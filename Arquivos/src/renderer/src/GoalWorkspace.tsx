import { Badge, Button, CheckControl, Choice, EmptyState, IconButton, PageHeader, Segments } from './ui';
import { useRef, useState } from 'react';
import type { ViewProps } from './App';
import { MILESTONE_DETAIL_LIMITS, goalData, sortMilestones, type Goal, type GoalAction, type GoalMilestone, type GoalOccurrence, type GoalProgressEntry, type GoalReview, type MilestoneResource } from '../../shared/types';
import { actionPlan, barrierSuggestions, goalSummary, roadmapEffort, todaysOccurrences, type GoalSuggestion } from '../../shared/goal-planning';
import { addDays, localDay, monday } from '../../shared/analytics';
import { Disclosure, Icon, Modal, minutesLabel } from './components';
import { ActionCheckIn, ActionEditor, GoalEditor, weekdayNames } from './GoalForms';
import { GoalMilestones } from './MilestoneChecklist';
import { GoalBehaviour } from './GoalBehaviour';
import { AgentProposals } from './AgentProposals';
import { AgentActivity } from './AgentActivity';

export interface GoalFocusOptions { taskId?: string; intention?: string; milestoneId?: string | null }
type Section = 'overview' | 'roadmap' | 'tasks' | 'behaviour' | 'plan';

function GoalMeasurements({ data,act,goal }: ViewProps & { goal: Goal }) {
  const today = localDay(Date.now(),data.settings.timezone);
  const [entry,setEntry] = useState<{ id: string; date: string; value: string; note: string }>({ id: crypto.randomUUID(),date: today,value: '',note: '' });
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [removing,setRemoving] = useState<GoalProgressEntry | null>(null);
  const pending = useRef(false), progress = goalData(data).goalProgress.filter(p => p.goalId === goal.id).sort((a,b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const save = async () => { if (pending.current) return; pending.current = true; setBusy(true); setError(''); try { const result = await act('goal.progress.save',{ ...entry,value: Number(entry.value),goalId: goal.id }); if (result.ok) setEntry({ id: crypto.randomUUID(),date: today,value: '',note: '' }); else setError(result.error); } finally { pending.current = false; setBusy(false); } };
  return <section className="panel goal-measurements"><div className="section-title"><h2>Outcome observations</h2></div><p className="hint">Baseline {goal.baseline} · Target {goal.target} {goal.unit}. Each entry is the absolute value observed that day; entries are not added together.</p>
    <form className="goal-form" onSubmit={e => { e.preventDefault(); void save(); }}><div className="goal-measure-inputs"><label className="form-label">Observation date<input aria-label="Observation date" type="date" max={today} required value={entry.date} onChange={e => setEntry({ ...entry,date: e.target.value })} /></label><label className="form-label">Observed value ({goal.unit})<input aria-label="Observed value" type="number" step="any" required value={entry.value} onChange={e => setEntry({ ...entry,value: e.target.value })} /></label></div><label className="form-label">Observation note <span className="optional">optional</span><input aria-label="Observation note" value={entry.note} onChange={e => setEntry({ ...entry,note: e.target.value })} maxLength={2000} /></label><div className="goal-button-row"><Button type="submit" disabled={busy || entry.value === ''}>{busy ? 'Saving…' : progress.some(p => p.id === entry.id) ? 'Save observation correction' : 'Record observation'}</Button>{progress.some(p => p.id === entry.id) && <Button type="button" variant="ghost" size="sm" onClick={() => setEntry({ id: crypto.randomUUID(),date: today,value: '',note: '' })}>Cancel correction</Button>}</div>{error && <p role="alert" className="goal-form-error">{error}</p>}</form>
    {!!progress.length && <Disclosure title="Observation history"><div className="goal-history">{progress.map(p => <div className="goal-history-row" key={p.id}><span>{p.date}</span><strong>{p.value} {goal.unit}</strong><p>{p.note}</p><div className="goal-button-row"><Button variant="ghost" size="sm" aria-label={`Correct observation ${p.date}`} onClick={() => setEntry({ id: p.id,date: p.date,value: String(p.value),note: p.note })}>Correct</Button><Button variant="ghost" size="sm" aria-label={`Remove observation ${p.date}`} onClick={() => setRemoving(p)}>Remove</Button></div></div>)}</div></Disclosure>}
    <Modal open={!!removing} destructive title="Remove this observation?" description="Removes only this measurement; focus sessions and action check-ins are retained." onClose={() => setRemoving(null)}><p className="modal-intro">{removing?.date} · {removing?.value} {goal.unit}</p><div className="modal-actions"><Button onClick={() => setRemoving(null)}>Keep observation</Button><Button variant="danger" onClick={async () => { const result = await act('goal.progress.delete',{ id: removing!.id }); if (result.ok) setRemoving(null); }}>Remove observation</Button></div></Modal>
  </section>;
}

function GoalWeeklyReview({ data,act,goal,week,onSuggestion }: ViewProps & { goal: Goal; week: string; onSuggestion: (suggestion: GoalSuggestion,decision: 'applied' | 'edited') => void }) {
  const domain = goalData(data), saved = domain.goalReviews.find(r => r.goalId === goal.id && r.week === week);
  const [adjustment,setAdjustment] = useState(saved?.adjustment ?? ''), [previousOutcome,setOutcome] = useState<GoalReview['previousOutcome']>(saved?.previousOutcome ?? 'undecided');
  const [busy,setBusy] = useState(false), [message,setMessage] = useState(''); const pending = useRef(false);
  const previous = domain.goalReviews.find(r => r.goalId === goal.id && r.week === addDays(week,-7));
  const summary = goalSummary(data,goal.id,week,addDays(week,6));
  const suggestions = week === monday(localDay(Date.now(),data.settings.timezone)) ? barrierSuggestions(data,goal.id) : [];
  return <section className="panel goal-weekly-review"><div className="section-title"><h2>One change for next week</h2><span className="hint">{week}–{addDays(week,6)}</span></div>
    <div className="goal-counts"><span><strong>{summary.done}</strong> full actions</span><span><strong>{summary.smaller}</strong> smaller versions</span><span><strong>{summary.skipped}</strong> explicit skips</span><span><strong>{summary.unrecorded}</strong> unrecorded</span></div>
    <p className="hint">{minutesLabel(summary.minutes)} of recorded effort · {summary.milestones.length ? `${summary.completedMilestones}/${summary.milestones.length} milestones complete` : 'no milestone to-dos yet'}{summary.latestProgress ? ` · Latest outcome: ${summary.latestProgress.value} ${goal.unit} (${summary.latestProgress.date})` : ''}. Missing check-ins are not evidence of failure.</p>
    <Disclosure title="Review this week’s actions"><div className="goal-history">{summary.occurrences.map(row => <div className="goal-history-row" key={row.id}><strong>{domain.goalActions.find(a => a.id === row.actionId)?.title}</strong><span>{row.date}{row.originalDate !== row.date ? ` · moved from ${row.originalDate}` : ''}</span><p>{row.plan.cue} → {row.plan.normal}</p>{row.date <= localDay(Date.now(),row.plan.timezone) ? <ActionCheckIn key={`${row.id}_${row.updatedAt}`} row={row} act={act} title={`${domain.goalActions.find(a => a.id === row.actionId)?.title} on ${row.date}`} /> : <span className="hint">Planned for a future date</span>}</div>)}{!summary.occurrences.length && <p className="hint">No actions were planned for this week.</p>}</div></Disclosure>
    {previous?.adjustment && <aside className="goal-evidence"><strong>Last week’s adjustment</strong><p>{previous.adjustment}</p></aside>}
    <form className="goal-form" onSubmit={async e => { e.preventDefault(); if (pending.current) return; pending.current = true; setBusy(true); setMessage(''); try { const result = await act('goal.review.save',{ goalId: goal.id,week,adjustment,previousOutcome }); setMessage(result.ok ? 'Weekly review saved.' : result.error); } finally { pending.current = false; setBusy(false); } }}>
      {previous?.adjustment && <label className="form-label">How did that adjustment fit?<Choice aria-label="Previous adjustment outcome" value={previousOutcome} onChange={e => setOutcome(e.target.value as GoalReview['previousOutcome'])}><option value="undecided">Not enough information yet</option><option value="keep">Keep trying it</option><option value="revise">Revise it</option></Choice></label>}
      <label className="form-label">One adjustment to try<textarea aria-label="One adjustment to try" rows={3} maxLength={2000} value={adjustment} onChange={e => { setAdjustment(e.target.value); setMessage(''); }} placeholder="Is the action moving the outcome forward? What one change would make next week more workable?" /></label><div className="goal-button-row"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save goal review'}</Button><span className="hint" role="status">{message}</span></div>
    </form>
    {!!suggestions.length && <Disclosure title="Ideas from your own check-ins"><p className="hint">These are practical ideas to try. Repeated self-reports do not establish a cause.</p>{suggestions.map(s => <aside className="goal-evidence" key={s.id}><strong>{s.title}</strong><p>{s.proposal}</p><p className="hint">You reported this barrier on {new Set(s.records.map(r => r.date)).size} distinct dates in the last 14 days for {domain.goalActions.find(a => a.id === s.actionId)?.title}.</p><details><summary>Supporting check-ins</summary><ul>{s.records.map(r => <li key={r.id}>{r.date} · {r.status} · {r.barrier}{r.note ? ` · ${r.note}` : ''}</li>)}</ul></details><div className="goal-button-row"><Button onClick={() => onSuggestion(s,'applied')}>Apply</Button><Button variant="ghost" size="sm" onClick={() => onSuggestion(s,'edited')}>Edit</Button><Button variant="ghost" size="sm" onClick={() => void act('goal.suggestion.decide',{ goalId: goal.id,suggestionId: s.id,decision: 'dismissed' })}>Dismiss</Button></div>{s.barrier === 'motivation' && <p className="hint">Apply pauses this goal so you can reconsider it.</p>}{s.barrier === 'capability' && <p className="hint">Apply adds an editable learning milestone.</p>}</aside>)}</Disclosure>}
  </section>;
}

/* Today's planned actions with check-ins and rescheduling; the goal list shows every goal, a workspace only its own. */
export function TodayActions({ data,act,rows,startAction,showGoal = true }: ViewProps & { rows: GoalOccurrence[]; startAction: (row: GoalOccurrence) => void; showGoal?: boolean }) {
  const domain = goalData(data), today = localDay(Date.now(),data.settings.timezone);
  const [rescheduling,setRescheduling] = useState<GoalOccurrence | null>(null), [newDate,setNewDate] = useState(addDays(today,1)), [scheduleError,setScheduleError] = useState(''), [busy,setBusy] = useState(false);
  return <>
    {rows.length ? <div className="goal-today-list">{rows.map(row => { const action = domain.goalActions.find(a => a.id === row.actionId)!; return <article className="goal-today-card" key={row.id}><div className="goal-action-heading"><div><span className="tiny-label text-caption tracking-normal">{showGoal ? `${domain.goals.find(g => g.id === row.goalId)?.title} · ` : ''}{row.date}</span><h3>{action.title}</h3><p>{row.plan.cue} → {row.plan.normal}</p><p className="hint">Smaller version: {row.plan.smaller}{row.originalDate !== row.date ? ` · Moved: ${[...row.rescheduleHistory,row.date].join(' → ')}` : ''}</p></div><div className="goal-button-row"><Button disabled={data.timer.mode !== 'idle' || busy || !data.fields.some(f => f.id === domain.goals.find(g => g.id === row.goalId)?.fieldId && !f.archived)} aria-label={`Start focus: ${action.title}`} onClick={() => startAction(row)}>Start focus</Button>{row.status === 'unrecorded' && <Button variant="ghost" size="sm" aria-label={`Reschedule: ${action.title}`} onClick={() => { setRescheduling(row); setNewDate(addDays(localDay(Date.now(),row.plan.timezone),1)); setScheduleError(''); }}>Reschedule</Button>}</div></div><ActionCheckIn key={`${row.id}_${row.updatedAt}`} row={row} act={act} title={action.title} /></article>; })}</div>
      : <EmptyState title="Room for your next action">Choose weekdays for an action in Plan &amp; review, or return on the next planned day. Earlier progress stays with you.</EmptyState>}
    <Modal open={!!rescheduling} title="Move this planned action" busy={busy} onClose={() => setRescheduling(null)}><p className="modal-intro">Its original date and earlier moves remain in history. Choose a day without another occurrence of this action.</p><label className="form-label">New action date<input aria-label="New action date" type="date" min={rescheduling ? localDay(Date.now(),rescheduling.plan.timezone) : today} value={newDate} onChange={e => setNewDate(e.target.value)} /></label>{scheduleError && <p className="goal-form-error" role="alert">{scheduleError}</p>}<div className="modal-actions"><Button disabled={busy} onClick={() => setRescheduling(null)}>Cancel</Button><Button variant="primary" disabled={busy || !newDate} onClick={async () => { setBusy(true); try { const result = await act('goal.occurrence.reschedule',{ id: rescheduling!.id,goalId: rescheduling!.goalId,originalDate: rescheduling!.originalDate,date: newDate }); if (result.ok) setRescheduling(null); else setScheduleError(result.error); } finally { setBusy(false); } }}>Save new date</Button></div></Modal>
  </>;
}

function GoalTasks({ data,act,goal,canFocus,focusGoal,openTasks }: ViewProps & { goal: Goal; canFocus: boolean; focusGoal: (goal: Goal,options?: GoalFocusOptions) => void; openTasks: (goal: Goal) => void }) {
  const [title,setTitle] = useState(''), [milestoneId,setMilestoneId] = useState(''), [showDone,setShowDone] = useState(false), [busy,setBusy] = useState(false);
  const steps = sortMilestones(goalData(data).milestones.filter(m => m.goalId === goal.id && m.kind === 'todo' && !m.archived));
  const tasks = data.tasks.filter(t => t.goalId === goal.id && !t.archived && (showDone || !t.completed)).sort((a,b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.createdAt.localeCompare(b.createdAt));
  const areaOpen = data.fields.some(f => f.id === goal.fieldId && !f.archived);
  return <section className="panel goal-tasks"><div className="section-title"><h2>Tasks for this goal</h2><label className="goal-toggle"><CheckControl aria-label="Show completed goal tasks" checked={showDone} onChange={e => setShowDone(e.target.checked)} />Show completed</label><Button variant="ghost" size="sm" onClick={() => openTasks(goal)}>Open in Tasks</Button></div>
    <form className="organizer-add goal-task-add grid grid-cols-1 items-center gap-2 min-[761px]:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto]" onSubmit={async e => { e.preventDefault(); setBusy(true); try { const result = await act('task.create',{ fieldId: goal.fieldId,title,goalId: goal.id,milestoneId: milestoneId || null,categoryId: null,dueDate: null }); if (result.ok) setTitle(''); } finally { setBusy(false); } }}>
      <input aria-label="New goal task" placeholder="Add a small next step for this goal…" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
      <Choice aria-label="Roadmap step for the new task" value={milestoneId} onChange={e => setMilestoneId(e.target.value)}><option value="">No roadmap step</option>{steps.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</Choice>
      <Button icon="plus" type="submit" disabled={busy || !title.trim() || !areaOpen || goal.status === 'archived'}>Add task</Button>
    </form>
    <div className="organizer-rows">{tasks.map(task => <div className={`organizer-task ${task.completed ? 'done' : ''}`} key={task.id}>
      <label className="task-completion"><CheckControl aria-label={`Complete ${task.title}`} checked={task.completed} onChange={e => void act('task.update',{ id: task.id,completed: e.target.checked })} /><span className="sr-only">Complete</span></label>
      <div className="task-details"><strong>{task.title}</strong>{task.notes && <p>{task.notes}</p>}<div className="task-meta">{task.milestoneId && <span>{steps.find(m => m.id === task.milestoneId)?.title ?? 'Archived step'}</span>}{task.priority === 'high' && <Badge tone="accent">High priority</Badge>}{task.dueDate && <span>Due {task.dueDate}</span>}</div></div>
      <div className="task-actions"><Button size="sm" variant="ghost" icon="focus" disabled={!canFocus || task.completed} aria-label={`Focus on ${task.title}`} onClick={() => focusGoal(goal,{ taskId: task.id,intention: task.title,milestoneId: steps.some(m => m.id === task.milestoneId) ? task.milestoneId : null })}>Focus</Button><IconButton icon="archive" label={`Archive task ${task.title}`} onClick={() => void act('task.update',{ id: task.id,archived: true })} /></div>
    </div>)}{!tasks.length && <EmptyState title="No open tasks for this goal">Add one-off steps here. Repeatable work belongs in Plan &amp; review.</EmptyState>}</div>
  </section>;
}

function StepDetails({ act,goal,step,onClose }: { act: ViewProps['act']; goal: Goal; step: GoalMilestone; onClose: () => void }) {
  const [hours,setHours] = useState(step.estimatedMinutes === null ? '' : String(Math.round(step.estimatedMinutes / 6) / 10)), [targetDate,setTargetDate] = useState(step.targetDate ?? ''), [notes,setNotes] = useState(step.notes);
  const [resources,setResources] = useState<MilestoneResource[]>(step.resources), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { const result = await act('goal.milestone.save',{ id: step.id,goalId: goal.id,estimatedMinutes: hours === '' ? null : Math.max(1,Math.round(Number(hours) * 60)),targetDate: targetDate || null,notes,resources: resources.filter(r => r.title.trim() || r.url.trim()) }); if (result.ok) onClose(); else setError(result.error); }
    finally { setBusy(false); }
  };
  return <Modal open title={step.title} description="Details for this roadmap step. They do not change the step’s title or whether it is done." busy={busy} wide onClose={onClose}><form className="goal-form" onSubmit={e => { e.preventDefault(); void save(); }}>
    <div className="goal-measure-inputs"><label className="form-label">Estimated hours<span className="optional">optional</span><input aria-label="Estimated hours" type="number" min={0.1} max={MILESTONE_DETAIL_LIMITS.estimatedMinutes / 60} step="any" value={hours} onChange={e => setHours(e.target.value)} /></label><label className="form-label">Target date<span className="optional">optional</span><input aria-label="Target date" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} /></label></div>
    <label className="form-label">Notes<span className="optional">optional</span><textarea aria-label="Step notes" rows={4} maxLength={MILESTONE_DETAIL_LIMITS.notes} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What does done look like? Which chapters, exercises or questions belong here?" /></label>
    <fieldset className="preference-group"><legend>Resources</legend>{resources.map((r,i) => <div className="step-resource" key={i}><input aria-label={`Resource ${i + 1} title`} placeholder="Title" maxLength={MILESTONE_DETAIL_LIMITS.resourceTitle} value={r.title} onChange={e => setResources(resources.map((x,j) => j === i ? { ...x,title: e.target.value } : x))} /><input aria-label={`Resource ${i + 1} link`} placeholder="https://…" maxLength={MILESTONE_DETAIL_LIMITS.url} value={r.url} onChange={e => setResources(resources.map((x,j) => j === i ? { ...x,url: e.target.value } : x))} /><IconButton icon="trash" label={`Remove resource ${i + 1}`} onClick={() => setResources(resources.filter((_,j) => j !== i))} /></div>)}<Button type="button" size="sm" variant="ghost" icon="plus" disabled={resources.length >= MILESTONE_DETAIL_LIMITS.resources} onClick={() => setResources([...resources,{ title: '',url: '' }])}>Add resource</Button><span className="hint">A book chapter, a course page, a video or a local file (http, https or file links).</span></fieldset>
    {error && <p role="alert" className="goal-form-error">{error}</p>}
    <div className="modal-actions"><Button type="button" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</Button></div>
  </form></Modal>;
}

/* The roadmap as stages and steps: a heading starts a stage; each to-do is a step with its estimate and the time recorded for it. */
function RoadmapSteps({ data,act,goal,canFocus,focusGoal }: ViewProps & { goal: Goal; canFocus: boolean; focusGoal: (goal: Goal,options?: GoalFocusOptions) => void }) {
  const [editing,setEditing] = useState<GoalMilestone | null>(null), effort = roadmapEffort(data,goal.id), today = localDay(Date.now(),data.settings.timezone);
  const rows = sortMilestones(goalData(data).milestones.filter(m => m.goalId === goal.id && !m.archived && (m.kind === 'todo' || m.kind === 'heading')));
  const stages: Array<{ heading: GoalMilestone | null; steps: GoalMilestone[] }> = [];
  for (const row of rows) { if (row.kind === 'heading') stages.push({ heading: row,steps: [] }); else { if (!stages.length) stages.push({ heading: null,steps: [] }); stages.at(-1)!.steps.push(row); } }
  const hours = (minutes: number) => minutes >= 60 ? `${(minutes / 60).toFixed(1)}h` : minutesLabel(minutes);
  if (!rows.some(r => r.kind === 'todo')) return null;
  return <section className="panel roadmap-steps"><div className="section-title"><h2>Steps, estimates and effort</h2><span className="hint">Recorded time counts sessions started for a step.</span></div>
    {stages.filter(stage => stage.steps.length).map((stage,i) => { const estimate = stage.steps.reduce((sum,m) => sum + (m.estimatedMinutes ?? 0),0), spent = stage.steps.reduce((sum,m) => sum + (effort.get(m.id) ?? 0),0); return <div className="roadmap-stage" key={stage.heading?.id ?? `stage-${i}`}>
      <div className="roadmap-stage-head"><h3>{stage.heading?.title ?? 'Steps'}</h3><span className="hint">{stage.steps.filter(m => m.completed).length}/{stage.steps.length} done · {hours(spent)} recorded{estimate ? ` of ${hours(estimate)} estimated` : ''}</span></div>
      {stage.steps.map(step => { const spentStep = effort.get(step.id) ?? 0; return <div className={`roadmap-step ${step.completed ? 'done' : ''}`} key={step.id}>
        <div className="roadmap-step-main"><strong>{step.completed && <Icon name="check" size={14} />}{step.title}</strong><span className="hint">{hours(spentStep)} recorded{step.estimatedMinutes ? ` of ${hours(step.estimatedMinutes)}` : ''}{step.targetDate ? ` · ${step.targetDate < today && !step.completed ? 'Target passed' : 'Target'} ${step.targetDate}` : ''}{step.resources.length ? ` · ${step.resources.length} resources` : ''}</span>
          {step.estimatedMinutes ? <div className="horizon-progress" aria-hidden="true"><span style={{ width: `${Math.min(100,spentStep / step.estimatedMinutes * 100)}%` }} /></div> : null}
          {step.notes && <p className="hint">{step.notes}</p>}
          {!!step.resources.length && <ul className="step-resources">{step.resources.map((r,j) => <li key={j}><strong>{r.title}</strong> <code>{r.url}</code></li>)}</ul>}</div>
        <div className="goal-button-row"><Button size="sm" variant="ghost" disabled={!canFocus || step.completed} onClick={() => focusGoal(goal,{ intention: step.title,milestoneId: step.id })}>Focus</Button><Button size="sm" variant="ghost" icon="edit" aria-label={`Edit details: ${step.title}`} onClick={() => setEditing(step)}>Details</Button></div>
      </div>; })}
    </div>; })}
    <p className="hint">Estimates are your own plan. Recorded time describes effort, not mastery.</p>
    {editing && <StepDetails act={act} goal={goal} step={editing} onClose={() => setEditing(null)} />}
  </section>;
}

// Permanent deletion, like area deletion: the main process saves a recovery backup first. Tasks and sessions stay, unlinked.
function DeleteGoal({ data,act,goal,onClose,onDeleted }: ViewProps & { goal: Goal; onClose: () => void; onDeleted: () => void }) {
  const [busy,setBusy] = useState(false), [error,setError] = useState(''); const pending = useRef(false);
  const domain = goalData(data), own = <T extends { goalId: string | null }>(rows: T[]) => rows.filter(r => r.goalId === goal.id);
  const steps = new Set(own(domain.milestones).map(m => m.id));
  const tasks = data.tasks.filter(t => t.goalId === goal.id || (t.milestoneId && steps.has(t.milestoneId)));
  const sessions = data.sessions.filter(s => s.goalId === goal.id || (s.milestoneId && steps.has(s.milestoneId)));
  const blocked = sessions.some(s => s.status !== 'completed'), minutes = sessions.reduce((sum,s) => sum + s.activeMs / 60000,0);
  const planning = own(domain.milestones).length + own(domain.goalActions).length + own(domain.goalOccurrences).length + own(domain.goalProgress).length + own(domain.goalReviews).length;
  const agent = own(domain.agentProposals).length + own(domain.agentChanges).length;
  const remove = async () => {
    if (pending.current || blocked) return;
    pending.current = true; setBusy(true); setError('');
    try { const result = await act('goal.delete',{ id: goal.id }); if (result.ok) onDeleted(); else setError(result.error); }
    catch (e) { setError(String(e)); }
    finally { pending.current = false; setBusy(false); }
  };
  return <Modal open destructive busy={busy} title="Delete this goal?" description="Permanently removes this goal and its planning records after saving a recovery backup." onClose={() => { if (!pending.current) onClose(); }}>
    <p className="hint">Removes {planning} planning {planning === 1 ? 'record' : 'records'}: roadmap rows, weekly actions, action check-ins, outcome observations and weekly reviews{agent ? `, and ${agent} agent proposals and change records` : ''}. These are included in the recovery backup.</p>
    <p className="modal-intro">Delete <strong>{goal.title}</strong>?</p>
    <div className="delete-impact"><span><strong>{tasks.length}</strong> tasks unlinked</span><span><strong>{sessions.length}</strong> sessions unlinked</span><span><strong>{minutesLabel(minutes)}</strong> recorded time kept</span></div>
    <p>Tasks and focus sessions stay in their area with their recorded time. Only their link to this goal and its steps is removed.</p>
    <p className="hint">Archive (in Edit goal) keeps the goal. Delete removes it from this dataset. A recovery backup is saved first; existing backups retain their copies.</p>
    {blocked && <p className="restore-error" role="alert">Finish this goal’s running or paused session before deleting it.</p>}
    {error && <p className="restore-error" role="alert">{error}</p>}
    <div className="modal-actions"><Button disabled={busy} onClick={onClose}>Keep goal</Button><Button variant="danger" disabled={busy || blocked} onClick={() => void remove()}>{busy ? 'Backing up & deleting…' : 'Back up & delete goal'}</Button></div>
  </Modal>;
}

export function GoalWorkspace({ data,act,goal,startAction,openTasks,focusGoal,onBack }: ViewProps & { goal: Goal; startAction: (row: GoalOccurrence) => void; openTasks: (goal: Goal) => void; focusGoal: (goal: Goal,options?: GoalFocusOptions) => void; onBack: () => void }) {
  const domain = goalData(data), today = localDay(Date.now(),data.settings.timezone), currentWeek = monday(today);
  const [section,setSection] = useState<Section>('overview'), [editing,setEditing] = useState(false), [achieving,setAchieving] = useState(false), [deleting,setDeleting] = useState(false);
  const [actionEditor,setActionEditor] = useState<{ goal: Goal; action: GoalAction | null; suggestion?: GoalSuggestion; decision?: 'applied' | 'edited' } | null>(null);
  const [week,setWeek] = useState(currentWeek), [busy,setBusy] = useState(false); const pending = useRef(false);
  const summary = goalSummary(data,goal.id,addDays(today,-27),today), area = data.fields.find(f => f.id === goal.fieldId);
  const actions = domain.goalActions.filter(a => a.goalId === goal.id), milestones = domain.milestones.filter(m => m.goalId === goal.id);
  const roadmap = sortMilestones(milestones.filter(m => !m.archived)), nextIndex = roadmap.findIndex(m => m.kind === 'todo' && !m.completed), next = roadmap[nextIndex];
  const phase = next ? roadmap.slice(0,nextIndex).reverse().find(m => m.kind === 'heading') : undefined;
  const canFocus = goal.status === 'active' && data.timer.mode === 'idle' && !!area && !area.archived;
  const recent = data.sessions.filter(s => s.goalId === goal.id && s.status === 'completed').sort((a,b) => b.startedAt.localeCompare(a.startedAt)).slice(0,5);
  const mutation = async (command: Parameters<ViewProps['act']>[0],input: Record<string,unknown>,done?: () => void) => { if (pending.current) return; pending.current = true; setBusy(true); try { const result = await act(command,input); if (result.ok) done?.(); return result; } finally { pending.current = false; setBusy(false); } };
  const suggestion = (row: GoalSuggestion,decision: 'applied' | 'edited') => {
    if (decision === 'applied' && (row.barrier === 'capability' || row.barrier === 'motivation')) void mutation('goal.suggestion.decide',{ goalId: row.goalId,suggestionId: row.id,decision });
    else setActionEditor({ goal,action: domain.goalActions.find(a => a.id === row.actionId)!,suggestion: row,decision });
  };
  return <div className="goal-workspace">
    <Button variant="ghost" size="sm" icon="chevron-left" className="goal-back" onClick={onBack}>All goals</Button>
    <PageHeader title={goal.title} description={goal.outcome || 'Define an outcome when you are ready.'} actions={<><Button variant="ghost" size="sm" icon="edit" onClick={() => setEditing(true)}>Edit goal</Button><IconButton icon="trash" tone="danger" label="Delete goal" onClick={() => setDeleting(true)} /><Button variant="primary" icon="focus" disabled={!canFocus} onClick={() => focusGoal(goal)}>Focus on this goal</Button></>} />
    <div className="goal-workspace-meta"><Badge tone={goal.status === 'active' ? 'accent' : goal.status === 'achieved' ? 'success' : 'neutral'} className="capitalize">{goal.status}</Badge><span className="hint"><i className="field-dot" style={{ background: area?.color }} />{area?.name}{area?.archived ? ' (archived)' : ''}{goal.deadline ? ` · Due ${goal.deadline}` : ''}</span>{!!goal.whyTags.length && <span className="goal-why-tags" aria-label="Why it matters">{goal.whyTags.map(tag => <Badge key={tag} tone="accent">{tag}</Badge>)}</span>}</div>
    {goal.status !== 'active' && <p className="alert notice" role="status">This goal is {goal.status}. Change its status in Edit goal to focus on it and to receive planned actions.</p>}
    <Segments className="segmented goal-workspace-nav" label="Goal workspace section" value={section} onChange={value => { if (value) setSection(value as Section); }} options={[{ value: 'overview', label: 'Overview' }, { value: 'roadmap', label: 'Roadmap' }, { value: 'tasks', label: 'Tasks' }, { value: 'behaviour', label: 'Behaviour' }, { value: 'plan', label: 'Plan & review' }]} />
    {section === 'overview' && <>
      <AgentProposals data={data} act={act} goalId={goal.id} />
      <AgentActivity data={data} act={act} goalId={goal.id} />
      <section className="panel"><div className="goal-outcome-grid"><div><span className="tiny-label text-caption tracking-normal">Recorded effort · last 28 days</span><strong>{minutesLabel(summary.minutes)}</strong><p className="hint">Finished, included focus sessions</p></div><div><span className="tiny-label text-caption tracking-normal">Roadmap</span><strong>{summary.milestones.length ? `${summary.completedMilestones}/${summary.milestones.length}` : '—'}</strong><p className="hint">Steps you confirmed</p></div><div><span className="tiny-label text-caption tracking-normal">Latest observation</span><strong>{goal.target === null ? '—' : `${summary.latestProgress?.value ?? goal.baseline} / ${goal.target}`}</strong><p className="hint">{goal.target === null ? 'Optional numeric outcome' : `${goal.unit} · ${summary.latestProgress?.date ?? 'baseline'}`}</p></div></div>
        <div className="goal-button-row">{goal.status !== 'achieved' && goal.status !== 'archived' && <Button onClick={() => setAchieving(true)}>Mark achieved</Button>}</div>
        <p className="footnote">Effort, actions, and outcomes each tell a different part of the story. Completing the timer does not mark this goal as achieved.</p></section>
      <section className="panel goal-next-step"><div className="section-title"><Icon name="arrow" /><h2>Next roadmap step</h2></div>{next ? <div className="goal-action-heading"><div>{phase && <span className="tiny-label text-caption tracking-normal">{phase.title}</span>}<h3>{next.title}</h3><p className="hint">{data.tasks.filter(t => t.milestoneId === next.id && !t.archived && !t.completed).length} open tasks linked to this step.</p></div><div className="goal-button-row"><Button disabled={!canFocus} onClick={() => focusGoal(goal,{ intention: next.title,milestoneId: next.id })}>Focus on this step</Button><Button variant="ghost" size="sm" onClick={() => setSection('roadmap')}>Open roadmap</Button></div></div> : <p className="hint">{roadmap.some(m => m.kind === 'todo') ? 'Every roadmap step is checked. Review the outcome, or add the next stage.' : 'Build a roadmap: headings for stages and to-dos for the steps you will check off.'} <Button variant="ghost" size="sm" onClick={() => setSection('roadmap')}>Open roadmap</Button></p>}</section>
      <section className="panel goals-today"><div className="section-title"><Icon name="sun" /><h2>Today’s actions for this goal</h2></div><TodayActions data={data} act={act} rows={todaysOccurrences(data).filter(row => row.goalId === goal.id)} startAction={startAction} showGoal={false} /></section>
      <section className="panel"><div className="section-title"><h2>Recent sessions</h2><Button variant="ghost" size="sm" onClick={() => setSection('behaviour')}>See behaviour</Button></div>{recent.length ? <div className="goal-history">{recent.map(s => <div className="goal-history-row" key={s.id}><span>{localDay(s.startedAt,s.timezone)}</span><strong>{minutesLabel(s.activeMs / 60000)} · {s.activityMode ?? 'Unspecified'}{s.excluded ? ' · excluded' : ''}</strong><p>{s.intention || 'Time set aside for this goal'}{s.note ? ` — ${s.note}` : ''}</p></div>)}</div> : <p className="hint">Sessions you start from this goal appear here.</p>}</section>
    </>}
    {section === 'roadmap' && <section className="panel goal-roadmap"><div className="section-title"><h2>Roadmap</h2><span className="hint">Headings mark stages; to-dos are the steps you check off.</span></div><GoalMilestones key={goal.id} goal={goal} milestones={milestones} act={act} busy={busy} />{milestones.some(m => m.archived) && <Disclosure title="Archived milestones">{milestones.filter(m => m.archived).map(m => <div className="goal-history-row" key={m.id}><strong>{m.title}</strong><Button variant="ghost" size="sm" aria-label={`Restore milestone: ${m.title}`} disabled={busy} onClick={() => void mutation('goal.milestone.save',{ id: m.id,goalId: goal.id,archived: false })}>Restore milestone</Button></div>)}</Disclosure>}</section>}
    {section === 'roadmap' && <RoadmapSteps data={data} act={act} goal={goal} canFocus={canFocus} focusGoal={focusGoal} />}
    {section === 'tasks' && <GoalTasks data={data} act={act} goal={goal} canFocus={canFocus} focusGoal={focusGoal} openTasks={openTasks} />}
    {section === 'behaviour' && <GoalBehaviour data={data} act={act} goal={goal} />}
    {section === 'plan' && <>
      <section className="panel"><div className="section-title"><h2>Weekly actions</h2><Button variant="ghost" size="sm" onClick={() => setActionEditor({ goal,action: null })}>Add action <Icon name="plus" size={15} /></Button></div>{actions.filter(a => !a.archived).map(a => { const plan = actionPlan(a,localDay(Date.now(),a.plans[0].timezone)) ?? a.plans[0], latest = a.plans.at(-1)!; return <article className="goal-plan-card" key={a.id}><h3>{a.title}</h3><p>{plan.cue} → {plan.normal}</p><p className="hint">{plan.weekdays.map(d => weekdayNames[d].slice(0,3)).join(', ')} · {plan.estimatedMinutes === null ? 'No time estimate' : `${plan.estimatedMinutes} minutes`} · {plan.activityMode}</p><p className="hint">Smaller: {plan.smaller}</p>{plan.obstacle && <p className="hint">If {plan.obstacle} → {plan.response || 'Choose a response in Edit.'}</p>}{latest.effectiveDate > today && <p className="hint">Next schedule revision: {latest.effectiveDate}</p>}<div className="goal-button-row"><Button variant="ghost" size="sm" aria-label={`Edit action: ${a.title}`} onClick={() => setActionEditor({ goal,action: a })}>Edit action</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => void mutation('goal.action.save',{ id: a.id,goalId: goal.id,title: a.title,archived: true,plan: { ...latest,enabled: false,effectiveDate: addDays(localDay(Date.now(),latest.timezone),1) } })}>Archive action</Button></div></article>; })}{!actions.some(a => !a.archived) && <p className="hint">Choose a weekly action, a cue, and a smaller fallback. Use Add action to start with an editable example.</p>}{actions.some(a => a.archived) && <Disclosure title="Archived actions">{actions.filter(a => a.archived).map(a => <div className="goal-history-row" key={a.id}><strong>{a.title}</strong><Button variant="ghost" size="sm" onClick={() => setActionEditor({ goal,action: a })}>Restore and edit</Button></div>)}</Disclosure>}</section>
      {goal.target !== null && <GoalMeasurements data={data} act={act} goal={goal} />}
      <div className="goal-review-week"><label className="form-label">Review week<Choice aria-label="Goal review week" value={week} onChange={e => setWeek(e.target.value)}>{Array.from({ length: 8 },(_,i) => addDays(currentWeek,-7*i)).map(w => <option key={w} value={w}>{w}{w === currentWeek ? ' · this week' : ''}</option>)}</Choice></label></div><GoalWeeklyReview key={`${goal.id}_${week}`} data={data} act={act} goal={goal} week={week} onSuggestion={suggestion} />
    </>}
    <p className="footnote">Private, local planning. The methods draw on behavior research; your records and suggestions do not diagnose you or establish why a result occurred.</p>
    {editing && <GoalEditor data={data} act={act} goal={goal} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    {actionEditor && <ActionEditor data={data} act={act} {...actionEditor} onClose={() => setActionEditor(null)} />}
    {deleting && <DeleteGoal data={data} act={act} goal={goal} onClose={() => setDeleting(false)} onDeleted={onBack} />}
    <Modal open={achieving} title="Confirm the outcome" busy={busy} onClose={() => setAchieving(false)}><p className="modal-intro">Have you accomplished <strong>{goal.outcome || goal.title}</strong>?</p><p className="hint">{roadmap.filter(m => m.kind === 'todo' && !m.completed).length} milestones remain unchecked. You decide whether the overall outcome has been achieved.</p><div className="modal-actions"><Button disabled={busy} onClick={() => setAchieving(false)}>Keep working</Button><Button variant="primary" disabled={busy} onClick={() => void mutation('goal.update',{ id: goal.id,status: 'achieved',confirmed: true },() => setAchieving(false))}>Confirm achieved</Button></div></Modal>
  </div>;
}
