import { useState } from 'react';
import type { ViewProps } from './App';
import { goalData, type AgentChange } from '../../shared/types';
import { Badge, Button, Card } from './ui';
import { Disclosure } from './components';
import { eventSourceLabel } from '../../shared/labels';

const TARGET_LABELS: Record<AgentChange['target'], string> = { goal: 'Meta', roadmap: 'Roteiro', step: 'Etapa', task: 'Tarefas', action: 'Ação semanal', review: 'Nota de revisão' };

function ChangeRow({ data, act, change }: ViewProps & { change: AgentChange }) {
  const [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false), [error, setError] = useState('');
  const undo = async (confirm = false) => {
    setBusy(true); setError('');
    try {
      const result = await act('agent.change.undo', { id: change.id, confirm });
      if (!result.ok) setError(result.error);
      else setConflict(!!(result.value && typeof result.value === 'object' && 'conflict' in result.value));
    } finally { setBusy(false); }
  };
  return <div className={`goal-history-row agent-change ${change.undoneAt ? 'undone' : ''}`}>
    <span>{new Date(change.at).toLocaleString('pt-BR', { timeZone: data.settings.timezone, dateStyle: 'medium', timeStyle: 'short' })} · {eventSourceLabel(change.source)}</span>
    <strong><Badge tone={change.undoneAt ? 'neutral' : 'accent'}>{TARGET_LABELS[change.target]}</Badge> {change.summary}</strong>
    {change.rationale && <p className="hint">{change.rationale}</p>}
    {conflict && <p className="alert notice" role="alert">Este registro mudou depois da alteração do agente. Desfazer restaura o estado anterior à alteração do agente, então as suas edições posteriores serão perdidas.</p>}
    {error && <p className="goal-form-error" role="alert">{error}</p>}
    {change.undoneAt ? <span className="hint">Desfeita em {new Date(change.undoneAt).toLocaleDateString('pt-BR', { timeZone: data.settings.timezone, dateStyle: 'medium' })}</span>
      : <div className="goal-button-row">{conflict ? <><Button size="sm" variant="danger" disabled={busy} onClick={() => void undo(true)}>Desfazer mesmo assim</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setConflict(false)}>Manter</Button></> : <Button size="sm" variant="ghost" disabled={busy} onClick={() => void undo()}>Desfazer</Button>}</div>}
  </div>;
}

/* Direct changes that a local AI agent made, newest first. With goalId, only that goal's changes. */
export function AgentActivity({ data, act, goalId }: ViewProps & { goalId?: string }) {
  const changes = goalData(data).agentChanges.filter(c => !goalId || c.goalId === goalId).sort((a, b) => b.at.localeCompare(a.at));
  if (!changes.length) return null;
  const recent = changes.filter(c => Date.parse(c.at) > Date.now() - 7 * 86400000 && !c.undoneAt);
  return <Card className="agent-activity" title="Atividade do agente" icon="spark" actions={<span className="hint">{recent.length === 1 ? '1 alteração' : `${recent.length} alterações`} nos últimos 7 dias</span>}>
    <p className="hint">Alterações que o seu agente de IA fez diretamente. Desfazer restaura o estado anterior; um registro criado pelo agente é arquivado, não excluído.</p>
    {changes.slice(0, 5).map(c => <ChangeRow key={c.id} data={data} act={act} change={c} />)}
    {changes.length > 5 && <Disclosure title={`Alterações anteriores (${changes.length - 5})`}>{changes.slice(5, 100).map(c => <ChangeRow key={c.id} data={data} act={act} change={c} />)}</Disclosure>}
  </Card>;
}
