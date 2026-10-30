import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AgentBridgeStatus, AgentPluginStatus } from '../shared/types';
import { atomicWrite } from './backup';
import { version } from '../../package.json';
import weeklyReview from '../../agent-plugin/skills/weekly-review/SKILL.md?raw';
import patternAnalysis from '../../agent-plugin/skills/pattern-analysis/SKILL.md?raw';
import planDay from '../../agent-plugin/skills/plan-day/SKILL.md?raw';
import roadmap from '../../agent-plugin/skills/roadmap/SKILL.md?raw';

/* A Claude Code plugin for Focus Guide: the MCP server, four skills and the hooks in src/mcp/hooks.ts. The app
   writes it to the "claude-plugin" folder of its data folder as a local marketplace, because the MCP server and
   the hooks need the absolute path of this executable. Claude Code copies the plugin when the user installs it,
   so the user installs again after an app update or move. The files hold no personal records. */
const PLUGIN = 'focus-guide', MARKETPLACE = 'focus-guide-local';
const DESCRIPTION = 'Skills and hooks for the Focus Guide AI agent: weekly review, pattern analysis, day plan and roadmaps.';
const SKILLS: Record<string, string> = { 'weekly-review': weeklyReview, 'pattern-analysis': patternAnalysis, 'plan-day': planDay, roadmap };
type Launch = NonNullable<AgentBridgeStatus['launch']>;

const folder = (dataDirectory: string) => join(dataDirectory, 'claude-plugin');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const mcpConfig = (launch: Launch) => ({ mcpServers: { [PLUGIN]: { type: 'stdio', command: launch.command, args: launch.args, env: launch.env } } });

/* Hooks run in PowerShell, which every Windows computer has, so that the environment variables can be set
   before the executable starts. Without ELECTRON_RUN_AS_NODE the executable would open the app instead. */
function hooksConfig(launch: Launch) {
  const quote = (text: string) => `'${text.replace(/'/g, "''")}'`;
  const command = (event: string) => `${Object.entries(launch.env).map(([name, value]) => `$env:${name} = ${quote(value)}`).join('; ')}; & ${quote(launch.command)} ${launch.args.map(quote).join(' ')} --hook ${event}; exit $LASTEXITCODE`;
  const hook = (event: string) => [{ type: 'command', shell: 'powershell', command: command(event), timeout: 15 }];
  const tools = 'mcp__(plugin_focus-guide_)?focus-guide__.*';
  return {
    description: 'Focus Guide: status at session start, checks before agent edits, reminders after proposals and edits, and a local log of tool calls.',
    hooks: {
      SessionStart: [{ hooks: hook('session-start') }],
      PreToolUse: [{ matcher: tools, hooks: hook('pre-tool-use') }],
      PostToolUse: [{ matcher: tools, hooks: hook('post-tool-use') }],
      PostToolUseFailure: [{ matcher: tools, hooks: hook('post-tool-use') }]
    }
  };
}

/* The plugin in the GitHub marketplace (.claude-plugin/marketplace.json at the repository root) cannot know where
   this executable is. Its scripts/focus-guide.cmd calls agent-launch.cmd in the data folder, which the app writes
   at each start. The file holds paths only, no personal records. */
export function writeAgentLauncher(dataDirectory: string, launch: Launch) {
  const text = (value: string) => value.replace(/%/g, '%%');
  const lines = ['@echo off', ...Object.entries(launch.env).map(([name, value]) => `set "${name}=${text(value)}"`),
    `"${text(launch.command)}" ${launch.args.map((arg) => `"${text(arg)}"`).join(' ')} %*`, 'exit /b %ERRORLEVEL%'];
  atomicWrite(join(dataDirectory, 'agent-launch.cmd'), lines.join('\r\n') + '\r\n');
}

/* The plugin is current when its version and its executable match this app. */
export function readAgentPlugin(dataDirectory: string, launch: Launch): AgentPluginStatus | null {
  const root = folder(dataDirectory);
  try {
    const manifest = JSON.parse(readFileSync(join(root, PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')) as { version?: unknown };
    const mcp = JSON.parse(readFileSync(join(root, PLUGIN, '.mcp.json'), 'utf8')) as { mcpServers?: Record<string, { command?: unknown }> };
    if (typeof manifest.version !== 'string') return null;
    return { path: root, version: manifest.version, current: manifest.version === version && mcp.mcpServers?.[PLUGIN]?.command === launch.command };
  } catch { return null; }
}

export function writeAgentPlugin(dataDirectory: string, launch: Launch): AgentPluginStatus {
  const root = folder(dataDirectory), plugin = join(root, PLUGIN);
  const write = (file: string, text: string) => { mkdirSync(dirname(file), { recursive: true }); atomicWrite(file, text); };
  // Remove the earlier plugin files, so that a skill that a newer version removed does not stay.
  rmSync(plugin, { recursive: true, force: true });
  write(join(root, '.claude-plugin', 'marketplace.json'), json({ name: MARKETPLACE, owner: { name: 'Focus Guide' }, description: 'The Focus Guide plugin that this computer\'s Focus Guide app wrote.', plugins: [{ name: PLUGIN, source: `./${PLUGIN}`, description: DESCRIPTION, version }] }));
  write(join(plugin, '.claude-plugin', 'plugin.json'), json({ name: PLUGIN, version, description: DESCRIPTION, author: { name: 'Focus Guide' }, license: 'MIT' }));
  write(join(plugin, '.mcp.json'), json(mcpConfig(launch)));
  write(join(plugin, 'hooks', 'hooks.json'), json(hooksConfig(launch)));
  for (const [name, text] of Object.entries(SKILLS)) write(join(plugin, 'skills', name, 'SKILL.md'), text);
  return { path: root, version, current: true };
}
