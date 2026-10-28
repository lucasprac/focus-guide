import type { TimerSnapshot } from './types';

export function displayedTime(timer: TimerSnapshot): number {
  return timer.phase === 'stopwatch' ? countedTime(timer.elapsedMs) : timer.phase === 'overtime' ? countedTime(timer.overtimeMs) : timer.remainingMs;
}
// Count-up clocks display completed seconds; countdowns retain their ceil convention.
export function countedTime(elapsedMs: number): number { return Math.floor(Math.max(0, elapsedMs) / 1000) * 1000; }
export function timerLabel(timer: TimerSnapshot): string {
  return timer.phase === 'stopwatch' ? 'Tempo registrado' : timer.phase === 'overtime' ? 'Tempo extra' : 'Tempo restante';
}
export function visualDuration(timer: TimerSnapshot): number { return timer.plannedMs ?? 60 * 60000; }
export function visualProgress(timer: TimerSnapshot): number {
  const duration = visualDuration(timer);
  return duration > 0 ? Math.max(0, Math.min(1, timer.elapsedMs / duration)) : 0;
}
// The floating timer's brain constellation forms its lines at milestones of elapsed timer time.
// Each 10-minute milestone adds a fixed share and eases in over BRAIN_FORMING_MS,
// so the brain is complete after BRAIN_MILESTONES milestones (2 hours), whatever the plan.
export const BRAIN_MILESTONE_MS = 10 * 60000;
export const BRAIN_MILESTONES = 12;
export const BRAIN_FORMING_MS = 2 * 60000;
export function brainFormation(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const reached = Math.min(BRAIN_MILESTONES, Math.floor(elapsedMs / BRAIN_MILESTONE_MS));
  if (!reached) return 0;
  const t = Math.max(0, Math.min(1, (elapsedMs - reached * BRAIN_MILESTONE_MS) / BRAIN_FORMING_MS));
  return (reached - 1 + t * t * (3 - 2 * t)) / BRAIN_MILESTONES;
}
