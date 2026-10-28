import { Badge, Button, EmptyState, PageHeader } from './ui';
import { useRef, useState } from 'react';
import type { ViewProps } from './App';
import { goalData, type Goal, type GoalOccurrence } from '../../shared/types';
import { goalSummary, todaysOccurrences, weeklyWorkload } from '../../shared/goal-planning';
import { addDays, localDay } from '../../shared/analytics';
import { CheckControl } from './ui';
import { Icon, minutesLabel } from './components';
import { GoalEditor } from './GoalForms';
import { GoalWorkspace, TodayActions, type GoalFocusOptions } from './GoalWorkspace';
import { AgentProposals } from './AgentProposals';
import { AgentActivity } from './AgentActivity';
import { GOAL_STATUS_LABELS } from '../../shared/labels';

type GoalsProps = ViewProps & { startAction: (row: GoalOccurrence) => void; openTasks: (goal: Goal) => void; focusGoal: (goal: Goal, options?: GoalFocusOptions) => void; activeGoalId: string | null; openGoal: (id: string | null) => void };

function GoalList({ data,act,startAction,openGoal }: GoalsProps) {
  const domain = goalData(data), today = localDay(Date.now(),data.settings.timezone);
  const [showAll,setShowAll] = useState(false), [creating,setCreating] = useState(false);
  const [budget,setBudget] = useState(String(data.settings.weeklyCapacityMinutes || '')), [busy,setBusy] = useState(false); const pending = useRef(false);
  const workload = weeklyWorkload(data), areasOpen = data.fields.some(f => !f.archived);
  const saveBudget = async () => { if (pending.current) return; pending.current = true; setBusy(true); try { await act('settings.update',{ ...data.settings,weeklyCapacityMinutes: budget ? Number(budget) : 0 }); } finally { pending.current = false; setBusy(false); } };
  return <>
    <PageHeader title="O que você está aprendendo?" description="Cada meta é um lugar para aprender: um roteiro, sessões de foco, tarefas e os padrões que você percebe pelo caminho." actions={<Button variant="primary" icon="plus" disabled={!areasOpen} onClick={() => setCreating(true)}>Nova meta</Button>} />
    {!areasOpen && <p className="alert notice">Adicione uma área em Configurações para começar a planejar uma meta.</p>}
    <AgentProposals data={data} act={act} goalId={null} onApplied={value => { const id = (value as { goalId?: string } | undefined)?.goalId; if (id) openGoal(id); }} />
    <section className="goals-overview"><div className="section-title"><h2>Suas metas</h2><label className="goal-toggle"><CheckControl aria-label="Mostrar metas pausadas e arquivadas" checked={showAll} onChange={e => setShowAll(e.target.checked)} />Mostrar todos os status</label></div><div className="goal-card-grid">{domain.goals.filter(g => showAll || g.status === 'active' || g.status === 'draft').map(g => { const summary = goalSummary(data,g.id,addDays(today,-27),today); return <button key={g.id} className="goal-card" aria-label={`Abrir meta: ${g.title}`} onClick={() => openGoal(g.id)}><Badge tone={g.status === 'active' ? 'accent' : g.status === 'achieved' ? 'success' : 'neutral'} className="goal-status self-start">{GOAL_STATUS_LABELS[g.status] ?? g.status}</Badge><strong>{g.title}</strong><p>{g.outcome || 'Defina um resultado quando estiver pronto.'}</p><span className="hint">{data.fields.find(f => f.id === g.fieldId)?.name}{g.deadline ? ` · Prazo ${g.deadline}` : ''} · {summary.milestones.length ? `${summary.completedMilestones}/${summary.milestones.length} etapas` : 'Ainda sem roteiro'} · {minutesLabel(summary.minutes)} em 28 dias{domain.agentProposals.some(p => p.goalId === g.id && (p.status === 'pending' || p.status === 'stale')) ? ' · Propostas do agente para revisar' : ''}</span></button>; })}</div>{!domain.goals.length && <EmptyState title="O que você gostaria de aprender ou realizar?">Um curso, um assunto, um projeto ou uma rotina pessoal. Crie uma meta, depois monte o roteiro e foque dentro dela.</EmptyState>}</section>
    <AgentActivity data={data} act={act} />
    <section className="panel goals-today"><div className="section-title"><Icon name="sun" /><h2>Ações de hoje</h2><span className="hint">As ações mantêm o fuso horário do planejamento</span></div><TodayActions data={data} act={act} rows={todaysOccurrences(data)} startAction={startAction} /></section>
    <section className="panel goal-capacity"><div><h2>Uma semana viável</h2><p className="hint">{minutesLabel(workload.minutes)} estimados nas metas ativas · {workload.unknown} ações planejadas sem estimativa.</p>{workload.capacity > 0 && workload.minutes > workload.capacity && <p className="goal-capacity-warning" role="status">Seus compromissos estimados excedem o seu orçamento semanal de {minutesLabel(workload.capacity)}. Considere menos dias ou ações menores.</p>}</div><form onSubmit={e => { e.preventDefault(); void saveBudget(); }}><label className="form-label">Orçamento semanal de tempo (minutos)<input aria-label="Orçamento semanal de tempo" type="number" min={0} max={10080} value={budget} onChange={e => setBudget(e.target.value)} placeholder="Opcional" /></label><Button type="submit" disabled={busy}>Salvar orçamento</Button></form></section>
    <p className="footnote">Planejamento privado e local. Os métodos se baseiam em pesquisas sobre comportamento; seus registros e sugestões não fazem diagnóstico nem estabelecem por que um resultado ocorreu.</p>
    {creating && <GoalEditor data={data} act={act} goal={null} onClose={() => setCreating(false)} onSaved={id => { setCreating(false); openGoal(id); }} />}
  </>;
}

export default function GoalsPage(props: GoalsProps) {
  const goal = goalData(props.data).goals.find(g => g.id === props.activeGoalId);
  return goal ? <GoalWorkspace key={goal.id} data={props.data} act={props.act} goal={goal} startAction={props.startAction} openTasks={props.openTasks} focusGoal={props.focusGoal} onBack={() => props.openGoal(null)} /> : <GoalList {...props} />;
}
