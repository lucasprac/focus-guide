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
    <input type="color" aria-label={`Cor da categoria ${category.name}`} value={color} onChange={e => setColor(e.target.value)} />
    <input aria-label={`Nome da categoria ${category.name}`} maxLength={60} value={name} onChange={e => setName(e.target.value)} />
    <div className="col-start-2 flex gap-1"><Button variant="ghost" size="sm" disabled={!name.trim() || name === category.name && color === category.color} onClick={() => void act('category.update', { id: category.id, name, color })}>Salvar</Button>
    <Button variant="ghost" size="sm" aria-label={`${category.archived ? 'Restaurar' : 'Arquivar'} categoria ${category.name}`} onClick={() => void act('category.archive', { id: category.id, archived: !category.archived })}>{category.archived ? 'Restaurar' : 'Arquivar'}</Button></div>
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
      <label className="task-completion"><CheckControl aria-label={`Concluir ${task.title}`} checked={task.completed} disabled={task.archived} onChange={e => void act('task.update', { id: task.id, completed: e.target.checked })} /><span className="sr-only">Concluir</span></label>
      <div className="task-details"><strong>{task.title}</strong>{task.notes && <p>{task.notes}</p>}<div className="task-meta"><span><i style={{ background: field?.color }} />{field?.name}</span><span><i style={{ background: category?.color ?? 'var(--muted)' }} />{category?.name ?? 'Sem categoria'}{category?.archived ? ' (arquivada)' : ''}</span>{task.priority === 'high' ? <Badge tone="accent">Prioridade alta</Badge> : task.priority === 'low' && <span>Prioridade baixa</span>}{task.goalId && <span>{data.goals?.find(g => g.id === task.goalId)?.title}{task.milestoneId ? ` · ${data.milestones?.find(m => m.id === task.milestoneId)?.title}` : ''}</span>}{task.dueDate && <span>Prazo {task.dueDate}</span>}</div></div>
      <div className="task-actions">{(linked || !task.archived && !task.completed && task.fieldId === sessionField) && <label className="task-session-choice"><CheckControl aria-label={`Incluir ${task.title} na ${current ? 'sessão atual' : 'próxima sessão'}`} checked={selection.includes(task.id)} disabled={busy || !selection.includes(task.id) && selection.length >= 100} onChange={async e => { setBusy(true); try { await toggleSelection(task, e.target.checked); } finally { setBusy(false); } }} />Sessão</label>}
        <IconButton icon="edit" label={`Editar ${task.title}`} onClick={() => setEditor({ ...task })} />
        <IconButton icon={task.archived ? 'restore' : 'archive'} label={`${task.archived ? 'Restaurar' : 'Arquivar'} tarefa ${task.title}`} onClick={() => void act('task.update', { id: task.id, archived: !task.archived })} />
      </div>
    </div>;
  };
  return <>
    <PageHeader title="Um lugar para os seus próximos passos." actions={<span className="task-total text-caption text-ink-muted">{data.tasks.filter(t => !t.archived && !t.completed).length} tarefas abertas</span>} />
    <div className="tasks-workspace"><section className="panel organizer-list"><div className="section-title"><h2>Suas tarefas</h2><span className="small-count">{filtered.length}</span></div>
      <form className="organizer-add goal-task-add grid grid-cols-1 items-center gap-2 min-[761px]:grid-cols-[minmax(0,1fr)_auto_auto]" onSubmit={async e => { e.preventDefault(); setBusy(true); try { const result = await act('task.create', { fieldId: data.goals?.find(g => g.id === newGoalId)?.fieldId ?? sessionField,title,categoryId: categoryId || null,goalId: newGoalId || null,milestoneId: newMilestoneId || null,dueDate: newDueDate || null }); if (result.ok) setTitle(''); } finally { setBusy(false); } }}>
        <input aria-label="Nova tarefa" placeholder="Adicione um pequeno próximo passo…" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
        <Button icon="plus" disabled={busy || !title.trim() || !sessionField || !!data.fields.find(f => f.id === sessionField)?.archived} type="submit">Adicionar tarefa</Button>
        <Fold variant="inline" title="Detalhes da tarefa" badge={newDueDate ? <Badge tone="accent">{newDueDate === today ? 'Prazo hoje' : `Prazo ${newDueDate}`}</Badge> : <span className="optional">Sem prazo</span>} contentClassName="grid gap-2 pt-2 min-[761px]:grid-cols-3"><Choice aria-label="Categoria da nova tarefa" value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Sem categoria</option>{data.categories.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Choice>
        <Choice aria-label="Meta da nova tarefa" value={newGoalId} onChange={e => { setNewGoalId(e.target.value); setNewMilestoneId(''); }}><option value="">Sem meta</option>{(data.goals ?? []).filter(g => g.status !== 'archived' && data.fields.some(f => f.id === g.fieldId && !f.archived)).map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</Choice>
        <Choice aria-label="Etapa da nova tarefa" value={newMilestoneId} disabled={!newGoalId} onChange={e => setNewMilestoneId(e.target.value)}><option value="">Sem etapa</option>{sortMilestones((data.milestones ?? []).filter(m => m.goalId === newGoalId && m.kind === 'todo' && !m.archived)).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</Choice>
        <div className="flex min-w-0 items-center gap-2"><input className="min-w-0 flex-1" aria-label="Prazo da nova tarefa" type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} />{newDueDate ? <Button type="button" className="shrink-0 whitespace-nowrap" variant="ghost" size="sm" onClick={() => setNewDueDate('')}>Sem prazo</Button> : <Button type="button" className="shrink-0 whitespace-nowrap" variant="ghost" size="sm" onClick={() => setNewDueDate(today)}>Prazo hoje</Button>}</div>
</Fold>
      </form>
      <div className="task-filters grid grid-cols-1 items-center gap-2 rounded-card border border-line bg-canvas p-2 min-[761px]:grid-cols-[minmax(0,1fr)_auto_auto_auto]"><input aria-label="Buscar tarefas" placeholder="Buscar em títulos e notas…" value={view.search} onChange={e => preference('search', e.target.value)} />
        <Choice aria-label="Filtrar status das tarefas" value={view.status} onChange={e => preference('status', e.target.value)}><option value="open">Abertas</option><option value="completed">Concluídas</option><option value="all">Todas ativas</option><option value="archived">Arquivadas</option></Choice>
        <Choice aria-label="Ordenar tarefas" value={view.sort} onChange={e => preference('sort', e.target.value)}><option value="newest">Mais recentes primeiro</option><option value="due">Prazo</option><option value="priority">Prioridade</option><option value="title">Título</option></Choice>
        <Fold variant="inline" icon="filter" title="Mais filtros" badge={extraFilters ? <Badge tone="accent">{extraFilters}</Badge> : null} contentClassName="grid gap-2 pt-1 sm:grid-cols-2 xl:grid-cols-4"><Choice aria-label="Filtrar tarefas por meta" value={view.goal} onChange={e => preference('goal',e.target.value)}><option value="">Todas as metas</option>{(data.goals ?? []).map(g => <option key={g.id} value={g.id}>{g.title}{g.status === 'archived' ? ' (arquivada)' : ''}</option>)}</Choice>
        <Choice aria-label="Filtrar tarefas por área" value={view.field} onChange={e => preference('field', e.target.value)}><option value="">Todas as áreas</option>{data.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Choice>
        <Choice aria-label="Filtrar tarefas por categoria" value={view.category} onChange={e => preference('category', e.target.value)}><option value="">Todas as categorias</option><option value="uncategorized">Sem categoria</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (arquivada)' : ''}</option>)}</Choice>
        <Choice aria-label="Filtrar tarefas por prioridade" value={view.priority} onChange={e => preference('priority', e.target.value)}><option value="">Todas as prioridades</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baixa</option></Choice></Fold>
      </div>
      <div className="organizer-rows">{filtered.map(t => row(t))}{!filtered.length && <EmptyState title="Nenhuma tarefa corresponde a esta visão">Adicione um próximo passo ou ajuste seus filtros.</EmptyState>}</div>
    </section><aside className="task-sidebar"><section className="panel session-task-panel"><div className="section-title"><h2>{current ? 'Esta sessão' : 'Prepare sua próxima sessão'}</h2><span className="hint">{selection.length}/100 selecionadas</span></div>
      <div className="task-session-settings"><label className="form-label">Área da sessão<Choice aria-label="Área da sessão da tarefa" value={sessionField} disabled={!!current} onChange={e => setPreparation({ fieldId: e.target.value, checklistIds: [], primaryTaskId: null })}>{fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}{!fields.length && <option value="">Adicione uma área em Configurações</option>}</Choice></label>
        <label className="form-label">Tarefa principal <span className="optional">opcional</span><Choice aria-label="Tarefa principal" value={primary ?? ''} disabled={busy} onChange={e => setPrimary(e.target.value || null)}><option value="">Nenhuma tarefa principal</option>{data.tasks.filter(t => selection.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</Choice></label>
        <Button variant="primary" icon="focus" disabled={!sessionField || data.timer.mode === 'break'} onClick={openFocus}>{current ? 'Voltar ao foco' : 'Ir para o Foco'}</Button>
      </div>
      {current && <div className="linked-task-list">{data.tasks.filter(t => selection.includes(t.id)).map(t => row(t, true))}{!selection.length && <p className="hint">Selecione abaixo tarefas abertas da área desta sessão.</p>}</div>}
    </section><Disclosure title="Gerenciar categorias"><section className="panel organizer-categories"><div className="section-title"><h2>Categorias</h2></div><p className="hint">Seus próprios grupos e cores. As áreas registram o tempo separadamente.</p>
      <form className="category-add" onSubmit={async e => { e.preventDefault(); const result = await act('category.create', { name: newCategory, color: categoryColor }); if (result.ok) setNewCategory(''); }}><input type="color" aria-label="Cor da nova categoria" value={categoryColor} onChange={e => setCategoryColor(e.target.value)} /><input aria-label="Nome da nova categoria" placeholder="Uma nova categoria…" maxLength={60} value={newCategory} onChange={e => setNewCategory(e.target.value)} /><IconButton icon="plus" type="submit" className="size-8" disabled={!newCategory.trim()} label="Adicionar categoria" /></form>
      {data.categories.map(c => <CategoryEditor key={c.id} category={c} act={act} />)}{!data.categories.length && <p className="hint">Comece com um projeto, Pessoal ou Estudo.</p>}
    </section></Disclosure></aside></div>
    <Modal busy={busy} open={!!(editor)} title="Editar tarefa" onClose={() => { if (!busy) setEditor(null); }}>{editor && <><form onSubmit={async e => { e.preventDefault(); setBusy(true); try { const result = await act('task.update', { id: editor.id, title: editor.title, notes: editor.notes, priority: editor.priority, dueDate: editor.dueDate, categoryId: editor.categoryId,goalId: editor.goalId ?? null,milestoneId: editor.milestoneId ?? null }); if (result.ok) setEditor(null); } finally { setBusy(false); } }}>
      <label className="form-label">Título<input aria-label="Título da tarefa" maxLength={200} value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} required /></label>
      <label className="form-label">Notas<textarea aria-label="Notas da tarefa" maxLength={2000} rows={3} value={editor.notes} onChange={e => setEditor({ ...editor, notes: e.target.value })} /></label>
      <label className="form-label">Categoria<Choice aria-label="Categoria da tarefa" value={editor.categoryId ?? ''} onChange={e => setEditor({ ...editor, categoryId: e.target.value || null })}><option value="">Sem categoria</option>{data.categories.filter(c => !c.archived || c.id === editor.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (arquivada)' : ''}</option>)}</Choice></label>
      <label className="form-label">Meta<Choice aria-label="Meta da tarefa" value={editor.goalId ?? ''} onChange={e => setEditor({ ...editor,goalId: e.target.value || null,milestoneId: null })}><option value="">Sem meta</option>{(data.goals ?? []).filter(g => g.fieldId === editor.fieldId && (g.status !== 'archived' || g.id === editor.goalId)).map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</Choice></label>
      <label className="form-label">Etapa<Choice aria-label="Etapa da tarefa" value={editor.milestoneId ?? ''} disabled={!editor.goalId} onChange={e => setEditor({ ...editor,milestoneId: e.target.value || null })}><option value="">Sem etapa</option>{sortMilestones((data.milestones ?? []).filter(m => m.goalId === editor.goalId && (m.kind === 'todo' && !m.archived || m.id === editor.milestoneId))).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</Choice></label>
      <label className="form-label">Prioridade<Choice aria-label="Prioridade da tarefa" value={editor.priority} onChange={e => setEditor({ ...editor, priority: e.target.value as Task['priority'] })}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option></Choice></label>
      <label className="form-label">Prazo <span className="optional">opcional</span><input aria-label="Prazo da tarefa" type="date" value={editor.dueDate ?? ''} onChange={e => setEditor({ ...editor, dueDate: e.target.value || null })} /></label>
      <div className="modal-actions"><Button disabled={busy} onClick={() => setEditor(null)}>Cancelar</Button><Button variant="primary" type="submit" disabled={busy || !editor.title.trim()}>Salvar tarefa</Button></div>
    </form></>}</Modal>
  </>;
}
