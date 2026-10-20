import type { ActivityMode } from './types';

export type GoalStatus = 'draft' | 'active' | 'paused' | 'achieved' | 'archived';
export type GoalBarrier = 'capability' | 'opportunity' | 'motivation' | 'other';
export interface Goal {
  id: string; fieldId: string; title: string; outcome: string; why: string; whyTags: string[];
  deadline: string | null; baseline: number | null; target: number | null; unit: string;
  status: GoalStatus; statusHistory: Array<{ at: string; status: GoalStatus }>;
  createdAt: string; updatedAt: string;
}
/* A milestone row is one block of the goal's checklist. Only 'todo' rows can be ticked, count for progress and take task links. */
export type MilestoneKind = 'todo' | 'heading' | 'bullet' | 'numbered' | 'text';
export const MILESTONE_KINDS: readonly MilestoneKind[] = ['todo', 'heading', 'bullet', 'numbered', 'text'];
export interface GoalMilestone { id: string; goalId: string; title: string; kind: MilestoneKind; completed: boolean; archived: boolean; position: number; createdAt: string; updatedAt: string }
export interface GoalActionPlan {
  effectiveDate: string; timezone: string; weekdays: number[]; cue: string;
  normal: string; smaller: string; obstacle: string; response: string;
  estimatedMinutes: number | null; activityMode: ActivityMode; enabled: boolean;
}
export interface GoalAction { id: string; goalId: string; title: string; archived: boolean; plans: GoalActionPlan[]; createdAt: string; updatedAt: string }
export interface GoalOccurrence {
  id: string; goalId: string; actionId: string; originalDate: string; date: string;
  status: 'unrecorded' | 'done' | 'smaller' | 'skipped'; barrier: GoalBarrier | null;
  note: string; rescheduleHistory: string[]; plan: GoalActionPlan; updatedAt: string;
}
export interface GoalProgressEntry { id: string; goalId: string; date: string; value: number; note: string; createdAt: string; updatedAt: string }
export interface GoalReview {
  id: string; goalId: string; week: string; adjustment: string;
  previousOutcome: 'undecided' | 'keep' | 'revise'; updatedAt: string;
  decisions: Array<{ suggestionId: string; decision: 'applied' | 'edited' | 'dismissed'; at: string }>;
}
export interface GoalData {
  goals: Goal[]; milestones: GoalMilestone[]; goalActions: GoalAction[];
  goalOccurrences: GoalOccurrence[]; goalProgress: GoalProgressEntry[]; goalReviews: GoalReview[];
}
export const GOAL_COLLECTIONS = ['goals', 'milestones', 'goalActions', 'goalOccurrences', 'goalProgress', 'goalReviews'] as const;
export function emptyGoalData(): GoalData { return { goals: [], milestones: [], goalActions: [], goalOccurrences: [], goalProgress: [], goalReviews: [] }; }
export function goalData(data: Partial<GoalData>): GoalData { return Object.fromEntries(GOAL_COLLECTIONS.map(key => [key, data[key] ?? []])) as unknown as GoalData; }
export const WHY_TAG_SUGGESTIONS = ['Health', 'Learning', 'Career', 'Finances', 'Relationships', 'Family', 'Wellbeing', 'Creativity', 'Independence', 'Contribution', 'Confidence', 'Enjoyment'];
export const WHY_TAG_LIMITS = { count: 12, length: 40 };
export function sortMilestones<T extends Pick<GoalMilestone, 'position' | 'createdAt' | 'id'>>(rows: T[]): T[] { return [...rows].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)); }
/* Schema 5 added goal reason tags and milestone order. Older records keep their free-text reason
   and receive positions in creation order, so nothing is lost. Schema 6 added the milestone block kind;
   every earlier milestone was a to-do. The upgrade is idempotent, so it serves every older version. */
export function upgradeGoalRecords<T extends { goals?: unknown[]; milestones?: unknown[] }>(data: T): T {
  const goals = (data.goals ?? []).map(row => ({ whyTags: [], ...(row as object) }));
  const rows = (data.milestones ?? []) as Array<Record<string, unknown>>, next = new Map<unknown, number>();
  for (const row of rows) if (typeof row.position === 'number') next.set(row.goalId, Math.max(next.get(row.goalId) ?? 0, row.position + 1));
  const legacy = rows.filter(row => row.position === undefined).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
  const positions = new Map(legacy.map(row => { const position = next.get(row.goalId) ?? 0; next.set(row.goalId, position + 1); return [row, position]; }));
  return { ...data, goals, milestones: rows.map(row => ({ kind: 'todo', ...row, ...(positions.has(row) ? { position: positions.get(row) } : {}) })) };
}
