import { randomUUID } from 'node:crypto';
import type { FocusSession, PendingProbe, TimerSnapshot } from '../shared/types';
import { t } from '../shared/i18n';

export interface ProbeOptions { firstMinMs: number; firstMaxMs: number; gapMinMs: number; gapMaxMs: number; timeoutMs: number; endGuardMs: number; maxPerSession: number }
export const DEFAULT_PROBE_OPTIONS: ProbeOptions = { firstMinMs: 8 * 60000, firstMaxMs: 20 * 60000, gapMinMs: 15 * 60000, gapMaxMs: 35 * 60000, timeoutMs: 45000, endGuardMs: 5 * 60000, maxPerSession: 6 };
export const FAST_PROBE_OPTIONS: ProbeOptions = { firstMinMs: 20000, firstMaxMs: 30000, gapMinMs: 60000, gapMaxMs: 90000, timeoutMs: 45000, endGuardMs: 0, maxPerSession: 6 };
export type ProbeTick = { type: 'show'; probe: PendingProbe } | { type: 'expire'; probe: PendingProbe; offsetMs: number } | { type: 'cancel' } | null;
/** Room between the expiry and the end guard, so the 250 ms poll sees the expiry before the guard cancels the check-in. */
export const PROBE_EXPIRY_MARGIN_MS = 1000;
const realClock = { monotonic: () => performance.now(), utc: () => Date.now() };

/** Runtime-only scheduling, shared by main and the preview. Active time schedules check-ins; monotonic time expires them. */
export class ProbeScheduler {
  private current: PendingProbe | null = null;
  private sessionId: string | null = null;
  private nextAt = 0;
  private shown = 0;
  private armed = false;
  private offsetMs = 0;
  private shownAt = 0;
  constructor(private random: () => number = Math.random, private options: ProbeOptions = DEFAULT_PROBE_OPTIONS, private clock: { monotonic(): number; utc(): number } = realClock) {}
  get pending(): PendingProbe | null { return this.current; }
  private delay(first: boolean): number {
    const [min, max] = first ? [this.options.firstMinMs, this.options.firstMaxMs] : [this.options.gapMinMs, this.options.gapMaxMs];
    return min + this.random() * (max - min);
  }
  private clear(): void { this.current = null; this.nextAt = this.offsetMs + this.delay(false); }
  /** Pause, finish, a break, Offline, turning check-ins off and the last minutes of a countdown cancel without a record. */
  tick(snapshot: TimerSnapshot, session: FocusSession | null, enabled: boolean): ProbeTick {
    const guarded = snapshot.phase === 'countdown' && snapshot.remainingMs < this.options.endGuardMs;
    const eligible = enabled && snapshot.mode === 'focus' && snapshot.running && !!session && session.id === snapshot.sessionId && session.activityMode !== 'Offline';
    if (this.current && (!eligible || guarded || this.current.sessionId !== snapshot.sessionId)) { this.clear(); return { type: 'cancel' }; }
    if (snapshot.sessionId !== this.sessionId) { this.sessionId = snapshot.sessionId; this.shown = 0; this.armed = false; }
    // The first check-in waits from the moment check-ins are on, also when they are turned on mid-session.
    if (!enabled) this.armed = false;
    else if (!this.armed && snapshot.sessionId) { this.armed = true; this.nextAt = snapshot.elapsedMs + this.delay(true); }
    if (this.current) {
      if (this.clock.monotonic() - this.shownAt < this.options.timeoutMs) return null;
      const probe = this.current; this.clear();
      return { type: 'expire', probe, offsetMs: this.offsetMs };
    }
    if (!eligible || this.shown >= this.options.maxPerSession) return null;
    // A check-in that appears must be able to expire before the end guard.
    if (snapshot.phase === 'countdown' && snapshot.remainingMs < this.options.endGuardMs + this.options.timeoutMs + PROBE_EXPIRY_MARGIN_MS) { this.nextAt = Math.max(this.nextAt, (snapshot.plannedMs ?? 0) + this.options.gapMinMs); return null; }
    if (snapshot.elapsedMs < this.nextAt) return null;
    const utc = this.clock.utc();
    this.current = { id: randomUUID(), sessionId: snapshot.sessionId!, shownAt: new Date(utc).toISOString(), expiresAt: new Date(utc + this.options.timeoutMs).toISOString() };
    this.offsetMs = snapshot.elapsedMs; this.shownAt = this.clock.monotonic(); this.shown++;
    return { type: 'show', probe: this.current };
  }
  /** Clears the pending check-in. The caller saves the answer with the returned offset and latency. */
  answer(id: string): { offsetMs: number; latencyMs: number } {
    const latencyMs = this.clock.monotonic() - this.shownAt;
    if (!this.current || this.current.id !== id || latencyMs >= this.options.timeoutMs) throw new Error(t('This check-in has expired.'));
    this.clear();
    return { offsetMs: this.offsetMs, latencyMs: Math.max(0, Math.round(latencyMs)) };
  }
  /** The person closed the surface that showed the check-in. */
  cancel(): boolean { if (!this.current) return false; this.clear(); return true; }
}
