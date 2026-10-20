import type { GoalData } from './goal-types';
export * from './goal-types';
export type SessionStatus = 'running' | 'paused' | 'completed';
export const MIN_INCLUDED_SESSION_MS = 2 * 60000;
export type EventKind = 'active' | 'pause' | 'interruption' | 'thought' | 'recovery' | 'edit' | 'attention-return';
export const ACTIVITY_MODES = ['Unspecified', 'Reading', 'Writing/coding', 'Visual work', 'Video/lecture', 'Offline', 'Mixed'] as const;
export type ActivityMode = typeof ACTIVITY_MODES[number];
export interface ActivitySample {
  id: string; sessionId: string; startMs: number; endMs: number; observedMs: number;
  keys: number; clicks: number; scrolls: number; movementMs: number;
  status: 'recorded' | 'disabled' | 'unavailable';
}
export interface CollectorStatus { state: 'recording' | 'disabled' | 'waiting' | 'unavailable'; shortcut: 'ready' | 'unavailable' | 'conflict'; requestedShortcut?: string; effectiveShortcut?: string; shortcutError?: string; message: string }
export interface Field { id: string; name: string; color: string; archived: boolean; createdAt: string }
export interface TaskCategory { id: string; name: string; color: string; archived: boolean; createdAt: string }
export interface Task { id: string; fieldId: string; title: string; completed: boolean; archived: boolean; createdAt: string; updatedAt: string; categoryId: string | null; notes: string; priority: 'low' | 'normal' | 'high'; dueDate: string | null; goalId?: string | null; milestoneId?: string | null }
export type TimingMode = 'countdown' | 'stopwatch';
export interface FocusSession {
  goalId?: string | null; occurrenceId?: string | null;
  id: string; fieldId: string; primaryTaskId: string | null; checklistIds: string[];
  intention: string; plannedMs: number | null; activeMs: number; status: SessionStatus;
  timingMode: TimingMode; autoOvertime: boolean; targetReached: boolean;
  activityMode?: ActivityMode; behaviourVersion?: number;
  startedAt: string; endedAt: string | null; timezone: string;
  energy: number | null; focus: number | null; note: string;
  completionReason: 'timer' | 'early' | null; excluded: boolean; recovered: boolean;
}
export interface SessionEvent {
  id: string; sessionId: string; kind: EventKind; startedAt: string;
  endedAt: string | null; durationMs: number; text: string; category: string;
  activeOffsetMs?: number | null; source?: 'shortcut' | 'floating' | 'main' | null;
}
export interface Settings {
  weeklyCapacityMinutes?: number;
  timezone: string; defaultMinutes: number; animation: boolean; sound: boolean;
  palette: 'cyan' | 'violet' | 'amber' | 'rose'; weeklyGoalMinutes: number;
  theme: 'light' | 'dark'; sidebarCollapsed: boolean;
  autoOvertime: boolean;
  collectActivity?: boolean; returnShortcut?: string; activityModes?: Record<string, ActivityMode>;
}
export interface WeeklyReview { week: string; adjustment: string; updatedAt: string }
export interface Dataset extends Partial<GoalData> {
  fields: Field[]; tasks: Task[]; sessions: FocusSession[]; events: SessionEvent[];
  settings: Settings; reviews: WeeklyReview[];
  categories: TaskCategory[];
  activity?: ActivitySample[];
}
export interface TimerSnapshot {
  mode: 'idle' | 'focus' | 'break'; running: boolean; sessionId: string | null;
  elapsedMs: number; remainingMs: number; plannedMs: number | null;
  phase: 'idle' | 'countdown' | 'stopwatch' | 'overtime' | 'break'; overtimeMs: number;
  pauseReason: string | null;
}
export interface AppState extends Dataset { graphicsMode?: 'auto' | 'software'; timer: TimerSnapshot; dataPath: string; backupStatus: string; collector?: CollectorStatus }
export type BackupFile = Dataset & GoalData & { format: 'focus-guide'; schemaVersion: 6; exportedAt: string };
export interface BackupPreview { token: string; exportedAt: string; sessions: number; fields: number; tasks: number; events: number; goals?: number; goalOccurrences?: number; goalProgress?: number }
export type Command =
  | 'goal.create' | 'goal.update' | 'goal.milestone.save' | 'goal.milestones.sync' | 'goal.action.save' | 'goal.occurrence.save' | 'goal.occurrence.reschedule' | 'goal.progress.save' | 'goal.progress.delete' | 'goal.review.save' | 'goal.suggestion.decide'
  | 'export.goals'
  | 'field.create' | 'field.update' | 'field.archive' | 'field.delete'
  | 'task.create' | 'task.update' | 'task.delete'
  | 'category.create' | 'category.update' | 'category.archive' | 'session.tasks'
  | 'session.start' | 'session.pause' | 'session.resume' | 'session.finish'
  | 'session.review' | 'session.edit' | 'session.exclude' | 'session.delete'
  | 'interruption.record' | 'thought.record' | 'break.start' | 'break.stop'
  | 'settings.update' | 'review.save'
  | 'attention.return' | 'attention.remove' | 'behaviour.read' | 'activity.delete' | 'export.activity' | 'shortcut.capture' | 'shortcut.retry'
  | 'window.float' | 'window.main' | 'window.hide'
  | 'export.sessions' | 'export.events' | 'export.backup'
  | 'backup.preview' | 'backup.restore' | 'backup.create';
export type AppEvent = { type: 'state'; state: AppState } | { type: 'timer'; timer: TimerSnapshot } | { type: 'error'; message: string } | { type: 'notice'; message: string } | { type: 'visibility'; visible: boolean } | { type: 'attention-return'; sessionId: string; eventId: string; savedAt: string } | { type: 'shortcut-captured'; shortcut: string };
export type CommandResult = { ok: true; value?: unknown } | { ok: false; error: string };
export interface FocusGuideAPI {
  getState(): Promise<AppState>;
  command(command: Command, input?: Record<string, unknown>): Promise<CommandResult>;
  onEvent(listener: (event: AppEvent) => void): () => void;
}
declare global { interface Window { focusGuide: FocusGuideAPI } }
