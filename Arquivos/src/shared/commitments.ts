import * as v from './validation';
import type { ActivityMode, FocusSession } from './types';
import { localDay, minuteOfDay } from './analytics';
import { t } from './i18n';

/* Schema 13: a commitment is a block of planned focus time on one local date, from startMinute for durationMinutes, in the
   timezone of its plan. It can serve a task, a roadmap step, a goal or an area, or nothing in particular (a free focus block).
   The stored status records a decision: planned, done (the user says it happened), skipped (the user did not do it) or
   cancelled (taken out of the plan, kept for history). What happened is in the sessions that link to it. */
export const COMMITMENT_STATUSES = ['planned', 'done', 'skipped', 'cancelled'] as const;
export type CommitmentStatus = typeof COMMITMENT_STATUSES[number];
export type CommitmentOrigin = 'user' | 'agent';
export interface Commitment {
  id: string; title: string; notes: string; date: string; startMinute: number; durationMinutes: number; timezone: string;
  fieldId: string | null; goalId: string | null; milestoneId: string | null; taskId: string | null;
  activityMode: ActivityMode; status: CommitmentStatus; origin: CommitmentOrigin; rescheduleCount: number;
  createdAt: string; updatedAt: string;
}
/* What the calendar shows: the stored decision, or what the linked sessions and the clock tell. */
export type CommitmentState = 'planned' | 'active' | 'done' | 'missed' | 'skipped' | 'cancelled';
export const COMMITMENT_LIMITS = { count: 50000, title: 200, notes: 2000, minMinutes: 5, maxMinutes: 720, batch: 50, rescheduleCount: 10000 };
export const COMMITMENT_KEYS = ['id', 'title', 'notes', 'date', 'startMinute', 'durationMinutes', 'timezone', 'fieldId', 'goalId', 'milestoneId', 'taskId', 'activityMode', 'status', 'origin', 'rescheduleCount', 'createdAt', 'updatedAt'] as const;

export function commitmentStatus(value: unknown): CommitmentStatus {
  if (!(COMMITMENT_STATUSES as readonly unknown[]).includes(value)) throw new Error(t('Choose planned, done, skipped or cancelled for the commitment.'));
  return value as CommitmentStatus;
}
/* The structure of one stored commitment. Links to other records are checked by the service and by backup validation. */
export function validateCommitment(value: unknown): Commitment {
  const r = v.object(value);
  if (Object.keys(r).some(k => !(COMMITMENT_KEYS as readonly string[]).includes(k)) || COMMITMENT_KEYS.some(k => !(k in r))) throw new Error(t('A commitment contains unsupported or missing fields.'));
  const date = v.date(r.date); if (!date) throw new Error(t('A commitment needs a date.'));
  const startMinute = v.number(r.startMinute, t('Start time'), 0, 1440 - COMMITMENT_LIMITS.minMinutes), durationMinutes = v.number(r.durationMinutes, t('Duration'), COMMITMENT_LIMITS.minMinutes, COMMITMENT_LIMITS.maxMinutes);
  if (!Number.isInteger(startMinute) || !Number.isInteger(durationMinutes)) throw new Error(t('Plan commitments in whole minutes.'));
  if (startMinute + durationMinutes > 1440) throw new Error(t('A commitment ends on the day it starts. Split a block that passes midnight.'));
  const link = (value: unknown) => value === null ? null : v.id(value);
  const goalId = link(r.goalId), milestoneId = link(r.milestoneId), fieldId = link(r.fieldId);
  if (milestoneId && !goalId) throw new Error(t('A roadmap step needs its goal.'));
  if (goalId && !fieldId) throw new Error(t('A goal commitment keeps the goal’s area.'));
  if (r.origin !== 'user' && r.origin !== 'agent') throw new Error(t('Invalid commitment origin.'));
  const rescheduleCount = v.number(r.rescheduleCount, t('Reschedule count'), 0, COMMITMENT_LIMITS.rescheduleCount);
  if (!Number.isInteger(rescheduleCount)) throw new Error(t('Invalid reschedule count.'));
  return { id: v.id(r.id), title: v.text(r.title, t('Commitment title'), COMMITMENT_LIMITS.title, true), notes: v.text(r.notes, t('Commitment notes'), COMMITMENT_LIMITS.notes), date, startMinute, durationMinutes, timezone: v.timezone(r.timezone),
    fieldId, goalId, milestoneId, taskId: link(r.taskId), activityMode: v.activityMode(r.activityMode), status: commitmentStatus(r.status), origin: r.origin, rescheduleCount, createdAt: v.timestamp(r.createdAt), updatedAt: v.timestamp(r.updatedAt) };
}

/* "HH:MM" on a 24-hour clock, the form that agents read and write. A minute of the clock (minuteOfDay) has a fraction; it is cut off. */
export function clockText(minute: number): string { const whole = Math.floor(minute); return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`; }
export function parseClock(value: unknown): number {
  const text = v.text(value, t('Start time'), 5, true), match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  if (!match) throw new Error(t('Write the start time as HH:MM on a 24-hour clock, such as 09:30.'));
  return Number(match[1]) * 60 + Number(match[2]);
}
export const commitmentEnd = (c: Pick<Commitment, 'startMinute' | 'durationMinutes'>) => c.startMinute + c.durationMinutes;
/* Only planned and done commitments hold their time: skipped and cancelled ones free it. */
export const holdsTime = (c: Pick<Commitment, 'status'>) => c.status === 'planned' || c.status === 'done';
/* The first other commitment on the same date whose time overlaps [startMinute, end). */
export function overlappingCommitment(rows: readonly Commitment[], draft: Pick<Commitment, 'id' | 'date' | 'startMinute' | 'durationMinutes' | 'status'>): Commitment | undefined {
  if (!holdsTime(draft)) return undefined;
  return rows.find(c => c.id !== draft.id && c.date === draft.date && holdsTime(c) && c.startMinute < commitmentEnd(draft) && draft.startMinute < commitmentEnd(c));
}
export function commitmentSessions(sessions: readonly FocusSession[], id: string): FocusSession[] { return sessions.filter(s => s.commitmentId === id); }
export function commitmentState(c: Commitment, sessions: readonly FocusSession[], now = Date.now()): CommitmentState {
  if (c.status !== 'planned') return c.status;
  const linked = commitmentSessions(sessions, c.id);
  if (linked.some(s => s.status !== 'completed')) return 'active';
  if (linked.length) return 'done';
  const today = localDay(now, c.timezone);
  return c.date < today || c.date === today && minuteOfDay(now, c.timezone) >= commitmentEnd(c) ? 'missed' : 'planned';
}
