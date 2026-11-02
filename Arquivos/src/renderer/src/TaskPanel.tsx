import { useEffect, useMemo, useState } from 'react';
import { Dialog } from 'radix-ui';
import { GENERAL_FIELD_ID, type AppState, type Task } from '../../shared/types';
import { addDays, localDay } from '../../shared/analytics';
import type { ViewProps } from './App';
import { AgentProposals } from './AgentProposals';
import { Badge, Button, CheckControl, Choice, EmptyState, Fold, IconButton, Segments, cn } from './ui';
import { Icon } from './icons';
import { t, tc } from '../../shared/i18n';

/* The task panel: a direct list of tasks that belong to no goal, open from every page. Goal tasks, roadmap steps and
   session planning stay in Goals. A task without an area is stored in the General area; here it shows as "No area". */
const areaKey = 'focus-guide-task-area-v1';
type DueChoice = 'today' | 'tomorrow' | 'none' | 'date';
const ALL = 'all', NO_AREA = 'none';
const weights = { low: 0, normal: 1, high: 2 };

const loose = (data: AppState) => data.tasks.filter(task => !task.goalId);
/* Open tasks without a goal that are due today or earlier; the top bar shows this number. */
export function dueTaskCount(data: AppState): number {
  const today = localDay(Date.now(), data.settings.timezone);
  return loose(data).filter(task => !task.archived && !task.completed && task.dueDate !== null && task.dueDate <= today).length;
}
function savedArea(): string { try { return localStorage.getItem(areaKey) ?? NO_AREA; } catch { return NO_AREA; } }
// The panel value of a task's area: General is shown as no area.
const areaValue = (task: Task) => task.fieldId === GENERAL_FIELD_ID ? NO_AREA : task.fieldId;
const fieldInput = (value: string) => value === NO_AREA ? null : value;

function TaskRow({ data, act, task, today, focusTask }: ViewProps & { task: Task; today: string; focusTask: (task: Task) => void }) {
  const [draft, setDraft] = useState<{ title: string; notes: string; area: string; dueDate: string; priority: Task['priority'] } | null>(null), [busy, setBusy] = useState(false);
  const field = data.fields.find(f => f.id === task.fieldId), general = task.fieldId === GENERAL_FIELD_ID;
  const areas = data.fields.filter(f => f.id !== GENERAL_FIELD_ID && (!f.archived || f.id === task.fieldId));
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await act('task.update', { id: task.id, title: draft.title, notes: draft.notes, priority: draft.priority, dueDate: draft.dueDate || null, ...(draft.area !== areaValue(task) ? { fieldId: fieldInput(draft.area) } : {}) });
      if (result.ok) setDraft(null);
    } finally { setBusy(false); }
  };
  const due = task.dueDate === today ? tc('task', 'Due today') : task.dueDate === addDays(today, 1) ? t('Due tomorrow') : task.dueDate ? t('Due {dueDate}', { dueDate: task.dueDate }) : null;
  return <div className={cn('organizer-task task-panel-row', task.completed && 'done')}>
    <label className="task-completion"><CheckControl aria-label={t('Complete {title}', { title: task.title })} checked={task.completed} disabled={task.archived || busy} onChange={e => void act('task.update', { id: task.id, completed: e.target.checked })} /><span className="sr-only">{t('Complete')}</span></label>
    {draft ? <form className="task-panel-edit" onSubmit={e => { e.preventDefault(); void save(); }}>
      <input aria-label={t('Task title')} maxLength={200} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} required autoFocus />
      <textarea aria-label={t('Task notes')} placeholder={t('Notes')} maxLength={2000} rows={2} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
      <div className="task-panel-edit-fields">
        <Choice aria-label={t('Task area')} value={draft.area} onChange={e => setDraft({ ...draft, area: e.target.value })}><option value={NO_AREA}>{t('No area')}</option>{areas.map(f => <option key={f.id} value={f.id}>{f.name}{f.archived ? t(' (archived)') : ''}</option>)}</Choice>
        <input aria-label={t('Task due date')} type="date" value={draft.dueDate} onChange={e => setDraft({ ...draft, dueDate: e.target.value })} />
        <Choice aria-label={t('Task priority')} value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value as Task['priority'] })}><option value="low">{tc('priority', 'Low')}</option><option value="normal">Normal</option><option value="high">{tc('priority', 'High')}</option></Choice>
      </div>
      <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>{t('Cancel')}</Button><Button size="sm" variant="primary" type="submit" disabled={busy || !draft.title.trim()}>{t('Save task')}</Button></div>
    </form> : <button type="button" className="task-details task-panel-open" aria-label={t('Edit {title}', { title: task.title })} onClick={() => setDraft({ title: task.title, notes: task.notes, area: areaValue(task), dueDate: task.dueDate ?? '', priority: task.priority })}>
      <strong>{task.title}</strong>{task.notes && <p>{task.notes}</p>}
      <span className="task-meta">{!general && field && <span><i style={{ background: field.color }} />{field.name}</span>}{due && <span className={cn(task.dueDate! < today && !task.completed && 'task-overdue')}>{due}</span>}{task.priority === 'high' && <Badge tone="accent">{t('High priority')}</Badge>}</span>
    </button>}
    {!draft && <div className="task-actions">
      {!task.archived && !task.completed && <IconButton icon="focus" label={t('Focus on {title}', { title: task.title })} disabled={data.timer.mode !== 'idle' || !field || field.archived} onClick={() => focusTask(task)} />}
      <IconButton icon={task.archived ? 'restore' : 'archive'} label={t('{v1} task {title}', { v1: task.archived ? t('Restore') : t('Archive'), title: task.title })} onClick={() => void act('task.update', { id: task.id, archived: !task.archived })} />
    </div>}
  </div>;
}

export function TaskPanel({ data, act, open, onClose, focusTask }: ViewProps & { open: boolean; onClose: () => void; focusTask: (task: Task) => void }) {
  const today = localDay(Date.now(), data.settings.timezone);
  const [title, setTitle] = useState(''), [area, setArea] = useState(savedArea), [dueChoice, setDueChoice] = useState<DueChoice>('today'), [dueDate, setDueDate] = useState(today);
  const [filter, setFilter] = useState(ALL), [busy, setBusy] = useState(false);
  const areas = data.fields.filter(f => f.id !== GENERAL_FIELD_ID && !f.archived);
  useEffect(() => { try { localStorage.setItem(areaKey, area); } catch { /* The panel still works without local storage. */ } }, [area]);
  useEffect(() => {
    if (area !== NO_AREA && !areas.some(f => f.id === area)) setArea(NO_AREA);
    if (filter !== ALL && filter !== NO_AREA && !data.fields.some(f => f.id === filter)) setFilter(ALL);
  }, [data.fields, area, filter]);
  const tasks = useMemo(() => loose(data).filter(task => filter === ALL || areaValue(task) === filter)
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || weights[b.priority] - weights[a.priority] || a.createdAt.localeCompare(b.createdAt)), [data.tasks, filter]);
  const active = tasks.filter(task => !task.archived && !task.completed);
  const groups = [
    { key: 'overdue', title: t('Overdue'), rows: active.filter(task => task.dueDate !== null && task.dueDate < today) },
    { key: 'today', title: t('Today'), rows: active.filter(task => task.dueDate === today) },
    { key: 'upcoming', title: t('Upcoming'), rows: active.filter(task => task.dueDate !== null && task.dueDate > today) },
    { key: 'undated', title: t('No due date'), rows: active.filter(task => task.dueDate === null) }
  ].filter(group => group.rows.length);
  const completed = tasks.filter(task => !task.archived && task.completed).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20);
  const archived = tasks.filter(task => task.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50);
  const goalTasks = data.tasks.filter(task => task.goalId && !task.archived && !task.completed).length;
  const due = dueChoice === 'today' ? today : dueChoice === 'tomorrow' ? addDays(today, 1) : dueChoice === 'date' ? dueDate || null : null;
  const add = async () => {
    setBusy(true);
    try { const result = await act('task.create', { fieldId: fieldInput(area), title, dueDate: due, categoryId: null }); if (result.ok) setTitle(''); }
    finally { setBusy(false); }
  };
  const row = (task: Task) => <TaskRow key={task.id} data={data} act={act} task={task} today={today} focusTask={focusTask} />;
  return <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="modal-shade task-panel-shade" /><Dialog.Content className="task-panel" aria-describedby={undefined}>
      <div className="task-panel-head"><Dialog.Title>{t('Tasks')}</Dialog.Title><span className="hint">{t('{length} open tasks', { length: active.length })}</span>
        <Dialog.Close asChild><button type="button" className="icon-button" aria-label={t('Close tasks')}><Icon name="close" size={20} /></button></Dialog.Close></div>
      <form className="task-panel-add" onSubmit={e => { e.preventDefault(); void add(); }}>
        <input aria-label={t('New task')} placeholder={t('Add a small next step…')} maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
        <Button icon="plus" type="submit" disabled={busy || !title.trim() || dueChoice === 'date' && !dueDate}>{t('Add task')}</Button>
        <div className="task-panel-add-options">
          <Choice aria-label={t('New task area')} value={area} onChange={e => setArea(e.target.value)}><option value={NO_AREA}>{t('No area')}</option>{areas.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Choice>
          <Choice aria-label={t('New task due date')} value={dueChoice} onChange={e => setDueChoice(e.target.value as DueChoice)}><option value="today">{tc('task', 'Due today')}</option><option value="tomorrow">{t('Due tomorrow')}</option><option value="none">{t('No due date')}</option><option value="date">{t('Choose a day')}</option></Choice>
          {dueChoice === 'date' && <input aria-label={t('Due date of the new task')} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />}
        </div>
      </form>
      {areas.length > 0 && <Segments className="segmented task-panel-areas" label={t('Show tasks of an area')} value={filter} onChange={value => { if (value) setFilter(value); }}
        options={[{ value: ALL, label: t('All') }, { value: NO_AREA, label: t('No area') }, ...areas.map(f => ({ value: f.id, label: f.name }))]} />}
      <div className="task-panel-body">
        <AgentProposals data={data} act={act} goalId={null} kinds={['tasks.add']} />
        {groups.map(group => <section key={group.key} className="task-panel-group" aria-label={group.title}><h3>{group.title}<span className="small-count">{group.rows.length}</span></h3><div className="organizer-rows">{group.rows.map(row)}</div></section>)}
        {!groups.length && <EmptyState icon="check" title={t('Nothing open here')}>{t('Write the next small step above. It does not need a goal.')}</EmptyState>}
        {!!completed.length && <Fold title={tc('filter', 'Completed')} badge={<Badge>{completed.length}</Badge>}><div className="organizer-rows">{completed.map(row)}</div></Fold>}
        {!!archived.length && <Fold title={tc('filter', 'Archived')} badge={<Badge>{archived.length}</Badge>}><div className="organizer-rows">{archived.map(row)}</div></Fold>}
        {goalTasks > 0 && <p className="hint task-panel-foot">{goalTasks === 1 ? t('1 open goal task is in Goals.') : t('{length} open goal tasks are in Goals.', { length: goalTasks })}</p>}
      </div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
