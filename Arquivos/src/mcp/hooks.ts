import { appendFileSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AGENT_TOOLS, isAgentTool, type AgentTool } from '../shared/agent-tools';
import { call, dataDirectory } from './client';

/* Claude Code hooks of the Focus Guide plugin. The plugin runs this file with the app executable and
   ELECTRON_RUN_AS_NODE=1, with "--hook <event>". The hooks add context and checks for the agent; the app
   still validates every tool call. A hook that fails for its own reasons prints nothing and exits with 0,
   so it never blocks the agent. The log keeps tool names and outcomes only, never record content. */
export const HOOK_EVENTS = ['session-start', 'pre-tool-use', 'post-tool-use'] as const;
type HookEvent = typeof HOOK_EVENTS[number];
interface HookInput { session_id?: string; hook_event_name?: string; tool_name?: string; tool_input?: Record<string, unknown>; tool_response?: unknown; error?: string }
interface SessionState { revisions: Record<string, string> }

const LOG_FILE = 'agent-hook-log.jsonl', LOG_LIMIT = 1024 * 1024, STATE_DAYS = 7;
const SKILLS = 'focus-guide:weekly-review, focus-guide:pattern-analysis, focus-guide:plan-day and focus-guide:roadmap';
const stateDirectory = join(tmpdir(), 'focus-guide-agent-hooks');

/* A tool of the manual "focus-guide" MCP entry, or of the MCP server that the plugin starts. */
function focusTool(name: unknown): AgentTool | null {
  const match = typeof name === 'string' ? /^mcp__(?:plugin_focus-guide_)?focus-guide__(.+)$/.exec(name) : null;
  return match && isAgentTool(match[1]) ? match[1] : null;
}
async function readInput(): Promise<HookInput> {
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) text += chunk;
  const value = JSON.parse(text || '{}') as unknown;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as HookInput : {};
}
function stateFile(session: string): string { return join(stateDirectory, `${session.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'default'}.json`); }
function loadState(session: string): SessionState {
  try { const value = JSON.parse(readFileSync(stateFile(session), 'utf8')) as SessionState; return value && typeof value.revisions === 'object' ? value : { revisions: {} }; } catch { return { revisions: {} }; }
}
function saveState(session: string, state: SessionState): void { mkdirSync(stateDirectory, { recursive: true }); writeFileSync(stateFile(session), JSON.stringify(state)); }
function pruneStates(): void {
  const cutoff = Date.now() - STATE_DAYS * 86400000;
  try { for (const name of readdirSync(stateDirectory)) { const file = join(stateDirectory, name); if (statSync(file).mtimeMs < cutoff) unlinkSync(file); } } catch { /* No state folder exists before the first get_goal. */ }
}
function log(input: HookInput, tool: AgentTool, outcome: 'ok' | 'error' | 'denied' | 'asked'): void {
  try {
    const file = join(dataDirectory(), LOG_FILE);
    try { if (statSync(file).size > LOG_LIMIT) renameSync(file, `${file}.1`); } catch { /* The log does not exist yet. */ }
    appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), session: (input.session_id ?? '').slice(0, 8), tool, outcome }) + '\n');
  } catch { /* The log is optional. */ }
}
/* MCP tool responses reach hooks in more than one shape: an object, a content array, or JSON text. */
function findRevision(value: unknown, depth = 0): string | null {
  if (depth > 6 || value === null || value === undefined) return null;
  if (typeof value === 'string') { try { return findRevision(JSON.parse(value), depth + 1); } catch { return null; } }
  if (Array.isArray(value)) { for (const item of value) { const found = findRevision(item, depth + 1); if (found) return found; } return null; }
  if (typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.roadmapRevision === 'string') return record.roadmapRevision;
  for (const item of Object.values(record)) { const found = findRevision(item, depth + 1); if (found) return found; }
  return null;
}
function failed(input: HookInput): boolean {
  const response = input.tool_response;
  return input.hook_event_name === 'PostToolUseFailure' || (!!response && typeof response === 'object' && (response as { isError?: unknown }).isError === true);
}
function output(hookEventName: string, fields: Record<string, unknown>): string { return JSON.stringify({ hookSpecificOutput: { hookEventName, ...fields } }); }

async function sessionStart(): Promise<string> {
  pruneStates();
  try {
    const overview = await call('get_overview', {}, { client: 'Claude Code hook', timeoutMs: 3000 }) as { access?: string; goals?: { status?: string; openProposals?: number }[]; todaysActions?: unknown[]; openNewGoalProposals?: number };
    const goals = overview.goals ?? [], access = overview.access ?? 'off';
    const proposals = goals.reduce((sum, goal) => sum + (goal.openProposals ?? 0), overview.openNewGoalProposals ?? 0);
    const rule = access === 'edit' ? 'Edit tools apply changes at once. Focus Guide records each change in Agent activity, and the user can undo it. Ask the user before a large change.'
      : access === 'propose' ? 'Edit tools are refused. Use the propose tools: the user applies or rejects each proposal in Focus Guide.'
        : 'Only read tools work. Give suggestions in the chat, and do not call propose or edit tools.';
    return output('SessionStart', { additionalContext: `Focus Guide is open. Agent access: ${access}. Active goals: ${goals.filter(goal => goal.status === 'active').length}. Open proposals: ${proposals}. Planned actions today: ${overview.todaysActions?.length ?? 0}. ${rule} When the user asks about focus, goals, tasks or study habits, use the skills ${SKILLS}.` });
  } catch (error) {
    return output('SessionStart', { additionalContext: `Focus Guide is not available: ${error instanceof Error ? error.message : String(error)} Mention this only if the user asks about Focus Guide, focus sessions or goals.` });
  }
}

function preToolUse(input: HookInput, tool: AgentTool): string {
  if (AGENT_TOOLS[tool] !== 'edit') return '';
  const args = input.tool_input ?? {};
  const deny = (reason: string) => { log(input, tool, 'denied'); return output('PreToolUse', { permissionDecision: 'deny', permissionDecisionReason: reason }); };
  if (typeof args.rationale !== 'string' || !args.rationale.trim()) return deny('Add a rationale: one or two sentences that tell the user why you make this change and which records you read. The user sees it in Agent activity in Focus Guide.');
  if (tool === 'update_roadmap') {
    const known = typeof args.goalId === 'string' ? loadState(input.session_id ?? '').revisions[args.goalId] : undefined;
    if (!known) return deny('Call get_goal for this goal first, in this session, and send its roadmapRevision. Show the user the roadmap that you will write before you replace the current one.');
    if (known !== args.revision) return deny('This revision is not the roadmapRevision from your last get_goal call for this goal. Call get_goal again and write the Markdown from the current roadmap.');
  }
  const change = tool === 'update_roadmap' ? 'replace the roadmap of a goal. Rows that the new Markdown leaves out are archived'
    : tool === 'update_task' && args.archived === true ? 'archive a task'
      : tool === 'update_task' && args.completed === true ? 'mark a task as complete'
        : tool === 'update_action' && args.archived === true ? 'archive a weekly action' : '';
  if (!change) return '';
  log(input, tool, 'asked');
  return output('PreToolUse', { permissionDecision: 'ask', permissionDecisionReason: `The agent wants to ${change}. Focus Guide records the change in Agent activity, and you can undo it there.` });
}

function postToolUse(input: HookInput, tool: AgentTool): string {
  const error = failed(input);
  log(input, tool, error ? 'error' : 'ok');
  if (error) return '';
  const goalId = typeof input.tool_input?.goalId === 'string' ? input.tool_input.goalId : null, session = input.session_id ?? '';
  if (goalId && (tool === 'get_goal' || tool === 'update_roadmap')) {
    const state = loadState(session), revision = tool === 'get_goal' ? findRevision(input.tool_response) : null;
    // A replaced roadmap has a new revision, so the next replacement needs a new get_goal.
    if (revision) state.revisions[goalId] = revision; else delete state.revisions[goalId];
    saveState(session, state);
  }
  const event = input.hook_event_name ?? 'PostToolUse';
  if (AGENT_TOOLS[tool] === 'propose') return output(event, { additionalContext: 'Focus Guide saved this as a pending proposal. Nothing changed yet. Tell the user to open Focus Guide and apply or reject it in the agent proposals on the Goals page (a new goal) or on the page of the goal.' });
  if (AGENT_TOOLS[tool] === 'edit') return output(event, { additionalContext: 'Focus Guide applied this change and recorded it in Agent activity. Tell the user in one sentence what changed, and that they can undo it in Agent activity on the Goals page.' });
  return '';
}

export async function runHook(event: HookEvent | undefined): Promise<void> {
  let text = '';
  try {
    if (event === 'session-start') text = await sessionStart();
    else if (event) {
      const input = await readInput(), tool = focusTool(input.tool_name);
      if (tool) text = event === 'pre-tool-use' ? preToolUse(input, tool) : postToolUse(input, tool);
    }
  } catch (error) { process.stderr.write(`focus-guide hook: ${error instanceof Error ? error.message : String(error)}\n`); text = ''; }
  if (text) process.stdout.write(text + '\n', () => process.exit(0));
  else process.exit(0);
}
