import { useRef, useState } from 'react';
import type { ViewProps } from './App';
import type { AgentAccess } from '../../shared/types';
import { Badge, Button, Card, Choice } from './ui';
import { t } from '../../shared/i18n';

/* Agent access is off by default. Read only lets a local AI agent read records. Read and propose also lets it
   save proposals, which the user applies or rejects on the goal pages. Read and edit also lets it change records
   directly; each change is logged and can be undone. */
export function AgentSettings({ data, act }: ViewProps) {
  const access = data.settings.agentAccess ?? 'off', status = data.agent, plugin = status?.plugin, [busy, setBusy] = useState(false), [copied, setCopied] = useState({ area: '', text: '' });
  const config = useRef<HTMLTextAreaElement>(null), pluginCommands = useRef<HTMLTextAreaElement>(null);
  const json = status?.launch ? JSON.stringify({ mcpServers: { 'focus-guide': { type: 'stdio', command: status.launch.command, args: status.launch.args, env: status.launch.env } } }, null, 2) : '';
  const commands = plugin ? [`# ${t('First install')}`, `claude plugin marketplace add "${plugin.path}"`, 'claude plugin install focus-guide@focus-guide-local', `# ${t('After an update of Focus Guide')}`, 'claude plugin marketplace update focus-guide-local', 'claude plugin update focus-guide@focus-guide-local'].join('\n') : '';
  const change = async (value: AgentAccess) => { setBusy(true); try { await act('settings.update', { ...data.settings, agentAccess: value }); } finally { setBusy(false); } };
  const writePlugin = async () => { setBusy(true); try { await act('agent.plugin.write', {}); } finally { setBusy(false); } };
  // The renderer has no clipboard permission, so a selected text area is copied with the editing command.
  const copy = (name: 'config' | 'plugin') => { const area = (name === 'config' ? config : pluginCommands).current; if (!area) return; area.focus(); area.select(); setCopied({ area: name, text: document.execCommand('copy') ? t('Copied.') : t('Select the text and press Ctrl+C.') }); };
  return <Card title={t('AI agent (MCP)')} icon="spark" actions={<Badge tone={status?.state === 'ready' ? 'success' : status?.state === 'error' ? 'neutral' : 'info'}>{status?.state === 'ready' ? t('Ready') : status?.state === 'error' ? t('Needs attention') : t('Off')}</Badge>}>
    <p className="hint">{t('Connect a local AI agent, such as Claude Code or Claude Desktop, through the Model Context Protocol (MCP). The agent can read your goals and focus records. With proposals allowed, it can suggest goals, roadmaps, tasks, weekly actions and review notes, and nothing changes until you apply a proposal. With edits allowed, it changes them directly and you can undo each change.')}</p>
    <label className="form-label">{t('Agent access')}<Choice aria-label={t('AI agent access')} value={access} disabled={busy} onChange={e => void change(e.target.value as AgentAccess)}><option value="off">{t('Off')}</option><option value="read">{t('Read only')}</option><option value="propose">{t('Read and propose')}</option><option value="edit">{t('Read and edit')}</option></Choice></label>
    {access === 'edit' && <p className="alert notice" role="note">{t('With Read and edit, the agent changes goals, roadmaps, tasks, weekly actions and review notes at once, without asking you. It cannot delete, mark a goal achieved, archive a goal or tick a roadmap step. Every change appears in Agent activity on the Goals page, where you can undo it.')}</p>}
    <p className="alert notice" role="note">{t('Your agent sends what it reads to its AI provider. With access on, your goals, sessions, notes and activity summaries can leave this computer. Restoring a backup turns access off.')}</p>
    <p className="hint" role="status">{status?.message ?? t('The agent bridge runs only in the Windows app.')}</p>
    {access !== 'off' && json && <>
      <label className="form-label">{t('Client configuration')}<textarea ref={config} readOnly rows={9} aria-label={t('MCP client configuration')} className="agent-config" value={json} onFocus={e => e.target.select()} /></label>
      <div className="goal-button-row"><Button onClick={() => copy('config')}>{t('Copy configuration')}</Button><span className="hint" role="status">{copied.area === 'config' ? copied.text : ''}</span></div>
      <p className="hint">{t('Claude Desktop: add the “focus-guide” entry to the mcpServers list in claude_desktop_config.json. Claude Code: save this text as .mcp.json in a project folder, or add it with the claude mcp add-json command. Keep Focus Guide open while the agent works.')}</p>
      <p className="form-label">{t('Claude Code plugin')}</p>
      <p className="hint">{t('For Claude Code, the plugin is the easier choice. It adds the Focus Guide MCP server, four skills (weekly review, pattern analysis, day plan and roadmap) and hooks. The hooks tell the agent the access level at the start of a session, check agent edits before they run, remind the agent to tell you about proposals and changes, and log the tool names and results, without your records, in agent-hook-log.jsonl in the data folder.')}</p>
      <div className="goal-button-row"><Button disabled={busy} onClick={() => void writePlugin()}>{plugin ? t('Update plugin files') : t('Create plugin files')}</Button>
        {plugin && <span className="hint" role="status">{plugin.current ? t('Plugin files for version {version} are ready.', { version: plugin.version }) : t('These plugin files are for version {version} or for another app folder. Update them, then update the plugin in Claude Code.', { version: plugin.version })}</span>}</div>
      {plugin && <>
        <label className="form-label">{t('Claude Code commands')}<textarea ref={pluginCommands} readOnly rows={6} aria-label={t('Claude Code plugin commands')} className="agent-config" value={commands} onFocus={e => e.target.select()} /></label>
        <div className="goal-button-row"><Button onClick={() => copy('plugin')}>{t('Copy commands')}</Button><span className="hint" role="status">{copied.area === 'plugin' ? copied.text : ''}</span></div>
        <p className="hint">{t('Run these commands in a terminal, then restart Claude Code. If you also added the “focus-guide” entry yourself, remove it, so that the agent does not see each tool two times.')}</p>
      </>}
    </>}
  </Card>;
}
