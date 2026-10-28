import { randomUUID } from 'node:crypto';
import type { FocusSession, ProbeAnswer, SessionEvent, TimerSnapshot } from '../shared/types';
import { MIN_INCLUDED_SESSION_MS } from '../shared/types';
import type { Store } from './store';
import { t } from '../shared/i18n';

export interface Clock { monotonic(): number; utc(): number }
const realClock: Clock = { monotonic: () => Number(process.hrtime.bigint() / 1000000n), utc: () => Date.now() };
const iso = (ms: number) => new Date(ms).toISOString();
export class TimerEngine {
  current: FocusSession | null = null;
  private interval: SessionEvent | null = null;
  private baseMs = 0;
  private anchor = 0;
  private savedMs = 0;
  private breakTimer: { elapsedMs: number; anchor: number; running: boolean } | null = null;
  pauseReason: string | null = null;
  private lastReturn = -Infinity;
  constructor(private store: Store, private clock: Clock = realClock, private onComplete: (mode: 'focus' | 'break') => void = () => {}) { this.recover(); }
  private event(kind: SessionEvent['kind'], text = '', category = ''): SessionEvent {
    if (!this.current) throw new Error(t('Start a session first.'));
    return { id: randomUUID(), sessionId: this.current.id, kind, startedAt: iso(this.clock.utc()), endedAt: null, durationMs: 0, text, category };
  }
  recover(): void {
    const unfinished = this.store.all().sessions.filter(s => s.status !== 'completed');
    if (unfinished.length > 1) throw new Error(t('The dataset contains multiple unfinished sessions. Restore a valid backup.'));
    this.current = unfinished[0] ?? null;
    this.breakTimer = null; this.interval = null;
    if (!this.current) return;
    const wasRunning = this.current.status === 'running';
    this.current = { ...this.current, status: 'paused', recovered: this.current.recovered || wasRunning };
    this.baseMs = this.savedMs = this.current.activeMs;
    this.pauseReason = wasRunning ? t('Recovered from an interrupted app session') : t('Resume when you are ready');
    const extras: SessionEvent[] = [];
    for (const e of this.store.all().events.filter(e => e.sessionId === this.current!.id && e.kind === 'pause' && !e.endedAt)) {
      extras.push({ ...e, endedAt: iso(this.clock.utc()), durationMs: Math.max(0, this.clock.utc() - Date.parse(e.startedAt)) });
    }
    if (wasRunning) extras.push(this.event('recovery', 'Only saved checkpoint time was recovered.'));
    this.interval = this.event('pause', this.pauseReason);
    this.store.persist(this.current, this.interval, extras);
  }
  start(input: Omit<FocusSession, 'id' | 'activeMs' | 'status' | 'startedAt' | 'endedAt' | 'focus' | 'note' | 'completionReason' | 'excluded' | 'recovered' | 'targetReached'>): void {
    if (this.current || this.breakTimer) throw new Error(t('Finish the current session or break first.'));
    const session: FocusSession = { ...input, id: randomUUID(), activeMs: 0, status: 'running', startedAt: iso(this.clock.utc()), endedAt: null, focus: null, note: '', completionReason: null, excluded: false, recovered: false, targetReached: false };
    this.current = session;
    const interval = this.event('active');
    try { this.store.persist(session, interval); } catch (error) { this.current = null; throw error; }
    this.interval = interval; this.anchor = this.clock.monotonic(); this.baseMs = this.savedMs = 0; this.pauseReason = null;
  }
  private elapsed(): number {
    if (!this.current) return 0;
    const total = this.baseMs + (this.current.status === 'running' ? Math.max(0, this.clock.monotonic() - this.anchor) : 0);
    return this.current.timingMode === 'countdown' && !this.current.autoOvertime ? Math.min(this.current.plannedMs!, total) : total;
  }
  private closedInterval(elapsedMs: number): SessionEvent | null {
    if (!this.interval || !this.current) return null;
    const duration = this.interval.kind === 'active' ? elapsedMs - this.baseMs : Math.max(0, this.clock.utc() - Date.parse(this.interval.startedAt));
    return { ...this.interval, durationMs: duration, endedAt: iso(Date.parse(this.interval.startedAt) + duration) };
  }
  checkpoint(): void {
    if (!this.current || this.current.status !== 'running') return;
    const elapsedMs = this.elapsed();
    this.reachTarget(elapsedMs);
    const next = { ...this.current!, activeMs: elapsedMs };
    try { this.store.persist(next, this.closedInterval(next.activeMs)); this.current = next; this.savedMs = next.activeMs; }
    catch (error) { this.failStorage(); throw error; }
  }
  private failStorage(): void {
    if (this.current) this.current = { ...this.current, status: 'paused', activeMs: this.savedMs };
    this.baseMs = this.savedMs; this.interval = null; this.pauseReason = t('Saving failed. Resolve the storage issue before resuming.');
  }
  pause(reason = t('Paused by you')): void {
    if (this.breakTimer) { if (this.breakTimer.running) { this.breakTimer.elapsedMs += Math.max(0, this.clock.monotonic() - this.breakTimer.anchor); this.breakTimer.running = false; this.pauseReason = reason; } return; }
    if (!this.current || this.current.status !== 'running') return;
    const elapsedMs = this.elapsed();
    if (this.current.timingMode === 'countdown' && !this.current.autoOvertime && elapsedMs >= this.current.plannedMs!) { this.finish('timer'); return; }
    this.reachTarget(elapsedMs);
    const end = this.closedInterval(elapsedMs);
    const next = { ...this.current, status: 'paused' as const, activeMs: elapsedMs };
    const pause = this.event('pause', reason);
    try { this.store.persist(next, pause, end ? [end] : []); }
    catch (error) { this.failStorage(); throw error; }
    this.current = next; this.baseMs = this.savedMs = next.activeMs; this.interval = pause; this.pauseReason = reason;
  }
  resume(): void {
    if (this.breakTimer) { if (!this.breakTimer.running) { this.breakTimer.anchor = this.clock.monotonic(); this.breakTimer.running = true; this.pauseReason = null; } return; }
    if (!this.current || this.current.status !== 'paused') return;
    if (this.current.timingMode === 'countdown' && !this.current.autoOvertime && this.current.activeMs >= this.current.plannedMs!) { this.finish('timer'); return; }
    const end = this.closedInterval(this.current.activeMs); const active = this.event('active');
    const next = { ...this.current, status: 'running' as const };
    this.store.persist(next, active, end ? [end] : []);
    this.current = next; this.interval = active; this.anchor = this.clock.monotonic(); this.baseMs = next.activeMs; this.pauseReason = null;
  }
  finish(reason: 'early' | 'timer' = 'early', excluded = false): FocusSession | null {
    if (!this.current) return null;
    const activeMs = this.elapsed();
    this.reachTarget(activeMs);
    const next = { ...this.current, activeMs, excluded: this.current.excluded || excluded || activeMs < MIN_INCLUDED_SESSION_MS, status: 'completed' as const, endedAt: iso(this.clock.utc()), completionReason: reason };
    const extras: SessionEvent[] = [];
    if (next.excluded) {
      const event = this.event('edit', JSON.stringify({ action: 'session.exclude', reason: excluded ? 'manual' : 'below-two-minutes' }), 'exclusion');
      event.endedAt = event.startedAt;
      extras.push(event);
    }
    try { this.store.persist(next, this.closedInterval(activeMs), extras); } catch (error) { this.failStorage(); throw error; }
    this.current = null; this.interval = null; this.baseMs = this.savedMs = 0; this.pauseReason = null;
    if (reason === 'timer' && !next.targetReached) this.onComplete('focus');
    return next;
  }
  record(kind: 'interruption' | 'thought', text: string, category = ''): void {
    if (!this.current) throw new Error(t('Start a focus session first.'));
    const event = this.event(kind, text, category); event.endedAt = event.startedAt;
    if (this.current.status !== 'running') { event.activeOffsetMs = this.current.activeMs; this.store.putEvent(event); return; }
    this.persistMarker(event);
  }
  /** The marker, the session total and the closed active interval commit together, so recovery never leaves a marker beyond durable time. */
  private persistMarker(event: SessionEvent, offsetMs?: number): void {
    const activeMs = this.elapsed();
    this.reachTarget(activeMs);
    event.activeOffsetMs = Math.min(offsetMs ?? activeMs, activeMs);
    const next = { ...this.current!, activeMs };
    try { this.store.persist(next, this.closedInterval(activeMs), [event]); }
    catch (error) { this.failStorage(); throw error; }
    this.current = next; this.savedMs = activeMs;
  }
  recordProbe(answer: ProbeAnswer | 'missed', offsetMs: number, source: 'floating' | 'main' | null, latencyMs: number | null): SessionEvent {
    if (!this.current || this.current.status !== 'running') throw new Error(t('This check-in has expired.'));
    const event = this.event('probe', JSON.stringify({ latencyMs }), answer);
    event.endedAt = event.startedAt; event.source = source;
    this.persistMarker(event, Math.max(0, offsetMs));
    return event;
  }
  recordReturn(source: 'shortcut' | 'floating' | 'main'): SessionEvent | null {
    if (!this.current || this.current.status !== 'running') throw new Error(t('Return markers require a running focus session.'));
    if (this.clock.monotonic() - this.lastReturn < 1000) return null;
    const activeMs = this.elapsed();
    const event = this.event('attention-return');
    this.reachTarget(activeMs);
    event.endedAt = event.startedAt; event.activeOffsetMs = activeMs; event.source = source;
    const next = { ...this.current, activeMs };
    // Recovery must never leave a return marker beyond the durable active boundary.
    try { this.store.persist(next, this.closedInterval(activeMs), [event]); }
    catch (error) { this.failStorage(); throw error; }
    this.current = next; this.savedMs = activeMs; this.lastReturn = this.clock.monotonic();
    return event;
  }
  addTask(taskId: string): void {
    if (!this.current || this.current.checklistIds.includes(taskId)) return;
    if (this.current.checklistIds.length >= 100) throw new Error(t('A session can include up to 100 tasks.'));
    const next = { ...this.current, checklistIds: [...this.current.checklistIds, taskId] };
    this.store.putSession(next); this.current = next;
  }
  beginBreak(): void {
    if (this.current || this.breakTimer) throw new Error(t('Finish the current timer first.'));
    this.breakTimer = { elapsedMs: 0, anchor: this.clock.monotonic(), running: true }; this.pauseReason = null;
  }
  endBreak(): void { this.breakTimer = null; this.pauseReason = null; }
  private reachTarget(elapsedMs: number): boolean {
    if (!this.current || this.current.timingMode !== 'countdown' || !this.current.autoOvertime || this.current.targetReached || elapsedMs < this.current.plannedMs!) return false;
    const next = { ...this.current, activeMs: elapsedMs, targetReached: true };
    try { this.store.persist(next, this.closedInterval(elapsedMs)); }
    catch (error) { this.failStorage(); throw error; }
    this.current = next; this.savedMs = elapsedMs;
    this.onComplete('focus'); return true;
  }
  setTasks(checklistIds: string[], primaryTaskId: string | null): void {
    if (!this.current) throw new Error(t('Start a session first.'));
    const next = { ...this.current, checklistIds, primaryTaskId };
    this.store.putSession(next); this.current = next;
  }
  tick(): boolean {
    if (this.current?.status === 'running' && this.current.timingMode === 'countdown') {
      const elapsedMs = this.elapsed();
      if (!this.current.autoOvertime && elapsedMs >= this.current.plannedMs!) { this.finish('timer'); return true; }
      if (this.reachTarget(elapsedMs)) return true;
    }
    if (this.breakTimer && this.snapshot().remainingMs <= 0) { this.endBreak(); this.onComplete('break'); return true; }
    return false;
  }
  snapshot(): TimerSnapshot {
    if (this.breakTimer) {
      const elapsedMs = Math.min(600000, this.breakTimer.elapsedMs + (this.breakTimer.running ? Math.max(0, this.clock.monotonic() - this.breakTimer.anchor) : 0));
      return { phase: 'break', overtimeMs: 0, mode: 'break', running: this.breakTimer.running, sessionId: null, elapsedMs, remainingMs: Math.max(0, 600000 - elapsedMs), plannedMs: 600000, pauseReason: this.pauseReason };
    }
    const elapsedMs = this.elapsed();
    const phase = !this.current ? 'idle' : this.current.timingMode === 'stopwatch' ? 'stopwatch' : elapsedMs >= this.current.plannedMs! && this.current.autoOvertime ? 'overtime' : 'countdown';
    return { phase, overtimeMs: phase === 'overtime' ? Math.max(0, elapsedMs - this.current!.plannedMs!) : 0, mode: this.current ? 'focus' : 'idle', running: this.current?.status === 'running', sessionId: this.current?.id ?? null, elapsedMs, remainingMs: Math.max(0, (this.current?.plannedMs ?? 0) - elapsedMs), plannedMs: this.current ? this.current.plannedMs : 0, pauseReason: this.pauseReason };
  }
}
