import { Badge, Button, CheckControl, Choice, EmptyState, Fold, IconButton, PageHeader } from './ui';
import { useEffect, useMemo, useState } from 'react';
import { sortMilestones, type Task, type TaskCategory } from '../../shared/types';
import type { ViewProps, SessionPreparation } from './App';
import { Modal } from './components';
import { localDay } from '../../shared/analytics';
import { t, tc } from '../../shared/i18n';

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
    <input type="color" aria-label={t('Color for category {name}', { name: category.name })} value={color} onChange={e => setColor(e.target.value)} />
    <input aria-label={t('Name for category {name}', { name: category.name })} maxLength={60} value={name} onChange={e => setName(e.target.value)} />
    <div className="col-start-2 flex gap-1"><Button variant="ghost" size="sm" disabled={!name.trim() || name === category.name && color === category.color} onClick={() => void act('category.update', { id: category.id, name, color })}>{t('Save')}</Button>
    <Button variant="ghost" size="sm" aria-label={t('{v1} category {name}', { v1: category.archived ? t('Restore') : t('Archive'), name: category.name })} onClick={() => void act('category.archive', { id: category.id, archived: !category.archived })}>{category.archived ? t('Restore') : t('Archive')}</Button></div>
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
      <label className="task-completion"><CheckControl aria-label={t('Complete {title}', { title: task.title })} checked={task.completed} disabled={task.archived} onChange={e => void act('task.update', { id: task.id, completed: e.target.checked })} /><span className="sr-only">{t('Complete')}</span></label>
      <div className="task-details"><strong>{task.title}</strong>{task.notes && <p>{task.notes}</p>}<div className="task-meta"><span><i style={{ background: field?.color }} />{field?.name}</span><span><i style={{ background: category?.color ?? 'var(--muted)' }} />{category?.name ?? t('Uncategorized')}{category?.archived ? t(' (archived)') : ''}</span>{task.priority === 'high' ? <Badge tone="accent">{t('High priority')}</Badge> : task.priority === 'low' && <span>{t('Low priority')}</span>}{task.goalId && <span>{data.goals?.find(g => g.id === task.goalId)?.title}{task.milestoneId ? ` · ${data.milestones?.find(m => m.id === task.milestoneId)?.title}` : ''}</span>}{task.dueDate && <span>{t('Due {dueDate}', { dueDate: task.dueDate })}</span>}</div></div>
      <div className="task-actions">{(linked || !task.archived && !task.completed && task.fieldId === sessionField) && <label className="task-session-choice"><CheckControl aria-label={t('Include {title} in {v2} session', { title: task.title, v2: current ? t('current') : t('next') })} checked={selection.includes(task.id)} disabled={busy || !selection.includes(task.id) && selection.length >= 100} onChange={async e => { setBusy(true); try { await toggleSelection(task, e.target.checked); } finally { setBusy(false); } }} />{t('Session')}</label>}
        <IconButton icon="edit" label={t('Edit {title}', { title: task.title })} onClick={() => setEditor({ ...task })} />
        <IconButton icon={task.archived ? 'restore' : 'archive'} label={t('{v1} task {title}', { v1: task.archived ? t('Restore') : t('Archive'), title: task.title })} onClick={() => void act('task.update', { id: task.id, archived: !task.archived })} />
      </div>
    </div>;
  };
  return <>
    <PageHeader title={t('A place for your next steps.')} actions={<span className="task-total text-caption text-ink-muted">{t('{length} open tasks', { length: data.tasks.filter(t => !t.archived && !t.completed).length })}</span>} />
    <div className="tasks-workspace"><section className="panel organizer-list"><div className="section-title"><h2>{t('Your tasks')}</h2><span className="small-count">{filtered.length}</span></div>
      <form className="organizer-add goal-task-add grid grid-cols-1 items-center gap-2 min-[761px]:grid-cols-[minmax(0,1fr)_auto_auto]" onSubmit={async e => { e.preventDefault(); setBusy(true); try { const result = await act('task.create', { fieldId: data.goals?.find(g => g.id === newGoalId)?.fieldId ?? sessionField,title,categoryId: categoryId || null,goalId: newGoalId || null,milestoneId: newMilestoneId || null,dueDate: newDueDate || null }); if (result.ok) setTitle(''); } finally { setBusy(false); } }}>
        <input aria-label={t('New task')} placeholder={t('Add a small next step…')} maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
        <Button icon="plus" disabled={busy || !title.trim() || !sessionField || !!data.fields.find(f => f.id === sessionField)?.archived} type="submit">{t('Add task')}</Button>
        <Fold variant="inline" title={t('Task details')} badge={newDueDate ? <Badge tone="accent">{newDueDate === today ? tc('task', 'Due today') : t('Due {newDueDate}', { newDueDate })}</Badge> : <span className="optional">{t('No due date')}</span>} contentClassName="grid gap-2 pt-2 min-[761px]:grid-cols-3"><Choice aria-label={t('New task category')} value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">{t('Uncategorized')}</option>{data.categories.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Choice>
        <Choice aria-label={t('New task goal')} value={newGoalId} onChange={e => { setNewGoalId(e.target.value); setNewMilestoneId(''); }}><option value="">{t('No goal')}</option>{(data.goals ?? []).filter(g => g.status !== 'archived' && data.fields.some(f => f.id === g.fieldId && !f.archived)).map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</Choice>
        <Choice aria-label={t('New task milestone')} value={newMilestoneId} disabled={!newGoalId} onChange={e => setNewMilestoneId(e.target.value)}><option value="">{t('No milestone')}</option>{sortMilestones((data.milestones ?? []).filter(m => m.goalId === newGoalId && m.kind === 'todo' && !m.archived)).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</Choice>
        <div className="flex min-w-0 items-center gap-2"><input className="min-w-0 flex-1" aria-label={t('New task due date')} type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} />{newDueDate ? <Button type="button" className="shrink-0 whitespace-nowrap" variant="ghost" size="sm" onClick={() => setNewDueDate('')}>{t('No due date')}</Button> : <Button type="button" className="shrink-0 whitespace-nowrap" variant="ghost" size="sm" onClick={() => setNewDueDate(today)}>{tc('task', 'Due today')}</Button>}</div>
</Fold>
      </form>
      <div className="task-filters grid grid-cols-1 items-center gap-2 rounded-card border border-line bg-canvas p-2 min-[761px]:grid-cols-[minmax(0,1fr)_auto_auto_auto]"><input aria-label={t('Search tasks')} placeholder={t('Search titles and notes…')} value={view.search} onChange={e => preference('search', e.target.value)} />
        <Choice aria-label={t('Filter task status')} value={view.status} onChange={e => preference('status', e.target.value)}><option value="open">{t('Open')}</option><option value="completed">{tc('filter', 'Completed')}</option><option value="all">{t('All active')}</option><option value="archived">{tc('filter', 'Archived')}</option></Choice>
        <Choice aria-label={t('Sort tasks')} value={view.sort} onChange={e => preference('sort', e.target.value)}><option value="newest">{t('Newest first')}</option><option value="due">{t('Due date')}</option><option value="priority">{t('Priority')}</option><option value="title">{t('Title')}</option></Choice>
        <Fold variant="inline" icon="filter" title={t('More filters')} badge={extraFilters ? <Badge tone="accent">{extraFilters}</Badge> : null} contentClassName="grid gap-2 pt-1 sm:grid-cols-2 xl:grid-cols-4"><Choice aria-label={t('Filter task goal')} value={view.goal} onChange={e => preference('goal',e.target.value)}><option value="">{t('All goals')}</option>{(data.goals ?? []).map(g => <option key={g.id} value={g.id}>{g.title}{g.status === 'archived' ? t(' (archived)') : ''}</option>)}</Choice>
        <Choice aria-label={t('Filter task area')} value={view.field} onChange={e => preference('field', e.target.value)}><option value="">{t('All areas')}</option>{data.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Choice>
        <Choice aria-label={t('Filter task category')} value={view.category} onChange={e => preference('category', e.target.value)}><option value="">{t('All categories')}</option><option value="uncategorized">{t('Uncategorized')}</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}{c.archived ? t(' (archived)') : ''}</option>)}</Choice>
        <Choice aria-label={t('Filter task priority')} value={view.priority} onChange={e => preference('priority', e.target.value)}><option value="">{t('All priorities')}</option><option value="high">{tc('priority', 'High')}</option><option value="normal">Normal</option><option value="low">{tc('priority', 'Low')}</option></Choice></Fold>
      </div>
      <div className="organizer-rows">{filtered.map(t => row(t))}{!filtered.length && <EmptyState title={t('No tasks match this view')}>{t('Add a next step or adjust your filters.')}</EmptyState>}</div>
    </section><aside className="task-sidebar"><section className="panel session-task-panel"><div className="section-title"><h2>{current ? t('This session') : t('Prepare your next session')}</h2><span className="hint">{t('{length}/100 selected', { length: selection.length })}</span></div>
      <div className="task-session-settings"><label className="form-label">{t('Session area')}<Choice aria-label={t('Task session area')} value={sessionField} disabled={!!current} onChange={e => setPreparation({ fieldId: e.target.value, checklistIds: [], primaryTaskId: null })}>{fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}{!fields.length && <option value="">{t('Add an area in Settings')}</option>}</Choice></label>
        <label className="form-label">{t('Primary task')}{' '}<span className="optional">{t('optional')}</span><Choice aria-label={t('Primary task')} value={primary ?? ''} disabled={busy} onChange={e => setPrimary(e.target.value || null)}><option value="">{t('No primary task')}</option>{data.tasks.filter(t => selection.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</Choice></label>
        <Button variant="primary" icon="focus" disabled={!sessionField || data.timer.mode === 'break'} onClick={openFocus}>{current ? t('Return to focus') : t('Go to Focus')}</Button>
      </div>
      {current && <div className="linked-task-list">{data.tasks.filter(t => selection.includes(t.id)).map(t => row(t, true))}{!selection.length && <p className="hint">{t('Select open tasks from this session’s area below.')}</p>}</div>}
    </section><Fold title={t('Manage categories')}><section className="panel organizer-categories"><div className="section-title"><h2>{t('Categories')}</h2></div><p className="hint">{t('Your own groups and colors. Areas track time separately.')}</p>
      <form className="category-add" onSubmit={async e => { e.preventDefault(); const result = await act('category.create', { name: newCategory, color: categoryColor }); if (result.ok) setNewCategory(''); }}><input type="color" aria-label={t('New category color')} value={categoryColor} onChange={e => setCategoryColor(e.target.value)} /><input aria-label={t('New category name')} placeholder={t('A new category…')} maxLength={60} value={newCategory} onChange={e => setNewCategory(e.target.value)} /><IconButton icon="plus" type="submit" className="size-8" disabled={!newCategory.trim()} label={t('Add category')} /></form>
      {data.categories.map(c => <CategoryEditor key={c.id} category={c} act={act} />)}{!data.categories.length && <p className="hint">{t('Start with a project, Personal, or Study.')}</p>}
    </section></Fold></aside></div>
    <Modal busy={busy} open={!!(editor)} title={t('Edit task')} onClose={() => { if (!busy) setEditor(null); }}>{editor && <><form onSubmit={async e => { e.preventDefault(); setBusy(true); try { const result = await act('task.update', { id: editor.id, title: editor.title, notes: editor.notes, priority: editor.priority, dueDate: editor.dueDate, categoryId: editor.categoryId,goalId: editor.goalId ?? null,milestoneId: editor.milestoneId ?? null }); if (result.ok) setEditor(null); } finally { setBusy(false); } }}>
      <label className="form-label">{t('Title')}<input aria-label={t('Task title')} maxLength={200} value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} required /></label>
      <label className="form-label">{t('Notes')}<textarea aria-label={t('Task notes')} maxLength={2000} rows={3} value={editor.notes} onChange={e => setEditor({ ...editor, notes: e.target.value })} /></label>
      <label className="form-label">{t('Category')}<Choice aria-label={t('Task category')} value={editor.categoryId ?? ''} onChange={e => setEditor({ ...editor, categoryId: e.target.value || null })}><option value="">{t('Uncategorized')}</option>{data.categories.filter(c => !c.archived || c.id === editor.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}{c.archived ? t(' (archived)') : ''}</option>)}</Choice></label>
      <label className="form-label">{t('Goal')}<Choice aria-label={t('Task goal')} value={editor.goalId ?? ''} onChange={e => setEditor({ ...editor,goalId: e.target.value || null,milestoneId: null })}><option value="">{t('No goal')}</option>{(data.goals ?? []).filter(g => g.fieldId === editor.fieldId && (g.status !== 'archived' || g.id === editor.goalId)).map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</Choice></label>
      <label className="form-label">{t('Milestone')}<Choice aria-label={t('Task milestone')} value={editor.milestoneId ?? ''} disabled={!editor.goalId} onChange={e => setEditor({ ...editor,milestoneId: e.target.value || null })}><option value="">{t('No milestone')}</option>{sortMilestones((data.milestones ?? []).filter(m => m.goalId === editor.goalId && (m.kind === 'todo' && !m.archived || m.id === editor.milestoneId))).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</Choice></label>
      <label className="form-label">{t('Priority')}<Choice aria-label={t('Task priority')} value={editor.priority} onChange={e => setEditor({ ...editor, priority: e.target.value as Task['priority'] })}><option value="low">{tc('priority', 'Low')}</option><option value="normal">Normal</option><option value="high">{tc('priority', 'High')}</option></Choice></label>
      <label className="form-label">{t('Due date')}{' '}<span className="optional">{t('optional')}</span><input aria-label={t('Task due date')} type="date" value={editor.dueDate ?? ''} onChange={e => setEditor({ ...editor, dueDate: e.target.value || null })} /></label>
      <div className="modal-actions"><Button disabled={busy} onClick={() => setEditor(null)}>{t('Cancel')}</Button><Button variant="primary" type="submit" disabled={busy || !editor.title.trim()}>{t('Save task')}</Button></div>
    </form></>}</Modal>
  </>;
}
