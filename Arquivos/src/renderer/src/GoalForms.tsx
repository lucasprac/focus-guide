import { useMemo, useRef, useState } from 'react';
import type { ViewProps } from './App';
import { ACTIVITY_MODES, WHY_TAG_LIMITS, whyTagSuggestions, goalData, type Goal, type GoalAction, type GoalActionPlan, type GoalBarrier, type GoalOccurrence } from '../../shared/types';
import type { GoalSuggestion } from '../../shared/goal-planning';
import { INSIGHT_THRESHOLDS, suggestedDuration } from '../../shared/focus-insights';
import { addDays, localDay } from '../../shared/analytics';
import { Badge, Button, CheckControl, Choice, TagPicker, useDiscardGuard } from './ui';
import { MilestoneChecklist, checklistItems, filledItems, type ChecklistItem } from './MilestoneChecklist';
import { Disclosure, Modal } from './components';
import { goalStatusLabel, activityModeLabel } from '../../shared/labels';
import { t, tc } from '../../shared/i18n';

export const weekdayNames = () => [t('Sunday'),t('Monday'),t('Tuesday'),t('Wednesday'),t('Thursday'),t('Friday'),t('Saturday')];
export function GoalEditor({ data,act,goal,onClose,onSaved }: ViewProps & { goal: Goal | null; onClose: () => void; onSaved: (id: string) => void }) {
  const activeFields = data.fields.filter(f => !f.archived);
  const [id] = useState(goal?.id ?? crypto.randomUUID());
  const [title,setTitle] = useState(goal?.title ?? ''), [outcome,setOutcome] = useState(goal?.outcome ?? ''), [why,setWhy] = useState(goal?.why ?? ''), [tags,setTags] = useState<string[]>(goal?.whyTags ?? []);
  // Most goals are due the day they are made, so a new goal starts with today's local date; existing goals keep their saved value.
  const [today] = useState(() => localDay(Date.now(),data.settings.timezone));
  const [fieldId,setField] = useState(goal?.fieldId ?? activeFields[0]?.id ?? ''), [deadline,setDeadline] = useState(goal ? goal.deadline ?? '' : today);
  const [baseline,setBaseline] = useState(goal?.baseline === null || !goal ? '' : String(goal.baseline)), [target,setTarget] = useState(goal?.target === null || !goal ? '' : String(goal.target));
  const [unit,setUnit] = useState(goal?.unit ?? ''), [milestones,setMilestones] = useState<ChecklistItem[]>([]);
  const [status,setStatus] = useState(goal?.status ?? 'active'), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const pending = useRef(false), hasProgress = !!goal && goalData(data).goalProgress.some(p => p.goalId === goal.id);
  const snapshot = JSON.stringify([title,outcome,why,tags,fieldId,deadline,baseline,target,unit,status,milestones.map(m => [m.title,m.kind,m.completed])]), initial = useRef(snapshot);
  const { requestClose,discardDialog } = useDiscardGuard(snapshot !== initial.current,onClose);
  const fieldName = data.fields.find(f => f.id === fieldId)?.name;
  const needsOutcome = goal ? status === 'active' || status === 'achieved' : true;
  const save = async (draft = false) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const input = { id,title,outcome,why,whyTags: tags,fieldId,deadline: deadline || null,baseline: baseline === '' ? null : Number(baseline),target: target === '' ? null : Number(target),unit,status: draft ? 'draft' : goal ? status : 'active' };
      const result = await act(goal ? 'goal.update' : 'goal.create',goal ? input : { ...input,milestones: filledItems(milestones).map(m => ({ title: m.title,kind: m.kind,completed: m.completed })) });
      if (result.ok) onSaved(id); else setError(result.error);
    } finally { pending.current = false; setBusy(false); }
  };
  const template = (kind: string) => {
    const example = (rows: string[]) => setMilestones(checklistItems(rows.map(title => ({ title,kind: 'todo' as const,completed: false }))));
    if (kind === 'study') { setTitle(t('Learn a new subject')); setOutcome(t('Explain the main ideas and complete a practice assessment.')); setTags([t('Learning'),t('Career')]); example([t('Choose my learning materials'),t('Practice the core skills'),t('Complete a practice assessment')]); }
    if (kind === 'work') { setTitle(t('Finish my project')); setOutcome(t('Deliver a finished version that meets my acceptance checklist.')); setTags([t('Career'),t('Contribution')]); example([t('Define the deliverable'),t('Build a first version'),t('Review and finish')]); }
    if (kind === 'personal') { setTitle(t('Make room for a personal routine')); setOutcome(t('Find a routine I can comfortably maintain and review it each week.')); setTags([t('Wellbeing'),t('Health')]); example([t('Choose an accessible first action'),t('Try the routine'),t('Review what fits my life')]); }
  };
  const filled = (count: number,label: string) => count ? <Badge tone="accent">{count} {label}</Badge> : <span className="optional">{t('optional')}</span>;
  const measured = baseline !== '' || target !== '' || unit !== '';
  return <>
    <Modal open title={goal ? t('Edit your goal') : t('Make room for a goal')} busy={busy} onClose={requestClose}>
      <form className="goal-form" onSubmit={e => { e.preventDefault(); void save(); }}>
        {!goal && <div className="goal-template-row"><span className="hint">{t('Start from an example:')}</span>{[['study',t('Study')],['work',t('Work')],['personal',t('Personal')]].map(([kind,label]) => <Button type="button" size="sm" key={kind} onClick={() => template(kind)}>{label}</Button>)}</div>}
        <label className="form-label">{t('Goal title')}<span className="required">{t('Required')}</span><input aria-label={t('Goal title')} value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required placeholder={t('Finish my course, run 5 km, ship the app…')} /></label>
        <label className="form-label">{t('Desired outcome')}{needsOutcome ? <span className="required">{t('Required')}</span> : <span className="optional">{t('optional for {status} goals', { status: goalStatusLabel(status) })}</span>}<textarea aria-label={t('Desired outcome')} aria-required={needsOutcome} value={outcome} onChange={e => setOutcome(e.target.value)} maxLength={2000} rows={2} placeholder={t('What will be different when you accomplish this?')} />{!goal && <span className="hint">{t('You can save a draft without it.')}</span>}</label>
        {goal || activeFields.length === 1
          ? <p className="hint goal-field-fixed">{t('Area:')}{' '}<strong>{fieldName}</strong>{goal && t(' · A goal keeps its area so its tasks and sessions stay together.')}</p>
          : <label className="form-label">{t('Goal area')}<span className="required">{t('Required')}</span><Choice aria-label={t('Goal area')} value={fieldId} onChange={e => setField(e.target.value)}>{activeFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}{!fieldId && <option value="">{t('Add an area in Settings')}</option>}</Choice></label>}
        <div className="goal-optional-folds">
          <Disclosure title={t('Why it matters')} badge={filled(tags.length,t('chosen|chosen', { count: tags.length }))}>
            <p className="hint">{t('Choose the reasons that make this goal worth your time.')}</p>
            <TagPicker label={t('Why it matters')} value={tags} onChange={setTags} suggestions={whyTagSuggestions()} limit={WHY_TAG_LIMITS.count} maxLength={WHY_TAG_LIMITS.length} disabled={busy} />
            {why && <aside className="goal-evidence"><strong>{t('Your earlier note')}</strong><p>{why}</p><Button type="button" variant="ghost" size="sm" onClick={() => setWhy('')}>{t('Remove note')}</Button></aside>}
          </Disclosure>
          {!goal && <Disclosure title={t('Milestones')} badge={filled(filledItems(milestones).length,filledItems(milestones).length === 1 ? t('row') : t('rows'))}>
            <p className="hint">{t('Steps that show you are getting closer. You can change them later on the goal page.')}</p>
            <MilestoneChecklist items={milestones} onChange={setMilestones} disabled={busy} />
          </Disclosure>}
          <Disclosure title={t('Deadline')} badge={deadline ? <Badge tone="accent">{deadline === today ? t('Today') : deadline}</Badge> : <span className="optional">{t('optional')}</span>}>
            <label className="form-label">{t('Goal deadline')}<span className="optional">{t('optional')}</span><input aria-label={t('Goal deadline')} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></label>
            <div className="goal-button-row">{deadline ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setDeadline('')}>{t('No deadline')}</Button> : <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setDeadline(today)}>{t('Due today')}</Button>}</div>
            <p className="hint">{t('{v1}A deadline can guide planning. Passing it does not mark the goal as failed.', { v1: goal ? '' : t('New goals are due today. Choose another date or remove the deadline. ') })}</p>
          </Disclosure>
          <Disclosure title={t('Numeric outcome')} badge={measured ? <Badge tone="accent">{unit || t('set')}</Badge> : <span className="optional">{t('optional')}</span>}>
            <p className="hint">{t('Record a score, distance, number of completed units, or another measure you choose. Fill in all three, or leave all three empty. Lower targets are supported too.')}</p>
            <div className="goal-measure-inputs"><label className="form-label">{t('Baseline')}<input aria-label={t('Goal baseline')} type="number" step="any" value={baseline} onChange={e => setBaseline(e.target.value)} /></label><label className="form-label">{t('Target')}<input aria-label={t('Goal target')} type="number" step="any" value={target} onChange={e => setTarget(e.target.value)} /></label><label className="form-label">{t('Unit')}<input aria-label={t('Goal unit')} value={unit} disabled={hasProgress} onChange={e => setUnit(e.target.value)} maxLength={60} /></label></div>
          </Disclosure>
        </div>
        {goal && <label className="form-label">{t('Goal status')}<Choice aria-label={t('Goal status')} value={status} onChange={e => setStatus(e.target.value as Goal['status'])}>{['draft','active','paused','archived',...(goal.status === 'achieved' ? ['achieved'] : [])].map(s => <option key={s} value={s}>{goalStatusLabel(s)}</option>)}</Choice></label>}
        {error && <p className="goal-form-error" role="alert">{error}</p>}
        <div className="modal-actions"><Button type="button" disabled={busy} onClick={requestClose}>{t('Cancel')}</Button>{!goal && <Button variant="ghost" type="button" disabled={busy || !title.trim() || !fieldId} onClick={() => void save(true)}>{t('Save as draft')}</Button>}<Button variant="primary" type="submit" disabled={busy || !title.trim() || !fieldId || needsOutcome && !outcome.trim()}>{busy ? t('Saving…') : goal ? t('Save goal') : t('Create goal')}</Button></div>
      </form>
    </Modal>
    {discardDialog}
  </>;
}

export function ActionEditor({ data,act,goal,action,onClose,suggestion,decision = 'edited' }: ViewProps & { goal: Goal; action: GoalAction | null; onClose: () => void; suggestion?: GoalSuggestion; decision?: 'applied' | 'edited' }) {
  const latest = action?.plans.at(-1), today = localDay(Date.now(),latest?.timezone ?? data.settings.timezone);
  const [id] = useState(action?.id ?? crypto.randomUUID()), [title,setTitle] = useState(action?.title ?? '');
  const [plan,setPlan] = useState<GoalActionPlan>({ effectiveDate: action ? addDays(today,1) : today,timezone: latest?.timezone ?? data.settings.timezone,weekdays: latest?.weekdays ?? [1,3,5],cue: latest?.cue ?? '',normal: suggestion?.barrier === 'other' && decision === 'applied' ? latest?.smaller ?? '' : latest?.normal ?? '',smaller: latest?.smaller ?? '',obstacle: latest?.obstacle ?? '',response: latest?.response ?? '',estimatedMinutes: latest?.estimatedMinutes ?? null,activityMode: latest?.activityMode ?? 'Unspecified',enabled: true });
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [dismissed,setDismissed] = useState(false);
  const pending = useRef(false), estimateInput = useRef<HTMLInputElement>(null);
  // One rule for "how long?": how long attention held before a drift, and only without that, the median recorded duration.
  const history = useMemo(() => suggestedDuration(data,goal.fieldId,plan.activityMode,Date.now(),goal.id),[data.sessions,data.events,data.settings.timezone,goal.fieldId,goal.id,plan.activityMode]);
  const snapshot = JSON.stringify([title,plan]), initial = useRef(snapshot);
  const { requestClose,discardDialog } = useDiscardGuard(snapshot !== initial.current,onClose);
  const change = <K extends keyof GoalActionPlan>(key: K,value: GoalActionPlan[K]) => setPlan(p => ({ ...p,[key]: value }));
  const template = (kind: string) => {
    setTitle(kind === 'study' ? t('Practice one skill') : kind === 'work' ? t('Move the next deliverable forward') : t('Take a short walk'));
    setPlan(p => ({ ...p,cue: kind === 'personal' ? t('After lunch') : t('After breakfast'),normal: kind === 'study' ? t('Complete a focused practice exercise and review mistakes.') : kind === 'work' ? t('Work on the next concrete part of the deliverable.') : t('Walk on a comfortable nearby route.'),smaller: kind === 'study' ? t('Complete one question.') : kind === 'work' ? t('Write down the next step and work on it for five minutes.') : t('Step outside for a short walk.'),obstacle: t('I have less time than expected.'),response: t('Use the smaller version and continue on the next planned day.'),estimatedMinutes: kind === 'personal' ? 15 : 25,activityMode: kind === 'personal' ? 'Offline' : kind === 'work' ? 'Writing/coding' : 'Reading' }));
  };
  const save = async () => {
    if (pending.current) return; pending.current = true; setBusy(true); setError('');
    try { const payload = { id,goalId: goal.id,title,plan,archived: false };
      const result = await act(suggestion ? 'goal.suggestion.decide' : 'goal.action.save',suggestion ? { goalId: goal.id,suggestionId: suggestion.id,decision,action: payload } : payload);
      if (result.ok) onClose(); else setError(result.error);
    } finally { pending.current = false; setBusy(false); }
  };
  return <><Modal open title={suggestion ? t('Choose a change to try') : action ? t('Edit weekly action') : t('Plan a weekly action')} busy={busy} onClose={requestClose}>
    <form className="goal-form" onSubmit={e => { e.preventDefault(); void save(); }}>
      <p className="modal-intro">{t('For')}{' '}<strong>{goal.title}</strong>{t('. Choose a cue, a practical action, and a smaller version for a difficult day.')}</p>
      {!action && <div className="goal-template-row">{[['study',t('Study action')],['work',t('Work action')],['personal',t('Personal action')]].map(([kind,label]) => <Button type="button" key={kind} onClick={() => template(kind)}>{label}</Button>)}</div>}
      <label className="form-label">{t('Action title')}<input aria-label={t('Action title')} value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} /></label>
      <label className="form-label">{t('When or after what?')}<input aria-label={t('Action cue')} placeholder={t('After breakfast, when I sit at my desk…')} value={plan.cue} onChange={e => change('cue',e.target.value)} required maxLength={500} /></label>
      <label className="form-label">{t('Normal action')}<textarea aria-label={t('Normal action')} rows={2} maxLength={500} value={plan.normal} onChange={e => change('normal',e.target.value)} required /></label>
      <label className="form-label">{t('Smaller version')}<textarea aria-label={t('Smaller version')} rows={2} maxLength={500} value={plan.smaller} onChange={e => change('smaller',e.target.value)} required /></label>
      <fieldset className="goal-weekdays"><legend>{t('Planned weekdays')}</legend>{[1,2,3,4,5,6,0].map(day => <label key={day}><CheckControl aria-label={weekdayNames()[day]} checked={plan.weekdays.includes(day)} onChange={e => change('weekdays',e.target.checked ? [...plan.weekdays,day] : plan.weekdays.filter(d => d !== day))} />{weekdayNames()[day].slice(0,3)}</label>)}</fieldset>
      <div className="goal-measure-inputs"><label className="form-label">{t('Activity context')}<Choice aria-label={t('Action activity context')} value={plan.activityMode} onChange={e => { change('activityMode',e.target.value as GoalActionPlan['activityMode']); setDismissed(false); }}>{ACTIVITY_MODES.map(mode => <option key={mode} value={mode}>{activityModeLabel(mode)}</option>)}</Choice></label><label className="form-label">{t('Estimated minutes')}{' '}<span className="optional">{t('optional')}</span><input ref={estimateInput} aria-label={t('Action estimated minutes')} type="number" min={1} max={1440} value={plan.estimatedMinutes ?? ''} onChange={e => change('estimatedMinutes',e.target.value ? Number(e.target.value) : null)} /></label></div>
      {history.eligible && !dismissed ? <aside className="goal-evidence"><strong>{t('A possible starting duration: {minutes} minutes', { minutes: history.minutes })}</strong><p>{t('{count} included {mode} sessions in this {scope}, spanning {days} days, {from}–{to}. {evidence} This describes recorded sessions, not an optimal duration.', { count: history.n, mode: activityModeLabel(plan.activityMode).toLowerCase(), scope: history.scope === 'goal' ? t('goal') : t('area'), days: history.spanDays, from: history.from, to: history.to, evidence: history.evidence })}</p><details><summary>{t('Supporting session records')}</summary><ul>{history.sessionIds.map(id => { const s = data.sessions.find(s => s.id === id)!; return <li key={id}>{t('{localDay} · {v2} minutes · {id}', { localDay: localDay(s.startedAt,s.timezone), v2: Math.round(s.activeMs/60000), id })}</li>; })}</ul></details><div className="goal-button-row"><Button type="button" onClick={() => { change('estimatedMinutes',history.minutes); setDismissed(true); }}>{t('Apply duration')}</Button><Button type="button" variant="ghost" size="sm" onClick={() => estimateInput.current?.focus()}>{t('Edit duration')}</Button><Button type="button" variant="ghost" size="sm" onClick={() => setDismissed(true)}>{t('Dismiss duration')}</Button></div></aside> : !history.eligible && <p className="hint">{t('Choose an estimate or leave it blank. Personal duration suggestions need {sessions} matching sessions with I’m back markers in the last {days} days, or {recordedSessions} matching included sessions spanning {recordedDays} days within the last {recordedWindowDays} days.', { sessions: INSIGHT_THRESHOLDS.attentionSpan.sessions, days: INSIGHT_THRESHOLDS.duration.days, recordedSessions: INSIGHT_THRESHOLDS.duration.recordedSessions, recordedDays: INSIGHT_THRESHOLDS.duration.recordedDays, recordedWindowDays: INSIGHT_THRESHOLDS.duration.recordedWindowDays })}</p>}
      <Disclosure title={t('Prepare for an obstacle')}><label className="form-label">{t('Likely obstacle')}<textarea aria-label={t('Likely obstacle')} rows={2} maxLength={500} value={plan.obstacle} onChange={e => change('obstacle',e.target.value)} /></label><label className="form-label">{t('If that happens, I will…')}<textarea aria-label={t('Obstacle response')} rows={2} maxLength={500} value={plan.response} onChange={e => change('response',e.target.value)} /></label></Disclosure>
      <label className="form-label">{t('Schedule takes effect')}<input aria-label={t('Schedule takes effect')} type="date" min={action ? addDays(today,1) : today} value={plan.effectiveDate} onChange={e => change('effectiveDate',e.target.value)} required /></label>
      <p className="hint">{t('Planning timezone: {timezone}. {v2}', { timezone: plan.timezone, v2: action ? t('Changes affect future dates; today’s plan and past check-ins keep their context.') : t('One occurrence per selected weekday. Missing a day does not erase earlier progress.') })}</p>
      {error && <p className="goal-form-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button type="button" disabled={busy} onClick={requestClose}>{t('Cancel')}</Button><Button variant="primary" type="submit" disabled={busy || !title.trim() || !plan.weekdays.length || !plan.cue.trim() || !plan.normal.trim() || !plan.smaller.trim()}>{busy ? t('Saving…') : suggestion ? t('Save adjustment') : t('Save action')}</Button></div>
    </form>
  </Modal>{discardDialog}</>;
}

export function ActionCheckIn({ row,act,title }: { row: GoalOccurrence; act: ViewProps['act']; title: string }) {
  const [barrier,setBarrier] = useState<GoalBarrier | ''>(row.barrier ?? ''), [note,setNote] = useState(row.note), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const pending = useRef(false);
  const save = async (status: GoalOccurrence['status']) => { if (pending.current) return; pending.current = true; setBusy(true); setError(''); try { const result = await act('goal.occurrence.save',{ id: row.id,goalId: row.goalId,originalDate: row.originalDate,status,barrier: barrier || null,note }); if (!result.ok) setError(result.error); } finally { pending.current = false; setBusy(false); } };
  return <div className="goal-check-in">
    <p className="hint">{t('Status: {v1}. Check-ins are optional and can be corrected.', { v1: row.status === 'done' ? tc('check-in', 'Done') : row.status === 'smaller' ? t('Smaller version') : row.status === 'skipped' ? t('Skipped') : t('Unrecorded') })}</p>
    <div className="goal-button-row">{[['done',tc('check-in', 'Done')],['smaller',t('Did the smaller version')],['skipped',t('Skip')]] .map(([status,label]) => <Button key={status} className="aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent" disabled={busy} aria-label={`${label}: ${title}`} aria-pressed={row.status === status} onClick={() => void save(status as GoalOccurrence['status'])}>{label}</Button>)}{row.status !== 'unrecorded' && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void save('unrecorded')}>{t('Clear check-in')}</Button>}</div>
    <Disclosure title={t('What helped or got in the way?')}><label className="form-label">{t('Reported barrier')}<Choice aria-label={t('Reported barrier: {title}', { title })} value={barrier} onChange={e => setBarrier(e.target.value as GoalBarrier | '')}><option value="">{t('No barrier recorded')}</option><option value="capability">{t('Skills or strategy')}</option><option value="opportunity">{t('Time, space, or access')}</option><option value="motivation">{t('Value or motivation')}</option><option value="other">{t('Other / action felt too large')}</option></Choice></label><label className="form-label">{t('Action note')}<textarea aria-label={t('Action note: {title}', { title })} rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label><Button disabled={busy || row.status === 'unrecorded'} onClick={() => void save(row.status)}>{t('Save check-in details')}</Button></Disclosure>
    {error && <p className="goal-form-error" role="alert">{error}</p>}
  </div>;
}
