import { randomUUID } from 'node:crypto';
import type { Store } from './store';
import type { Command, Task } from '../shared/types';
import { goalData, sortMilestones, type AgentChange, type AgentChangeTarget, type GoalActionPlan, type GoalStatus } from '../shared/goal-types';
import * as v from '../shared/validation';
import { CHANGE_LIMITS, GOAL_LIMITS, goalDate, goalPlan, goalStatus, validateGoalRecord, whyTags } from '../shared/goal-validation';
import { MILESTONE_LIMITS, parseMilestoneMarkdown, reconnectMilestones } from '../shared/milestone-markdown';
import { addDays, localDay, monday } from '../shared/analytics';
import { roadmapRevision } from '../shared/goal-planning';

type Run = (command: Command, input: Record<string, unknown>) => unknown;
type State = Record<string, unknown> | null;
interface Drafts { actionDraft(value: unknown, now: string): Record<string, unknown>; markdown(value: unknown, required: boolean): string }
const GOAL_KEYS = ['title', 'outcome', 'why', 'whyTags', 'deadline', 'status'], STEP_KEYS = ['title', 'estimatedMinutes', 'targetDate', 'notes', 'resources'];
const TASK_KEYS = ['title', 'notes', 'priority', 'dueDate', 'milestoneId', 'completed', 'archived'], PLAN_KEYS = ['weekdays', 'cue', 'normal', 'smaller', 'obstacle', 'response', 'estimatedMinutes', 'activityMode'];
const AGENT_STATUSES: GoalStatus[] = ['draft', 'active', 'paused'];
const pick = (row: object, keys: string[]) => Object.fromEntries(keys.map(k => [k, (row as Record<string, unknown>)[k] ?? null]));
const given = (input: Record<string, unknown>, keys: string[]) => keys.filter(k => k in input && input[k] !== undefined);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* Direct changes by a local AI agent at the 'edit' access level. Each change runs the normal validated commands
   and saves an audit record in the same transaction. The app writes the summary, so the log does not depend on the
   agent's wording. The agent never deletes: it archives. Achieving or archiving a goal and ticking a roadmap step stay
   with the user. The user can undo each change; an undo that would overwrite later edits asks for confirmation. */
export class AgentEditor {
  constructor(private store: Store, private command: Run, private drafts: Drafts) {}
  private records() { return goalData(this.store.all()); }
  private timezone() { return this.store.getSettings().timezone; }
  private openGoal(id: unknown) {
    const goal = this.records().goals.find(g => g.id === v.id(id));
    if (!goal) throw new Error('This goal does not exist. Use get_overview to find goal identifiers.');
    if (goal.status === 'achieved' || goal.status === 'archived') throw new Error(`This goal is ${goal.status}. Only the user can change it in Focus Guide.`);
    return goal;
  }
  private steps(goalId: string) { return sortMilestones(this.records().milestones.filter(m => m.goalId === goalId && m.kind === 'todo' && !m.archived)); }
  private stepId(goalId: string, title: unknown): string | null {
    const name = v.text(title ?? '', 'Roadmap step', MILESTONE_LIMITS.title);
    if (!name) return null;
    const step = this.steps(goalId).find(m => m.title.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (!step) throw new Error(`No open roadmap step is called “${name}”. Use a step title from get_goal.`);
    return step.id;
  }
  private plan(action: Record<string, unknown>, effectiveDate: string, enabled = true): GoalActionPlan {
    return goalPlan({ ...Object.fromEntries(PLAN_KEYS.map(k => [k, action[k]])), effectiveDate, timezone: action.timezone ?? this.timezone(), enabled });
  }

  /* The fields that a change touches, in the same shape before, after and now. */
  state(target: AgentChangeTarget, id: string): State {
    const data = this.store.all(), domain = goalData(data);
    switch (target) {
      case 'goal': { const goal = domain.goals.find(g => g.id === id); return goal ? pick(goal, GOAL_KEYS) : null; }
      case 'roadmap': return { rows: sortMilestones(domain.milestones.filter(m => m.goalId === id)).map(m => ({ id: m.id, title: m.title, kind: m.kind, completed: m.completed, archived: m.archived, position: m.position })) };
      case 'step': { const step = domain.milestones.find(m => m.id === id); return step ? pick(step, STEP_KEYS) : null; }
      case 'task': { const task = data.tasks.find(t => t.id === id); return task ? pick(task, TASK_KEYS) : null; }
      case 'action': { const action = domain.goalActions.find(a => a.id === id); return action ? { title: action.title, archived: action.archived, plan: action.plans.at(-1) } : null; }
      case 'review': return { adjustment: domain.goalReviews.find(r => r.id === id)?.adjustment ?? '' };
    }
  }

  private change(now: string, source: string, tool: string, target: AgentChangeTarget, existing: string[], input: Record<string, unknown>, apply: () => { value: Record<string, unknown>; goalId: string; created?: string[]; summary: string }) {
    const records = this.records();
    if (records.agentChanges.filter(c => Date.parse(c.at) > Date.parse(now) - 3600000).length >= CHANGE_LIMITS.perHour) throw new Error(`The agent reached the limit of ${CHANGE_LIMITS.perHour} direct changes per hour. Wait, or use the propose tools.`);
    const rationale = v.text(input.rationale ?? '', 'Rationale', CHANGE_LIMITS.rationale);
    let result: Record<string, unknown> = {};
    this.store.db.transaction(() => {
      const before: Record<string, State> = Object.fromEntries(existing.map(id => [id, this.state(target, id)]));
      const done = apply(), ids = [...existing, ...(done.created ?? [])];
      for (const id of done.created ?? []) before[id] = null;
      const record = validateGoalRecord('agentChanges', { id: randomUUID(), goalId: done.goalId, at: now, source, tool, target, summary: done.summary.slice(0, CHANGE_LIMITS.summary), rationale, before, after: Object.fromEntries(ids.map(id => [id, this.state(target, id)])), undoneAt: null }) as AgentChange;
      this.store.putGoalRecord('agentChanges', record);
      if (records.agentChanges.length + 1 > GOAL_LIMITS.agentChanges) this.store.pruneAgentChanges(GOAL_LIMITS.agentChanges);
      result = { changeId: record.id, summary: record.summary, ...done.value };
    })();
    return result;
  }

  tool(name: string, input: Record<string, unknown>, source: string, now: string): unknown {
    const today = localDay(now, this.timezone());
    switch (name) {
      case 'create_goal': return this.change(now, source, name, 'goal', [], input, () => {
        const status = input.status === undefined ? (input.outcome ? 'active' : 'draft') : goalStatus(input.status);
        if (!AGENT_STATUSES.includes(status)) throw new Error('A new goal can be draft or active.');
        const actions = input.actions === undefined ? [] : input.actions;
        if (!Array.isArray(actions) || actions.length > 10) throw new Error('Add up to 10 weekly actions.');
        const drafts = actions.map(a => this.drafts.actionDraft(a, now)), roadmap = parseMilestoneMarkdown(this.drafts.markdown(input.roadmapMarkdown, false)).map(r => ({ ...r, completed: false }));
        const goalId = this.command('goal.create', { fieldId: v.id(input.areaId), title: input.title, outcome: input.outcome ?? '', why: input.why ?? '', whyTags: whyTags(input.whyTags ?? []), deadline: input.deadline ?? null, baseline: null, target: null, unit: '', status, milestones: roadmap }) as string;
        const actionIds = drafts.map(a => this.command('goal.action.save', { goalId, title: a.title, plan: this.plan(a, today) }));
        return { value: { goalId, actionIds }, goalId, created: [goalId], summary: `Created goal “${v.text(input.title, 'Goal title', 200, true)}” with ${roadmap.filter(r => r.kind === 'todo').length} roadmap steps and ${actionIds.length} weekly ${actionIds.length === 1 ? 'action' : 'actions'}` };
      });
      case 'update_goal': {
        const goal = this.openGoal(input.goalId), fields = given(input, GOAL_KEYS);
        if (!fields.length) throw new Error(`Change at least one of: ${GOAL_KEYS.join(', ')}.`);
        if (fields.includes('status') && !AGENT_STATUSES.includes(goalStatus(input.status))) throw new Error('An agent can set a goal to draft, active or paused. Only the user marks a goal achieved or archived.');
        return this.change(now, source, name, 'goal', [goal.id], input, () => {
          this.command('goal.update', { id: goal.id, ...Object.fromEntries(fields.map(k => [k, k === 'whyTags' ? whyTags(input[k]) : input[k]])) });
          return { value: { goalId: goal.id }, goalId: goal.id, summary: `Updated goal “${goal.title}”: ${fields.join(', ')}` };
        });
      }
      case 'update_roadmap': {
        const goal = this.openGoal(input.goalId), current = roadmapRevision(this.store.all(), goal.id);
        if (input.revision !== current) throw new Error(`The roadmap changed since you read it, or the revision is missing. Its current roadmapRevision is ${current}. Read it again with get_goal before you change it.`);
        const previous = sortMilestones(this.records().milestones.filter(m => m.goalId === goal.id && !m.archived));
        // Rows match by exact title only: a guessed rename would move task and session links to another step. Use update_step to rename.
        const rows = reconnectMilestones(parseMilestoneMarkdown(this.drafts.markdown(input.markdown, true)), previous, randomUUID, false)
          // Only the user ticks a step: a kept step keeps its state, a new step starts open.
          .map(row => ({ id: row.id, title: row.title, kind: row.kind, completed: row.kind === 'todo' && !!previous.find(m => m.id === row.id && m.completed) }));
        const added = rows.filter(r => !previous.some(m => m.id === r.id)).length, removed = previous.filter(m => !rows.some(r => r.id === m.id)).length;
        return this.change(now, source, name, 'roadmap', [goal.id], input, () => {
          const saved = this.command('goal.milestones.sync', { goalId: goal.id, rows, revision: current }) as { revision: string };
          return { value: { goalId: goal.id, roadmapRevision: saved.revision, added, archived: removed, note: 'Step completion stays with the user. Rows you removed are archived and can be restored.' }, goalId: goal.id, summary: `Updated the roadmap of “${goal.title}”: ${added === 1 ? '1 new row' : `${added} new rows`}, ${removed} archived` };
        });
      }
      case 'update_step': {
        const step = this.records().milestones.find(m => m.id === v.id(input.stepId));
        if (!step || step.archived) throw new Error('This roadmap row does not exist or is archived. Use a row identifier from get_goal.');
        const goal = this.openGoal(step.goalId), fields = given(input, STEP_KEYS);
        if (!fields.length) throw new Error(`Change at least one of: ${STEP_KEYS.join(', ')}. Only the user ticks a step.`);
        return this.change(now, source, name, 'step', [step.id], input, () => {
          this.command('goal.milestone.save', { id: step.id, goalId: goal.id, ...Object.fromEntries(fields.map(k => [k, input[k]])) });
          return { value: { stepId: step.id }, goalId: goal.id, summary: `Updated step “${step.title}”: ${fields.join(', ')}` };
        });
      }
      case 'create_tasks': {
        const goal = this.openGoal(input.goalId);
        if (!Array.isArray(input.tasks) || !input.tasks.length || input.tasks.length > 50) throw new Error('Add from 1 to 50 tasks.');
        const tasks = input.tasks.map(item => { const t = v.object(item); return { title: t.title, notes: t.notes ?? '', priority: t.priority ?? 'normal', dueDate: t.dueDate ?? null, milestoneId: this.stepId(goal.id, t.step) }; });
        return this.change(now, source, name, 'task', [], input, () => {
          const created = tasks.map(t => this.command('task.create', { fieldId: goal.fieldId, categoryId: null, goalId: goal.id, ...t }) as string);
          return { value: { goalId: goal.id, taskIds: created }, goalId: goal.id, created, summary: `Added ${created.length === 1 ? '1 task' : `${created.length} tasks`} to “${goal.title}”` };
        });
      }
      case 'update_task': {
        const task = this.store.task(v.id(input.taskId)) as Task | undefined;
        if (!task || !task.goalId) throw new Error('This task does not exist or belongs to no goal. The agent can change only goal tasks.');
        const goal = this.openGoal(task.goalId), fields = given(input, ['title', 'notes', 'priority', 'dueDate', 'completed', 'archived', 'step']);
        if (!fields.length) throw new Error('Change at least one of: title, notes, priority, dueDate, completed, archived, step.');
        return this.change(now, source, name, 'task', [task.id], input, () => {
          this.command('task.update', { id: task.id, ...Object.fromEntries(fields.filter(k => k !== 'step').map(k => [k, input[k]])), ...(fields.includes('step') ? { milestoneId: this.stepId(goal.id, input.step) } : {}) });
          return { value: { taskId: task.id }, goalId: goal.id, summary: `Updated task “${task.title}”: ${fields.join(', ')}` };
        });
      }
      case 'create_action': {
        const goal = this.openGoal(input.goalId), draft = this.drafts.actionDraft(input.action, now);
        return this.change(now, source, name, 'action', [], input, () => {
          const actionId = this.command('goal.action.save', { goalId: goal.id, title: draft.title, plan: this.plan(draft, today) }) as string;
          return { value: { actionId }, goalId: goal.id, created: [actionId], summary: `Added weekly action “${draft.title}” to “${goal.title}”` };
        });
      }
      case 'update_action': {
        const action = this.records().goalActions.find(a => a.id === v.id(input.actionId));
        if (!action) throw new Error('This weekly action does not exist. Use an action identifier from get_goal.');
        const goal = this.openGoal(action.goalId), fields = given(input, ['title', 'archived', ...PLAN_KEYS]), latest = action.plans.at(-1)!;
        if (!fields.length) throw new Error(`Change at least one of: title, archived, ${PLAN_KEYS.join(', ')}.`);
        const archived = fields.includes('archived') ? v.bool(input.archived, 'Archived action') : action.archived;
        // A schedule change starts tomorrow, as in the app; earlier revisions stay in history.
        const plan = this.plan({ ...latest, ...Object.fromEntries(fields.filter(k => PLAN_KEYS.includes(k)).map(k => [k, input[k]])) }, addDays(localDay(now, latest.timezone), 1), !archived);
        return this.change(now, source, name, 'action', [action.id], input, () => {
          this.command('goal.action.save', { id: action.id, goalId: goal.id, title: fields.includes('title') ? input.title : action.title, archived, plan });
          return { value: { actionId: action.id, effectiveDate: plan.effectiveDate }, goalId: goal.id, summary: `${archived && !action.archived ? 'Archived' : 'Updated'} weekly action “${action.title}”: ${fields.join(', ')}` };
        });
      }
      case 'add_review_note': {
        const goal = this.openGoal(input.goalId), week = goalDate(input.week ?? monday(today)), text = v.text(input.text, 'Review note', 2000, true);
        if (monday(week) !== week || week > monday(today)) throw new Error('Choose the Monday of the current week or an earlier week.');
        const id = `${goal.id}_${week}`, existing = this.records().goalReviews.find(r => r.id === id), adjustment = existing?.adjustment ? `${existing.adjustment}\n\n${text}` : text;
        if (adjustment.length > 2000) throw new Error('The note does not fit next to the existing weekly adjustment (2000 characters). Write a shorter note.');
        return this.change(now, source, name, 'review', [id], input, () => {
          this.command('goal.review.save', { goalId: goal.id, week, adjustment, previousOutcome: existing?.previousOutcome ?? 'undecided' });
          return { value: { goalId: goal.id, week }, goalId: goal.id, summary: `Added a review note for the week of ${week} to “${goal.title}”` };
        });
      }
      default: throw new Error('This tool is not available.');
    }
  }

  /* Puts back the state from before the change, through the normal commands. A created record is archived, never deleted. */
  undo(input: Record<string, unknown>, now: string): unknown {
    const change = this.records().agentChanges.find(c => c.id === v.id(input.id));
    if (!change) throw new Error('This agent change no longer exists.');
    if (change.undoneAt) throw new Error('This change was already undone.');
    const changed = Object.keys(change.after).filter(id => !same(this.state(change.target, id), change.after[id]));
    if (changed.length && input.confirm !== true) return { conflict: true, changed };
    this.store.db.transaction(() => {
      for (const [id, raw] of Object.entries(change.before)) {
        const before = raw as Record<string, unknown> | null;
        switch (change.target) {
          case 'goal': {
            const goal = this.records().goals.find(g => g.id === id);
            if (!goal) break;
            if (before === null) { if (goal.status !== 'archived') this.command('goal.update', { id, status: 'archived' }); }
            else this.command('goal.update', { id, ...before });
            break;
          }
          case 'roadmap': {
            const rows = (before!.rows as Array<{ id: string; title: string; kind: string; completed: boolean; archived: boolean; position: number }>).filter(r => !r.archived).sort((a, b) => a.position - b.position);
            this.command('goal.milestones.sync', { goalId: id, rows: rows.map(r => ({ id: r.id, title: r.title, kind: r.kind, completed: r.completed })) });
            break;
          }
          case 'step': if (before) this.command('goal.milestone.save', { id, goalId: change.goalId, ...before }); break;
          case 'task': if (this.store.task(id)) this.command('task.update', before === null ? { id, archived: true } : { id, ...before }); break;
          case 'action': {
            const action = this.records().goalActions.find(a => a.id === id);
            if (!action) break;
            const latest = action.plans.at(-1)!, tomorrow = addDays(localDay(now, latest.timezone), 1);
            this.command('goal.action.save', before === null
              ? { id, goalId: action.goalId, title: action.title, archived: true, plan: { ...latest, enabled: false, effectiveDate: tomorrow } }
              : { id, goalId: action.goalId, title: before.title, archived: before.archived, plan: { ...(before.plan as GoalActionPlan), effectiveDate: tomorrow } });
            break;
          }
          case 'review': {
            const week = id.slice(-10), review = this.records().goalReviews.find(r => r.id === id);
            this.command('goal.review.save', { goalId: change.goalId, week, adjustment: before?.adjustment ?? '', previousOutcome: review?.previousOutcome ?? 'undecided' });
            break;
          }
        }
      }
      this.store.putGoalRecord('agentChanges', { ...change, undoneAt: now });
    })();
    return { undone: true };
  }
}
