import type { Dataset, ActivityMode } from './types';
import { goalData, sortMilestones, type Goal, type GoalAction, type GoalActionPlan, type GoalOccurrence, type GoalBarrier } from './goal-types';
import { addDays, localDay, median, monday } from './analytics';

export function actionPlan(action: GoalAction, day: string): GoalActionPlan | undefined {
  return [...action.plans].reverse().find(plan => plan.effectiveDate <= day);
}
export function occurrenceId(actionId: string, day: string): string { return `${actionId}_${day}`; }
export function statusOn(goal: Goal, day: string, timezone: string): Goal['status'] {
  return [...goal.statusHistory].reverse().find(change => localDay(change.at, timezone) <= day)?.status ?? 'draft';
}
export function plannedOccurrences(data: Dataset, from: string, to: string, goalId?: string, now = Date.now()): GoalOccurrence[] {
  if (from > to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(to) - Date.parse(from) > 3660 * 86400000) return [];
  const domain = goalData(data), stored = new Map(domain.goalOccurrences.map(row => [row.id, row]));
  const occupied = new Set(domain.goalOccurrences.map(row => `${row.actionId}_${row.date}`));
  const result = new Map<string, GoalOccurrence>();
  for (const action of domain.goalActions) {
    const goal = domain.goals.find(g => g.id === action.goalId);
    if (!goal || goalId && goal.id !== goalId) continue;
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const plan = actionPlan(action, day), id = occurrenceId(action.id, day);
      const saved = stored.get(id);
      if (saved) { if (saved.date >= from && saved.date <= to) result.set(saved.id, saved); continue; }
      // A moved occurrence owns its new date even if a later plan adds that weekday.
      if (occupied.has(id)) continue;
      if (!plan || !plan.enabled || !plan.weekdays.includes(new Date(`${day}T12:00:00Z`).getUTCDay())) continue;
      const today = localDay(now, plan.timezone);
      if (day >= today && (goal.status !== 'active' || action.archived) || day < today && statusOn(goal, day, plan.timezone) !== 'active') continue;
      result.set(id, { id, goalId: goal.id, actionId: action.id, originalDate: day, date: day, status: 'unrecorded', barrier: null, note: '', rescheduleHistory: [], plan, updatedAt: action.updatedAt });
    }
  }
  for (const row of domain.goalOccurrences) if ((!goalId || row.goalId === goalId) && row.date >= from && row.date <= to) result.set(row.id, row);
  return [...result.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export function todaysOccurrences(data: Dataset, now = Date.now()): GoalOccurrence[] {
  const domain = goalData(data), rows = new Map<string, GoalOccurrence>();
  for (const timezone of new Set(domain.goalActions.map(a => a.plans[0]?.timezone).filter(Boolean))) {
    const today = localDay(now, timezone);
    for (const row of plannedOccurrences(data, today, today, undefined, now)) {
      const goal = domain.goals.find(g => g.id === row.goalId), owner = domain.goalActions.find(a => a.id === row.actionId);
      if (goal?.status === 'active' && owner && !owner.archived && row.date === localDay(now, row.plan.timezone)) rows.set(row.id, row);
    }
  }
  return [...rows.values()];
}
export function goalSummary(data: Dataset, goalId: string, from: string, to: string) {
  const domain = goalData(data), occurrences = plannedOccurrences(data, from, to, goalId);
  const milestones = sortMilestones(domain.milestones.filter(m => m.goalId === goalId && !m.archived && m.kind === 'todo'));
  const progress = domain.goalProgress.filter(p => p.goalId === goalId && p.date <= to).sort((a,b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
  const sessions = data.sessions.filter(s => s.goalId === goalId && s.status === 'completed' && !s.excluded && localDay(s.startedAt, s.timezone) >= from && localDay(s.startedAt, s.timezone) <= to);
  return { occurrences, minutes: sessions.reduce((sum,s) => sum + s.activeMs / 60000, 0),
    done: occurrences.filter(o => o.status === 'done').length, smaller: occurrences.filter(o => o.status === 'smaller').length,
    skipped: occurrences.filter(o => o.status === 'skipped').length, unrecorded: occurrences.filter(o => o.status === 'unrecorded').length,
    milestones, completedMilestones: milestones.filter(m => m.completed).length, latestProgress: progress[0] ?? null };
}
export function weeklyWorkload(data: Dataset, now = Date.now()) {
  const day = localDay(now, data.settings.timezone), week = monday(day);
  const rows = plannedOccurrences(data, week, addDays(week, 6), undefined, now).filter(row => goalData(data).goals.find(g => g.id === row.goalId)?.status === 'active' && !goalData(data).goalActions.find(a => a.id === row.actionId)?.archived);
  return { minutes: rows.reduce((sum,row) => sum + (row.plan.estimatedMinutes ?? 0), 0), unknown: rows.filter(row => row.plan.estimatedMinutes === null).length, capacity: data.settings.weeklyCapacityMinutes ?? 0 };
}
/* With a goal, the goal's own sessions come first; the area's sessions are used only when the goal
   alone does not meet the same gate. */
export function durationSuggestion(data: Dataset, fieldId: string, activityMode: ActivityMode, now = Date.now(), goalId?: string) {
  const today = localDay(now, data.settings.timezone), from = addDays(today, -27);
  const gate = (scope: 'goal' | 'area') => {
    const sessions = data.sessions.filter(s => (scope === 'goal' ? s.goalId === goalId : s.fieldId === fieldId) && (s.activityMode ?? 'Unspecified') === activityMode && s.status === 'completed' && !s.excluded && localDay(s.startedAt, s.timezone) >= from && localDay(s.startedAt, s.timezone) <= today);
    const days = [...new Set(sessions.map(s => localDay(s.startedAt, s.timezone)))].sort();
    const spanDays = days.length ? Math.round((Date.parse(days.at(-1)!) - Date.parse(days[0])) / 86400000) + 1 : 0;
    return { scope, eligible: sessions.length >= 10 && spanDays >= 14, minutes: sessions.length >= 10 && spanDays >= 14 ? Math.max(1, Math.min(1440, Math.round(median(sessions.map(s => s.activeMs / 60000))!))) : null, n: sessions.length, spanDays, sessionIds: sessions.map(s => s.id), from, to: today };
  };
  const own = goalId ? gate('goal') : null;
  return own?.eligible ? own : gate('area');
}
export interface GoalSuggestion { id: string; goalId: string; actionId: string; barrier: GoalBarrier; title: string; proposal: string; records: GoalOccurrence[] }
export function barrierSuggestions(data: Dataset, goalId: string, now = Date.now()): GoalSuggestion[] {
  const domain = goalData(data), result: GoalSuggestion[] = [];
  if (domain.goals.find(g => g.id === goalId)?.status !== 'active') return result;
  const labels = {
    capability: ['Add a learning step', 'Try a milestone to discover or practice a strategy before asking for the final result.'],
    opportunity: ['Choose a more accessible cue', 'Try a different routine or weekday that fits the time and space you have.'],
    motivation: ['Review whether this goal still matters', 'Revisit why you chose this goal; pausing it is an available choice.'],
    other: ['Try the smaller action', 'Try your smaller version as the normal action for the next week.']
  };
  for (const action of domain.goalActions.filter(a => a.goalId === goalId && !a.archived)) {
    const today = localDay(now, action.plans.at(-1)!.timezone), from = addDays(today, -13);
    for (const barrier of ['capability', 'opportunity', 'motivation', 'other'] as const) {
      const records = domain.goalOccurrences.filter(o => o.actionId === action.id && o.status !== 'unrecorded' && o.barrier === barrier && o.date >= from && o.date <= today);
      if (new Set(records.map(o => o.date)).size < 3) continue;
      const id = `${action.id}_${barrier}_${records.map(o => o.date).sort().at(-1)}`;
      if (domain.goalReviews.some(r => r.goalId === goalId && r.decisions.some(d => d.suggestionId === id))) continue;
      result.push({ id, goalId, actionId: action.id, barrier, title: labels[barrier][0], proposal: labels[barrier][1], records });
    }
  }
  return result;
}
/* Recorded effort per roadmap step: finished, included sessions that were started for that step. */
export function roadmapEffort(data: Dataset, goalId: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const s of data.sessions) if (s.goalId === goalId && s.milestoneId && s.status === 'completed' && !s.excluded) result.set(s.milestoneId, (result.get(s.milestoneId) ?? 0) + s.activeMs / 60000);
  return result;
}
/* A short, stable fingerprint of a goal's active roadmap rows. Writers send the revision they read, so a
   save based on an older roadmap is refused instead of archiving rows that someone else added. */
export function roadmapRevision(data: Dataset, goalId: string): string {
  return rowsRevision(sortMilestones(goalData(data).milestones.filter(m => m.goalId === goalId && !m.archived)));
}
/* The same fingerprint for rows in their order, for example the rows that an editor last saved. */
export function rowsRevision(rows: Array<{ id: string; title: string; kind: string; completed: boolean }>): string {
  const text = JSON.stringify(rows.map(m => [m.id, m.title, m.kind, m.completed]));
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return `${text.length}:${hash.toString(16)}`;
}
export const ROADMAP_CHANGED = 'The roadmap changed while you were editing it.';
