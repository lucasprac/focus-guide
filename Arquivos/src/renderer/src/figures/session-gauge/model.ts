import { BRAIN_MILESTONE_MS, BRAIN_MILESTONES } from '../../../../shared/timer-display';
import { t } from '../../../../shared/i18n';

// The session gauge reads elapsed timer time from the main-process snapshot; it never measures time itself.
// One turn of the needle is one 10-minute milestone, and the small dial counts turns up to the
// 12 milestones (2 hours) of the brain formation, so both visuals keep the same pace.
export const TURN_MS = BRAIN_MILESTONE_MS;
export const TURNS = BRAIN_MILESTONES;

export function gaugeTurns(elapsedMs: number): number {
  return Number.isFinite(elapsedMs) ? Math.max(0, Math.min(TURNS, elapsedMs / TURN_MS)) : 0;
}
// The plan marker on the small dial; a stopwatch session has no plan.
export function planTurns(plannedMs: number | null): number | null {
  return plannedMs !== null && Number.isFinite(plannedMs) && plannedMs > 0 ? Math.min(TURNS, plannedMs / TURN_MS) : null;
}
export function gaugeReadout(elapsedMs: number, plannedMs: number | null): string {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const turn = Math.min(TURNS, Math.floor(elapsed / TURN_MS));
  const minutes = Math.floor(elapsed / 60000);
  const plan = planTurns(plannedMs) === null ? '' : t(' of {v1}', { v1: Math.round(plannedMs! / 60000) });
  return t('turn {turn} of {TURNS} · {minutes}{plan} min', { turn, TURNS, minutes, plan });
}
