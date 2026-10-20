const COLOR_DELAY_MS = 10 * 60 * 1000;

export function brainColorProgress(elapsedMs: number, plannedMs: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(plannedMs) || plannedMs <= COLOR_DELAY_MS) return 0;
  return Math.max(0, Math.min(1, (elapsedMs - COLOR_DELAY_MS) / (plannedMs - COLOR_DELAY_MS)));
}
