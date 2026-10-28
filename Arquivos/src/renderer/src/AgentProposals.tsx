import { useState } from 'react';
import type { ViewProps } from './App';
import { goalData, sortMilestones, type AgentProposal, type ProposalKind } from '../../shared/types';
import { parseMilestoneMarkdown, reconnectMilestones } from '../../shared/milestone-markdown';
import { weekdayNames } from './GoalForms';
import { Badge, Button, Card } from './ui';
import { Disclosure } from './components';

const KIND_LABELS: Record<ProposalKind, string> = { 'goal.create': 'Nova meta', 'roadmap.replace': 'Roteiro', 'tasks.add': 'Tarefas', 'action.add': 'Ação semanal', 'review.note': 'Nota de revisão' };
type Draft = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' ? value : '';

function MarkdownRows({ markdown }: { markdown: string }) {
  const rows = parseMilestoneMarkdown(markdown);
  return <ul className="proposal-rows">{rows.map((row, i) => <li key={i} className={`proposal-row-${row.kind}`}>{row.kind === 'todo' ? (row.completed ? '☑ ' : '☐ ') : row.kind === 'bullet' ? '• ' : ''}{row.title}</li>)}</ul>;
}
/* Shows what applying a roadmap proposal does: kept rows keep their links, new rows are added, missing rows are archived. */
function RoadmapDiff({ data, goalId, markdown }: Pick<ViewProps, 'data'> & { goalId: string; markdown: string }) {
  const current = sortMilestones(goalData(data).milestones.filter(m => m.goalId === goalId && !m.archived));
  let n = 0; const rows = reconnectMilestones(parseMilestoneMarkdown(markdown), current, () => `new-${n++}`);
  const kept = new Set(rows.map(r => r.id)), removed = current.filter(m => !kept.has(m.id));
  return <div className="proposal-diff"><ul className="proposal-rows">{rows.map(row => { const old = current.find(m => m.id === row.id); return <li key={row.id} className={`proposal-row-${row.kind}`}>{row.kind === 'todo' ? (row.completed || old?.completed ? '☑ ' : '☐ ') : row.kind === 'bullet' ? '• ' : ''}{row.title}{!old ? <Badge tone="accent">nova</Badge> : old.title !== row.title ? <Badge tone="info">renomeada</Badge> : null}</li>; })}</ul>
    {!!removed.length && <p className="hint">Arquivadas ao aplicar: {removed.map(m => m.title).join(' · ')}. As linhas arquivadas mantêm os vínculos com tarefas e sessões e podem ser restauradas.</p>}</div>;
}

function ProposalCard({ data, act, proposal, onApplied }: ViewProps & { proposal: AgentProposal; onApplied?: (value: unknown) => void }) {
  const p = proposal.payload, [editing, setEditing] = useState<Draft | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const editable = proposal.kind === 'goal.create' || proposal.kind === 'roadmap.replace' || proposal.kind === 'review.note';
  const decide = async (command: 'agent.proposal.apply' | 'agent.proposal.reject', extra: Record<string, unknown> = {}) => {
    setBusy(true); setError('');
    try {
      const result = await act(command, { id: proposal.id, ...(editing ? { edits: editing } : {}), ...extra });
      if (!result.ok) { setError(result.error); return; }
      if (command === 'agent.proposal.apply' && !(result.value && typeof result.value === 'object' && 'stale' in result.value)) { setEditing(null); onApplied?.(result.value); }
    } finally { setBusy(false); }
  };
  const field = (key: string, label: string, rows = 1) => <label className="form-label">{label}{rows > 1 ? <textarea aria-label={label} rows={rows} value={text(editing![key])} onChange={e => setEditing({ ...editing!, [key]: e.target.value })} /> : <input aria-label={label} value={text(editing![key])} onChange={e => setEditing({ ...editing!, [key]: e.target.value })} />}</label>;
  const actions = (proposal.kind === 'goal.create' ? p.actions : proposal.kind === 'action.add' ? [p.action] : []) as Array<Record<string, unknown>>;
  return <article className="proposal-card">
    <div className="proposal-head"><Badge tone={proposal.status === 'stale' ? 'neutral' : 'accent'}>{KIND_LABELS[proposal.kind]}</Badge><strong>{proposal.summary}</strong><span className="hint">{proposal.source} · {new Date(proposal.createdAt).toLocaleString('pt-BR', { timeZone: data.settings.timezone, dateStyle: 'medium', timeStyle: 'short' })}</span></div>
    {proposal.rationale && <p className="hint">{proposal.rationale}</p>}
    {editing ? <div className="goal-form">
      {proposal.kind === 'goal.create' && <>{field('title', 'Título da meta')}{field('outcome', 'Resultado desejado', 2)}{field('roadmapMarkdown', 'Roteiro em Markdown', 8)}</>}
      {proposal.kind === 'roadmap.replace' && field('markdown', 'Roteiro em Markdown', 10)}
      {proposal.kind === 'review.note' && field('text', 'Nota de revisão', 4)}
    </div> : <>
      {proposal.kind === 'goal.create' && <><p><strong>{text(p.title)}</strong>{p.outcome ? ` — ${text(p.outcome)}` : ''}</p><p className="hint">Área: {data.fields.find(f => f.id === p.areaId)?.name ?? 'área desconhecida'}{p.deadline ? ` · Prazo ${text(p.deadline)}` : ''}</p>{text(p.roadmapMarkdown) && <MarkdownRows markdown={text(p.roadmapMarkdown)} />}</>}
      {proposal.kind === 'roadmap.replace' && proposal.goalId && <RoadmapDiff data={data} goalId={proposal.goalId} markdown={text(p.markdown)} />}
      {proposal.kind === 'tasks.add' && <ul className="proposal-rows">{(p.tasks as Array<Record<string, unknown>>).map((t, i) => <li key={i}>{text(t.title)}{t.step ? <span className="hint"> · {text(t.step)}</span> : null}{t.dueDate ? <span className="hint"> · prazo {text(t.dueDate)}</span> : null}</li>)}</ul>}
      {proposal.kind === 'review.note' && <aside className="goal-evidence"><strong>Semana de {text(p.week)}</strong><p>{text(p.text)}</p></aside>}
    </>}
    {actions.map((a, i) => <div className="goal-plan-card" key={i}><h3>{text(a.title)}</h3><p>{text(a.cue)} → {text(a.normal)}</p><p className="hint">{(a.weekdays as number[]).map(d => weekdayNames[d].slice(0, 3)).join(', ')} · {a.estimatedMinutes ? `${a.estimatedMinutes} minutos` : 'Sem estimativa de tempo'} · Versão menor: {text(a.smaller)}</p></div>)}
    {proposal.status === 'stale' && <p className="alert notice" role="status">O roteiro mudou depois que o agente escreveu esta proposta. A comparação acima usa o roteiro atual. Aplique somente se o resultado ainda for o que você quer.</p>}
    {error && <p role="alert" className="goal-form-error">{error}</p>}
    <div className="goal-button-row">
      {proposal.status === 'stale' ? <Button variant="primary" disabled={busy} onClick={() => void decide('agent.proposal.apply', { confirmStale: true })}>Aplicar mesmo assim</Button> : <Button variant="primary" disabled={busy} onClick={() => void decide('agent.proposal.apply')}>{editing ? 'Aplicar versão editada' : 'Aplicar'}</Button>}
      {editable && !editing && <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(proposal.kind === 'goal.create' ? { title: p.title, outcome: p.outcome, roadmapMarkdown: p.roadmapMarkdown } : proposal.kind === 'roadmap.replace' ? { markdown: p.markdown } : { text: p.text })}>Editar e aplicar</Button>}
      {editing && <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(null)}>Cancelar edições</Button>}
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void decide('agent.proposal.reject')}>Rejeitar</Button>
    </div>
  </article>;
}

/* Proposals for one goal, or new-goal proposals when goalId is null. Applied and rejected proposals stay as an audit trail. */
export function AgentProposals({ data, act, goalId, onApplied }: ViewProps & { goalId: string | null; onApplied?: (value: unknown) => void }) {
  const rows = goalData(data).agentProposals.filter(p => p.goalId === goalId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = rows.filter(p => p.status === 'pending' || p.status === 'stale'), decided = rows.filter(p => p.status === 'applied' || p.status === 'rejected');
  if (!open.length && !decided.length) return null;
  return <Card className="agent-proposals" title={goalId ? 'Propostas do seu agente de IA' : 'Novas metas propostas pelo seu agente de IA'} icon="spark" actions={<span className="hint">{open.length} para revisar</span>}>
    {open.map(p => <ProposalCard key={`${p.id}_${p.status}`} data={data} act={act} proposal={p} onApplied={onApplied} />)}
    {!open.length && <p className="hint">Nada para revisar. O seu agente salva propostas aqui; nada muda até você aplicar uma.</p>}
    {!!decided.length && <Disclosure title="Histórico do agente"><div className="goal-history">{decided.slice(0, 20).map(p => <div className="goal-history-row" key={p.id}><span>{p.decidedAt?.slice(0, 10)} · {p.status === 'applied' ? 'aplicada' : 'rejeitada'}</span><strong>{KIND_LABELS[p.kind]} · {p.summary}</strong>{p.rationale && <p className="hint">{p.rationale}</p>}</div>)}</div></Disclosure>}
  </Card>;
}
