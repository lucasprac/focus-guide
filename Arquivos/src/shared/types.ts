import type { AgentAccess, GoalData } from './goal-types';
export * from './goal-types';
export type SessionStatus = 'running' | 'paused' | 'completed';
export const MIN_INCLUDED_SESSION_MS = 2 * 60000;
export type EventKind = 'active' | 'pause' | 'interruption' | 'thought' | 'recovery' | 'edit' | 'attention-return' | 'probe';
export const ACTIVITY_MODES = ['Unspecified', 'Reading', 'Writing/coding', 'Visual work', 'Video/lecture', 'Offline', 'Mixed'] as const;
export type ActivityMode = typeof ACTIVITY_MODES[number];
/* Optional reflection answers after a session; an absent answer stays null. */
export const DETRACTORS = ['none', 'notifications', 'people', 'thoughts', 'tiredness', 'task', 'other'] as const;
export type Detractor = typeof DETRACTORS[number];
export const CHALLENGES = ['too-easy', 'right', 'too-hard'] as const;
export type Challenge = typeof CHALLENGES[number];
/* A probe event stores one of these answers, or 'missed', in its category. */
export const PROBE_ANSWERS = ['on-task', 'drifting', 'elsewhere'] as const;
export type ProbeAnswer = typeof PROBE_ANSWERS[number];
/* What the Focus stage draws: the 3D brain or the isometric session gauge. Appearance only; timing is unchanged. */
export type FocusVisual = 'brain' | 'instrument';
export interface ActivitySample {
  id: string; sessionId: string; startMs: number; endMs: number; observedMs: number;
  keys: number; clicks: number; scrolls: number; movementMs: number;
  status: 'recorded' | 'disabled' | 'unavailable';
  /* Schema 10: observed time with any input, and foreground window changes. Null when unknown. */
  inputMs?: number | null; switches?: number | null;
}
export interface CollectorStatus { state: 'recording' | 'disabled' | 'waiting' | 'unavailable'; shortcut: 'ready' | 'unavailable' | 'conflict'; requestedShortcut?: string; effectiveShortcut?: string; shortcutError?: string; message: string }
export interface Field { id: string; name: string; color: string; archived: boolean; createdAt: string }
export interface TaskCategory { id: string; name: string; color: string; archived: boolean; createdAt: string }
export interface Task { id: string; fieldId: string; title: string; completed: boolean; archived: boolean; createdAt: string; updatedAt: string; categoryId: string | null; notes: string; priority: 'low' | 'normal' | 'high'; dueDate: string | null; goalId?: string | null; milestoneId?: string | null }
export type TimingMode = 'countdown' | 'stopwatch';
export interface FocusSession {
  goalId?: string | null; occurrenceId?: string | null; milestoneId?: string | null;
  id: string; fieldId: string; primaryTaskId: string | null; checklistIds: string[];
  intention: string; plannedMs: number | null; activeMs: number; status: SessionStatus;
  timingMode: TimingMode; autoOvertime: boolean; targetReached: boolean;
  activityMode?: ActivityMode; behaviourVersion?: number;
  startedAt: string; endedAt: string | null; timezone: string;
  energy: number | null; focus: number | null; note: string;
  completionReason: 'timer' | 'early' | null; excluded: boolean; recovered: boolean;
  detractor?: Detractor | null; challenge?: Challenge | null;
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
  agentAccess?: AgentAccess;
  focusVisual?: FocusVisual;
  attentionProbes?: boolean;
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
/* Runtime state of the local agent bridge; it never reaches settings, datasets or backups. */
export interface AgentBridgeStatus { state: 'off' | 'ready' | 'error'; message: string; launch: { command: string; args: string[]; env: Record<string, string> } | null }
/* Runtime state of the attention check-in that is on screen now; it never reaches settings, datasets or backups. */
export interface PendingProbe { id: string; sessionId: string; shownAt: string; expiresAt: string }
export interface AppState extends Dataset { graphicsMode?: 'auto' | 'software'; timer: TimerSnapshot; dataPath: string; backupStatus: string; collector?: CollectorStatus; agent?: AgentBridgeStatus; probe?: PendingProbe | null }
export type BackupFile = Dataset & GoalData & { format: 'focus-guide'; schemaVersion: 10; exportedAt: string };
export interface BackupPreview { token: string; exportedAt: string; sessions: number; fields: number; tasks: number; events: number; goals?: number; goalOccurrences?: number; goalProgress?: number }
export type Command =
  | 'goal.create' | 'goal.update' | 'goal.milestone.save' | 'goal.milestones.sync' | 'goal.action.save' | 'goal.occurrence.save' | 'goal.occurrence.reschedule' | 'goal.progress.save' | 'goal.progress.delete' | 'goal.review.save' | 'goal.suggestion.decide' | 'goal.behaviour'
  | 'agent.proposal.apply' | 'agent.proposal.reject' | 'agent.change.undo'
  | 'export.goals'
  | 'field.create' | 'field.update' | 'field.archive' | 'field.delete'
  | 'task.create' | 'task.update' | 'task.delete'
  | 'category.create' | 'category.update' | 'category.archive' | 'session.tasks'
  | 'session.start' | 'session.pause' | 'session.resume' | 'session.finish'
  | 'session.review' | 'session.edit' | 'session.exclude' | 'session.delete'
  | 'interruption.record' | 'thought.record' | 'break.start' | 'break.stop'
  | 'settings.update' | 'review.save'
  | 'attention.return' | 'attention.remove' | 'behaviour.read' | 'activity.delete' | 'export.activity' | 'shortcut.capture' | 'shortcut.retry'
  | 'probe.answer' | 'insights.read'
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
