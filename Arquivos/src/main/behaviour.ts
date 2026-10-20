import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { ActivitySample, CollectorStatus } from '../shared/types';
import type { Store } from './store';
import type { TimerEngine } from './timer';
import { object, number, shortcut } from '../shared/validation';

type Packet = Omit<ActivitySample, 'id' | 'sessionId' | 'status'>;
interface Span { sessionId: string; epoch: number; start: number; cursor: number; enabled: boolean; ready: boolean; startRequested: boolean; packets: Packet[] }

/** Aggregates cross the process boundary; raw input never enters Electron. */
export class BehaviourCollector {
  status: CollectorStatus = { state: 'waiting', shortcut: 'unavailable', message: 'Starting local controls.' };
  private child: ChildProcessWithoutNullStreams | null = null;
  private span: Span | null = null;
  private epoch = 0;
  private buffer = '';
  private heartbeat = 0;
  private ready = false;
  private requests = new Map<number, (ok: boolean) => void>();
  private requestId = 0;
  private stopReply: (() => void) | null = null;
  private readyReply: (() => void) | null = null;
  private appliedShortcut = '';
  private closed = false;
  private stopping = false;
  constructor(private store: Store, private timer: TimerEngine, executable: string, private onReturn: () => void, private onStatus: () => void) {
    try {
      this.child = spawn(executable, [String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
      this.child.stdout.setEncoding('utf8'); this.child.stdout.on('data', data => this.receive(String(data)));
      this.child.stderr.resume();
      this.child.on('error', () => this.fail()); this.child.on('exit', () => this.fail());
      this.child.stdin.on('error', () => this.fail());
    } catch { this.fail(); }
  }
  private write(message: string): void { if (this.child && !this.child.killed && this.ready) this.child.stdin.write(message + '\n'); }
  private fail(): void {
    this.appliedShortcut = ''; this.status = { ...this.status, effectiveShortcut: '' };
    this.ready = false; this.readyReply?.(); this.stopReply?.();
    for (const reply of this.requests.values()) reply(false); this.requests.clear();
    this.setStatus('unavailable', 'Local input helper unavailable. Timer and floating return control remain usable.', 'unavailable');
    this.child?.kill(); this.child = null;
  }
  private setStatus(state: CollectorStatus['state'], message: string, hotkey = this.status.shortcut): void {
    if (state === this.status.state && message === this.status.message && hotkey === this.status.shortcut) return;
    this.status = { ...this.status, state, message, shortcut: hotkey }; if (!this.closed) this.onStatus();
  }
  private receive(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > 65536) { this.fail(); return; }
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
      try {
        if (line.length > 1024) throw new Error('Oversized helper message.');
        const value = object(JSON.parse(line));
        if (value.type === 'ready') { this.ready = true; this.heartbeat = Date.now(); this.readyReply?.(); }
        else if (value.type === 'heartbeat') this.heartbeat = Date.now();
        else if (value.type === 'hotkey') { if (typeof value.ok !== 'boolean') throw new Error('Invalid shortcut reply.'); this.requests.get(Number(value.request))?.(value.ok); }
        else if (value.type === 'stopped') { this.stopReply?.(); }
        else if (value.type === 'return') this.onReturn();
        else if (value.type === 'started' && value.epoch === this.span?.epoch) {
          this.span!.ready = value.ok === true; this.heartbeat = Date.now();
          this.setStatus(value.ok === true ? 'recording' : 'unavailable', value.ok === true ? 'Local activity collection is recording.' : 'Input registration failed. Coverage is unavailable.');
        } else if (value.type === 'sample') {
          const end = number(value.endMs, 'Helper time', 0, Number.MAX_SAFE_INTEGER), duration = number(value.durationMs, 'Helper interval', 1, Number.MAX_SAFE_INTEGER);
          const epoch = number(value.epoch, 'Helper generation', 1, Number.MAX_SAFE_INTEGER);
          const counts = ['keys', 'clicks', 'scrolls'].map(key => number(value[key], key, 0, 1000000));
          const movementMs = number(value.movementMs, 'Movement', 0, duration);
          if (![end, duration, epoch, ...counts].every(Number.isSafeInteger) || end < duration) throw new Error('Invalid aggregate counters.');
          if (epoch !== this.span?.epoch || !this.span.enabled) continue;
          this.heartbeat = Date.now();
          const packet: Packet = { startMs: this.span.start + end - duration, endMs: this.span.start + end, observedMs: duration, keys: counts[0], clicks: counts[1], scrolls: counts[2], movementMs };
          const snapshot = this.timer.snapshot();
          const limit = snapshot.sessionId === this.span.sessionId ? snapshot.elapsedMs + 100 : (this.store.session(this.span.sessionId)?.activeMs ?? 0) + 2500;
          // Scheduling gaps and post-pause tails cannot locate their counters in active time.
          // Leave those periods unavailable without disabling the independent global shortcut.
          if (duration > 2500 || this.span.packets.length >= 20 || packet.startMs < (this.span.packets.at(-1)?.endMs ?? this.span.cursor) || packet.endMs > limit) continue;
          this.span.packets.push(packet);
        }
      } catch { this.fail(); return; }
    }
  }
  async configureShortcut(value: string): Promise<void> {
    const validated = shortcut(value);
    this.status = { ...this.status, requestedShortcut: validated };
    if (!this.ready) await new Promise<void>(resolve => { this.readyReply = resolve; setTimeout(resolve, 1500); });
    if (!this.ready) { this.status = { ...this.status, shortcut: 'unavailable', effectiveShortcut: '', shortcutError: validated ? 'Global shortcut unavailable. Use the floating timer.' : undefined }; this.onStatus(); if (!validated) return; throw new Error(this.status.shortcutError); }
    if (validated === this.appliedShortcut && this.status.shortcut === 'ready') return;
    const parts = validated.split('+'), key = parts.pop() ?? '';
    const modifiers = parts.reduce((sum, part) => sum | ({ Alt: 1, Ctrl: 2, Shift: 4, Win: 8 }[part] ?? 0), 0);
    const code = !key ? 0 : key === 'Space' ? 32 : /^F\d+$/.test(key) ? 111 + Number(key.slice(1)) : key.charCodeAt(0);
    const request = ++this.requestId;
    const ok = await new Promise<boolean>(resolve => {
      const timeout = setTimeout(() => { this.requests.delete(request); resolve(false); }, 1500);
      this.requests.set(request, success => { clearTimeout(timeout); this.requests.delete(request); resolve(success); });
      this.write(`hotkey ${request} ${modifiers} ${code}`);
    });
    if (!ok) {
      this.status = { ...this.status, shortcut: this.ready ? 'conflict' : 'unavailable', effectiveShortcut: this.appliedShortcut, shortcutError: 'That shortcut is unavailable or already in use. Change it or choose Retry shortcut.' };
      this.onStatus(); throw new Error(this.status.shortcutError);
    }
    this.appliedShortcut = validated;
    this.status = { ...this.status, effectiveShortcut: validated, shortcutError: undefined };
    this.onStatus();
    this.setStatus(this.status.state, this.status.message, validated ? 'ready' : 'unavailable');
  }
  reconcile(): void {
    if (this.stopping || this.closed) return;
    const snapshot = this.timer.snapshot(), enabled = !!this.store.getSettings().collectActivity;
    if (!snapshot.running || snapshot.mode !== 'focus') {
      if (this.span) { this.write('stop'); this.flush(true); }
      this.setStatus(enabled ? 'waiting' : 'disabled', enabled ? 'Collection waits for a running focus session.' : 'Activity collection is off.'); return;
    }
    if (this.span && this.span.sessionId === snapshot.sessionId && this.span.enabled === enabled) {
      this.startCollection(snapshot.elapsedMs);
      if (enabled && (!this.ready || Date.now() - this.heartbeat > 2500)) this.setStatus('unavailable', 'No collector heartbeat. Missing periods remain unavailable.');
      return;
    }
    if (this.span) { this.write('stop'); this.flush(true); }
    this.span = { sessionId: snapshot.sessionId!, epoch: ++this.epoch, start: snapshot.elapsedMs, cursor: snapshot.elapsedMs, enabled, ready: false, startRequested: false, packets: [] };
    if (enabled && this.ready) this.startCollection(snapshot.elapsedMs);
    else this.setStatus(enabled ? 'unavailable' : 'disabled', enabled ? 'Local input helper unavailable.' : 'Activity collection is off.');
  }
  private startCollection(elapsedMs: number): void {
    if (!this.span?.enabled || this.span.startRequested || !this.ready) return;
    this.span.start = elapsedMs;
    this.span.startRequested = true;
    this.setStatus('waiting', 'Starting input collection.');
    this.write(`start ${this.span.epoch}`);
  }
  async stop(): Promise<void> {
    if (!this.span) return;
    if (this.span.enabled && this.ready) { this.stopping = true; try { await new Promise<void>(resolve => {
      const timeout = setTimeout(() => { this.stopReply = null; resolve(); }, 1000);
      this.stopReply = () => { clearTimeout(timeout); this.stopReply = null; resolve(); }; this.write('stop');
    }); } finally { this.stopping = false; } }
  }
  /** Write only within the timer's durable boundary. Minute buckets merge in Store. */
  flush(final = false): void {
    const span = this.span; if (!span) return;
    const session = this.store.session(span.sessionId); if (!session) { this.span = null; return; }
    const durable = session.activeMs;
    const append = (start: number, end: number, status: ActivitySample['status'], packet?: Packet) => {
      while (end > start) {
        const next = Math.min(end, (Math.floor(start / 60000) + 1) * 60000);
        const complete = packet && end >= packet.endMs && next === end;
        this.store.putActivity({ id: randomUUID(), sessionId: span.sessionId, startMs: start, endMs: next, status,
          observedMs: status === 'recorded' ? next - start : 0, movementMs: packet?.movementMs ? Math.min(next - start, packet.movementMs) : 0,
          keys: complete ? packet.keys : 0, clicks: complete ? packet.clicks : 0, scrolls: complete ? packet.scrolls : 0 });
        start = next;
      }
    };
    const previousCursor = span.cursor;
    try { this.store.db.transaction(() => {
      for (const packet of span.packets) {
        // A clipped interval cannot locate its input counts precisely; keep that tail unavailable.
        if (packet.endMs > durable) break;
        const start = Math.max(span.cursor, packet.startMs), end = Math.min(durable, packet.endMs);
        if (start > span.cursor) append(span.cursor, Math.min(start, durable), 'unavailable');
        if (end > start) append(start, end, 'recorded', packet);
        span.cursor = Math.max(span.cursor, end);
      }
      if ((!span.enabled || final || !this.ready || Date.now() - this.heartbeat > 2500) && durable > span.cursor) {
        append(span.cursor, durable, span.enabled ? 'unavailable' : 'disabled'); span.cursor = durable;
      }
    })(); } catch (error) { span.cursor = previousCursor; throw error; }
    span.packets = span.packets.filter(packet => packet.endMs > durable && !final);
    if (final) { this.span = null; this.setStatus(this.store.getSettings().collectActivity ? 'waiting' : 'disabled', 'Collection waits for a running focus session.'); }
  }
  close(): void { this.closed = true; this.write('stop'); this.child?.stdin.end(); this.child?.kill(); this.child = null; }
}
