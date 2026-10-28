import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ActivitySample, FocusSession, ProbeAnswer, SessionEvent } from '../../shared/types';
import { INSIGHT_THRESHOLDS, PROBE_ANSWER_LABELS } from '../../shared/focus-insights';
import type { Action, ViewProps } from './App';
import { eventSourceLabel, interruptionLabel, activityModeLabel } from '../../shared/labels';
import { Disclosure, Icon, useMotionEnabled, minutesLabel } from './components';
import { t } from '../../shared/i18n';

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
    {ack && <span className={`return-ack ${ack.animate ? 'pulse-halo' : ''}`} role="status" aria-label={t('Return saved')}><Icon name="check" size={14} /></span>}
  </div>;
}

export function ReturnMarkers({ events, sessionId, act }: { events: SessionEvent[]; sessionId: string; act: Action }) {
  const returns = events.filter(e => e.sessionId === sessionId && e.kind === 'attention-return');
  return <div className="return-list"><p className="hint">{t('{length} reported {v2}. Marks when you came back; distraction duration is unknown.', { length: returns.length, v2: returns.length === 1 ? t('return') : t('returns') })}</p>{returns.map(e => <div key={e.id}><span>{t('I’m back · {minutesLabel} active ·', { minutesLabel: minutesLabel((e.activeOffsetMs ?? 0) / 60000) })}{' '}{eventSourceLabel(e.source)}</span><button className="text-button" aria-label={t('Remove return at {v1} seconds', { v1: Math.round((e.activeOffsetMs ?? 0) / 1000) })} onClick={() => void act('attention.remove', { id: e.id })}>{t('Remove')}</button></div>)}</div>;
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
  const tracks: Array<{ key: 'keys' | 'clicks' | 'scrolls' | 'movementMs' | 'inputMs' | 'switches'; label: string; unit: string }> = [{ key: 'keys', label: t('Keys'), unit: t('keys') }, { key: 'clicks', label: t('Clicks'), unit: t('clicks') }, { key: 'scrolls', label: t('Scrolls'), unit: t('scrolls') }, { key: 'movementMs', label: t('Movement'), unit: t('ms in movement intervals') },
    ...(measured ? [{ key: 'inputMs' as const, label: t('Input'), unit: t('ms with input') }, { key: 'switches' as const, label: t('Switches'), unit: t('window switches') }] : [])];
  return <Disclosure title={t('Behaviour')} open={open} onOpenChange={setOpen}><div className="behaviour-review">
    <p className="hint">{t('Activity mode ·')}{' '}{activityModeLabel(session.activityMode)}{t('. Computer interaction and reported returns provide context; they do not measure attention.')}</p>
    {error ? <p role="alert">{error}</p> : samples === null ? <p role="status">{t('Loading session behaviour…')}</p> : <>
      <div className="behaviour-totals"><span><strong>{totals.keys}</strong>{t('key presses')}</span><span><strong>{totals.clicks}</strong>{t('mouse clicks')}</span><span><strong>{totals.scrolls}</strong>{t('scroll events')}</span><span><strong>{(totals.movementMs / 1000).toFixed(1)}s</strong>{t('intervals with mouse movement')}</span>
        {measured && totals.inputObservedMs > 0 && <span><strong>{Math.round(Math.min(1, totals.inputMs / totals.inputObservedMs) * 100)}%</strong>{t('of observed time with input')}</span>}{measured && totals.switchesKnown && <span><strong>{totals.switches}</strong>{t('window switches')}</span>}</div>
      <p className="coverage-label">{t('Observed {minutesLabel} of {minutesLabel2} · {v3}% coverage', { minutesLabel: minutesLabel(observed / 60000), minutesLabel2: minutesLabel(session.activeMs / 60000), v3: Math.round(observed / totalMs * 100) })}</p>
      {!session.behaviourVersion && <p className="hint">{t('Historical session · activity collection was unavailable.')}</p>}
      <div className="activity-timeline" aria-label={t('Behaviour timeline in recorded active time')}>
        {tracks.map(track => {
          const max = Math.max(1, ...bins.map(bin => bin[track.key]));
          return <div className="activity-track" key={track.key}><span>{track.label}</span><div className="activity-bars">{bins.map(bin => <span key={bin.start} className={bin.observed === 0 ? bin.disabled ? 'disabled-bin' : 'unavailable-bin' : bin.observed < bin.end - bin.start - 1 ? 'partial-bin' : 'recorded-bin'} title={t('{v1}–{v2} active min: {v3}', { v1: Math.floor(bin.start / 60000), v2: Math.ceil(bin.end / 60000), v3: bin.observed === 0 ? bin.disabled ? t('collection disabled') : t('unavailable') : t('{v1} {unit}; {v3}% observed', { v1: bin[track.key], unit: track.unit, v3: Math.round(bin.observed / (bin.end - bin.start) * 100) }) })}><i style={{ height: `${bin[track.key] / max * 100}%` }} /></span>)}</div></div>;
        })}
        <div className="timeline-events">
          {events.filter(e => e.kind === 'attention-return').map(e => <span key={e.id} className="timeline-return" style={{ left: at(offsetOf(e)) }} title={t('Return at {minute} active time', { minute: minute(offsetOf(e)) })}>↩</span>)}
          {events.filter(e => e.kind === 'interruption').map(e => <span key={e.id} className="timeline-interruption" style={{ left: at(offsetOf(e)) }} title={t('Interruption · {interruptionLabel} · {minute} active time', { interruptionLabel: interruptionLabel(e.category), minute: minute(offsetOf(e)) })}>!</span>)}
          {events.filter(e => e.kind === 'probe').map(e => <span key={e.id} className="timeline-probe" style={{ left: at(offsetOf(e)) }} title={t('Check-in · {v1} · {minute} active time', { v1: e.category === 'missed' ? t('missed') : PROBE_ANSWER_LABELS[e.category as ProbeAnswer] ?? e.category, minute: minute(offsetOf(e)) })}>{probeMark(e.category)}</span>)}
          {pausePoints.map(({ event, offset }) => <span key={event.id} className="timeline-pause" style={{ left: at(offset) }} title={t('Pause · {text}', { text: event.text })}>Ⅱ</span>)}
        </div>
        <div className="timeline-phases" aria-label={t('Session phases')}>{([[t('Warm-up'), 0], [t('Sustain'), 1], [t('Fatigue'), 2]] as const).map(([label, i]) => phaseMs[i] > 0 && <span key={label} className={`phase-${i}`} style={{ width: `${phaseMs[i] / totalMs * 100}%` }} title={t('{label}: {v2} active min', { label, v2: i === 0 ? `0–${warmUpMinutes}` : i === 1 ? `${warmUpMinutes}–${fatigueMinutes}` : `${fatigueMinutes}+` })}>{label}</span>)}</div>
        <div className="timeline-axis"><span>{t('0 active min')}</span><span>{t('{v1} active min', { v1: Math.ceil(session.activeMs / 60000) })}</span></div>
        <p className="hint">{t('Solid: recorded (including zero) · striped: partial · pale: disabled · dotted: unavailable. ↩ Return · ! Interruption · ● On the task · ◐ Drifting or elsewhere · ○ Missed check-in · Ⅱ Pause ({length}). Phases: warm-up 0–{warmUpMinutes}, sustain {warmUpMinutes2}–{fatigueMinutes}, fatigue {fatigueMinutes2}+ active minutes. Hover a column for values.', { length: pauses.length, warmUpMinutes, warmUpMinutes2: warmUpMinutes, fatigueMinutes, fatigueMinutes2: fatigueMinutes })}</p>
      </div>
    </>}
    <ReturnMarkers events={data.events} sessionId={session.id} act={act} />
  </div></Disclosure>;
}
