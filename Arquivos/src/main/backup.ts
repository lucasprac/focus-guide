import { readFileSync, statSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROBE_ANSWERS, type ActivitySample, type BackupFile, type Dataset, type Field, type FocusSession, type SessionEvent, type Task, type TaskCategory, type WeeklyReview } from '../shared/types';
import * as v from '../shared/validation';
import type { Store } from './store';
import { GOAL_COLLECTIONS, LEGACY_GOAL_COLLECTIONS, V8_GOAL_COLLECTIONS, goalData, upgradeGoalRecords } from '../shared/goal-types';
import { GOAL_LIMITS, validateGoalData } from '../shared/goal-validation';

export const BACKUP_LIMITS = { bytes: 64 * 1024 * 1024, fields: 1000, tasks: 100000, categories: 1000, sessions: 50000, events: 500000, reviews: 5000, activity: 2000000 } as const;
const capacityMessage = 'JSON backups support up to 64 MiB. This file exceeds that capacity; your existing backups have been kept. Use CSV exports or a SQLite snapshot for this dataset.';

function keys(row: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(row).some(k => !allowed.includes(k))) throw new Error('The backup contains unsupported fields.');
  if (allowed.some(k => !(k in row))) throw new Error('The backup is missing required fields.');
}
function rows(value: unknown, limit: number): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error('The backup has an invalid or oversized collection.');
  return value.map(v.object);
}
function unique(values: string[], name: string): void { if (new Set(values).size !== values.length) throw new Error(`Duplicate ${name} identifiers in backup.`); }
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid task checklist.');
  const result = value.map(v.id); unique(result, 'checklist'); return result;
}
export function validateBackup(value: unknown): BackupFile {
  const data = v.object(value);
  const zones = new Map<string, string>();
  const timezone = (value: unknown) => {
    if (typeof value === 'string' && zones.has(value)) return zones.get(value)!;
    const zone = v.timezone(value); zones.set(zone, zone); return zone;
  };
  if (data.schemaVersion === 1) {
    keys(data, ['format', 'schemaVersion', 'exportedAt', 'fields', 'tasks', 'sessions', 'events', 'settings', 'reviews']);
    const tasks = rows(data.tasks, BACKUP_LIMITS.tasks).map(t => {
      keys(t, ['id', 'fieldId', 'title', 'completed', 'archived', 'createdAt', 'updatedAt']);
      return { ...t, categoryId: null, notes: '', priority: 'normal', dueDate: null };
    });
    const sessions = rows(data.sessions, BACKUP_LIMITS.sessions).map(s => {
      keys(s, ['id', 'fieldId', 'primaryTaskId', 'checklistIds', 'intention', 'plannedMs', 'activeMs', 'status', 'startedAt', 'endedAt', 'timezone', 'energy', 'focus', 'note', 'completionReason', 'excluded', 'recovered']);
      return { ...s, timingMode: 'countdown', autoOvertime: false, targetReached: typeof s.activeMs === 'number' && typeof s.plannedMs === 'number' && s.activeMs >= s.plannedMs };
    });
    return validateBackup({ ...data, schemaVersion: 2, categories: [], tasks, sessions });
  }
  if (data.schemaVersion === 2) {
    keys(data, ['format', 'schemaVersion', 'exportedAt', 'fields', 'tasks', 'sessions', 'events', 'settings', 'reviews', 'categories']);
    return validateBackup({ ...data, schemaVersion: 3, activity: [],
      sessions: rows(data.sessions, BACKUP_LIMITS.sessions).map(s => ({ ...s, activityMode: 'Unspecified', behaviourVersion: 0 })),
      events: rows(data.events, BACKUP_LIMITS.events).map(e => ({ ...e, activeOffsetMs: null, source: null })) });
  }
  if (data.schemaVersion === 3) {
    keys(data, ['format', 'schemaVersion', 'exportedAt', 'fields', 'tasks', 'sessions', 'events', 'settings', 'reviews', 'categories', 'activity']);
    return validateBackup({ ...data, schemaVersion: 4, ...Object.fromEntries(LEGACY_GOAL_COLLECTIONS.map(key => [key, []])),
      tasks: rows(data.tasks,BACKUP_LIMITS.tasks).map(t => ({ ...t,goalId: null,milestoneId: null })),
      sessions: rows(data.sessions,BACKUP_LIMITS.sessions).map(s => ({ ...s,goalId: null,occurrenceId: null })) });
  }
  if (data.schemaVersion === 4) {
    keys(data, ['format', 'schemaVersion', 'exportedAt', 'fields', 'tasks', 'sessions', 'events', 'settings', 'reviews', 'categories', 'activity', ...LEGACY_GOAL_COLLECTIONS]);
    const upgraded = upgradeGoalRecords({ goals: rows(data.goals, GOAL_LIMITS.goals), milestones: rows(data.milestones, GOAL_LIMITS.milestones) });
    return validateBackup({ ...data, schemaVersion: 5, goals: upgraded.goals, milestones: upgraded.milestones });
  }
  if (data.schemaVersion === 5) {
    keys(data, ['format', 'schemaVersion', 'exportedAt', 'fields', 'tasks', 'sessions', 'events', 'settings', 'reviews', 'categories', 'activity', ...LEGACY_GOAL_COLLECTIONS]);
    return validateBackup({ ...data, schemaVersion: 6, milestones: upgradeGoalRecords({ milestones: rows(data.milestones, GOAL_LIMITS.milestones) }).milestones });
  }
  if (data.schemaVersion === 6) {
    keys(data, ['format', 'schemaVersion', 'exportedAt', 'fields', 'tasks', 'sessions', 'events', 'settings', 'reviews', 'categories', 'activity', ...LEGACY_GOAL_COLLECTIONS]);
    return validateBackup({ ...data, schemaVersion: 7, milestones: upgradeGoalRecords({ milestones: rows(data.milestones, GOAL_LIMITS.milestones) }).milestones,
      sessions: rows(data.sessions, BACKUP_LIMITS.sessions).map(s => ({ ...s, milestoneId: null })) });
  }
  if (data.schemaVersion === 7) {
    keys(data, ['format', 'schemaVersion', 'exportedAt', 'fields', 'tasks', 'sessions', 'events', 'settings', 'reviews', 'categories', 'activity', ...LEGACY_GOAL_COLLECTIONS]);
    return validateBackup({ ...data, schemaVersion: 8, agentProposals: [] });
  }
  if (data.schemaVersion === 8) {
    keys(data, ['format', 'schemaVersion', 'exportedAt', 'fields', 'tasks', 'sessions', 'events', 'settings', 'reviews', 'categories', 'activity', ...V8_GOAL_COLLECTIONS]);
    return validateBackup({ ...data, schemaVersion: 9, agentChanges: [] });
  }
  if (data.schemaVersion === 9) {
    keys(data, ['format', 'schemaVersion', 'exportedAt', 'fields', 'tasks', 'sessions', 'events', 'settings', 'reviews', 'categories', 'activity', ...GOAL_COLLECTIONS]);
    return validateBackup({ ...data, schemaVersion: 10,
      sessions: rows(data.sessions, BACKUP_LIMITS.sessions).map(s => ({ ...s, detractor: null, challenge: null })),
      activity: rows(data.activity, BACKUP_LIMITS.activity).map(a => ({ ...a, inputMs: null, switches: null })) });
  }
  keys(data, ['format', 'schemaVersion', 'exportedAt', 'fields', 'tasks', 'sessions', 'events', 'settings', 'reviews', 'categories', 'activity', ...GOAL_COLLECTIONS]);
  if (data.format !== 'focus-guide' || data.schemaVersion !== 10) throw new Error('This is not a supported Focus Guide backup (versions 1 to 10).');
  const fields: Field[] = rows(data.fields, BACKUP_LIMITS.fields).map(f => {
    keys(f, ['id', 'name', 'color', 'archived', 'createdAt']);
    return { id: v.id(f.id), name: v.text(f.name, 'Field name', 60, true), color: v.color(f.color), archived: v.bool(f.archived, 'Archived'), createdAt: v.timestamp(f.createdAt) };
  });
  const categories: TaskCategory[] = rows(data.categories, BACKUP_LIMITS.categories).map(c => {
    keys(c, ['id', 'name', 'color', 'archived', 'createdAt']);
    return { id: v.id(c.id), name: v.text(c.name, 'Category name', 60, true), color: v.color(c.color), archived: v.bool(c.archived, 'Archived'), createdAt: v.timestamp(c.createdAt) };
  });
  const tasks: Task[] = rows(data.tasks, BACKUP_LIMITS.tasks).map(t => {
    keys(t, ['id', 'fieldId', 'title', 'completed', 'archived', 'createdAt', 'updatedAt', 'categoryId', 'notes', 'priority', 'dueDate', 'goalId', 'milestoneId']);
    return { goalId: t.goalId === null ? null : v.id(t.goalId), milestoneId: t.milestoneId === null ? null : v.id(t.milestoneId), categoryId: t.categoryId === null ? null : v.id(t.categoryId), notes: v.text(t.notes, 'Task notes', 2000), priority: v.priority(t.priority), dueDate: v.date(t.dueDate), id: v.id(t.id), fieldId: v.id(t.fieldId), title: v.text(t.title, 'Task title', 200, true), completed: v.bool(t.completed, 'Completed'), archived: v.bool(t.archived, 'Archived'), createdAt: v.timestamp(t.createdAt), updatedAt: v.timestamp(t.updatedAt) };
  });
  const sessions: FocusSession[] = rows(data.sessions, BACKUP_LIMITS.sessions).map(s => {
    keys(s, ['id', 'fieldId', 'primaryTaskId', 'checklistIds', 'intention', 'plannedMs', 'activeMs', 'status', 'startedAt', 'endedAt', 'timezone', 'energy', 'focus', 'note', 'completionReason', 'excluded', 'recovered', 'timingMode', 'autoOvertime', 'targetReached', 'activityMode', 'behaviourVersion', 'goalId', 'occurrenceId', 'milestoneId', 'detractor', 'challenge']);
    if (!['running', 'paused', 'completed'].includes(String(s.status))) throw new Error('Invalid session status.');
    if (![null, 'early', 'timer'].includes(s.completionReason as string | null)) throw new Error('Invalid completion reason.');
    if (s.timingMode !== 'countdown' && s.timingMode !== 'stopwatch') throw new Error('Invalid timing mode.');
    const autoOvertime = v.bool(s.autoOvertime, 'Automatic overtime'), targetReached = v.bool(s.targetReached, 'Target reached');
    if (s.timingMode === 'stopwatch' && (s.plannedMs !== null || autoOvertime || targetReached || s.completionReason === 'timer')) throw new Error('A stopwatch cannot have a countdown target.');
    const plannedMs = s.timingMode === 'stopwatch' ? null : v.number(s.plannedMs, 'Planned duration', 60000, 86400000);
    const activeMs = v.number(s.activeMs, 'Recorded duration', 0, plannedMs !== null && !autoOvertime ? plannedMs : Number.MAX_SAFE_INTEGER);
    if (plannedMs !== null && (targetReached && activeMs < plannedMs || autoOvertime && activeMs >= plannedMs && !targetReached)) throw new Error('Countdown target data is inconsistent.');
    const status = s.status as FocusSession['status'];
    if ((status === 'completed') !== (s.endedAt !== null) || (status === 'completed') !== (s.completionReason !== null)) throw new Error('Session completion data is inconsistent.');
    if (s.completionReason === 'timer' && Math.abs(activeMs - plannedMs!) > 1) throw new Error('A timer-completed session has inconsistent time.');
    return { goalId: s.goalId === null ? null : v.id(s.goalId), occurrenceId: s.occurrenceId === null ? null : v.id(s.occurrenceId), milestoneId: s.milestoneId === null ? null : v.id(s.milestoneId), activityMode: v.activityMode(s.activityMode), behaviourVersion: v.number(s.behaviourVersion, 'Behaviour version', 0, 4), detractor: v.detractor(s.detractor), challenge: v.challenge(s.challenge), timingMode: s.timingMode, autoOvertime, targetReached, id: v.id(s.id), fieldId: v.id(s.fieldId), primaryTaskId: s.primaryTaskId === null ? null : v.id(s.primaryTaskId), checklistIds: ids(s.checklistIds), intention: v.text(s.intention, 'Intention', 500), plannedMs, activeMs, status,
      startedAt: v.timestamp(s.startedAt), endedAt: s.endedAt === null ? null : v.timestamp(s.endedAt), timezone: timezone(s.timezone), energy: v.rating(s.energy), focus: v.rating(s.focus), note: v.text(s.note, 'Note', 2000), completionReason: s.completionReason as FocusSession['completionReason'], excluded: v.bool(s.excluded, 'Excluded'), recovered: v.bool(s.recovered, 'Recovered') };
  });
  const events: SessionEvent[] = rows(data.events, BACKUP_LIMITS.events).map(e => {
    keys(e, ['id', 'sessionId', 'kind', 'startedAt', 'endedAt', 'durationMs', 'text', 'category', 'activeOffsetMs', 'source']);
    if (!['active', 'pause', 'interruption', 'thought', 'recovery', 'edit', 'attention-return', 'probe'].includes(String(e.kind))) throw new Error('Unknown event kind.');
    if (![null, 'shortcut', 'floating', 'main'].includes(e.source as string | null)) throw new Error('Invalid return source.');
    const event: SessionEvent = { activeOffsetMs: e.activeOffsetMs === null ? null : v.number(e.activeOffsetMs, 'Active offset', 0, Number.MAX_SAFE_INTEGER), source: e.source as SessionEvent['source'], id: v.id(e.id), sessionId: v.id(e.sessionId), kind: e.kind as SessionEvent['kind'], startedAt: v.timestamp(e.startedAt), endedAt: e.endedAt === null ? null : v.timestamp(e.endedAt), durationMs: v.number(e.durationMs, 'Event duration', 0, Number.MAX_SAFE_INTEGER), text: v.text(e.text, 'Event text', 2000), category: v.text(e.category, 'Category', 100) };
    if (event.kind === 'active' && event.endedAt && Math.abs(Date.parse(event.endedAt) - Date.parse(event.startedAt) - event.durationMs) > 1) throw new Error('An active interval has inconsistent boundaries.');
    if (!['active', 'pause'].includes(event.kind) && event.durationMs !== 0) throw new Error('Only intervals may contain a duration.');
    if (event.kind === 'active' && !event.endedAt && event.durationMs !== 0) throw new Error('An active interval is missing its saved boundary.');
    if (event.kind === 'probe' && (!([...PROBE_ANSWERS, 'missed'] as string[]).includes(event.category) || (event.category === 'missed') !== (event.source === null) || event.source === 'shortcut')) throw new Error('Invalid check-in record.');
    return event;
  });
  const activity: ActivitySample[] = rows(data.activity, BACKUP_LIMITS.activity).map(a => {
    keys(a, ['id', 'sessionId', 'startMs', 'endMs', 'observedMs', 'keys', 'clicks', 'scrolls', 'movementMs', 'status', 'inputMs', 'switches']);
    if (!['recorded', 'disabled', 'unavailable'].includes(String(a.status))) throw new Error('Invalid collection status.');
    const observedMs = v.number(a.observedMs, 'Observed time', 0, 60000);
    const sample: ActivitySample = { id: v.id(a.id), sessionId: v.id(a.sessionId), startMs: v.number(a.startMs, 'Sample start', 0, Number.MAX_SAFE_INTEGER), endMs: v.number(a.endMs, 'Sample end', 0, Number.MAX_SAFE_INTEGER), observedMs, inputMs: a.inputMs === null ? null : v.number(a.inputMs, 'Input time', 0, observedMs + 1), switches: a.switches === null ? null : v.number(a.switches, 'Window switches', 0, 1000), movementMs: v.number(a.movementMs, 'Mouse movement time', 0, 60000), keys: v.number(a.keys, 'Key count', 0, 10000000), clicks: v.number(a.clicks, 'Click count', 0, 10000000), scrolls: v.number(a.scrolls, 'Scroll count', 0, 10000000), status: a.status as ActivitySample['status'] };
    if (sample.endMs <= sample.startMs || sample.endMs - sample.startMs > 60001 || sample.observedMs > sample.endMs - sample.startMs + 1 || sample.movementMs > sample.observedMs + 1 || ![sample.keys, sample.clicks, sample.scrolls].every(Number.isInteger) || sample.switches !== null && !Number.isInteger(sample.switches)) throw new Error('Inconsistent activity summary.');
    if (sample.status !== 'recorded' && (sample.observedMs || sample.keys || sample.clicks || sample.scrolls || sample.movementMs || sample.inputMs || sample.switches)) throw new Error('Unavailable activity cannot contain measurements.');
    return sample;
  });
  unique(activity.map(a => a.id), 'activity');
  const reviews: WeeklyReview[] = rows(data.reviews, BACKUP_LIMITS.reviews).map(r => {
    keys(r, ['week', 'adjustment', 'updatedAt']);
    const week = v.text(r.week, 'Week', 10, true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || !Number.isFinite(Date.parse(week)) || new Date(week).toISOString().slice(0, 10) !== week) throw new Error('Invalid review date.');
    return { week, adjustment: v.text(r.adjustment, 'Adjustment', 2000), updatedAt: v.timestamp(r.updatedAt) };
  });
  unique(categories.map(c => c.id), 'category');
  const categorySet = new Set(categories.map(c => c.id));
  for (const task of tasks) if (task.categoryId !== null && !categorySet.has(task.categoryId)) throw new Error('A task refers to an unknown category.');
  unique(fields.map(f => f.id), 'field'); unique(tasks.map(t => t.id), 'task'); unique(sessions.map(s => s.id), 'session'); unique(events.map(e => e.id), 'event'); unique(reviews.map(r => r.week), 'review');
  const fieldSet = new Set(fields.map(f => f.id)), taskMap = new Map(tasks.map(t => [t.id, t])), sessionMap = new Map(sessions.map(s => [s.id, s]));
  for (const t of tasks) if (!fieldSet.has(t.fieldId)) throw new Error('A task refers to an unknown field.');
  for (const s of sessions) {
    if (!fieldSet.has(s.fieldId)) throw new Error('A session refers to an unknown field.');
    for (const taskId of [...s.checklistIds, ...(s.primaryTaskId ? [s.primaryTaskId] : [])]) if (taskMap.get(taskId)?.fieldId !== s.fieldId) throw new Error('A session task belongs to another or missing field.');
  }
  const boundaries = new Map<string, number>();
  for (const sample of [...activity].sort((a,b) => a.startMs - b.startMs)) {
    const session = sessionMap.get(sample.sessionId);
    if (!session || sample.endMs > session.activeMs + 1 || sample.startMs < (boundaries.get(sample.sessionId) ?? 0)) throw new Error('Activity summaries overlap or exceed session time.');
    boundaries.set(sample.sessionId, sample.endMs);
  }
  for (const event of events) if (event.kind === 'attention-return' && (event.activeOffsetMs === null || event.activeOffsetMs === undefined || !event.source || !sessionMap.has(event.sessionId) || event.activeOffsetMs > sessionMap.get(event.sessionId)!.activeMs + 1)) throw new Error('Return marker exceeds saved time.');
  for (const event of events) if (event.kind === 'probe' && (event.activeOffsetMs === null || event.activeOffsetMs === undefined || !sessionMap.has(event.sessionId) || event.activeOffsetMs > sessionMap.get(event.sessionId)!.activeMs + 1)) throw new Error('Check-in marker exceeds saved time.');
  const totals = new Map<string, number>();
  for (const e of events) { if (!sessionMap.has(e.sessionId)) throw new Error('An event refers to an unknown session.'); if (e.kind === 'active') totals.set(e.sessionId, (totals.get(e.sessionId) ?? 0) + e.durationMs); }
  for (const s of sessions) if (Math.abs((totals.get(s.id) ?? 0) - s.activeMs) > 1) throw new Error('Recorded time does not match the active intervals.');
  if (sessions.filter(s => s.status !== 'completed').length > 1) throw new Error('The backup contains multiple unfinished sessions.');
  const settingsInput = v.object(data.settings);
  // Appearance fields are optional in older version-1 backups.
  keys({ weeklyCapacityMinutes: 0, theme: 'light', sidebarCollapsed: false, autoOvertime: true, collectActivity: false, returnShortcut: 'Ctrl+Alt+Space', activityModes: {}, agentAccess: 'off', focusVisual: 'brain', attentionProbes: false, ...settingsInput }, ['timezone', 'defaultMinutes', 'animation', 'sound', 'palette', 'weeklyGoalMinutes', 'theme', 'sidebarCollapsed', 'autoOvertime', 'collectActivity', 'returnShortcut', 'activityModes', 'weeklyCapacityMinutes', 'agentAccess', 'focusVisual', 'attentionProbes']);
  const base: Dataset = { fields,tasks,sessions,events,reviews,categories,settings: v.settings(settingsInput),activity };
  const domain = validateGoalData(Object.fromEntries(GOAL_COLLECTIONS.map(key => [key,data[key]])),base);
  return { ...base,...domain,format: 'focus-guide',schemaVersion: 10,exportedAt: v.timestamp(data.exportedAt) };
}
export function readBackup(path: string): BackupFile {
  if (statSync(path).size > BACKUP_LIMITS.bytes) throw new Error(capacityMessage);
  const content = readFileSync(path);
  if (content.byteLength > BACKUP_LIMITS.bytes) throw new Error(capacityMessage);
  return validateBackup(JSON.parse(content.toString('utf8').replace(/^\uFEFF/, '')));
}
export function makeBackup(data: Dataset): BackupFile {
  return { ...data,...goalData(data),format: 'focus-guide',schemaVersion: 10,exportedAt: new Date().toISOString(),
    activity: (data.activity ?? []).map(a => ({ ...a,inputMs: a.inputMs ?? null,switches: a.switches ?? null })),
    tasks: data.tasks.map(t => ({ goalId: null,milestoneId: null,...t })),
    sessions: data.sessions.map(s => ({ activityMode: 'Unspecified',behaviourVersion: 0,goalId: null,occurrenceId: null,milestoneId: null,...s,detractor: s.detractor ?? null,challenge: s.challenge ?? null })),
    events: data.events.map(e => ({ activeOffsetMs: null,source: null,...e })) };
}
export function serializeBackup(data: Dataset): string {
  const backup = makeBackup(data);
  validateBackup(backup);
  const contents = JSON.stringify(backup, null, 2);
  if (Buffer.byteLength(contents, 'utf8') > BACKUP_LIMITS.bytes) throw new Error(capacityMessage);
  return contents;
}
export async function saveDailyBackup(store: Store, directory: string, day: string): Promise<{ jsonError?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid backup date.');
  // SQLite remains independently usable even when the JSON format reaches capacity.
  mkdirSync(directory, { recursive: true });
  const snapshot = join(directory, `daily-${day}.${randomUUID()}.tmp.sqlite`);
  try {
    await store.backup(snapshot);
    renameSync(snapshot, join(directory, `daily-${day}.sqlite`));
    try { atomicWrite(join(directory, `daily-${day}.json`), serializeBackup(store.all(true))); return {}; }
    catch (error) { return { jsonError: error instanceof Error ? error.message : 'JSON backup failed.' }; }
  } finally {
    try { unlinkSync(snapshot); } catch { /* A successful rename already removed the temporary path. */ }
  }
}
export function atomicWrite(path: string, contents: string): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, contents, { encoding: 'utf8', flag: 'wx' }); renameSync(temporary, path); }
  catch (error) { try { unlinkSync(temporary); } catch { /* There may be no temporary file. */ } throw error; }
}
export function csvCell(value: unknown): string {
  let str = value === null || value === undefined ? '' : String(value);
  if (/^\s*[=+@-]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}
function csv(headers: string[], rows: unknown[][]): string { return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
export function sessionCSV(data: Dataset): string {
  const fields = new Map(data.fields.map(f => [f.id, f.name])), tasks = new Map(data.tasks.map(t => [t.id, t.title]));
  return csv(['id', 'field_id', 'field_name', 'primary_task_id', 'primary_task_title', 'checklist_task_ids', 'intention', 'planned_minutes', 'recorded_minutes', 'status', 'started_at_utc', 'ended_at_utc', 'recording_timezone', 'energy_1_5', 'focus_1_5', 'note', 'completion_reason', 'excluded', 'recovered', 'timing_mode', 'overtime_minutes', 'activity_mode', 'goal_id', 'occurrence_id', 'milestone_id', 'detractor', 'challenge'],
    data.sessions.map(s => [s.id, s.fieldId, fields.get(s.fieldId), s.primaryTaskId, s.primaryTaskId ? tasks.get(s.primaryTaskId) : null, JSON.stringify(s.checklistIds), s.intention, s.plannedMs === null ? null : s.plannedMs / 60000, s.activeMs / 60000, s.status, s.startedAt, s.endedAt, s.timezone, s.energy, s.focus, s.note, s.completionReason, s.excluded, s.recovered, s.timingMode, s.plannedMs === null ? 0 : Math.max(0, s.activeMs - s.plannedMs) / 60000, s.activityMode ?? 'Unspecified', s.goalId, s.occurrenceId, s.milestoneId ?? null, s.detractor ?? null, s.challenge ?? null]));
}
export function eventCSV(data: Dataset): string {
  return csv(['id', 'session_id', 'kind', 'started_at_utc', 'ended_at_utc', 'duration_ms', 'text', 'category', 'active_offset_ms', 'activation_source'], data.events.map(e => [e.id, e.sessionId, e.kind, e.startedAt, e.endedAt, e.durationMs, e.text, e.category, e.activeOffsetMs, e.source]));
}

export function activityCSV(data: Dataset): string {
  return csv(['id', 'session_id', 'start_active_ms', 'end_active_ms', 'observed_ms', 'key_presses', 'mouse_clicks', 'scroll_events', 'mouse_movement_ms', 'collection_status', 'input_ms', 'window_switches'], (data.activity ?? []).map(a => [a.id, a.sessionId, a.startMs, a.endMs, a.observedMs, a.keys, a.clicks, a.scrolls, a.movementMs, a.status, a.inputMs ?? null, a.switches ?? null]));
}

export function goalCSV(data: Dataset): string {
  const domain = goalData(data);
  return csv(['record_type','id','goal_id','field_id','date','status','value','details_json'], GOAL_COLLECTIONS.flatMap(key => domain[key].map(row => {
    const r = row as unknown as Record<string,unknown>;
    return [key,r.id,key === 'goals' ? r.id : r.goalId,r.fieldId,r.date ?? r.week,r.status,r.value,JSON.stringify(row)];
  })));
}
