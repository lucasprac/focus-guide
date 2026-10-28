import { useRef, useState } from 'react';
import type { ViewProps } from './App';
import type { AgentAccess } from '../../shared/types';
import { Badge, Button, Card, Choice } from './ui';

/* Agent access is off by default. Read only lets a local AI agent read records. Read and propose also lets it
   save proposals, which the user applies or rejects on the goal pages. Read and edit also lets it change records
   directly; each change is logged and can be undone. */
export function AgentSettings({ data, act }: ViewProps) {
  const access = data.settings.agentAccess ?? 'off', status = data.agent, [busy, setBusy] = useState(false), [copied, setCopied] = useState(''), config = useRef<HTMLTextAreaElement>(null);
  const json = status?.launch ? JSON.stringify({ mcpServers: { 'focus-guide': { type: 'stdio', command: status.launch.command, args: status.launch.args, env: status.launch.env } } }, null, 2) : '';
  const change = async (value: AgentAccess) => { setBusy(true); try { await act('settings.update', { ...data.settings, agentAccess: value }); } finally { setBusy(false); } };
  // The renderer has no clipboard permission, so a selected text area is copied with the editing command.
  const copy = () => { const area = config.current; if (!area) return; area.focus(); area.select(); setCopied(document.execCommand('copy') ? 'Copiado.' : 'Selecione o texto e pressione Ctrl+C.'); };
  return <Card title="Agente de IA (MCP)" icon="spark" actions={<Badge tone={status?.state === 'ready' ? 'success' : status?.state === 'error' ? 'neutral' : 'info'}>{status?.state === 'ready' ? 'Pronto' : status?.state === 'error' ? 'Precisa de atenção' : 'Desligado'}</Badge>}>
    <p className="hint">Conecte um agente de IA local, como o Claude Code ou o Claude Desktop, por meio do Model Context Protocol (MCP). O agente pode ler suas metas e seus registros de foco. Com propostas permitidas, ele pode sugerir metas, roteiros, tarefas, ações semanais e notas de revisão, e nada muda até você aplicar uma proposta. Com edições permitidas, ele altera esses itens diretamente e você pode desfazer cada alteração.</p>
    <label className="form-label">Acesso do agente<Choice aria-label="Acesso do agente de IA" value={access} disabled={busy} onChange={e => void change(e.target.value as AgentAccess)}><option value="off">Desligado</option><option value="read">Somente leitura</option><option value="propose">Ler e propor</option><option value="edit">Ler e editar</option></Choice></label>
    {access === 'edit' && <p className="alert notice" role="note">Com Ler e editar, o agente altera metas, roteiros, tarefas, ações semanais e notas de revisão na hora, sem perguntar a você. Ele não pode excluir, marcar uma meta como alcançada, arquivar uma meta nem marcar uma etapa do roteiro como concluída. Toda alteração aparece em Atividade do agente, na página Metas, onde você pode desfazê-la.</p>}
    <p className="alert notice" role="note">Seu agente envia o que lê ao provedor de IA dele. Com o acesso ativado, suas metas, sessões, notas e resumos de atividade podem sair deste computador. Restaurar um backup desliga o acesso.</p>
    <p className="hint" role="status">{status?.message ?? 'A ponte do agente funciona apenas no app para Windows.'}</p>
    {access !== 'off' && json && <>
      <label className="form-label">Configuração do cliente<textarea ref={config} readOnly rows={9} aria-label="Configuração do cliente MCP" className="agent-config" value={json} onFocus={e => e.target.select()} /></label>
      <div className="goal-button-row"><Button onClick={copy}>Copiar configuração</Button><span className="hint" role="status">{copied}</span></div>
      <p className="hint">Claude Desktop: adicione a entrada “focus-guide” à lista mcpServers em claude_desktop_config.json. Claude Code: salve este texto como .mcp.json em uma pasta de projeto, ou adicione-o com o comando claude mcp add-json. Mantenha o Focus Guide aberto enquanto o agente trabalha.</p>
    </>}
  </Card>;
}
