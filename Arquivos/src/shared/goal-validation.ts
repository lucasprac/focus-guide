import * as v from './validation';
import type { Dataset } from './types';
import { AGENT_CHANGE_TARGETS, GOAL_COLLECTIONS, MILESTONE_DETAIL_LIMITS, MILESTONE_KINDS, PROPOSAL_KINDS, WHY_TAG_LIMITS, goalData, type AgentChange, type AgentChangeTarget, type AgentProposal, type GoalData, type Goal, type GoalActionPlan, type GoalAction, type GoalMilestone, type GoalOccurrence, type GoalProgressEntry, type GoalReview, type GoalStatus, type GoalBarrier, type MilestoneDetails, type MilestoneKind, type MilestoneResource } from './goal-types';
import { occurrenceId } from './goal-planning';
import { monday } from './analytics';
import { t } from './i18n';

export const GOAL_LIMITS = { goals: 1000, milestones: 10000, goalActions: 10000, goalOccurrences: 100000, goalProgress: 50000, goalReviews: 20000, agentProposals: 5000, agentChanges: 20000 };
export const CHANGE_LIMITS = { summary: 500, rationale: 4000, source: 100, tool: 40, state: 60000, perHour: 60 };
export const PROPOSAL_LIMITS = { summary: 500, rationale: 4000, source: 100, payload: 30000, basis: 4000, pending: 50 };
function exact(row: Record<string, unknown>, keys: string[]) { if (Object.keys(row).some(k => !keys.includes(k)) || keys.some(k => !(k in row))) throw new Error(t('Goal data contains unsupported or missing fields.')); }
function collection(value: unknown, limit: number) { if (!Array.isArray(value) || value.length > limit) throw new Error(t('Invalid or oversized goal collection.')); return value; }
export function goalStatus(value: unknown): GoalStatus { if (typeof value !== 'string' || !['draft', 'active', 'paused', 'achieved', 'archived'].includes(value)) throw new Error(t('Choose a valid goal status.')); return value as GoalStatus; }
export function goalDate(value: unknown): string { const date = v.date(value); if (!date) throw new Error(t('A planning date is required.')); return date; }
export function goalNumber(value: unknown): number | null { return value === null || value === undefined || value === '' ? null : v.number(value, t('Goal measure'), -1e12, 1e12); }
export function goalPlan(value: unknown): GoalActionPlan {
  const p = v.object(value); exact(p, ['effectiveDate', 'timezone', 'weekdays', 'cue', 'normal', 'smaller', 'obstacle', 'response', 'estimatedMinutes', 'activityMode', 'enabled']);
  const days = collection(p.weekdays, 7).map(d => v.number(d, t('Weekday'), 0, 6));
  if (!days.every(Number.isInteger) || new Set(days).size !== days.length || !days.length) throw new Error(t('Choose at least one unique weekday.'));
  return { effectiveDate: goalDate(p.effectiveDate), timezone: v.timezone(p.timezone), weekdays: [...days].sort(), cue: v.text(p.cue, t('Cue'), 500, true), normal: v.text(p.normal, t('Normal action'), 500, true), smaller: v.text(p.smaller, t('Smaller action'), 500, true), obstacle: v.text(p.obstacle, t('Obstacle'), 500), response: v.text(p.response, t('Obstacle response'), 500), estimatedMinutes: p.estimatedMinutes === null ? null : v.number(p.estimatedMinutes, t('Estimated minutes'), 1, 1440), activityMode: v.activityMode(p.activityMode), enabled: v.bool(p.enabled, t('Enabled action')) };
}
export function milestoneKind(value: unknown): MilestoneKind { if (typeof value !== 'string' || !MILESTONE_KINDS.includes(value as MilestoneKind)) throw new Error(t('Choose a valid milestone kind.')); return value as MilestoneKind; }
export function milestoneResource(value: unknown): MilestoneResource {
  const r = v.object(value); exact(r, ['title','url']);
  const url = v.text(r.url, 'Link', MILESTONE_DETAIL_LIMITS.url, true);
  let protocol = '';
  try { protocol = new URL(url).protocol; } catch { throw new Error(t('Use a full link, such as https://example.com.')); }
  if (!['http:','https:','file:'].includes(protocol)) throw new Error(t('Links must start with http, https or file.'));
  return { title: v.text(r.title, t('Link title'), MILESTONE_DETAIL_LIMITS.resourceTitle, true), url };
}
/* Only a to-do is a roadmap step with an estimate and a target date; every kind can keep notes and links. */
export function milestoneDetails(value: Record<string, unknown>, kind: MilestoneKind): MilestoneDetails {
  const estimatedMinutes = value.estimatedMinutes === null ? null : v.number(value.estimatedMinutes, t('Estimated minutes'), 1, MILESTONE_DETAIL_LIMITS.estimatedMinutes);
  if (estimatedMinutes !== null && !Number.isInteger(estimatedMinutes)) throw new Error(t('Estimate whole minutes.'));
  const targetDate = v.date(value.targetDate);
  if (kind !== 'todo' && (estimatedMinutes !== null || targetDate !== null)) throw new Error(t('Only a to-do step can have an estimate or a target date.'));
  return { estimatedMinutes, targetDate, notes: v.text(value.notes, t('Step notes'), MILESTONE_DETAIL_LIMITS.notes), resources: collection(value.resources, MILESTONE_DETAIL_LIMITS.resources).map(milestoneResource) };
}
export function whyTags(value: unknown): string[] {
  const tags = collection(value ?? [], WHY_TAG_LIMITS.count).map(tag => v.text(tag, t('Reason tag'), WHY_TAG_LIMITS.length, true).replace(/\s+/g, ' '));
  if (new Set(tags.map(tag => tag.toLocaleLowerCase())).size !== tags.length) throw new Error(t('Each reason tag can be chosen once.'));
  return tags;
}
export function validateGoalRecord(key: keyof GoalData, value: unknown): GoalData[keyof GoalData][number] {
  const r = v.object(value), id = v.id(r.id);
  if ((key === 'goals' || key === 'goalActions') && id.length > 53) throw new Error(t('Goal and action identifiers support up to 53 characters.'));
  if (key === 'goals') {
    exact(r, ['id','fieldId','title','outcome','why','whyTags','deadline','baseline','target','unit','status','statusHistory','createdAt','updatedAt']);
    const history = collection(r.statusHistory, 1000).map(h => { const c = v.object(h); exact(c, ['at','status']); return { at: v.timestamp(c.at), status: goalStatus(c.status) }; });
    const status = goalStatus(r.status), baseline = goalNumber(r.baseline), target = goalNumber(r.target), unit = v.text(r.unit, t('Unit'), 60);
    if (!history.length || history.at(-1)!.status !== status || history.some((c,i) => i > 0 && c.at < history[i-1].at)) throw new Error(t('Invalid goal status history.'));
    if ((baseline === null) !== (target === null) || target !== null && (!unit || baseline === target)) throw new Error(t('A numeric measure needs a baseline, a different target, and a unit.'));
    return { id, fieldId: v.id(r.fieldId), title: v.text(r.title,t('Goal title'),200,true), outcome: v.text(r.outcome,t('Outcome'),2000,status === 'active' || status === 'achieved'), why: v.text(r.why,t('Why this matters'),2000), whyTags: whyTags(r.whyTags), deadline: v.date(r.deadline), baseline, target, unit, status, statusHistory: history, createdAt: v.timestamp(r.createdAt), updatedAt: v.timestamp(r.updatedAt) } as Goal;
  }
  if (key === 'agentProposals') {
    exact(r, ['id','goalId','kind','summary','rationale','source','payload','basis','status','createdAt','decidedAt']);
    if (typeof r.kind !== 'string' || !(PROPOSAL_KINDS as readonly string[]).includes(r.kind) || typeof r.status !== 'string' || !['pending','applied','rejected','stale'].includes(r.status)) throw new Error(t('Invalid agent proposal kind or status.'));
    const payload = v.object(r.payload);
    if (JSON.stringify(payload).length > PROPOSAL_LIMITS.payload) throw new Error(t('An agent proposal is too large.'));
    if ((r.kind === 'goal.create') !== (r.goalId === null)) throw new Error(t('Only a new-goal proposal has no goal.'));
    const decidedAt = r.decidedAt === null ? null : v.timestamp(r.decidedAt);
    if ((r.status === 'applied' || r.status === 'rejected') !== (decidedAt !== null)) throw new Error(t('Invalid agent proposal decision time.'));
    return { id, goalId: r.goalId === null ? null : v.id(r.goalId), kind: r.kind, summary: v.text(r.summary,t('Proposal summary'),PROPOSAL_LIMITS.summary,true), rationale: v.text(r.rationale,t('Proposal rationale'),PROPOSAL_LIMITS.rationale), source: v.text(r.source,t('Proposal source'),PROPOSAL_LIMITS.source), payload, basis: r.basis === null ? null : v.text(r.basis,t('Proposal basis'),PROPOSAL_LIMITS.basis), status: r.status, createdAt: v.timestamp(r.createdAt), decidedAt } as AgentProposal;
  }
  if (key === 'agentChanges') {
    exact(r, ['id','goalId','at','source','tool','target','summary','rationale','before','after','undoneAt']);
    if (!AGENT_CHANGE_TARGETS.includes(r.target as AgentChangeTarget)) throw new Error(t('Invalid agent change target.'));
    const before = v.object(r.before), after = v.object(r.after);
    if (JSON.stringify(before).length > CHANGE_LIMITS.state || JSON.stringify(after).length > CHANGE_LIMITS.state) throw new Error(t('An agent change record is too large.'));
    return { id, goalId: v.id(r.goalId), at: v.timestamp(r.at), source: v.text(r.source,t('Change source'),CHANGE_LIMITS.source), tool: v.text(r.tool,t('Change tool'),CHANGE_LIMITS.tool,true), target: r.target, summary: v.text(r.summary,t('Change summary'),CHANGE_LIMITS.summary,true), rationale: v.text(r.rationale,t('Change rationale'),CHANGE_LIMITS.rationale), before, after, undoneAt: r.undoneAt === null ? null : v.timestamp(r.undoneAt) } as AgentChange;
  }
  const goalId = v.id(r.goalId), updatedAt = v.timestamp(r.updatedAt);
  if (key === 'milestones') {
    exact(r, ['id','goalId','title','kind','completed','archived','position','createdAt','updatedAt','estimatedMinutes','targetDate','notes','resources']); const position = v.number(r.position,t('Milestone position'),0,1e6); if (!Number.isInteger(position)) throw new Error(t('Invalid milestone position.'));
    const kind = milestoneKind(r.kind), completed = v.bool(r.completed,t('Completed milestone'));
    if (completed && kind !== 'todo') throw new Error(t('Only a to-do milestone can be done.'));
    return { id, goalId, title: v.text(r.title,t('Milestone'),200,true), kind, completed, archived: v.bool(r.archived,t('Archived milestone')), position, createdAt: v.timestamp(r.createdAt), updatedAt, ...milestoneDetails(r,kind) } as GoalMilestone;
  }
  if (key === 'goalActions') {
    exact(r, ['id','goalId','title','archived','plans','createdAt','updatedAt']); const plans = collection(r.plans, 1000).map(goalPlan);
    if (!plans.length || plans.some((p,i) => i > 0 && p.effectiveDate <= plans[i-1].effectiveDate)) throw new Error(t('Action revisions must have unique increasing dates.'));
    if (new Set(plans.map(p => p.timezone)).size !== 1) throw new Error(t('An action retains its original planning timezone.'));
    return { id, goalId, title: v.text(r.title,t('Action title'),200,true), archived: v.bool(r.archived,t('Archived action')), plans, createdAt: v.timestamp(r.createdAt), updatedAt } as GoalAction;
  }
  if (key === 'goalOccurrences') {
    exact(r, ['id','goalId','actionId','originalDate','date','status','barrier','note','rescheduleHistory','plan','updatedAt']);
    if (typeof r.status !== 'string' || !['unrecorded','done','smaller','skipped'].includes(r.status) || ![null,'capability','opportunity','motivation','other'].includes(r.barrier as string | null)) throw new Error(t('Invalid action check-in.'));
    const actionId = v.id(r.actionId), originalDate = goalDate(r.originalDate);
    if (id !== occurrenceId(actionId, originalDate)) throw new Error(t('Invalid occurrence identity.'));
    const history = collection(r.rescheduleHistory, 100).map(goalDate), date = goalDate(r.date);
    if ((date !== originalDate || history.length > 0) && (history[0] !== originalDate || history.at(-1) === date)) throw new Error(t('Invalid rescheduling history.'));
    const plan = goalPlan(r.plan);
    if (!plan.enabled || plan.effectiveDate > originalDate || !plan.weekdays.includes(new Date(`${originalDate}T12:00:00Z`).getUTCDay())) throw new Error(t('An occurrence needs its original planned context.'));
    return { id, goalId, actionId, originalDate, date, status: r.status as GoalOccurrence['status'], barrier: r.barrier as GoalBarrier | null, note: v.text(r.note,t('Action note'),2000), rescheduleHistory: history, plan, updatedAt } as GoalOccurrence;
  }
  if (key === 'goalProgress') { exact(r, ['id','goalId','date','value','note','createdAt','updatedAt']); return { id, goalId, date: goalDate(r.date), value: v.number(r.value,t('Progress value'),-1e12,1e12), note: v.text(r.note,t('Progress note'),2000), createdAt: v.timestamp(r.createdAt), updatedAt } as GoalProgressEntry; }
  exact(r, ['id','goalId','week','adjustment','previousOutcome','updatedAt','decisions']);
  const week = goalDate(r.week); if (monday(week) !== week || id !== `${goalId}_${week}` || typeof r.previousOutcome !== 'string' || !['undecided','keep','revise'].includes(r.previousOutcome)) throw new Error(t('Invalid goal review week or outcome.'));
  const decisions = collection(r.decisions, 1000).map(value => { const d = v.object(value); exact(d, ['suggestionId','decision','at']); if (typeof d.decision !== 'string' || !['applied','edited','dismissed'].includes(d.decision)) throw new Error(t('Invalid suggestion decision.')); return { suggestionId: v.text(d.suggestionId,t('Suggestion identifier'),160,true), decision: d.decision as GoalReview['decisions'][number]['decision'], at: v.timestamp(d.at) }; });
  if (new Set(decisions.map(d => d.suggestionId)).size !== decisions.length) throw new Error(t('Duplicate suggestion decisions.'));
  return { id, goalId, week, adjustment: v.text(r.adjustment,t('Weekly adjustment'),2000), previousOutcome: r.previousOutcome as GoalReview['previousOutcome'], decisions, updatedAt } as GoalReview;
}
export function validateGoalData(value: Partial<GoalData>, base: Dataset): GoalData {
  const domain = goalData(value);
  for (const key of GOAL_COLLECTIONS) {
    const entries = collection(key in value ? value[key] : [], GOAL_LIMITS[key]).map(row => validateGoalRecord(key,row));
    if (new Set(entries.map(row => row.id)).size !== entries.length) throw new Error(t('Duplicate goal record identifiers.'));
    (domain[key] as typeof entries) = entries;
  }
  const goals = new Map(domain.goals.map(g => [g.id,g])), actions = new Map(domain.goalActions.map(a => [a.id,a])), milestones = new Map(domain.milestones.map(m => [m.id,m])), occurrences = new Map(domain.goalOccurrences.map(o => [o.id,o]));
  for (const goal of domain.goals) if (!base.fields.some(f => f.id === goal.fieldId)) throw new Error(t('Goal refers to an unknown field.'));
  for (const key of GOAL_COLLECTIONS.filter(k => k !== 'goals')) for (const row of domain[key]) if (row.goalId !== null && !goals.has(row.goalId)) throw new Error(t('Goal record refers to an unknown goal.'));
  const dates = new Set<string>();
  for (const row of domain.goalOccurrences) { if (actions.get(row.actionId)?.goalId !== row.goalId || row.plan.timezone !== actions.get(row.actionId)!.plans[0].timezone) throw new Error(t('Occurrence belongs to an unknown action.')); const key = `${row.actionId}_${row.date}`; if (dates.has(key)) throw new Error(t('Duplicate scheduled action dates.')); dates.add(key); }
  for (const row of domain.goalProgress) if (goals.get(row.goalId)?.target === null) throw new Error(t('Progress needs a goal measure.'));
  for (const task of base.tasks) { if (task.goalId && goals.get(task.goalId)?.fieldId !== task.fieldId || task.milestoneId && (!task.goalId || milestones.get(task.milestoneId)?.goalId !== task.goalId || milestones.get(task.milestoneId)?.kind !== 'todo')) throw new Error(t('Task goal links are inconsistent.')); }
  for (const session of base.sessions) if (session.goalId && goals.get(session.goalId)?.fieldId !== session.fieldId || session.occurrenceId && (!session.goalId || occurrences.get(session.occurrenceId)?.goalId !== session.goalId) || session.milestoneId && (!session.goalId || milestones.get(session.milestoneId)?.goalId !== session.goalId || milestones.get(session.milestoneId)?.kind !== 'todo')) throw new Error(t('Session goal links are inconsistent.'));
  return domain;
}
