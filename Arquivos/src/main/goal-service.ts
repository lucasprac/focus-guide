import { randomUUID } from 'node:crypto';
import type { Store } from './store';
import type { Command, Task } from '../shared/types';
import { goalData, type Goal, type GoalAction, type GoalMilestone, type GoalOccurrence, type GoalReview, type MilestoneKind } from '../shared/goal-types';
import * as v from '../shared/validation';
import { goalDate, goalPlan, goalStatus, milestoneKind, validateGoalRecord, whyTags, GOAL_LIMITS } from '../shared/goal-validation';
import { MILESTONE_LIMITS } from '../shared/milestone-markdown';
import { barrierSuggestions, plannedOccurrences } from '../shared/goal-planning';
import { localDay, monday } from '../shared/analytics';

export class GoalService {
  constructor(private store: Store) {}
  private records() { return goalData(this.store.all()); }
  private goal(id: unknown) { const goal = this.records().goals.find(g => g.id === v.id(id)); if (!goal) throw new Error('This goal no longer exists.'); return goal; }
  private put<K extends keyof ReturnType<typeof goalData>>(key: K, row: ReturnType<typeof goalData>[K][number]) {
    const records = this.records()[key];
    if (!records.some(r => r.id === row.id) && records.length >= GOAL_LIMITS[key]) throw new Error('The goal record limit has been reached.');
    this.store.putGoalRecord(key, validateGoalRecord(key,row) as typeof row);
  }
  taskLinks(task: Task, input: Record<string, unknown>) {
    const goalId = 'goalId' in input ? input.goalId ? v.id(input.goalId) : null : task.goalId ?? null;
    const milestoneId = 'milestoneId' in input ? input.milestoneId ? v.id(input.milestoneId) : null : goalId === task.goalId ? task.milestoneId ?? null : null;
    if (goalId) { const goal = this.goal(goalId); if (goal.fieldId !== task.fieldId || goal.status === 'archived' && goalId !== task.goalId) throw new Error('Choose a goal from this task’s field.'); }
    if (milestoneId && (!goalId || !this.records().milestones.some(m => m.id === milestoneId && m.goalId === goalId && m.kind === 'todo'))) throw new Error('Choose a to-do milestone from this goal.');
    return { goalId, milestoneId };
  }
  occurrence(input: Record<string, unknown>, now: string): GoalOccurrence {
    const id = v.id(input.id), data = this.store.all(), records = goalData(data);
    const existing = records.goalOccurrences.find(o => o.id === id);
    if (existing) return existing;
    const originalDate = goalDate(input.originalDate), goalId = v.id(input.goalId);
    const row = plannedOccurrences(data, originalDate, originalDate, goalId, Date.parse(now)).find(o => o.id === id);
    if (!row) throw new Error('This action is not planned for that date.'); return row;
  }
  sessionLinks(fieldId: string, primaryTaskId: string | null, input: Record<string, unknown>, now: string) {
    const inferred = primaryTaskId ? this.store.task(primaryTaskId)?.goalId : null;
    const goalId = 'goalId' in input ? input.goalId ? v.id(input.goalId) : null : inferred ?? null;
    let occurrence: GoalOccurrence | null = null;
    if (goalId) { const goal = this.goal(goalId); if (goal.fieldId !== fieldId || goal.status !== 'active') throw new Error('Choose an active goal from the session field.'); }
    if (input.occurrenceId) {
      occurrence = this.occurrence({ id: input.occurrenceId, goalId, originalDate: input.occurrenceDate },now);
      if (!goalId || occurrence.goalId !== goalId || occurrence.date !== localDay(now,occurrence.plan.timezone) || this.records().goalActions.find(a => a.id === occurrence!.actionId)?.archived) throw new Error('Choose an action planned for today.');
    }
    return { goalId, occurrenceId: occurrence?.id ?? null, occurrence };
  }
  private saveAction(input: Record<string, unknown>, now: string): GoalAction {
    const goal = this.goal(input.goalId), id = input.id ? v.id(input.id) : randomUUID();
    const existing = this.records().goalActions.find(a => a.id === id);
    if (existing && existing.goalId !== goal.id) throw new Error('An action cannot move to a different goal.');
    const plan = goalPlan(input.plan), today = localDay(now,plan.timezone);
    if (existing && plan.timezone !== existing.plans[0].timezone) throw new Error('Keep the action’s original planning timezone.');
    if (existing && plan.effectiveDate <= today || !existing && plan.effectiveDate < today) throw new Error('Schedule changes take effect on a future date.');
    const plans = existing ? [...existing.plans.filter(p => p.effectiveDate !== plan.effectiveDate),plan].sort((a,b) => a.effectiveDate.localeCompare(b.effectiveDate)) : [plan];
    const row: GoalAction = { id, goalId: goal.id, title: v.text(input.title,'Action title',200,true), archived: input.archived === undefined ? existing?.archived ?? false : v.bool(input.archived,'Archived action'), plans, createdAt: existing?.createdAt ?? now, updatedAt: now };
    this.put('goalActions',row); return row;
  }
  private nextPosition(goalId: string) { return this.records().milestones.filter(m => m.goalId === goalId).reduce((next,m) => Math.max(next,m.position + 1),0); }
  // Rows without a kind are to-dos, as every milestone was before schema 6. Only a to-do can be done.
  private milestoneRows(value: unknown): Array<{ id: string | null; title: string; kind: MilestoneKind; completed: boolean }> {
    if (!Array.isArray(value) || value.length > MILESTONE_LIMITS.count) throw new Error(`Keep up to ${MILESTONE_LIMITS.count} milestones in a checklist.`);
    return value.map(item => { const r = v.object(item), kind = r.kind === undefined ? 'todo' : milestoneKind(r.kind); return { id: r.id ? v.id(r.id) : null, title: v.text(r.title,'Milestone',MILESTONE_LIMITS.title,true).replace(/\s+/g,' '), kind, completed: kind === 'todo' && (r.completed === undefined ? false : v.bool(r.completed,'Completed milestone')) }; });
  }
  // Task links point only to to-dos, so a linked to-do keeps its kind until its tasks are unlinked.
  private keepLinkedTodo(old: GoalMilestone | undefined, kind: MilestoneKind) {
    if (old?.kind === 'todo' && kind !== 'todo' && this.store.all().tasks.some(t => t.milestoneId === old.id)) throw new Error(`“${old.title}” has linked tasks. Unlink them on the Tasks page before you change it from a to-do.`);
  }
  private review(goalId: string, now: string): GoalReview {
    const week = monday(localDay(now,this.store.getSettings().timezone));
    return this.records().goalReviews.find(r => r.goalId === goalId && r.week === week) ?? { id: `${goalId}_${week}`, goalId, week, adjustment: '', previousOutcome: 'undecided', decisions: [], updatedAt: now };
  }
  run(command: Command, input: Record<string, unknown>, now: string): unknown {
    switch (command) {
      case 'goal.create': case 'goal.update': {
        const existing = command === 'goal.update' ? this.goal(input.id) : input.id ? this.records().goals.find(g => g.id === v.id(input.id)) : undefined;
        if (existing && command === 'goal.create') { if (existing.title !== v.text(input.title,'Goal title',200,true) || existing.fieldId !== input.fieldId) throw new Error('This goal identifier is already in use.'); return existing.id; }
        const status = goalStatus(input.status ?? existing?.status ?? 'draft');
        if (status === 'achieved' && existing?.status !== 'achieved' && input.confirmed !== true) throw new Error('Confirm that this goal’s outcome was achieved.');
        const fieldId = v.id(input.fieldId ?? existing?.fieldId), field = this.store.field(fieldId);
        if (!field || field.archived && (!existing || existing.fieldId !== fieldId)) throw new Error('Choose an active focus field.');
        if (existing && fieldId !== existing.fieldId) throw new Error('A goal retains its field to preserve task and session history.');
        const changes = { ...(existing ?? {}), ...Object.fromEntries(['title','outcome','why','deadline','baseline','target','unit'].filter(k => k in input).map(k => [k,input[k]])), ...('whyTags' in input ? { whyTags: whyTags(input.whyTags) } : {}) };
        if (existing && this.records().goalProgress.some(p => p.goalId === existing.id) && (input.target === null || 'unit' in input && input.unit !== existing.unit)) throw new Error('Keep the unit and measure while this goal has progress records.');
        const row = { title: '',outcome: '',why: '',whyTags: [],deadline: null,baseline: null,target: null,unit: '',...changes,
          id: existing?.id ?? (input.id ? v.id(input.id) : randomUUID()),fieldId,status,statusHistory: existing?.status === status ? existing.statusHistory : [...existing?.statusHistory ?? [],{ at: now,status }],createdAt: existing?.createdAt ?? now,updatedAt: now } as Goal;
        const drafts = this.milestoneRows(input.milestones ?? []);
        this.store.db.transaction(() => {
          this.put('goals',row);
          if (!existing) drafts.forEach((m,position) => this.put('milestones',{ id: randomUUID(),goalId: row.id,title: m.title,kind: m.kind,completed: m.completed,archived: false,position,createdAt: now,updatedAt: now }));
        })(); return row.id;
      }
      case 'goal.milestone.save': {
        const goal = this.goal(input.goalId), id = input.id ? v.id(input.id) : randomUUID(), old = this.records().milestones.find(m => m.id === id);
        if (old && old.goalId !== goal.id) throw new Error('A milestone cannot move to another goal.');
        const kind = input.kind === undefined ? old?.kind ?? 'todo' : milestoneKind(input.kind), completed = input.completed === undefined ? kind === 'todo' && (old?.completed ?? false) : v.bool(input.completed,'Completed milestone');
        if (completed && kind !== 'todo') throw new Error('Only a to-do can be ticked.');
        this.keepLinkedTodo(old,kind);
        this.put('milestones',{ id,goalId: goal.id,title: v.text(input.title ?? old?.title,'Milestone',200,true),kind,completed,archived: input.archived === undefined ? old?.archived ?? false : v.bool(input.archived,'Archived milestone'),position: old?.position ?? this.nextPosition(goal.id),createdAt: old?.createdAt ?? now,updatedAt: now }); return id;
      }
      case 'goal.milestones.sync': {
        // Replaces the order and content of a goal's active checklist. Omitted milestones are archived, never deleted, so task links survive.
        // The editor makes the identifier of a new row, so a repeated save never creates a duplicate; an unknown identifier creates that milestone.
        const goal = this.goal(input.goalId), rows = this.milestoneRows(input.rows), records = this.records().milestones, all = records.filter(m => m.goalId === goal.id);
        const kept = new Set<string>();
        for (const row of rows) if (row.id) { const old = records.find(m => m.id === row.id); if (old && old.goalId !== goal.id) throw new Error('Choose a milestone from this goal.'); if (kept.has(row.id)) throw new Error('Each milestone can appear once.'); this.keepLinkedTodo(old,row.kind); kept.add(row.id); }
        this.store.db.transaction(() => {
          const active = rows.length;
          rows.forEach((row,position) => { const old = row.id ? all.find(m => m.id === row.id) : undefined; this.put('milestones',{ id: row.id ?? randomUUID(),goalId: goal.id,title: row.title,kind: row.kind,completed: row.completed,archived: false,position,createdAt: old?.createdAt ?? now,updatedAt: old && old.title === row.title && old.kind === row.kind && old.completed === row.completed && !old.archived && old.position === position ? old.updatedAt : now }); });
          all.filter(m => !m.archived && !kept.has(m.id)).forEach((m,i) => this.put('milestones',{ ...m,archived: true,position: active + i,updatedAt: now }));
        })(); return;
      }
      case 'goal.action.save': return this.saveAction(input,now).id;
      case 'goal.occurrence.save': {
        const row = this.occurrence(input,now);
        if (row.date > localDay(now,row.plan.timezone)) throw new Error('Record an action after its planned day arrives.');
        const updated = { ...row,status: input.status,barrier: input.barrier ?? null,note: input.note ?? '',updatedAt: now } as GoalOccurrence;
        if (updated.status === 'unrecorded') { updated.barrier = null; updated.note = ''; }
        this.put('goalOccurrences',updated); return row.id;
      }
      case 'goal.occurrence.reschedule': {
        const row = this.occurrence(input,now), date = goalDate(input.date), goal = this.goal(row.goalId);
        if (goal.status !== 'active' || this.records().goalActions.find(a => a.id === row.actionId)?.archived) throw new Error('Activate the goal and action before rescheduling.');
        if (row.status !== 'unrecorded') throw new Error('Only an unrecorded action can be rescheduled.');
        if (date < localDay(now,row.plan.timezone)) throw new Error('Choose today or a future day.');
        if (date === row.date) return row.id;
        if (row.rescheduleHistory.length >= 100) throw new Error('This action has reached its rescheduling limit.');
        if (plannedOccurrences(this.store.all(),date,date,row.goalId,Date.parse(now)).some(o => o.actionId === row.actionId && o.id !== row.id)) throw new Error('That action is already planned for this day. Choose another day.');
        this.put('goalOccurrences',{ ...row,date,rescheduleHistory: [...row.rescheduleHistory,row.date],updatedAt: now }); return row.id;
      }
      case 'goal.progress.save': {
        const goal = this.goal(input.goalId); if (goal.target === null) throw new Error('Add a numeric measure to the goal first.');
        const id = input.id ? v.id(input.id) : randomUUID(), existing = this.records().goalProgress.find(p => p.id === id), date = goalDate(input.date);
        if (existing && existing.goalId !== goal.id) throw new Error('A progress observation cannot move to another goal.');
        if (date > localDay(now,this.store.getSettings().timezone)) throw new Error('Record measurements for today or an earlier date.');
        this.put('goalProgress',{ id,goalId: goal.id,date,value: v.number(input.value,'Progress value',-1e12,1e12),note: v.text(input.note ?? '','Progress note',2000),createdAt: existing?.createdAt ?? now,updatedAt: now }); return id;
      }
      case 'goal.progress.delete': { const id = v.id(input.id); if (!this.records().goalProgress.some(p => p.id === id)) throw new Error('This observation no longer exists.'); this.store.removeGoalProgress(id); return; }
      case 'goal.review.save': {
        const goal = this.goal(input.goalId), week = goalDate(input.week);
        if (monday(week) !== week || week > monday(localDay(now,this.store.getSettings().timezone))) throw new Error('Choose a current or earlier Monday.');
        const old = this.records().goalReviews.find(r => r.goalId === goal.id && r.week === week);
        this.put('goalReviews',{ id: `${goal.id}_${week}`,goalId: goal.id,week,adjustment: v.text(input.adjustment,'Adjustment',2000),previousOutcome: (input.previousOutcome ?? 'undecided') as GoalReview['previousOutcome'],decisions: old?.decisions ?? [],updatedAt: now }); return;
      }
      case 'goal.suggestion.decide': {
        const goal = this.goal(input.goalId), suggestionId = v.text(input.suggestionId,'Suggestion identifier',160,true), oldReview = this.review(goal.id,now);
        if (this.records().goalReviews.some(r => r.decisions.some(d => d.suggestionId === suggestionId))) return;
        const suggestion = barrierSuggestions(this.store.all(),goal.id,Date.parse(now)).find(s => s.id === suggestionId);
        if (!suggestion) throw new Error('This suggestion no longer has matching records.');
        const decision = input.decision; if (typeof decision !== 'string' || !['applied','edited','dismissed'].includes(decision)) throw new Error('Choose Apply, Edit, or Dismiss.');
        this.store.db.transaction(() => {
          if (decision !== 'dismissed') {
            if (input.action) { const change = v.object(input.action); if (change.id !== suggestion.actionId || change.goalId !== goal.id) throw new Error('Edit the suggested action.'); this.saveAction(change,now); }
            else if (suggestion.barrier === 'capability') this.put('milestones',{ id: randomUUID(),goalId: goal.id,title: `Explore a strategy for ${this.records().goalActions.find(a => a.id === suggestion.actionId)!.title}`.slice(0,200),kind: 'todo',completed: false,archived: false,position: this.nextPosition(goal.id),createdAt: now,updatedAt: now });
            else if (suggestion.barrier === 'motivation') this.put('goals',{ ...goal,status: 'paused',statusHistory: [...goal.statusHistory,{ at: now,status: 'paused' }],updatedAt: now });
            else throw new Error('Choose the revised cue or smaller action before applying.');
          }
          this.put('goalReviews',{ ...oldReview,decisions: [...oldReview.decisions,{ suggestionId,decision: decision as GoalReview['decisions'][number]['decision'],at: now }],updatedAt: now });
        })(); return;
      }
      default: throw new Error('This goal command is not available.');
    }
  }
}
