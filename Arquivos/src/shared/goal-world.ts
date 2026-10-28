import type { Dataset } from './types';
import { goalData, sortMilestones, type GoalStatus } from './goal-types';
import { goalSummary, roadmapEffort } from './goal-planning';
import { addDays, localDay } from './analytics';

/* Neural World reads goals only. Each goal is a cell: focus time sets its size, roadmap steps ring it as beads and
   recorded actions of the last 28 days are counted. Skipped or unrecorded actions add nothing. */
export type WorldStatus = Exclude<GoalStatus, 'archived'>;
export interface WorldStep { id: string; title: string; completed: boolean; next: boolean; effortMinutes: number; estimatedMinutes: number | null; targetDate: string | null }
export interface WorldGoal {
  id: string; fieldId: string; title: string; outcome: string; status: WorldStatus; color: string;
  totalMinutes: number; minutes28: number; steps: WorldStep[]; completedSteps: number; done: number; smaller: number;
  progress: { value: number | null; target: number; unit: string; fraction: number } | null;
}
export interface WorldArea { id: string; name: string; color: string }
export interface GoalWorldModel { areas: WorldArea[]; goals: WorldGoal[] }

/* The map draws this many goals and this many roadmap beads per goal at most. The inspector shows every step. */
export const WORLD_GOAL_LIMIT = 24;
export const WORLD_STEP_LIMIT = 12;
const statusOrder: Record<WorldStatus, number> = { active: 0, paused: 1, draft: 2, achieved: 3 };

export function goalWorldModel(data: Dataset, now = Date.now()): GoalWorldModel {
  const domain = goalData(data), today = localDay(now, data.settings.timezone), from = addDays(today, -27);
  const fields = new Map(data.fields.map(f => [f.id, f]));
  const totals = new Map<string, number>();
  for (const s of data.sessions) if (s.goalId && s.status === 'completed' && !s.excluded) totals.set(s.goalId, (totals.get(s.goalId) ?? 0) + s.activeMs / 60000);
  const goals = domain.goals.filter(g => g.status !== 'archived' && fields.has(g.fieldId)).map((goal): WorldGoal => {
    const summary = goalSummary(data, goal.id, from, today), effort = roadmapEffort(data, goal.id);
    const todo = sortMilestones(domain.milestones.filter(m => m.goalId === goal.id && !m.archived && m.kind === 'todo'));
    const nextId = todo.find(m => !m.completed)?.id;
    const steps = todo.map(m => ({ id: m.id, title: m.title, completed: m.completed, next: m.id === nextId, effortMinutes: effort.get(m.id) ?? 0, estimatedMinutes: m.estimatedMinutes, targetDate: m.targetDate }));
    const latest = summary.latestProgress;
    const measured = goal.baseline !== null && goal.target !== null && goal.target !== goal.baseline;
    const fraction = measured && latest ? Math.max(0, Math.min(1, (latest.value - goal.baseline!) / (goal.target! - goal.baseline!))) : 0;
    return {
      id: goal.id, fieldId: goal.fieldId, title: goal.title, outcome: goal.outcome, status: goal.status as WorldStatus, color: fields.get(goal.fieldId)!.color,
      totalMinutes: totals.get(goal.id) ?? 0, minutes28: summary.minutes, steps, completedSteps: steps.filter(s => s.completed).length,
      done: summary.done, smaller: summary.smaller,
      progress: measured ? { value: latest?.value ?? null, target: goal.target!, unit: goal.unit, fraction } : null
    };
  }).sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.id.localeCompare(b.id));
  const used = new Set(goals.map(g => g.fieldId));
  const areas = data.fields.filter(f => used.has(f.id)).map(f => ({ id: f.id, name: f.name, color: f.color })).sort((a, b) => a.id.localeCompare(b.id));
  return { areas, goals };
}

/* The visible window of a roadmap: it always holds the next step, with up to three finished steps before it. */
export function stepWindow(goal: WorldGoal): { start: number; end: number } {
  if (goal.steps.length <= WORLD_STEP_LIMIT) return { start: 0, end: goal.steps.length };
  const next = goal.steps.findIndex(s => s.next), anchor = next < 0 ? goal.steps.length : next;
  const start = Math.max(0, Math.min(anchor - 3, goal.steps.length - WORLD_STEP_LIMIT));
  return { start, end: start + WORLD_STEP_LIMIT };
}
