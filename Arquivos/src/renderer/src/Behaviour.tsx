import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ActivitySample, FocusSession, SessionEvent } from '../../shared/types';
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
  const rows = samples ?? [], observed = rows.reduce((sum, row) => sum + row.observedMs, 0);
  const totals = rows.reduce((sum, row) => ({ keys: sum.keys + row.keys, clicks: sum.clicks + row.clicks, scrolls: sum.scrolls + row.scrolls, movementMs: sum.movementMs + row.movementMs }), { keys: 0, clicks: 0, scrolls: 0, movementMs: 0 });
  const totalMs = Math.max(1, session.activeMs), bucketMs = Math.max(60000, Math.ceil(totalMs / 60000 / 120) * 60000);
  const bins = Array.from({ length: Math.ceil(totalMs / bucketMs) }, (_, i) => {
    const start = i * bucketMs, end = Math.min(totalMs, start + bucketMs);
    const overlap = rows.filter(row => row.endMs > start && row.startMs < end);
    return { start, end, observed: overlap.reduce((sum, row) => sum + row.observedMs * Math.max(0, Math.min(row.endMs, end) - Math.max(row.startMs, start)) / (row.endMs - row.startMs), 0),
      keys: overlap.reduce((sum, row) => sum + row.keys, 0), clicks: overlap.reduce((sum, row) => sum + row.clicks, 0), scrolls: overlap.reduce((sum, row) => sum + row.scrolls, 0), movementMs: overlap.reduce((sum, row) => sum + row.movementMs, 0),
      disabled: overlap.some(row => row.status === 'disabled') };
  });
  const events = data.events.filter(e => e.sessionId === session.id), pauses = events.filter(e => e.kind === 'pause');
  // Pause positions use durable active intervals rather than wall-clock subtraction.
  const chronological = events.filter(e => e.kind === 'active' || e.kind === 'pause').sort((a,b) => a.startedAt.localeCompare(b.startedAt));
  let elapsed = 0;
  const pausePoints = chronological.flatMap(e => { if (e.kind === 'active') { elapsed += e.durationMs; return []; } return [{ event: e, offset: elapsed }]; });
  return <Disclosure title="Behaviour" open={open} onOpenChange={setOpen}><div className="behaviour-review">
    <p className="hint">Activity mode · {session.activityMode ?? 'Unspecified'}. Computer interaction and reported returns provide context; they do not measure attention.</p>
    {error ? <p role="alert">{error}</p> : samples === null ? <p role="status">Loading session behaviour…</p> : <>
      <div className="behaviour-totals"><span><strong>{totals.keys}</strong>key presses</span><span><strong>{totals.clicks}</strong>mouse clicks</span><span><strong>{totals.scrolls}</strong>scroll events</span><span><strong>{(totals.movementMs / 1000).toFixed(1)}s</strong>intervals with mouse movement</span></div>
      <p className="coverage-label">Observed {minutesLabel(observed / 60000)} of {minutesLabel(session.activeMs / 60000)} · {Math.round(observed / totalMs * 100)}% coverage</p>
      {!session.behaviourVersion && <p className="hint">Historical session · activity collection was unavailable.</p>}
      <div className="activity-timeline" aria-label="Behaviour timeline in recorded active time">
        {(['keys', 'clicks', 'scrolls', 'movementMs'] as const).map(track => {
          const max = Math.max(1, ...bins.map(bin => bin[track]));
          return <div className="activity-track" key={track}><span>{({ keys: 'Keys', clicks: 'Clicks', scrolls: 'Scrolls', movementMs: 'Movement' })[track]}</span><div className="activity-bars">{bins.map(bin => <span key={bin.start} className={bin.observed === 0 ? bin.disabled ? 'disabled-bin' : 'unavailable-bin' : bin.observed < bin.end - bin.start - 1 ? 'partial-bin' : 'recorded-bin'} title={`${Math.floor(bin.start / 60000)}–${Math.ceil(bin.end / 60000)} active min: ${bin.observed === 0 ? bin.disabled ? 'collection disabled' : 'unavailable' : `${bin[track]} ${track === 'movementMs' ? 'ms in movement intervals' : track}; ${Math.round(bin.observed / (bin.end - bin.start) * 100)}% observed`}`}><i style={{ height: `${bin[track] / max * 100}%` }} /></span>)}</div></div>;
        })}
        <div className="timeline-events">{events.filter(e => e.kind === 'attention-return').map(e => <span key={e.id} className="timeline-return" style={{ left: `${Math.min(100, (e.activeOffsetMs ?? 0) / totalMs * 100)}%` }} title={`Return at ${minutesLabel((e.activeOffsetMs ?? 0) / 60000)} active time`}>↩</span>)}{pausePoints.map(({ event, offset }) => <span key={event.id} className="timeline-pause" style={{ left: `${Math.min(100, offset / totalMs * 100)}%` }} title={`Pause · ${event.text}`}>Ⅱ</span>)}</div>
        <div className="timeline-axis"><span>0 active min</span><span>{Math.ceil(session.activeMs / 60000)} active min</span></div>
        <p className="hint">Solid: recorded (including zero) · striped: partial · pale: disabled · dotted: unavailable. ↩ Return · Ⅱ Pause ({pauses.length}). Hover a column for values.</p>
      </div>
    </>}
    <ReturnMarkers events={data.events} sessionId={session.id} act={act} />
  </div></Disclosure>;
}
