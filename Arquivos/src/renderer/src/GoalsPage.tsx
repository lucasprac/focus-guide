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

type GoalsProps = ViewProps & { startAction: (row: GoalOccurrence) => void; openTasks: (goal: Goal) => void; focusGoal: (goal: Goal, options?: GoalFocusOptions) => void; activeGoalId: string | null; openGoal: (id: string | null) => void };

function GoalList({ data,act,startAction,openGoal }: GoalsProps) {
  const domain = goalData(data), today = localDay(Date.now(),data.settings.timezone);
  const [showAll,setShowAll] = useState(false), [creating,setCreating] = useState(false);
  const [budget,setBudget] = useState(String(data.settings.weeklyCapacityMinutes || '')), [busy,setBusy] = useState(false); const pending = useRef(false);
  const workload = weeklyWorkload(data), areasOpen = data.fields.some(f => !f.archived);
  const saveBudget = async () => { if (pending.current) return; pending.current = true; setBusy(true); try { await act('settings.update',{ ...data.settings,weeklyCapacityMinutes: budget ? Number(budget) : 0 }); } finally { pending.current = false; setBusy(false); } };
  return <>
    <PageHeader title="What are you learning?" description="Each goal is a place to learn: a roadmap, focused sessions, tasks, and the patterns you notice along the way." actions={<Button variant="primary" icon="plus" disabled={!areasOpen} onClick={() => setCreating(true)}>New goal</Button>} />
    {!areasOpen && <p className="alert notice">Add an area in Settings to begin planning a goal.</p>}
    <AgentProposals data={data} act={act} goalId={null} onApplied={value => { const id = (value as { goalId?: string } | undefined)?.goalId; if (id) openGoal(id); }} />
    <section className="goals-overview"><div className="section-title"><h2>Your goals</h2><label className="goal-toggle"><CheckControl aria-label="Show paused and archived goals" checked={showAll} onChange={e => setShowAll(e.target.checked)} />Show all statuses</label></div><div className="goal-card-grid">{domain.goals.filter(g => showAll || g.status === 'active' || g.status === 'draft').map(g => { const summary = goalSummary(data,g.id,addDays(today,-27),today); return <button key={g.id} className="goal-card" aria-label={`Open goal: ${g.title}`} onClick={() => openGoal(g.id)}><Badge tone={g.status === 'active' ? 'accent' : g.status === 'achieved' ? 'success' : 'neutral'} className="goal-status self-start capitalize">{g.status}</Badge><strong>{g.title}</strong><p>{g.outcome || 'Define an outcome when you are ready.'}</p><span className="hint">{data.fields.find(f => f.id === g.fieldId)?.name}{g.deadline ? ` · Due ${g.deadline}` : ''} · {summary.milestones.length ? `${summary.completedMilestones}/${summary.milestones.length} steps` : 'No roadmap yet'} · {minutesLabel(summary.minutes)} in 28 days{domain.agentProposals.some(p => p.goalId === g.id && (p.status === 'pending' || p.status === 'stale')) ? ' · Agent proposals to review' : ''}</span></button>; })}</div>{!domain.goals.length && <EmptyState title="What would you like to learn or accomplish?">A course, a subject, a project, or a personal routine. Create a goal, then build its roadmap and focus inside it.</EmptyState>}</section>
    <AgentActivity data={data} act={act} />
    <section className="panel goals-today"><div className="section-title"><Icon name="sun" /><h2>Today’s actions</h2><span className="hint">Actions keep their planning timezone</span></div><TodayActions data={data} act={act} rows={todaysOccurrences(data)} startAction={startAction} /></section>
    <section className="panel goal-capacity"><div><h2>A workable week</h2><p className="hint">{minutesLabel(workload.minutes)} estimated across active goals · {workload.unknown} planned actions without an estimate.</p>{workload.capacity > 0 && workload.minutes > workload.capacity && <p className="goal-capacity-warning" role="status">Your estimated commitments exceed your {minutesLabel(workload.capacity)} weekly budget. Consider fewer days or smaller actions.</p>}</div><form onSubmit={e => { e.preventDefault(); void saveBudget(); }}><label className="form-label">Weekly time budget (minutes)<input aria-label="Weekly time budget" type="number" min={0} max={10080} value={budget} onChange={e => setBudget(e.target.value)} placeholder="Optional" /></label><Button type="submit" disabled={busy}>Save budget</Button></form></section>
    <p className="footnote">Private, local planning. The methods draw on behavior research; your records and suggestions do not diagnose you or establish why a result occurred.</p>
    {creating && <GoalEditor data={data} act={act} goal={null} onClose={() => setCreating(false)} onSaved={id => { setCreating(false); openGoal(id); }} />}
  </>;
}

export default function GoalsPage(props: GoalsProps) {
  const goal = goalData(props.data).goals.find(g => g.id === props.activeGoalId);
  return goal ? <GoalWorkspace key={goal.id} data={props.data} act={props.act} goal={goal} startAction={props.startAction} openTasks={props.openTasks} focusGoal={props.focusGoal} onBack={() => props.openGoal(null)} /> : <GoalList {...props} />;
}
