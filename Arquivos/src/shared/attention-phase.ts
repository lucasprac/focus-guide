import type { SessionEvent, TimerSnapshot } from './types';
import { t } from './i18n';

/* The attention state of a focus session: warm-up, sustain or fatigue. In automatic mode it follows active time
   (warm-up before PHASE_MINUTES.warmUp, fatigue from PHASE_MINUTES.fatigue). A manual session starts with a warm-up
   marker at offset 0 and changes with each 'attention-phase' marker; a session is manual exactly when it has one. */
export const ATTENTION_PHASES = ['warm-up', 'sustain', 'fatigue'] as const;
export type AttentionPhase = typeof ATTENTION_PHASES[number];
export type AttentionPhaseMode = 'auto' | 'manual';
export const PHASE_MINUTES = { warmUp: 10, fatigue: 25 } as const;
export const ATTENTION_PHASE_LABELS: Record<AttentionPhase, string> = { get 'warm-up'() { return t('Warm-up'); }, get sustain() { return t('Sustain'); }, get fatigue() { return t('Fatigue'); } };
export function isAttentionPhase(value: unknown): value is AttentionPhase { return (ATTENTION_PHASES as readonly unknown[]).includes(value); }

export interface PhaseMarker { offsetMs: number; phase: AttentionPhase }
export interface PhaseSpan { phase: AttentionPhase; fromMs: number; toMs: number }

export function automaticPhase(offsetMs: number): AttentionPhase {
  return offsetMs < PHASE_MINUTES.warmUp * 60000 ? 'warm-up' : offsetMs < PHASE_MINUTES.fatigue * 60000 ? 'sustain' : 'fatigue';
}
/* The phase markers of one session, in order of active time. */
export function phaseMarkers(events: SessionEvent[], sessionId: string): PhaseMarker[] {
  return events.filter(e => e.sessionId === sessionId && e.kind === 'attention-phase' && isAttentionPhase(e.category) && typeof e.activeOffsetMs === 'number')
    .map(e => ({ offsetMs: e.activeOffsetMs!, phase: e.category as AttentionPhase })).sort((a, b) => a.offsetMs - b.offsetMs);
}
/* Before the first marker the automatic cuts apply; from each marker on, the phase of the marker. */
export function phaseAt(offsetMs: number, markers: PhaseMarker[]): AttentionPhase {
  let phase: AttentionPhase | null = null;
  for (const m of markers) { if (m.offsetMs > offsetMs) break; phase = m.phase; }
  return phase ?? automaticPhase(offsetMs);
}
/* The phases that cover [0, activeMs), with neighbouring spans of the same phase joined. */
export function phaseSpans(activeMs: number, markers: PhaseMarker[]): PhaseSpan[] {
  const cuts = new Set<number>([0, PHASE_MINUTES.warmUp * 60000, PHASE_MINUTES.fatigue * 60000, ...markers.map(m => m.offsetMs)]);
  const points = [...cuts].filter(c => c >= 0 && c < activeMs).sort((a, b) => a - b), spans: PhaseSpan[] = [];
  for (const [i, from] of points.entries()) {
    const to = points[i + 1] ?? activeMs, phase = phaseAt(from, markers), last = spans[spans.length - 1];
    if (last && last.phase === phase) last.toMs = to; else spans.push({ phase, fromMs: from, toMs: to });
  }
  return spans;
}
/* The state shown during a focus session. Display only: the elapsed time comes from the main process. */
export function currentAttentionPhase(timer: TimerSnapshot, events: SessionEvent[]): { phase: AttentionPhase; manual: boolean } | null {
  if (timer.mode !== 'focus' || !timer.sessionId) return null;
  const markers = phaseMarkers(events, timer.sessionId);
  return { phase: phaseAt(timer.elapsedMs, markers), manual: markers.length > 0 };
}
