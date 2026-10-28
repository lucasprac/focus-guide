import type { Dataset, FocusSession, Settings } from './types';
import { goalData } from './goal-types';
import { monday, parts } from './analytics';

/* Achievements are derived from records only, so they cannot drift from the data and need no migration.
   Design rules, from game design, adapted to a focus app that must never pressure:
   - Clear goals and visible progress: every visible achievement shows how far you are (goal-gradient effect).
   - Ladders: time milestones are tiers, so there is always a next step that is close.
   - Varied motivations: time, craft (goals and roadmaps), exploration, rhythm and secrets reward different players.
   - No loss: nothing can be lost again. Rhythm counts different weeks, never consecutive days, and one secret rewards a return.
   - Rewards are cosmetic: some achievements unlock a palette for the world. Collecting is a small ceremony, not a requirement.
   - Surprise: secret achievements stay hidden until a record earns them. */
export type AchievementCategory = 'time' | 'craft' | 'explore' | 'rhythm' | 'secret';
export type PaletteId = Settings['palette'];
export interface AchievementDefinition { id: string; title: string; description: string; category: AchievementCategory; target: number; unit?: 'h' }
export interface AchievementState extends AchievementDefinition {
  current: number; fraction: number; unlocked: boolean; unlockedAt: string | null; collectedAt: string | null; hidden: boolean; reward: PaletteId | null;
}
export interface PaletteDefinition { id: PaletteId; name: string; color: string; description: string; hours?: number; achievement?: string }

export const ACHIEVEMENT_CATEGORIES: Array<{ id: AchievementCategory; name: string; description: string }> = [
  { id: 'time', name: 'Time', description: 'Hours that you returned to.' },
  { id: 'craft', name: 'Craft', description: 'Goals, roadmaps and the tasks that move them.' },
  { id: 'explore', name: 'Exploration', description: 'New areas, new ways to work.' },
  { id: 'rhythm', name: 'Rhythm', description: 'Weeks with focus, in any order. No streak to protect.' },
  { id: 'secret', name: 'Secrets', description: 'Hidden until you find them.' }
];

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'first-spark', title: 'First spark', description: 'Finish your first focus session.', category: 'time', target: 1 },
  { id: 'hours-1', title: 'First hour', description: 'Record 1 hour of focus.', category: 'time', target: 1, unit: 'h' },
  { id: 'hours-10', title: 'First ten hours', description: 'Record 10 hours of focus.', category: 'time', target: 10, unit: 'h' },
  { id: 'hours-25', title: 'Steady flame', description: 'Record 25 hours of focus.', category: 'time', target: 25, unit: 'h' },
  { id: 'hours-50', title: 'Fifty hours', description: 'Record 50 hours of focus.', category: 'time', target: 50, unit: 'h' },
  { id: 'hours-100', title: 'A hundred hours', description: 'Record 100 hours of focus.', category: 'time', target: 100, unit: 'h' },
  { id: 'hours-250', title: 'Deep roots', description: 'Record 250 hours of focus.', category: 'time', target: 250, unit: 'h' },
  { id: 'deep-dive', title: 'Deep dive', description: 'Finish one session with 90 active minutes or more.', category: 'time', target: 90 },
  { id: 'first-goal', title: 'A direction', description: 'Create your first goal.', category: 'craft', target: 1 },
  { id: 'mapped-route', title: 'Mapped route', description: 'Give one goal a roadmap with 3 steps.', category: 'craft', target: 3 },
  { id: 'aimed-effort', title: 'Aimed effort', description: 'Finish 10 sessions linked to a goal.', category: 'craft', target: 10 },
  { id: 'task-trio', title: 'More than three', description: 'Complete more than 3 tasks of one goal.', category: 'craft', target: 4 },
  { id: 'steps-5', title: 'Step by step', description: 'Finish 5 roadmap steps.', category: 'craft', target: 5 },
  { id: 'steps-25', title: 'Long road', description: 'Finish 25 roadmap steps.', category: 'craft', target: 25 },
  { id: 'summit', title: 'Summit', description: 'Mark a goal as achieved.', category: 'craft', target: 1 },
  { id: 'explorer', title: 'Explorer', description: 'Focus in 3 different areas.', category: 'explore', target: 3 },
  { id: 'two-clocks', title: 'Two clocks', description: 'Finish a countdown session and a stopwatch session.', category: 'explore', target: 2 },
  { id: 'clear-intention', title: 'Clear intention', description: 'Write an intention for 10 sessions.', category: 'explore', target: 10 },
  { id: 'honest-mirror', title: 'Honest mirror', description: 'Rate your focus after 10 sessions.', category: 'explore', target: 10 },
  { id: 'looking-back', title: 'Looking back', description: 'Save 3 weekly or goal reviews.', category: 'explore', target: 3 },
  { id: 'weeks-4', title: 'Four weeks', description: 'Focus in 4 different weeks, in any order.', category: 'rhythm', target: 4 },
  { id: 'weeks-12', title: 'A season', description: 'Focus in 12 different weeks, in any order.', category: 'rhythm', target: 12 },
  { id: 'weeks-26', title: 'Half a year', description: 'Focus in 26 different weeks, in any order.', category: 'rhythm', target: 26 },
  { id: 'welcome-back', title: 'Welcome back', description: 'Return after 7 days or more away. Your world waited.', category: 'secret', target: 1 },
  { id: 'night-owl', title: 'Night owl', description: 'Start a session between 22:00 and 04:00.', category: 'secret', target: 1 },
  { id: 'early-light', title: 'Early light', description: 'Start a session between 05:00 and 07:00.', category: 'secret', target: 1 },
  { id: 'past-the-bell', title: 'Past the bell', description: 'Continue a countdown session for 10 minutes or more after it ends.', category: 'secret', target: 1 }
];
export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map(a => a.id);

/* The first four palettes keep their hour thresholds. The others are rewards of achievements. */
export const PALETTES: PaletteDefinition[] = [
  { id: 'cyan', name: 'First light', color: '#62d8cd', hours: 0, description: 'A quiet cyan beginning.' },
  { id: 'violet', name: 'Afterglow', color: '#ac9df3', hours: 5, description: 'Five hours, a softer sky.' },
  { id: 'amber', name: 'Golden hour', color: '#edbe78', hours: 20, description: 'Twenty hours of returning.' },
  { id: 'rose', name: 'Rose horizon', color: '#eea5bb', hours: 50, description: 'Fifty hours, a wider world.' },
  { id: 'mint', name: 'Wild mint', color: '#7fd6a2', achievement: 'explorer', description: 'Three areas, one greener map.' },
  { id: 'ocean', name: 'Open sea', color: '#79aef2', achievement: 'weeks-12', description: 'A season of weeks, a deeper blue.' },
  { id: 'ember', name: 'Ember', color: '#f2956b', achievement: 'summit', description: 'A goal reached, a warm glow.' },
  { id: 'aurora', name: 'Aurora', color: '#c4e06e', achievement: 'hours-100', description: 'A hundred hours, a sky that moves.' }
];
export const PALETTE_IDS = PALETTES.map(p => p.id);

const included = (data: Dataset) => data.sessions.filter(s => s.status === 'completed' && !s.excluded)
  .sort((a, b) => (a.endedAt ?? a.startedAt).localeCompare(b.endedAt ?? b.startedAt));
const finished = (s: FocusSession) => s.endedAt ?? s.startedAt;
type Progress = { current: number; at: string | null };
/* The moment a running total first reaches the target. Rows must be sorted by time. */
function crossing<T>(rows: T[], target: number, at: (row: T) => string, amount: (row: T) => number = () => 1): Progress {
  let total = 0, when: string | null = null;
  for (const row of rows) { total += amount(row); if (when === null && total >= target - 1e-9) when = at(row); }
  return { current: total, at: when };
}
/* The time at which the count of distinct keys first reaches the target. */
function distinct<T>(rows: T[], target: number, key: (row: T) => string, at: (row: T) => string): Progress {
  const seen = new Set<string>(); let when: string | null = null;
  for (const row of rows) { seen.add(key(row)); if (when === null && seen.size >= target) when = at(row); }
  return { current: seen.size, at: when };
}
function first<T>(rows: T[], test: (row: T) => boolean, at: (row: T) => string): Progress {
  const row = rows.find(test); return { current: row ? 1 : 0, at: row ? at(row) : null };
}
/* The best group: the largest count, and the earliest time at which any group reached the target. */
function bestGroup<T>(rows: T[], target: number, key: (row: T) => string, at: (row: T) => string): Progress {
  const groups = new Map<string, T[]>();
  for (const row of [...rows].sort((a, b) => at(a).localeCompare(at(b)))) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  let current = 0, when: string | null = null;
  for (const group of groups.values()) {
    current = Math.max(current, group.length);
    if (group.length >= target) { const reached = at(group[target - 1]); if (!when || reached < when) when = reached; }
  }
  return { current, at: when };
}

function progressFor(data: Dataset): Record<string, Progress> {
  const sessions = included(data), domain = goalData(data);
  const minutes = (s: FocusSession) => s.activeMs / 60000;
  const hour = (s: FocusSession) => parts(s.startedAt, s.timezone).hour;
  const hours = (target: number) => { const p = crossing(sessions, target * 60, finished, minutes); return { current: p.current / 60, at: p.at }; };
  const weeks = (target: number) => distinct(sessions, target, s => monday(parts(s.startedAt, s.timezone).day), finished);
  const steps = domain.milestones.filter(m => m.kind === 'todo' && !m.archived);
  const doneSteps = steps.filter(m => m.completed).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const achievedAt = (goal: typeof domain.goals[number]) => goal.statusHistory.find(h => h.status === 'achieved')?.at ?? goal.updatedAt;
  const achieved = domain.goals.filter(g => g.status === 'achieved' || g.statusHistory.some(h => h.status === 'achieved')).sort((a, b) => achievedAt(a).localeCompare(achievedAt(b)));
  const reviews = [...data.reviews.map(r => r.updatedAt), ...domain.goalReviews.map(r => r.updatedAt)].sort();
  let away: Progress = { current: 0, at: null };
  for (let i = 1; i < sessions.length && !away.at; i++) {
    const gap = Date.parse(sessions[i].startedAt) - Date.parse(finished(sessions[i - 1]));
    if (gap >= 7 * 86400000) away = { current: 1, at: finished(sessions[i]) };
  }
  const countdown = sessions.find(s => s.timingMode === 'countdown'), stopwatch = sessions.find(s => s.timingMode === 'stopwatch');
  const longest = sessions.reduce((max, s) => Math.max(max, minutes(s)), 0), deep = sessions.find(s => minutes(s) >= 90);
  return {
    'first-spark': crossing(sessions, 1, finished),
    'hours-1': hours(1), 'hours-10': hours(10), 'hours-25': hours(25), 'hours-50': hours(50), 'hours-100': hours(100), 'hours-250': hours(250),
    'deep-dive': { current: Math.floor(longest), at: deep ? finished(deep) : null },
    'first-goal': crossing([...domain.goals].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), 1, g => g.createdAt),
    'mapped-route': bestGroup(steps, 3, m => m.goalId, m => m.createdAt),
    'aimed-effort': crossing(sessions.filter(s => s.goalId), 10, finished),
    'task-trio': bestGroup(data.tasks.filter(t => t.completed && t.goalId), 4, t => t.goalId!, t => t.updatedAt),
    'steps-5': crossing(doneSteps, 5, m => m.updatedAt), 'steps-25': crossing(doneSteps, 25, m => m.updatedAt),
    summit: crossing(achieved, 1, achievedAt),
    explorer: distinct(sessions, 3, s => s.fieldId, finished),
    'two-clocks': { current: (countdown ? 1 : 0) + (stopwatch ? 1 : 0), at: countdown && stopwatch ? [finished(countdown), finished(stopwatch)].sort()[1] : null },
    'clear-intention': crossing(sessions.filter(s => s.intention.trim()), 10, finished),
    'honest-mirror': crossing(sessions.filter(s => s.focus !== null), 10, finished),
    'looking-back': crossing(reviews, 3, at => at),
    'weeks-4': weeks(4), 'weeks-12': weeks(12), 'weeks-26': weeks(26),
    'welcome-back': away,
    'night-owl': first(sessions, s => hour(s) >= 22 || hour(s) < 4, finished),
    'early-light': first(sessions, s => hour(s) >= 5 && hour(s) < 7, finished),
    'past-the-bell': first(sessions, s => s.timingMode === 'countdown' && s.plannedMs !== null && s.activeMs - s.plannedMs >= 600000, finished)
  };
}

export function evaluateAchievements(data: Dataset): AchievementState[] {
  const progress = progressFor(data), collected = data.settings.collectedAchievements ?? {};
  return ACHIEVEMENTS.map(definition => {
    const p = progress[definition.id] ?? { current: 0, at: null }, unlocked = p.at !== null;
    return {
      ...definition, current: Math.min(p.current, definition.target), fraction: Math.max(0, Math.min(1, p.current / definition.target)),
      unlocked, unlockedAt: p.at, collectedAt: unlocked ? collected[definition.id] ?? null : null,
      hidden: definition.category === 'secret' && !unlocked, reward: PALETTES.find(palette => palette.achievement === definition.id)?.id ?? null
    };
  });
}

export function paletteUnlocked(palette: PaletteDefinition, data: Dataset, achievements = evaluateAchievements(data)): boolean {
  if (palette.achievement) return achievements.some(a => a.id === palette.achievement && a.unlocked);
  return included(data).reduce((sum, s) => sum + s.activeMs, 0) / 3600000 >= (palette.hours ?? 0);
}
export function paletteUnlockLabel(palette: PaletteDefinition): string {
  return palette.achievement ? `Earn “${ACHIEVEMENTS.find(a => a.id === palette.achievement)?.title}”` : `Record ${palette.hours} hours`;
}
