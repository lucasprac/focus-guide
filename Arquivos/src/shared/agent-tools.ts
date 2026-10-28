import type { AgentAccess } from './goal-types';

/* The only operations that the local agent bridge accepts, with the access level that each one needs.
   Read tools return copies of records. Propose tools save a proposal that the user applies or rejects in the app. */
export const AGENT_TOOLS = {
  get_overview: 'read', get_goal: 'read', get_goal_behaviour: 'read', get_focus_insights: 'read', list_sessions: 'read', get_weekly_review: 'read', list_proposals: 'read', list_changes: 'read',
  propose_goal: 'propose', propose_roadmap: 'propose', propose_tasks: 'propose', propose_action: 'propose', propose_review_note: 'propose',
  create_goal: 'edit', update_goal: 'edit', update_roadmap: 'edit', update_step: 'edit', create_tasks: 'edit', update_task: 'edit', create_action: 'edit', update_action: 'edit', add_review_note: 'edit'
} as const satisfies Record<string, Exclude<AgentAccess, 'off'>>;
export type AgentTool = keyof typeof AGENT_TOOLS;
export function isAgentTool(name: unknown): name is AgentTool { return typeof name === 'string' && Object.hasOwn(AGENT_TOOLS, name); }
/* Each level includes the levels below it: read < propose < edit. */
const LEVELS: Record<AgentAccess, number> = { off: 0, read: 1, propose: 2, edit: 3 };
export function allowsTool(access: AgentAccess, tool: AgentTool): boolean { return access !== 'off' && LEVELS[access] >= LEVELS[AGENT_TOOLS[tool]]; }
export function accessError(access: AgentAccess): string { return access === 'off' ? 'O acesso do agente de IA está desligado. O usuário pode ativá-lo nas configurações do Focus Guide.' : access === 'read' ? 'O Focus Guide permite apenas acesso de leitura. O usuário pode liberar mais nas configurações do Focus Guide.' : 'O Focus Guide permite apenas propostas. Use as ferramentas de proposta ou peça ao usuário que libere edições diretas nas configurações do Focus Guide.'; }

/* The bridge file in the data folder tells a local MCP server where the running app listens. */
export const AGENT_BRIDGE_FILE = 'agent-bridge.json';
export interface AgentBridgeFile { version: 1; pipe: string; token: string; pid: number }
export const AGENT_MESSAGE_LIMIT = 64 * 1024;
