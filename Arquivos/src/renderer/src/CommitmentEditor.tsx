import { useEffect, useState } from 'react';
import type { ViewProps } from './App';
import { ACTIVITY_MODES, goalData, sortMilestones, type ActivityMode, type Commitment } from '../../shared/types';
import { COMMITMENT_LIMITS, clockText, commitmentState, parseClock } from '../../shared/commitments';
import { localDay } from '../../shared/analytics';
import { activityModeLabel, commitmentStateLabel } from '../../shared/labels';
import { Badge, Button, Choice, Field } from './ui';
import { Modal } from './components';
import { t } from '../../shared/i18n';

/* What a commitment serves. A task gives its area, goal and step; a goal gives its area. */
type TargetKind = 'free' | 'area' | 'goal' | 'task';
export interface CommitmentDraft { commitment?: Commitment; date: string; startMinute: number }
interface Form { title: string; date: string; start: string; duration: number; notes: string; activityMode: ActivityMode; kind: TargetKind; fieldId: string; goalId: string; milestoneId: string; taskId: string }

function initial(data: ViewProps['data'], draft: CommitmentDraft): Form {
  const c = draft.commitment;
  const kind: TargetKind = c?.taskId ? 'task' : c?.goalId ? 'goal' : c?.fieldId ? 'area' : 'free';
  return { title: c?.title ?? '', date: c?.date ?? draft.date, start: clockText(c?.startMinute ?? draft.startMinute), duration: c?.durationMinutes ?? data.settings.defaultMinutes, notes: c?.notes ?? '', activityMode: c?.activityMode ?? 'Unspecified',
    kind, fieldId: c?.fieldId ?? '', goalId: c?.goalId ?? '', milestoneId: c?.milestoneId ?? '', taskId: c?.taskId ?? '' };
}

/* Create or change one commitment, and record what became of it. Starting focus, done and skipped are the user's actions. */
export function CommitmentEditor({ data, act, draft, onClose, onFocus }: ViewProps & { draft: CommitmentDraft | null; onClose: () => void; onFocus: (row: Commitment) => void }) {
  const [form, setForm] = useState<Form | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setForm(draft ? initial(data, draft) : null); setError(''); setConfirmDelete(false); }, [draft]);
  const saved = draft?.commitment ? data.commitments?.find(c => c.id === draft.commitment!.id) : undefined;
  const domain = goalData(data), today = localDay(Date.now(), data.settings.timezone);
  const areas = data.fields.filter(f => !f.archived || f.id === form?.fieldId);
  const goals = domain.goals.filter(g => g.status !== 'archived' && g.status !== 'achieved' || g.id === form?.goalId);
  const steps = form?.goalId ? sortMilestones(domain.milestones.filter(m => m.goalId === form.goalId && m.kind === 'todo' && (!m.archived && !m.completed || m.id === form.milestoneId))) : [];
  const tasks = data.tasks.filter(tk => !tk.archived && !tk.completed || tk.id === form?.taskId);
  const set = (change: Partial<Form>) => setForm(current => current && { ...current, ...change });
  const run = async (input: Record<string, unknown>, close = true) => {
    setBusy(true); setError('');
    try {
      const result = await act('commitment.save', input);
      if (!result.ok) { setError(result.error); return false; }
      if (close) onClose();
      return true;
    } finally { setBusy(false); }
  };
  const save = () => {
    if (!form) return;
    let startMinute: number;
    try { startMinute = parseClock(form.start); } catch (e) { setError(e instanceof Error ? e.message : String(e)); return; }
    const target = form.kind === 'task' ? { taskId: form.taskId || null, goalId: null, fieldId: null }
      : form.kind === 'goal' ? { taskId: null, goalId: form.goalId || null, milestoneId: form.milestoneId || null, fieldId: null }
        : { taskId: null, goalId: null, milestoneId: null, fieldId: form.kind === 'area' ? form.fieldId || null : null };
    void run({ ...(saved ? { id: saved.id } : {}), title: form.title, date: form.date, startMinute, durationMinutes: form.duration, notes: form.notes, activityMode: form.activityMode, ...target });
  };
  const remove = async () => {
    if (!saved) return;
    setBusy(true);
    try { const result = await act('commitment.delete', { id: saved.id }); if (result.ok) onClose(); else setError(result.error); } finally { setBusy(false); }
  };
  const state = saved ? commitmentState(saved, data.sessions) : null;
  const incomplete = !form || form.kind === 'task' && !form.taskId || form.kind === 'goal' && !form.goalId || form.kind === 'area' && !form.fieldId || !form.date || !form.start;
  return <Modal open={!!draft} title={saved ? t('Commitment') : t('New commitment')} onClose={onClose} busy={busy}>{form && <form onSubmit={e => { e.preventDefault(); save(); }}>
    {saved && state && <p className="modal-intro"><Badge tone={state === 'done' ? 'success' : state === 'missed' ? 'danger' : state === 'active' ? 'accent' : 'neutral'}>{commitmentStateLabel(state)}</Badge>{' '}{saved.origin === 'agent' ? t('Planned by your AI agent.') : t('Planned by you.')}{saved.rescheduleCount > 0 ? ` ${saved.rescheduleCount === 1 ? t('Moved once.') : t('Moved {count} times.', { count: saved.rescheduleCount })}` : ''}</p>}
    <Field label={t('Title')} optional hint={t('Leave it empty to use the name of what you plan for.')}><input value={form.title} maxLength={COMMITMENT_LIMITS.title} onChange={e => set({ title: e.target.value })} /></Field>
    <div className="commitment-time-fields">
      <Field label={t('Day')}><input type="date" required value={form.date} onChange={e => set({ date: e.target.value })} /></Field>
      <Field label={t('Start')}><input type="time" required step={300} value={form.start} onChange={e => set({ start: e.target.value })} /></Field>
      <Field label={t('Minutes')}><input type="number" required min={COMMITMENT_LIMITS.minMinutes} max={COMMITMENT_LIMITS.maxMinutes} step={5} value={form.duration} onChange={e => set({ duration: Number(e.target.value) })} /></Field>
    </div>
    <Field label={t('Plan for')}><Choice value={form.kind} onChange={e => set({ kind: e.target.value as TargetKind })}><option value="free">{t('A free focus block')}</option><option value="area">{t('An area')}</option><option value="goal">{t('A goal or roadmap step')}</option><option value="task">{t('A task')}</option></Choice></Field>
    {form.kind === 'area' && <Field label={t('Area')}><Choice value={form.fieldId} onChange={e => set({ fieldId: e.target.value })}><option value="">{t('Choose an area')}</option>{areas.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Choice></Field>}
    {form.kind === 'goal' && <><Field label={t('Goal')}><Choice value={form.goalId} onChange={e => set({ goalId: e.target.value, milestoneId: '' })}><option value="">{t('Choose a goal')}</option>{goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</Choice></Field>
      {!!steps.length && <Field label={t('Roadmap step')} optional><Choice value={form.milestoneId} onChange={e => set({ milestoneId: e.target.value })}><option value="">{t('The whole goal')}</option>{steps.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</Choice></Field>}</>}
    {form.kind === 'task' && <Field label={t('Task')}><Choice value={form.taskId} onChange={e => set({ taskId: e.target.value })}><option value="">{t('Choose a task')}</option>{tasks.map(tk => <option key={tk.id} value={tk.id}>{tk.title}{tk.goalId ? ` · ${domain.goals.find(g => g.id === tk.goalId)?.title ?? ''}` : ''}</option>)}</Choice></Field>}
    <Field label={t('Activity mode')}><Choice value={form.activityMode} onChange={e => set({ activityMode: e.target.value as ActivityMode })}>{ACTIVITY_MODES.map(mode => <option key={mode} value={mode}>{activityModeLabel(mode)}</option>)}</Choice></Field>
    <Field label={t('Notes')} optional hint={t('The first thing to do, or what done looks like.')}><textarea rows={2} maxLength={COMMITMENT_LIMITS.notes} value={form.notes} onChange={e => set({ notes: e.target.value })} /></Field>
    {error && <p role="alert" className="goal-form-error">{error}</p>}
    {saved && <div className="commitment-status-row">
      {saved.status === 'planned' && saved.date === today && <Button variant="primary" icon="play" disabled={busy || data.timer.mode !== 'idle'} onClick={() => { onClose(); onFocus(saved); }}>{t('Start focus')}</Button>}
      {saved.status === 'planned' && <Button size="sm" icon="check" disabled={busy} onClick={() => void run({ id: saved.id, status: 'done' })}>{t('Mark done')}</Button>}
      {saved.status === 'planned' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run({ id: saved.id, status: 'skipped' })}>{t('Skipped')}</Button>}
      {saved.status === 'planned' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run({ id: saved.id, status: 'cancelled' })}>{t('Cancel commitment')}</Button>}
      {saved.status !== 'planned' && <Button size="sm" icon="restore" disabled={busy} onClick={() => void run({ id: saved.id, status: 'planned' }, false)}>{t('Back to planned')}</Button>}
    </div>}
    <div className="modal-actions">
      {saved && (confirmDelete ? <Button variant="danger" disabled={busy} onClick={() => void remove()}>{t('Delete permanently')}</Button> : <Button variant="ghost" icon="trash" disabled={busy} onClick={() => setConfirmDelete(true)}>{t('Delete')}</Button>)}
      <Button disabled={busy} onClick={onClose}>{t('Close')}</Button>
      <Button variant="primary" type="submit" disabled={busy || incomplete}>{saved ? t('Save changes') : t('Add commitment')}</Button>
    </div>
  </form>}</Modal>;
}
