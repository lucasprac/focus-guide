import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ActivitySample, FocusSession, ProbeAnswer, SessionEvent } from '../../shared/types';
import { INSIGHT_THRESHOLDS, PROBE_ANSWER_LABELS } from '../../shared/focus-insights';
import type { Action, ViewProps } from './App';
import { Disclosure, Icon, useMotionEnabled, minutesLabel } from './components';

export function ReturnFeedback({ children, sessionId, animation, visible = true, neutral = false }: { children: ReactNode; sessionId: string | null; animation: boolean; visible?: boolean; neutral?: boolean }) {
  const motion = useMotionEnabled(animation);
  const [ack, setAck] = useState<{ id: string; animate: boolean } | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const nativeVisible = useRef(document.visibilityState !== 'hidden');
  useEffect(() => {
    const clearHidden = () => { if (document.hidden) setAck(null); };
    document.addEventListener('visibilitychange', clearHidden);
    const remove = window.focusGuide?.onEvent(event => {
      if (event.type === 'visibility') { nativeVisible.current = event.visible; if (!event.visible) setAck(null); }
      if (event.type === 'attention-return' && event.sessionId === sessionId && visible && nativeVisible.current && !document.hidden) setAck({ id: event.eventId, animate: motion });
    });
    return () => { remove?.(); document.removeEventListener('visibilitychange', clearHidden); };
  }, [sessionId, motion, visible]);
  useEffect(() => { if (!visible) setAck(null); }, [visible]);
  useEffect(() => { if (!motion) setAck(value => value ? { ...value, animate: false } : null); }, [motion]);
  useEffect(() => { if (!ack) return; const timeout = setTimeout(() => setAck(null), ack.animate ? 700 : 900); return () => clearTimeout(timeout); }, [ack]);
  // Animate in place: remounting the children would rebuild a WebGL scene and flash its fallback.
  useEffect(() => { if (ack?.animate) content.current?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)', offset: .45 }, { transform: 'scale(1)' }], { duration: 700, easing: 'ease-in-out' }); }, [ack]);
  return <div className={`return-feedback ${neutral ? 'neutral-feedback' : ''}`}>
    <div ref={content}>{children}</div>
    {ack && <span className={`return-ack ${ack.animate ? 'pulse-halo' : ''}`} role="status" aria-label="Return saved"><Icon name="check" size={14} /></span>}
  </div>;
}

export function ReturnMarkers({ events, sessionId, act }: { events: SessionEvent[]; sessionId: string; act: Action }) {
  const returns = events.filter(e => e.sessionId === sessionId && e.kind === 'attention-return');
  return <div className="return-list"><p className="hint">{returns.length} reported {returns.length === 1 ? 'return' : 'returns'}. Marks when you came back; distraction duration is unknown.</p>{returns.map(e => <div key={e.id}><span>I’m back · {minutesLabel((e.activeOffsetMs ?? 0) / 60000)} active · {e.source}</span><button className="text-button" aria-label={`Remove return at ${Math.round((e.activeOffsetMs ?? 0) / 1000)} seconds`} onClick={() => void act('attention.remove', { id: e.id })}>Remove</button></div>)}</div>;
}

export function BehaviourReview({ session, data, act }: ViewProps & { session: FocusSession }) {
  const [open, setOpen] = useState(false), [samples, setSamples] = useState<ActivitySample[] | null>(null), [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    void window.focusGuide.command('behaviour.read', { id: session.id }).then(result => {
      if (!mounted) return;
      if (result.ok) { setSamples(result.value as ActivitySample[]); setError(''); } else setError(result.error);
    }).catch(e => { if (mounted) setError(String(e)); });
    return () => { mounted = false; };
  }, [open, session.id, session.activeMs, data.collector?.state]);
  const rows = samples ?? [], observed = rows.reduce((sum, row) => sum + row.observedMs, 0), measured = (session.behaviourVersion ?? 0) >= INSIGHT_THRESHOLDS.inputVersion;
  const totals = rows.reduce((sum, row) => ({ keys: sum.keys + row.keys, clicks: sum.clicks + row.clicks, scrolls: sum.scrolls + row.scrolls, movementMs: sum.movementMs + row.movementMs,
    inputMs: sum.inputMs + (typeof row.inputMs === 'number' ? row.inputMs : 0), inputObservedMs: sum.inputObservedMs + (typeof row.inputMs === 'number' ? row.observedMs : 0),
    switches: sum.switches + (typeof row.switches === 'number' ? row.switches : 0), switchesKnown: sum.switchesKnown || typeof row.switches === 'number' }), { keys: 0, clicks: 0, scrolls: 0, movementMs: 0, inputMs: 0, inputObservedMs: 0, switches: 0, switchesKnown: false });
  const totalMs = Math.max(1, session.activeMs), bucketMs = Math.max(60000, Math.ceil(totalMs / 60000 / 120) * 60000);
  const bins = Array.from({ length: Math.ceil(totalMs / bucketMs) }, (_, i) => {
    const start = i * bucketMs, end = Math.min(totalMs, start + bucketMs);
    const overlap = rows.filter(row => row.endMs > start && row.startMs < end), sum = (pick: (row: ActivitySample) => number | null | undefined) => overlap.reduce((total, row) => total + (pick(row) ?? 0), 0);
    return { start, end, observed: overlap.reduce((total, row) => total + row.observedMs * Math.max(0, Math.min(row.endMs, end) - Math.max(row.startMs, start)) / (row.endMs - row.startMs), 0),
      keys: sum(row => row.keys), clicks: sum(row => row.clicks), scrolls: sum(row => row.scrolls), movementMs: sum(row => row.movementMs), inputMs: sum(row => row.inputMs), switches: sum(row => row.switches),
      disabled: overlap.some(row => row.status === 'disabled') };
  });
  const events = data.events.filter(e => e.sessionId === session.id), pauses = events.filter(e => e.kind === 'pause');
  // Positions use durable active intervals rather than wall-clock subtraction. Older markers have no offset: it is the active time before the marker.
  const intervals = events.filter(e => e.kind === 'active').sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const offsetOf = (e: SessionEvent) => {
    if (typeof e.activeOffsetMs === 'number') return e.activeOffsetMs;
    const at = Date.parse(e.startedAt); let offset = 0;
    for (const i of intervals) { const begin = Date.parse(i.startedAt); if (begin >= at) break; offset += Math.min(i.durationMs, at - begin); }
    return offset;
  };
  const chronological = events.filter(e => e.kind === 'active' || e.kind === 'pause').sort((a,b) => a.startedAt.localeCompare(b.startedAt));
  let elapsed = 0;
  const pausePoints = chronological.flatMap(e => { if (e.kind === 'active') { elapsed += e.durationMs; return []; } return [{ event: e, offset: elapsed }]; });
  const at = (offset: number) => `${Math.max(0, Math.min(100, offset / totalMs * 100))}%`, minute = (offset: number) => minutesLabel(offset / 60000), { warmUpMinutes, fatigueMinutes } = INSIGHT_THRESHOLDS.attentionSpan;
  const phaseMs = [Math.min(totalMs, warmUpMinutes * 60000), Math.max(0, Math.min(totalMs, fatigueMinutes * 60000) - warmUpMinutes * 60000), Math.max(0, totalMs - fatigueMinutes * 60000)];
  const probeMark = (answer: string) => answer === 'on-task' ? '●' : answer === 'missed' ? '○' : '◐';
  const tracks: Array<{ key: 'keys' | 'clicks' | 'scrolls' | 'movementMs' | 'inputMs' | 'switches'; label: string; unit: string }> = [{ key: 'keys', label: 'Keys', unit: 'keys' }, { key: 'clicks', label: 'Clicks', unit: 'clicks' }, { key: 'scrolls', label: 'Scrolls', unit: 'scrolls' }, { key: 'movementMs', label: 'Movement', unit: 'ms in movement intervals' },
    ...(measured ? [{ key: 'inputMs' as const, label: 'Input', unit: 'ms with input' }, { key: 'switches' as const, label: 'Switches', unit: 'window switches' }] : [])];
  return <Disclosure title="Behaviour" open={open} onOpenChange={setOpen}><div className="behaviour-review">
    <p className="hint">Activity mode · {session.activityMode ?? 'Unspecified'}. Computer interaction and reported returns provide context; they do not measure attention.</p>
    {error ? <p role="alert">{error}</p> : samples === null ? <p role="status">Loading session behaviour…</p> : <>
      <div className="behaviour-totals"><span><strong>{totals.keys}</strong>key presses</span><span><strong>{totals.clicks}</strong>mouse clicks</span><span><strong>{totals.scrolls}</strong>scroll events</span><span><strong>{(totals.movementMs / 1000).toFixed(1)}s</strong>intervals with mouse movement</span>
        {measured && totals.inputObservedMs > 0 && <span><strong>{Math.round(Math.min(1, totals.inputMs / totals.inputObservedMs) * 100)}%</strong>of observed time with input</span>}{measured && totals.switchesKnown && <span><strong>{totals.switches}</strong>window switches</span>}</div>
      <p className="coverage-label">Observed {minutesLabel(observed / 60000)} of {minutesLabel(session.activeMs / 60000)} · {Math.round(observed / totalMs * 100)}% coverage</p>
      {!session.behaviourVersion && <p className="hint">Historical session · activity collection was unavailable.</p>}
      <div className="activity-timeline" aria-label="Behaviour timeline in recorded active time">
        {tracks.map(track => {
          const max = Math.max(1, ...bins.map(bin => bin[track.key]));
          return <div className="activity-track" key={track.key}><span>{track.label}</span><div className="activity-bars">{bins.map(bin => <span key={bin.start} className={bin.observed === 0 ? bin.disabled ? 'disabled-bin' : 'unavailable-bin' : bin.observed < bin.end - bin.start - 1 ? 'partial-bin' : 'recorded-bin'} title={`${Math.floor(bin.start / 60000)}–${Math.ceil(bin.end / 60000)} active min: ${bin.observed === 0 ? bin.disabled ? 'collection disabled' : 'unavailable' : `${bin[track.key]} ${track.unit}; ${Math.round(bin.observed / (bin.end - bin.start) * 100)}% observed`}`}><i style={{ height: `${bin[track.key] / max * 100}%` }} /></span>)}</div></div>;
        })}
        <div className="timeline-events">
          {events.filter(e => e.kind === 'attention-return').map(e => <span key={e.id} className="timeline-return" style={{ left: at(offsetOf(e)) }} title={`Return at ${minute(offsetOf(e))} active time`}>↩</span>)}
          {events.filter(e => e.kind === 'interruption').map(e => <span key={e.id} className="timeline-interruption" style={{ left: at(offsetOf(e)) }} title={`Interruption · ${e.category || 'Unspecified'} · ${minute(offsetOf(e))} active time`}>!</span>)}
          {events.filter(e => e.kind === 'probe').map(e => <span key={e.id} className="timeline-probe" style={{ left: at(offsetOf(e)) }} title={`Check-in · ${e.category === 'missed' ? 'missed' : PROBE_ANSWER_LABELS[e.category as ProbeAnswer] ?? e.category} · ${minute(offsetOf(e))} active time`}>{probeMark(e.category)}</span>)}
          {pausePoints.map(({ event, offset }) => <span key={event.id} className="timeline-pause" style={{ left: at(offset) }} title={`Pause · ${event.text}`}>Ⅱ</span>)}
        </div>
        <div className="timeline-phases" aria-label="Session phases">{([['Warm-up', 0], ['Sustain', 1], ['Fatigue', 2]] as const).map(([label, i]) => phaseMs[i] > 0 && <span key={label} className={`phase-${i}`} style={{ width: `${phaseMs[i] / totalMs * 100}%` }} title={`${label}: ${i === 0 ? `0–${warmUpMinutes}` : i === 1 ? `${warmUpMinutes}–${fatigueMinutes}` : `${fatigueMinutes}+`} active min`}>{label}</span>)}</div>
        <div className="timeline-axis"><span>0 active min</span><span>{Math.ceil(session.activeMs / 60000)} active min</span></div>
        <p className="hint">Solid: recorded (including zero) · striped: partial · pale: disabled · dotted: unavailable. ↩ Return · ! Interruption · ● On the task · ◐ Drifting or elsewhere · ○ Missed check-in · Ⅱ Pause ({pauses.length}). Phases: warm-up 0–{warmUpMinutes}, sustain {warmUpMinutes}–{fatigueMinutes}, fatigue {fatigueMinutes}+ active minutes. Hover a column for values.</p>
      </div>
    </>}
    <ReturnMarkers events={data.events} sessionId={session.id} act={act} />
  </div></Disclosure>;
}
