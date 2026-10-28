import { randomUUID } from 'node:crypto';
import type { Store } from './store';
import type { Command, Task } from '../shared/types';
import { goalData, milestoneDefaults, type Goal, type GoalAction, type GoalMilestone, type GoalOccurrence, type GoalReview, type MilestoneDetails, type MilestoneKind } from '../shared/goal-types';
import * as v from '../shared/validation';
import { goalDate, goalPlan, goalStatus, milestoneDetails, milestoneKind, validateGoalRecord, whyTags, GOAL_LIMITS } from '../shared/goal-validation';
import { MILESTONE_LIMITS } from '../shared/milestone-markdown';
import { ROADMAP_CHANGED, barrierSuggestions, plannedOccurrences, roadmapRevision } from '../shared/goal-planning';
import { localDay, monday, selectedSessions } from '../shared/analytics';
import { goalBehaviourProfile } from '../shared/behaviour-analytics';

/** An analysis range of any length: valid dates with from <= to. */
export function dateRange(input: Record<string, unknown>): { from: string; to: string } {
  let from: string, to: string;
  try { from = goalDate(input.from); to = goalDate(input.to); } catch { throw new Error('Escolha um intervalo de datas válido.'); }
  if (from > to) throw new Error('Escolha uma data inicial igual ou anterior à data final.');
  return { from, to };
}
export class GoalService {
  constructor(private store: Store) {}
  private records() { return goalData(this.store.all()); }
  private goal(id: unknown) { const goal = this.records().goals.find(g => g.id === v.id(id)); if (!goal) throw new Error('Esta meta não existe mais.'); return goal; }
  private put<K extends keyof ReturnType<typeof goalData>>(key: K, row: ReturnType<typeof goalData>[K][number]) {
    const records = this.records()[key];
    if (!records.some(r => r.id === row.id) && records.length >= GOAL_LIMITS[key]) throw new Error('O limite de registros de metas foi atingido.');
    this.store.putGoalRecord(key, validateGoalRecord(key,row) as typeof row);
  }
  taskLinks(task: Task, input: Record<string, unknown>) {
    const goalId = 'goalId' in input ? input.goalId ? v.id(input.goalId) : null : task.goalId ?? null;
    const milestoneId = 'milestoneId' in input ? input.milestoneId ? v.id(input.milestoneId) : null : goalId === task.goalId ? task.milestoneId ?? null : null;
    if (goalId) { const goal = this.goal(goalId); if (goal.fieldId !== task.fieldId || goal.status === 'archived' && goalId !== task.goalId) throw new Error('Escolha uma meta da área desta tarefa.'); }
    if (milestoneId && (!goalId || !this.records().milestones.some(m => m.id === milestoneId && m.goalId === goalId && m.kind === 'todo'))) throw new Error('Escolha uma etapa de tarefa desta meta.');
    return { goalId, milestoneId };
  }
  occurrence(input: Record<string, unknown>, now: string): GoalOccurrence {
    const id = v.id(input.id), data = this.store.all(), records = goalData(data);
    const existing = records.goalOccurrences.find(o => o.id === id);
    if (existing) return existing;
    const originalDate = goalDate(input.originalDate), goalId = v.id(input.goalId);
    const row = plannedOccurrences(data, originalDate, originalDate, goalId, Date.parse(now)).find(o => o.id === id);
    if (!row) throw new Error('Esta ação não está planejada para essa data.'); return row;
  }
  sessionLinks(fieldId: string, primaryTaskId: string | null, input: Record<string, unknown>, now: string) {
    const inferred = primaryTaskId ? this.store.task(primaryTaskId)?.goalId : null;
    const goalId = 'goalId' in input ? input.goalId ? v.id(input.goalId) : null : inferred ?? null;
    let occurrence: GoalOccurrence | null = null;
    if (goalId) { const goal = this.goal(goalId); if (goal.fieldId !== fieldId || goal.status !== 'active') throw new Error('Escolha uma meta ativa da área da sessão.'); }
    if (input.occurrenceId) {
      occurrence = this.occurrence({ id: input.occurrenceId, goalId, originalDate: input.occurrenceDate },now);
      if (!goalId || occurrence.goalId !== goalId || occurrence.date !== localDay(now,occurrence.plan.timezone) || this.records().goalActions.find(a => a.id === occurrence!.actionId)?.archived) throw new Error('Escolha uma ação planejada para hoje.');
    }
    // The roadmap step is optional and, like the goal, is fixed when the session starts.
    const milestoneId = input.milestoneId ? v.id(input.milestoneId) : null;
    if (milestoneId && (!goalId || !this.records().milestones.some(m => m.id === milestoneId && m.goalId === goalId && m.kind === 'todo' && !m.archived))) throw new Error('Escolha uma etapa do roteiro desta meta.');
    return { goalId, occurrenceId: occurrence?.id ?? null, occurrence, milestoneId };
  }
  private saveAction(input: Record<string, unknown>, now: string): GoalAction {
    const goal = this.goal(input.goalId), id = input.id ? v.id(input.id) : randomUUID();
    const existing = this.records().goalActions.find(a => a.id === id);
    if (existing && existing.goalId !== goal.id) throw new Error('Uma ação não pode ser movida para outra meta.');
    const plan = goalPlan(input.plan), today = localDay(now,plan.timezone);
    if (existing && plan.timezone !== existing.plans[0].timezone) throw new Error('Mantenha o fuso horário de planejamento original da ação.');
    if (existing && plan.effectiveDate <= today || !existing && plan.effectiveDate < today) throw new Error('Alterações de agenda entram em vigor em uma data futura.');
    const plans = existing ? [...existing.plans.filter(p => p.effectiveDate !== plan.effectiveDate),plan].sort((a,b) => a.effectiveDate.localeCompare(b.effectiveDate)) : [plan];
    const row: GoalAction = { id, goalId: goal.id, title: v.text(input.title,'Título da ação',200,true), archived: input.archived === undefined ? existing?.archived ?? false : v.bool(input.archived,'Ação arquivada'), plans, createdAt: existing?.createdAt ?? now, updatedAt: now };
    this.put('goalActions',row); return row;
  }
  private nextPosition(goalId: string) { return this.records().milestones.filter(m => m.goalId === goalId).reduce((next,m) => Math.max(next,m.position + 1),0); }
  // Rows without a kind are to-dos, as every milestone was before schema 6. Only a to-do can be done.
  private milestoneRows(value: unknown): Array<{ id: string | null; title: string; kind: MilestoneKind; completed: boolean }> {
    if (!Array.isArray(value) || value.length > MILESTONE_LIMITS.count) throw new Error(`Mantenha até ${MILESTONE_LIMITS.count} etapas em uma lista.`);
    return value.map(item => { const r = v.object(item), kind = r.kind === undefined ? 'todo' : milestoneKind(r.kind); return { id: r.id ? v.id(r.id) : null, title: v.text(r.title,'Etapa',MILESTONE_LIMITS.title,true).replace(/\s+/g,' '), kind, completed: kind === 'todo' && (r.completed === undefined ? false : v.bool(r.completed,'Etapa concluída')) }; });
  }
  // Task links point only to to-dos, so a linked to-do keeps its kind until its tasks are unlinked.
  // Sessions also point only to to-dos, and their links are history, so a step with sessions stays a to-do.
  private keepLinkedTodo(old: GoalMilestone | undefined, kind: MilestoneKind) {
    if (old?.kind !== 'todo' || kind === 'todo') return;
    const data = this.store.all();
    if (data.tasks.some(t => t.milestoneId === old.id)) throw new Error(`“${old.title}” tem tarefas vinculadas. Desvincule-as na página Tarefas antes de deixar de ser uma tarefa.`);
    if (data.sessions.some(s => s.milestoneId === old.id)) throw new Error(`“${old.title}” tem sessões de foco vinculadas, então continua sendo uma tarefa.`);
  }
  // Details survive edits of the title, order and state. A row that stops being a to-do loses its estimate and date.
  private details(old: GoalMilestone | undefined, kind: MilestoneKind): MilestoneDetails {
    const kept = old ? { estimatedMinutes: old.estimatedMinutes ?? null, targetDate: old.targetDate ?? null, notes: old.notes ?? '', resources: old.resources ?? [] } : milestoneDefaults();
    return kind === 'todo' ? kept : { ...kept, estimatedMinutes: null, targetDate: null };
  }
  private review(goalId: string, now: string): GoalReview {
    const week = monday(localDay(now,this.store.getSettings().timezone));
    return this.records().goalReviews.find(r => r.goalId === goalId && r.week === week) ?? { id: `${goalId}_${week}`, goalId, week, adjustment: '', previousOutcome: 'undecided', decisions: [], updatedAt: now };
  }
  // goal.delete: FocusService calls this with the goal of the timer's current session and the host's recovery backup.
  // A session that is not finished still writes its goal link, so deletion waits until it ends.
  remove(input: Record<string, unknown>, currentGoalId: string | null, backup?: (kind: 'goal') => void): void {
    const goal = this.goal(input.id);
    if (currentGoalId === goal.id || this.store.all().sessions.some(s => s.goalId === goal.id && s.status !== 'completed')) throw new Error('Conclua a sessão em andamento ou pausada desta meta antes de excluí-la.');
    if (!backup) throw new Error('É necessário um backup de recuperação antes de excluir uma meta.');
    backup('goal');
    this.store.removeGoal(goal.id);
  }
  run(command: Command, input: Record<string, unknown>, now: string): unknown {
    switch (command) {
      case 'goal.create': case 'goal.update': {
        const existing = command === 'goal.update' ? this.goal(input.id) : input.id ? this.records().goals.find(g => g.id === v.id(input.id)) : undefined;
        if (existing && command === 'goal.create') { if (existing.title !== v.text(input.title,'Título da meta',200,true) || existing.fieldId !== input.fieldId) throw new Error('Este identificador de meta já está em uso.'); return existing.id; }
        const status = goalStatus(input.status ?? existing?.status ?? 'draft');
        if (status === 'achieved' && existing?.status !== 'achieved' && input.confirmed !== true) throw new Error('Confirme que o resultado desta meta foi alcançado.');
        const fieldId = v.id(input.fieldId ?? existing?.fieldId), field = this.store.field(fieldId);
        if (!field || field.archived && (!existing || existing.fieldId !== fieldId)) throw new Error('Escolha uma área ativa.');
        if (existing && fieldId !== existing.fieldId) throw new Error('Uma meta mantém sua área para preservar o histórico de tarefas e sessões.');
        const changes = { ...(existing ?? {}), ...Object.fromEntries(['title','outcome','why','deadline','baseline','target','unit'].filter(k => k in input).map(k => [k,input[k]])), ...('whyTags' in input ? { whyTags: whyTags(input.whyTags) } : {}) };
        if (existing && this.records().goalProgress.some(p => p.goalId === existing.id) && (input.target === null || 'unit' in input && input.unit !== existing.unit)) throw new Error('Mantenha a unidade e a medida enquanto esta meta tiver registros de progresso.');
        const row = { title: '',outcome: '',why: '',whyTags: [],deadline: null,baseline: null,target: null,unit: '',...changes,
          id: existing?.id ?? (input.id ? v.id(input.id) : randomUUID()),fieldId,status,statusHistory: existing?.status === status ? existing.statusHistory : [...existing?.statusHistory ?? [],{ at: now,status }],createdAt: existing?.createdAt ?? now,updatedAt: now } as Goal;
        const drafts = this.milestoneRows(input.milestones ?? []);
        this.store.db.transaction(() => {
          this.put('goals',row);
          if (!existing) drafts.forEach((m,position) => this.put('milestones',{ id: randomUUID(),goalId: row.id,title: m.title,kind: m.kind,completed: m.completed,archived: false,position,createdAt: now,updatedAt: now,...milestoneDefaults() }));
        })(); return row.id;
      }
      case 'goal.milestone.save': {
        const goal = this.goal(input.goalId), id = input.id ? v.id(input.id) : randomUUID(), old = this.records().milestones.find(m => m.id === id);
        if (old && old.goalId !== goal.id) throw new Error('Uma etapa não pode ser movida para outra meta.');
        const kind = input.kind === undefined ? old?.kind ?? 'todo' : milestoneKind(input.kind), completed = input.completed === undefined ? kind === 'todo' && (old?.completed ?? false) : v.bool(input.completed,'Etapa concluída');
        if (completed && kind !== 'todo') throw new Error('Somente uma tarefa pode ser marcada como concluída.');
        this.keepLinkedTodo(old,kind);
        const kept = this.details(old,kind), details = ['estimatedMinutes','targetDate','notes','resources'].some(k => k in input) ? milestoneDetails({ ...kept,...Object.fromEntries(['estimatedMinutes','targetDate','notes','resources'].filter(k => k in input).map(k => [k,input[k]])) },kind) : kept;
        this.put('milestones',{ id,goalId: goal.id,title: v.text(input.title ?? old?.title,'Etapa',200,true),kind,completed,archived: input.archived === undefined ? old?.archived ?? false : v.bool(input.archived,'Etapa arquivada'),position: old?.position ?? this.nextPosition(goal.id),createdAt: old?.createdAt ?? now,updatedAt: now,...details }); return id;
      }
      case 'goal.milestones.sync': {
        // Replaces the order and content of a goal's active checklist. Omitted milestones are archived, never deleted, so task links survive.
        // The editor makes the identifier of a new row, so a repeated save never creates a duplicate; an unknown identifier creates that milestone.
        const goal = this.goal(input.goalId), rows = this.milestoneRows(input.rows), records = this.records().milestones, all = records.filter(m => m.goalId === goal.id);
        if (input.revision !== undefined && input.revision !== roadmapRevision(this.store.all(),goal.id)) throw new Error(ROADMAP_CHANGED);
        const kept = new Set<string>();
        for (const row of rows) if (row.id) { const old = records.find(m => m.id === row.id); if (old && old.goalId !== goal.id) throw new Error('Escolha uma etapa desta meta.'); if (kept.has(row.id)) throw new Error('Cada etapa só pode aparecer uma vez.'); this.keepLinkedTodo(old,row.kind); kept.add(row.id); }
        this.store.db.transaction(() => {
          const active = rows.length;
          rows.forEach((row,position) => { const old = row.id ? all.find(m => m.id === row.id) : undefined; this.put('milestones',{ id: row.id ?? randomUUID(),goalId: goal.id,title: row.title,kind: row.kind,completed: row.completed,archived: false,position,createdAt: old?.createdAt ?? now,updatedAt: old && old.title === row.title && old.kind === row.kind && old.completed === row.completed && !old.archived && old.position === position ? old.updatedAt : now,...this.details(old,row.kind) }); });
          all.filter(m => !m.archived && !kept.has(m.id)).forEach((m,i) => this.put('milestones',{ ...m,archived: true,position: active + i,updatedAt: now }));
        })(); return { revision: roadmapRevision(this.store.all(),goal.id) };
      }
      case 'goal.action.save': return this.saveAction(input,now).id;
      case 'goal.occurrence.save': {
        const row = this.occurrence(input,now);
        if (row.date > localDay(now,row.plan.timezone)) throw new Error('Registre uma ação depois que o dia planejado chegar.');
        const updated = { ...row,status: input.status,barrier: input.barrier ?? null,note: input.note ?? '',updatedAt: now } as GoalOccurrence;
        if (updated.status === 'unrecorded') { updated.barrier = null; updated.note = ''; }
        this.put('goalOccurrences',updated); return row.id;
      }
      case 'goal.occurrence.reschedule': {
        const row = this.occurrence(input,now), date = goalDate(input.date), goal = this.goal(row.goalId);
        if (goal.status !== 'active' || this.records().goalActions.find(a => a.id === row.actionId)?.archived) throw new Error('Ative a meta e a ação antes de reagendar.');
        if (row.status !== 'unrecorded') throw new Error('Somente uma ação sem registro pode ser reagendada.');
        if (date < localDay(now,row.plan.timezone)) throw new Error('Escolha hoje ou um dia futuro.');
        if (date === row.date) return row.id;
        if (row.rescheduleHistory.length >= 100) throw new Error('Esta ação atingiu o limite de reagendamentos.');
        if (plannedOccurrences(this.store.all(),date,date,row.goalId,Date.parse(now)).some(o => o.actionId === row.actionId && o.id !== row.id)) throw new Error('Essa ação já está planejada para este dia. Escolha outro dia.');
        this.put('goalOccurrences',{ ...row,date,rescheduleHistory: [...row.rescheduleHistory,row.date],updatedAt: now }); return row.id;
      }
      case 'goal.progress.save': {
        const goal = this.goal(input.goalId); if (goal.target === null) throw new Error('Adicione primeiro uma medida numérica à meta.');
        const id = input.id ? v.id(input.id) : randomUUID(), existing = this.records().goalProgress.find(p => p.id === id), date = goalDate(input.date);
        if (existing && existing.goalId !== goal.id) throw new Error('Uma observação de progresso não pode ser movida para outra meta.');
        if (date > localDay(now,this.store.getSettings().timezone)) throw new Error('Registre medições para hoje ou uma data anterior.');
        this.put('goalProgress',{ id,goalId: goal.id,date,value: v.number(input.value,'Valor do progresso',-1e12,1e12),note: v.text(input.note ?? '','Nota do progresso',2000),createdAt: existing?.createdAt ?? now,updatedAt: now }); return id;
      }
      case 'goal.progress.delete': { const id = v.id(input.id); if (!this.records().goalProgress.some(p => p.id === id)) throw new Error('Esta observação não existe mais.'); this.store.removeGoalProgress(id); return; }
      case 'goal.review.save': {
        const goal = this.goal(input.goalId), week = goalDate(input.week);
        if (monday(week) !== week || week > monday(localDay(now,this.store.getSettings().timezone))) throw new Error('Escolha uma segunda-feira atual ou anterior.');
        const old = this.records().goalReviews.find(r => r.goalId === goal.id && r.week === week);
        this.put('goalReviews',{ id: `${goal.id}_${week}`,goalId: goal.id,week,adjustment: v.text(input.adjustment,'Ajuste',2000),previousOutcome: (input.previousOutcome ?? 'undecided') as GoalReview['previousOutcome'],decisions: old?.decisions ?? [],updatedAt: now }); return;
      }
      case 'goal.suggestion.decide': {
        const goal = this.goal(input.goalId), suggestionId = v.text(input.suggestionId,'Identificador da sugestão',160,true), oldReview = this.review(goal.id,now);
        if (this.records().goalReviews.some(r => r.decisions.some(d => d.suggestionId === suggestionId))) return;
        const suggestion = barrierSuggestions(this.store.all(),goal.id,Date.parse(now)).find(s => s.id === suggestionId);
        if (!suggestion) throw new Error('Esta sugestão não tem mais registros correspondentes.');
        const decision = input.decision; if (typeof decision !== 'string' || !['applied','edited','dismissed'].includes(decision)) throw new Error('Escolha Aplicar, Editar ou Dispensar.');
        this.store.db.transaction(() => {
          if (decision !== 'dismissed') {
            if (input.action) { const change = v.object(input.action); if (change.id !== suggestion.actionId || change.goalId !== goal.id) throw new Error('Edite a ação sugerida.'); this.saveAction(change,now); }
            else if (suggestion.barrier === 'capability') this.put('milestones',{ id: randomUUID(),goalId: goal.id,title: `Explore a strategy for ${this.records().goalActions.find(a => a.id === suggestion.actionId)!.title}`.slice(0,200),kind: 'todo',completed: false,archived: false,position: this.nextPosition(goal.id),createdAt: now,updatedAt: now,...milestoneDefaults() });
            else if (suggestion.barrier === 'motivation') this.put('goals',{ ...goal,status: 'paused',statusHistory: [...goal.statusHistory,{ at: now,status: 'paused' }],updatedAt: now });
            else throw new Error('Escolha o gatilho revisado ou a ação menor antes de aplicar.');
          }
          this.put('goalReviews',{ ...oldReview,decisions: [...oldReview.decisions,{ suggestionId,decision: decision as GoalReview['decisions'][number]['decision'],at: now }],updatedAt: now });
        })(); return;
      }
      case 'goal.behaviour': {
        const goal = this.goal(input.goalId), { from, to } = dateRange(input);
        const data = this.store.all(), sessions = selectedSessions(data, from, to, '', goal.id);
        return goalBehaviourProfile(data, sessions.flatMap(s => this.store.activity(s.id)), goal.id, from, to, Date.parse(now));
      }
      default: throw new Error('Este comando de meta não está disponível.');
    }
  }
}
