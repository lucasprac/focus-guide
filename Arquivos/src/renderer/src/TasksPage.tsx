import { Badge, Button, CheckControl, Choice, EmptyState, Fold, IconButton, PageHeader } from './ui';
import { useEffect, useMemo, useState } from 'react';
import { sortMilestones, type Task, type TaskCategory } from '../../shared/types';
import type { ViewProps, SessionPreparation } from './App';
import { Disclosure, Modal } from './components';
import { localDay } from '../../shared/analytics';

type Preferences = { goal: string; search: string; field: string; category: string; status: string; priority: string; sort: string };
const defaults: Preferences = { goal: '', search: '', field: '', category: '', status: 'open', priority: '', sort: 'newest' };
const preferenceKey = 'focus-guide-task-view-v1';
function loadPreferences(): Preferences {
  try { const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}');
    const result = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, typeof saved?.[key] === 'string' ? saved[key].slice(0, 500) : value])) as Preferences;
    if (!['open', 'completed', 'all', 'archived'].includes(result.status)) result.status = defaults.status;
    if (!['', 'low', 'normal', 'high'].includes(result.priority)) result.priority = defaults.priority;
    if (!['newest', 'due', 'priority', 'title'].includes(result.sort)) result.sort = defaults.sort;
    return result;
  } catch { return defaults; }
}
function CategoryEditor({ category, act }: { category: TaskCategory; act: ViewProps['act'] }) {
  const [name, setName] = useState(category.name), [color, setColor] = useState(category.color);
  useEffect(() => { setName(category.name); setColor(category.color); }, [category.name, category.color]);
  return <div className={`category-editor ${category.archived ? 'archived' : ''}`}>
    <input type="color" aria-label={`Color for category ${category.name}`} value={color} onChange={e => setColor(e.target.value)} />
    <input aria-label={`Name for category ${category.name}`} maxLength={60} value={name} onChange={e => setName(e.target.value)} />
    <div className="col-start-2 flex gap-1"><Button variant="ghost" size="sm" disabled={!name.trim() || name === category.name && color === category.color} onClick={() => void act('category.update', { id: category.id, name, color })}>Save</Button>
    <Button variant="ghost" size="sm" aria-label={`${category.archived ? 'Restore' : 'Archive'} category ${category.name}`} onClick={() => void act('category.archive', { id: category.id, archived: !category.archived })}>{category.archived ? 'Restore' : 'Archive'}</Button></div>
  </div>;
}
export default function TasksPage({ data, act, preparation, setPreparation, openFocus, initialGoalId }: ViewProps & {
  preparation: SessionPreparation; setPreparation: (value: SessionPreparation) => void; openFocus: () => void; initialGoalId?: string | null;
}) {
  const [view, setView] = useState(() => ({ ...loadPreferences(),...(initialGoalId ? { goal: initialGoalId,status: 'all',field: '' } : {}) })), [title, setTitle] = useState(''), [newCategory, setNewCategory] = useState('');
  const [categoryColor, setCategoryColor] = useState('#8B70DE'), [categoryId, setCategoryId] = useState('');
  const [newGoalId,setNewGoalId] = useState(initialGoalId ?? ''), [newMilestoneId,setNewMilestoneId] = useState('');
  // Most next steps are due the day they are written, so new tasks start with today's local date.
  const today = localDay(Date.now(),data.settings.timezone), [newDueDate,setNewDueDate] = useState(today);
  const [editor, setEditor] = useState<Task | null>(null), [busy, setBusy] = useState(false);
  const current = data.sessions.find(s => s.id === data.timer.sessionId);
  const sessionField = current?.fieldId ?? preparation.fieldId;
  const fields = data.fields.filter(f => !f.archived || f.id === current?.fieldId);
  const selection = current?.checklistIds ?? preparation.checklistIds, primary = current ? current.primaryTaskId : preparation.primaryTaskId;
  useEffect(() => { try { localStorage.setItem(preferenceKey, JSON.stringify(view)); } catch { /* Filtering still works without local storage. */ } }, [view]);
  useEffect(() => { if (categoryId && !data.categories.some(c => c.id === categoryId && !c.archived)) setCategoryId(''); }, [data.categories, categoryId]);
  useEffect(() => {
    if (view.goal && !data.goals?.some(g => g.id === view.goal)) setView(current => ({ ...current,goal: '' }));
    if (newGoalId && !data.goals?.some(g => g.id === newGoalId && g.status !== 'archived')) { setNewGoalId(''); setNewMilestoneId(''); }
    if (view.field && !data.fields.some(f => f.id === view.field)) setView(current => ({ ...current, field: '' }));
    if (editor && !data.tasks.some(t => t.id === editor.id)) setEditor(null);
  }, [data.fields,data.tasks,data.goals,view.field,view.goal,newGoalId,editor]);
  const preference = (key: keyof Preferences, value: string) => setView(v => ({ ...v, [key]: value }));
  const filtered = useMemo(() => {
    const query = view.search.toLocaleLowerCase().trim();
    const weights = { low: 0, normal: 1, high: 2 };
    return data.tasks.filter(t => (!query || `${t.title} ${t.notes}`.toLocaleLowerCase().includes(query)) &&
      (!view.goal || t.goalId === view.goal) && (!view.field || t.fieldId === view.field) && (!view.category || (view.category === 'uncategorized' ? t.categoryId === null : t.categoryId === view.category)) &&
      (!view.priority || t.priority === view.priority) && (view.status === 'archived' ? t.archived : !t.archived && (view.status === 'all' || view.status === 'completed' ? view.status === 'all' || t.completed : !t.completed)))
      .sort((a, b) => (view.sort === 'due' ? (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') : view.sort === 'priority' ? weights[b.priority] - weights[a.priority] : view.sort === 'title' ? a.title.localeCompare(b.title) : b.createdAt.localeCompare(a.createdAt)) || a.id.localeCompare(b.id));
  }, [data.tasks, view]);
  const toggleSelection = async (task: Task, checked: boolean) => {
    const checklistIds = checked ? [...new Set([...selection, task.id])] : selection.filter(id => id !== task.id);
    const primaryTaskId = primary && checklistIds.includes(primary) ? primary : null;
    if (current) await act('session.tasks', { checklistIds, primaryTaskId });
    else setPreparation({ ...preparation,fieldId: sessionField,checklistIds,primaryTaskId });
  };
  const setPrimary = (primaryTaskId: string | null) => current ? void act('session.tasks', { checklistIds: selection, primaryTaskId }) : setPreparation({ ...preparation,primaryTaskId,goalId: undefined,occurrenceId: null,occurrenceDate: undefined,preparedAt: undefined });
  const extraFilters = [view.goal, view.field, view.category, view.priority].filter(Boolean).length;
  const row = (task: Task, linked = false) => {
    const category = data.categories.find(c => c.id === task.categoryId), field = data.fields.find(f => f.id === task.fieldId);
    return <div className={`organizer-task ${task.completed ? 'done' : ''}`} key={task.id}>
      <label className="task-completion"><CheckControl aria-label={`Complete ${task.title}`} checked={task.completed} disabled={task.archived} onChange={e => void act('task.update', { id: task.id, completed: e.target.checked })} /><span className="sr-only">Complete</span></label>
      <div className="task-details"><strong>{task.title}</strong>{task.notes && <p>{task.notes}</p>}<div className="task-meta"><span><i style={{ background: field?.color }} />{field?.name}</span><span><i style={{ background: category?.color ?? 'var(--muted)' }} />{category?.name ?? 'Uncategorized'}{category?.archived ? ' (archived)' : ''}</span>{task.priority === 'high' ? <Badge tone="accent">High priority</Badge> : task.priority === 'low' && <span>Low priority</span>}{task.goalId && <span>{data.goals?.find(g => g.id === task.goalId)?.title}{task.milestoneId ? ` · ${data.milestones?.find(m => m.id === task.milestoneId)?.title}` : ''}</span>}{task.dueDate && <span>Due {task.dueDate}</span>}</div></div>
      <div className="task-actions">{(linked || !task.archived && !task.completed && task.fieldId === sessionField) && <label className="task-session-choice"><CheckControl aria-label={`Include ${task.title} in ${current ? 'current' : 'next'} session`} checked={selection.includes(task.id)} disabled={busy || !selection.includes(task.id) && selection.length >= 100} onChange={async e => { setBusy(true); try { await toggleSelection(task, e.target.checked); } finally { setBusy(false); } }} />Session</label>}
        <IconButton icon="edit" label={`Edit ${task.title}`} onClick={() => setEditor({ ...task })} />
        <IconButton icon={task.archived ? 'restore' : 'archive'} label={`${task.archived ? 'Restore' : 'Archive'} task ${task.title}`} onClick={() => void act('task.update', { id: task.id, archived: !task.archived })} />
      </div>
    </div>;
  };
  return <>
    <PageHeader title="A place for your next steps." actions={<span className="task-total text-caption text-ink-muted">{data.tasks.filter(t => !t.archived && !t.completed).length} open tasks</span>} />
    <div className="tasks-workspace"><section className="panel organizer-list"><div className="section-title"><h2>Your tasks</h2><span className="small-count">{filtered.length}</span></div>
      <form className="organizer-add goal-task-add grid grid-cols-1 items-center gap-2 min-[761px]:grid-cols-[minmax(0,1fr)_auto_auto]" onSubmit={async e => { e.preventDefault(); setBusy(true); try { const result = await act('task.create', { fieldId: data.goals?.find(g => g.id === newGoalId)?.fieldId ?? sessionField,title,categoryId: categoryId || null,goalId: newGoalId || null,milestoneId: newMilestoneId || null,dueDate: newDueDate || null }); if (result.ok) setTitle(''); } finally { setBusy(false); } }}>
        <input aria-label="New task" placeholder="Add a small next step…" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
        <Button icon="plus" disabled={busy || !title.trim() || !sessionField || !!data.fields.find(f => f.id === sessionField)?.archived} type="submit">Add task</Button>
        <Fold variant="inline" title="Task details" badge={newDueDate ? <Badge tone="accent">{newDueDate === today ? 'Due today' : `Due ${newDueDate}`}</Badge> : <span className="optional">No due date</span>} contentClassName="grid gap-2 pt-2 min-[761px]:grid-cols-3"><Choice aria-label="New task category" value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Uncategorized</option>{data.categories.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Choice>
        <Choice aria-label="New task goal" value={newGoalId} onChange={e => { setNewGoalId(e.target.value); setNewMilestoneId(''); }}><option value="">No goal</option>{(data.goals ?? []).filter(g => g.status !== 'archived' && data.fields.some(f => f.id === g.fieldId && !f.archived)).map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</Choice>
        <Choice aria-label="New task milestone" value={newMilestoneId} disabled={!newGoalId} onChange={e => setNewMilestoneId(e.target.value)}><option value="">No milestone</option>{sortMilestones((data.milestones ?? []).filter(m => m.goalId === newGoalId && m.kind === 'todo' && !m.archived)).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</Choice>
        <div className="flex min-w-0 items-center gap-2"><input className="min-w-0 flex-1" aria-label="New task due date" type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} />{newDueDate ? <Button type="button" className="shrink-0 whitespace-nowrap" variant="ghost" size="sm" onClick={() => setNewDueDate('')}>No due date</Button> : <Button type="button" className="shrink-0 whitespace-nowrap" variant="ghost" size="sm" onClick={() => setNewDueDate(today)}>Due today</Button>}</div>
</Fold>
      </form>
      <div className="task-filters grid grid-cols-1 items-center gap-2 rounded-card border border-line bg-canvas p-2 min-[761px]:grid-cols-[minmax(0,1fr)_auto_auto_auto]"><input aria-label="Search tasks" placeholder="Search titles and notes…" value={view.search} onChange={e => preference('search', e.target.value)} />
        <Choice aria-label="Filter task status" value={view.status} onChange={e => preference('status', e.target.value)}><option value="open">Open</option><option value="completed">Completed</option><option value="all">All active</option><option value="archived">Archived</option></Choice>
        <Choice aria-label="Sort tasks" value={view.sort} onChange={e => preference('sort', e.target.value)}><option value="newest">Newest first</option><option value="due">Due date</option><option value="priority">Priority</option><option value="title">Title</option></Choice>
        <Fold variant="inline" icon="filter" title="More filters" badge={extraFilters ? <Badge tone="accent">{extraFilters}</Badge> : null} contentClassName="grid gap-2 pt-1 sm:grid-cols-2 xl:grid-cols-4"><Choice aria-label="Filter task goal" value={view.goal} onChange={e => preference('goal',e.target.value)}><option value="">All goals</option>{(data.goals ?? []).map(g => <option key={g.id} value={g.id}>{g.title}{g.status === 'archived' ? ' (archived)' : ''}</option>)}</Choice>
        <Choice aria-label="Filter task area" value={view.field} onChange={e => preference('field', e.target.value)}><option value="">All areas</option>{data.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Choice>
        <Choice aria-label="Filter task category" value={view.category} onChange={e => preference('category', e.target.value)}><option value="">All categories</option><option value="uncategorized">Uncategorized</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (archived)' : ''}</option>)}</Choice>
        <Choice aria-label="Filter task priority" value={view.priority} onChange={e => preference('priority', e.target.value)}><option value="">All priorities</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></Choice></Fold>
      </div>
      <div className="organizer-rows">{filtered.map(t => row(t))}{!filtered.length && <EmptyState title="No tasks match this view">Add a next step or adjust your filters.</EmptyState>}</div>
    </section><aside className="task-sidebar"><section className="panel session-task-panel"><div className="section-title"><h2>{current ? 'This session' : 'Prepare your next session'}</h2><span className="hint">{selection.length}/100 selected</span></div>
      <div className="task-session-settings"><label className="form-label">Session area<Choice aria-label="Task session area" value={sessionField} disabled={!!current} onChange={e => setPreparation({ fieldId: e.target.value, checklistIds: [], primaryTaskId: null })}>{fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}{!fields.length && <option value="">Add an area in Settings</option>}</Choice></label>
        <label className="form-label">Primary task <span className="optional">optional</span><Choice aria-label="Primary task" value={primary ?? ''} disabled={busy} onChange={e => setPrimary(e.target.value || null)}><option value="">No primary task</option>{data.tasks.filter(t => selection.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</Choice></label>
        <Button variant="primary" icon="focus" disabled={!sessionField || data.timer.mode === 'break'} onClick={openFocus}>{current ? 'Return to focus' : 'Go to Focus'}</Button>
      </div>
      {current && <div className="linked-task-list">{data.tasks.filter(t => selection.includes(t.id)).map(t => row(t, true))}{!selection.length && <p className="hint">Select open tasks from this session’s area below.</p>}</div>}
    </section><Disclosure title="Manage categories"><section className="panel organizer-categories"><div className="section-title"><h2>Categories</h2></div><p className="hint">Your own groups and colors. Areas track time separately.</p>
      <form className="category-add" onSubmit={async e => { e.preventDefault(); const result = await act('category.create', { name: newCategory, color: categoryColor }); if (result.ok) setNewCategory(''); }}><input type="color" aria-label="New category color" value={categoryColor} onChange={e => setCategoryColor(e.target.value)} /><input aria-label="New category name" placeholder="A new category…" maxLength={60} value={newCategory} onChange={e => setNewCategory(e.target.value)} /><IconButton icon="plus" type="submit" className="size-8" disabled={!newCategory.trim()} label="Add category" /></form>
      {data.categories.map(c => <CategoryEditor key={c.id} category={c} act={act} />)}{!data.categories.length && <p className="hint">Start with a project, Personal, or Study.</p>}
    </section></Disclosure></aside></div>
    <Modal busy={busy} open={!!(editor)} title="Edit task" onClose={() => { if (!busy) setEditor(null); }}>{editor && <><form onSubmit={async e => { e.preventDefault(); setBusy(true); try { const result = await act('task.update', { id: editor.id, title: editor.title, notes: editor.notes, priority: editor.priority, dueDate: editor.dueDate, categoryId: editor.categoryId,goalId: editor.goalId ?? null,milestoneId: editor.milestoneId ?? null }); if (result.ok) setEditor(null); } finally { setBusy(false); } }}>
      <label className="form-label">Title<input aria-label="Task title" maxLength={200} value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} required /></label>
      <label className="form-label">Notes<textarea aria-label="Task notes" maxLength={2000} rows={3} value={editor.notes} onChange={e => setEditor({ ...editor, notes: e.target.value })} /></label>
      <label className="form-label">Category<Choice aria-label="Task category" value={editor.categoryId ?? ''} onChange={e => setEditor({ ...editor, categoryId: e.target.value || null })}><option value="">Uncategorized</option>{data.categories.filter(c => !c.archived || c.id === editor.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (archived)' : ''}</option>)}</Choice></label>
      <label className="form-label">Goal<Choice aria-label="Task goal" value={editor.goalId ?? ''} onChange={e => setEditor({ ...editor,goalId: e.target.value || null,milestoneId: null })}><option value="">No goal</option>{(data.goals ?? []).filter(g => g.fieldId === editor.fieldId && (g.status !== 'archived' || g.id === editor.goalId)).map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</Choice></label>
      <label className="form-label">Milestone<Choice aria-label="Task milestone" value={editor.milestoneId ?? ''} disabled={!editor.goalId} onChange={e => setEditor({ ...editor,milestoneId: e.target.value || null })}><option value="">No milestone</option>{sortMilestones((data.milestones ?? []).filter(m => m.goalId === editor.goalId && (m.kind === 'todo' && !m.archived || m.id === editor.milestoneId))).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</Choice></label>
      <label className="form-label">Priority<Choice aria-label="Task priority" value={editor.priority} onChange={e => setEditor({ ...editor, priority: e.target.value as Task['priority'] })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></Choice></label>
      <label className="form-label">Due date <span className="optional">optional</span><input aria-label="Task due date" type="date" value={editor.dueDate ?? ''} onChange={e => setEditor({ ...editor, dueDate: e.target.value || null })} /></label>
      <div className="modal-actions"><Button disabled={busy} onClick={() => setEditor(null)}>Cancel</Button><Button variant="primary" type="submit" disabled={busy || !editor.title.trim()}>Save task</Button></div>
    </form></>}</Modal>
  </>;
}
