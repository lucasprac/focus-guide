import type { AppState } from '../../shared/types';
import { goalData } from '../../shared/goal-types';
import { addDays, localDay } from '../../shared/analytics';
import { goalWorldModel, stepWindow, WORLD_GOAL_LIMIT, type WorldGoal, type WorldStep } from '../../shared/goal-world';

/* The 2D overview: you in the centre, one region per area around you, and each goal as a cell at the edge of its area.
   Positions come from identities and creation order, never from totals, so the map does not jump when time changes.
   World units: the map fits a circle of radius 1 around the centre. */
export interface MapSpark { at: number; minutes: number; areaId: string; goalId: string | null }
export interface MapStep { step: WorldStep; angle: number }
export interface MapGoal { goal: WorldGoal; createdAt: number; x: number; y: number; angle: number; steps: MapStep[] }
export interface MapArea {
  id: string; name: string; color: string; createdAt: number; x: number; y: number; angle: number;
  minutes: number; minutes28: number; sessions: number; lastAt: number | null; goals: MapGoal[];
}
export interface WorldMap {
  areas: MapArea[]; sparks: MapSpark[]; totalMinutes: number; minutes28: number; firstAt: number | null;
  /* The area and goal of the running focus session, if any. */
  live: { areaId: string; goalId: string | null } | null;
}

const saturate = (minutes: number, hours: number) => Math.min(1, Math.log1p(minutes / 60) / Math.log1p(hours));
export const coreRadius = (minutes: number) => .07 + .05 * saturate(minutes, 500);
export const areaRadius = (minutes: number) => .075 + .075 * saturate(minutes, 300);
export const goalRadius = (minutes: number) => .02 + .028 * saturate(minutes, 100);

export function buildWorldMap(data: AppState, now = Date.now()): WorldMap {
  const model = goalWorldModel(data, now), domain = goalData(data);
  const created = new Map(domain.goals.map(g => [g.id, Date.parse(g.createdAt)]));
  const from = addDays(localDay(now, data.settings.timezone), -27);
  const included = data.sessions.filter(s => s.status === 'completed' && !s.excluded);
  const goalsOnMap = new Set(model.goals.slice(0, WORLD_GOAL_LIMIT).map(g => g.id));
  const sparks = included.map((s): MapSpark => ({ at: Date.parse(s.endedAt ?? s.startedAt), minutes: s.activeMs / 60000, areaId: s.fieldId, goalId: s.goalId && goalsOnMap.has(s.goalId) ? s.goalId : null })).sort((a, b) => a.at - b.at);
  const usedFields = new Set([...included.map(s => s.fieldId), ...model.goals.map(g => g.fieldId)]);
  const fields = data.fields.filter(f => !f.archived || usedFields.has(f.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const count = fields.length, distance = count <= 1 ? 0 : count <= 6 ? .56 : .64;
  const areas = fields.map((field, index): MapArea => {
    const angle = -Math.PI / 2 + index / Math.max(1, count) * Math.PI * 2;
    const x = Math.cos(angle) * distance, y = Math.sin(angle) * distance;
    const rows = included.filter(s => s.fieldId === field.id);
    const goals = model.goals.filter(g => g.fieldId === field.id && goalsOnMap.has(g.id)).sort((a, b) => (created.get(a.id) ?? 0) - (created.get(b.id) ?? 0) || a.id.localeCompare(b.id));
    return {
      id: field.id, name: field.name, color: field.color, createdAt: Date.parse(field.createdAt), x, y, angle,
      minutes: rows.reduce((sum, s) => sum + s.activeMs / 60000, 0),
      minutes28: rows.filter(s => localDay(s.startedAt, s.timezone) >= from).reduce((sum, s) => sum + s.activeMs / 60000, 0),
      sessions: rows.length, lastAt: rows.length ? Math.max(...rows.map(s => Date.parse(s.endedAt ?? s.startedAt))) : null,
      goals: placeGoals(goals, x, y, count <= 1 ? -Math.PI / 2 : angle, created)
    };
  });
  const running = data.timer.mode === 'focus' ? data.sessions.find(s => s.id === data.timer.sessionId) : undefined;
  return {
    areas, sparks, totalMinutes: sparks.reduce((sum, s) => sum + s.minutes, 0), minutes28: areas.reduce((sum, a) => sum + a.minutes28, 0),
    firstAt: sparks[0]?.at ?? null, live: running ? { areaId: running.fieldId, goalId: running.goalId && goalsOnMap.has(running.goalId) ? running.goalId : null } : null
  };
}

/* Goals sit on a fan that faces away from the centre: up to 7 on the first arc, the rest on a wider second arc. */
function placeGoals(goals: WorldGoal[], ax: number, ay: number, outward: number, created: Map<string, number>): MapGoal[] {
  return goals.map((goal, index) => {
    const ring = index < 7 ? 0 : 1, onRing = ring ? goals.length - 7 : Math.min(7, goals.length), slot = ring ? index - 7 : index;
    const step = Math.min(.62, (ring ? 3.4 : 2.6) / Math.max(1, onRing - 1)), angle = outward + (slot - (onRing - 1) / 2) * step;
    const reach = ring ? .3 : .21, window = stepWindow(goal);
    const steps = goal.steps.slice(window.start, window.end).map((step, i, all) => ({ step, angle: -Math.PI / 2 + i / all.length * Math.PI * 2 }));
    return { goal, createdAt: created.get(goal.id) ?? 0, x: ax + Math.cos(angle) * reach, y: ay + Math.sin(angle) * reach, angle, steps };
  });
}
