import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AppState, FloatBarPosition } from '../../shared/types';
import { PALETTES } from '../../shared/achievements';
import type { Action } from './App';
import { Icon, time } from './components';
import ProbePrompt, { ProbeAnnouncer } from './ProbePrompt';
import { displayedTime, timerLabel, visualProgress } from '../../shared/timer-display';
import { t } from '../../shared/i18n';

// Match .fbar-track and .fbar-marker in app.css. A press that moves less than DRAG_PX is a click, not a drag.
const TRACK_PX = 160, MARKER_PX = 24, CLOSE_DELAY_MS = 400, DRAG_PX = 6;
const arrowKeys: Record<string, FloatBarPosition> = { ArrowUp: 'top', ArrowDown: 'bottom', ArrowLeft: 'left', ArrowRight: 'right' };
const positionLabels: Record<FloatBarPosition, () => string> = { top: () => t('Top of the screen'), bottom: () => t('Bottom of the screen'), left: () => t('Left of the screen'), right: () => t('Right of the screen') };
// The screen edge nearest to a point, in the screen coordinates of pointer events.
function nearestEdge(x: number, y: number): FloatBarPosition {
  const s = window.screen as Screen & { availLeft?: number; availTop?: number };
  const left = s.availLeft ?? 0, top = s.availTop ?? 0;
  const gaps: Record<FloatBarPosition, number> = { left: (x - left) / s.availWidth, right: (left + s.availWidth - x) / s.availWidth, top: (y - top) / s.availHeight, bottom: (top + s.availHeight - y) / s.availHeight };
  return (Object.keys(gaps) as FloatBarPosition[]).reduce((a, b) => gaps[b] < gaps[a] ? b : a);
}
/* The floating timer as a thin bar: horizontal at the top and bottom edges (fills from left to right), vertical at
   the side edges (fills from bottom to top). Main gives the window one fixed size at the middle of a screen edge and
   lets clicks pass through it; this view turns input on only while the pointer is over the bar or one of its cards,
   so the empty area never blocks other apps. Drag the bar to another edge: it moves to the nearest edge on release. */
export default function FloatingBar({ data, act, error, onDismissError }: { data: AppState; act: Action; error: string; onDismissError: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(''), [noteSaved, setNoteSaved] = useState(false), savingNote = useRef(false);
  const [returned, setReturned] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; target: FloatBarPosition | null } | null>(null), dragging = useRef(false);
  const interactive = useRef(false), closeTimer = useRef<number | undefined>(undefined);
  const sessionId = data.timer.sessionId;
  // I'm back, from the panel or the shortcut: the bar flashes and a check sits at the end of the fill for a moment.
  useEffect(() => window.focusGuide.onEvent(event => { if (event.type === 'attention-return' && event.sessionId === sessionId) setReturned(event.eventId); }), [sessionId]);
  useEffect(() => { if (!returned) return; const timeout = window.setTimeout(() => setReturned(null), 1200); return () => window.clearTimeout(timeout); }, [returned]);
  useEffect(() => { if (!noteSaved) return; const timeout = window.setTimeout(() => setNoteSaved(false), 1800); return () => window.clearTimeout(timeout); }, [noteSaved]);
  // A quick note is a parked thought of this session: the session review lists it and can turn it into a task.
  const saveNote = async () => {
    if (savingNote.current || !note.trim()) return;
    savingNote.current = true;
    try { const result = await act('thought.record', { text: note }); if (result.ok) { setNote(''); setNoteSaved(true); } }
    finally { savingNote.current = false; }
  };
  useEffect(() => {
    // Not through act: the browser preview has no windows, and a refused request must not show an error.
    const setInteractive = (on: boolean) => { if (interactive.current === on) return; interactive.current = on; void window.focusGuide.command('window.floatPointer', { interactive: on }).catch(() => undefined); };
    const scheduleClose = () => { window.clearTimeout(closeTimer.current); closeTimer.current = window.setTimeout(() => { if (!document.querySelector('.fbar-app :focus-visible, .fbar-note input:focus')) setOpen(false); }, CLOSE_DELAY_MS); };
    const move = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const over = !!target?.closest('.fbar-hit');
      setInteractive(over || dragging.current);
      if (dragging.current) return;
      if (!over) { scheduleClose(); return; }
      window.clearTimeout(closeTimer.current);
      if (target?.closest('.fbar-line')) setOpen(true);
    };
    const leave = () => { setInteractive(false); scheduleClose(); };
    document.addEventListener('mousemove', move);
    document.documentElement.addEventListener('mouseleave', leave);
    return () => { document.removeEventListener('mousemove', move); document.documentElement.removeEventListener('mouseleave', leave); window.clearTimeout(closeTimer.current); };
  }, []);
  const timer = data.timer, focus = timer.mode === 'focus', position = data.floatBarPosition ?? 'top';
  const progress = timer.mode === 'idle' ? 0 : timer.phase === 'overtime' ? 1 : visualProgress(timer);
  const percent = Math.round(progress * 100);
  const clock = (timer.phase === 'overtime' ? '+' : '') + time(timer.mode === 'idle' ? data.settings.defaultMinutes * 60000 : displayedTime(timer));
  const vertical = position === 'left' || position === 'right';
  const along = Math.max(0, Math.min(TRACK_PX - MARKER_PX, progress * TRACK_PX - MARKER_PX / 2));
  const fill: CSSProperties = vertical ? { height: `${progress * 100}%` } : { width: `${progress * 100}%` };
  const marker: CSSProperties = vertical ? { top: TRACK_PX - MARKER_PX - along } : { left: along };
  // The fill takes the colour of the palette chosen in Neural World; only unlocked palettes can be chosen there.
  const palette = PALETTES.find(p => p.id === data.settings.palette) ?? PALETTES[0];
  const move = (target: FloatBarPosition) => { if (target !== position) void act('window.floatMove', { position: target }); };
  const target = drag?.target ?? null;
  return <div className={`fbar-app pos-${position} ${vertical ? 'vertical' : ''} ${target ? 'dragging' : ''} ${timer.mode === 'break' ? 'break' : ''} ${timer.running ? '' : 'paused'} ${data.settings.animation ? '' : 'still'} ${returned ? 'returned' : ''}`} style={{ '--palette': palette.color } as CSSProperties} key={data.settings.language}
    onFocus={() => setOpen(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
    {focus && <ProbeAnnouncer probe={data.probe} />}
    <div className="fbar-line fbar-hit">
      <div className="fbar-track" tabIndex={0} role="progressbar" aria-label={t('Floating timer')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={timer.mode === 'idle' ? t('Planned duration') : `${timerLabel(timer)}: ${clock}`}
        title={t('Drag to another edge of the screen')} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
        onKeyDown={e => { const edge = arrowKeys[e.key]; if (e.altKey && edge) { e.preventDefault(); move(edge); } }}
        onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); setDrag({ x: e.screenX, y: e.screenY, target: null }); }}
        onPointerMove={e => {
          if (!drag) return;
          if (!drag.target && Math.hypot(e.screenX - drag.x, e.screenY - drag.y) < DRAG_PX) return;
          if (!dragging.current) { dragging.current = true; setOpen(false); }
          const edge = nearestEdge(e.screenX, e.screenY);
          if (edge !== drag.target) setDrag({ ...drag, target: edge });
        }}
        onPointerUp={() => { if (drag?.target) move(drag.target); dragging.current = false; setDrag(null); }}
        onPointerCancel={() => { dragging.current = false; setDrag(null); }}>
        <div className="fbar-fill" style={fill} />
        {timer.phase === 'overtime' && <div className="fbar-overtime" />}
      </div>
      {data.probe && <span className="fbar-marker" style={marker} aria-hidden="true" />}
      {returned && <span key={returned} className="fbar-ack" style={marker} role="status" aria-label={t('Return saved')}><Icon name="check" size={14} /></span>}
    </div>
    <div className="fbar-cards">
    {target && <div className={`fbar-drop to-${target}`} role="status"><Icon name="arrow" size={14} /><span>{t('Release to move to: {place}', { place: positionLabels[target]() })}</span></div>}
    {data.probe && <div className="fbar-probe fbar-hit"><ProbePrompt key={data.probe.id} probe={data.probe} act={act} bar /></div>}
    {open && <div className="fbar-panel fbar-hit">
      <div className="fbar-time"><span role="timer" aria-label={timer.mode === 'idle' ? t('Planned duration') : timerLabel(timer)}>{clock}</span><small>{timer.mode === 'break' ? t('Break') : timer.mode === 'idle' ? t('Planned duration') : timerLabel(timer)}</small></div>
      <div className="fbar-controls">
        {focus && <button aria-label={t('I\'m back')} title={t('I\'m back — save a return marker')} disabled={!timer.running} onClick={() => void act('attention.return', { source: 'floating' })}><Icon name="check" size={16} /></button>}
        {timer.mode !== 'idle' && <>
          <button onClick={() => void act(timer.running ? 'session.pause' : 'session.resume')} aria-label={timer.running ? t('Pause') : t('Resume')} title={timer.running ? t('Pause') : t('Resume')}><Icon name={timer.running ? 'pause' : 'play'} size={16} /></button>
          <button onClick={async () => { const result = await act(timer.mode === 'break' ? 'break.stop' : 'session.finish'); if (result.ok) await act('window.main'); }} aria-label={t('Finish')} title={t('Finish')}><Icon name="stop" size={16} /></button>
        </>}
        <button onClick={() => void act('window.main')} aria-label={t('Open your focus space')} title={t('Open your focus space')}><Icon name="arrow" size={16} /></button>
        <button onClick={() => void act('window.hide')} aria-label={t('Hide floating timer')} title={t('Hide floating timer')}><Icon name="close" size={16} /></button>
      </div>
      {focus && <form className="fbar-note" onSubmit={e => { e.preventDefault(); void saveNote(); }}>
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={2000} aria-label={t('Quick note for after the session')} placeholder={noteSaved ? t('Saved for after the session') : t('Note a task or thought…')} />
        <span className="sr-only" role="status">{noteSaved ? t('Saved for after the session') : ''}</span>
        <button type="submit" disabled={!note.trim()} aria-label={t('Save note')} title={t('Save note')}><Icon name={noteSaved ? 'check' : 'plus'} size={16} /></button>
      </form>}
    </div>}
    {error && <div className="fbar-error fbar-hit" role="alert"><span>{error}</span><button onClick={onDismissError} aria-label={t('Dismiss error')}><Icon name="close" size={14} /></button></div>}
    </div>
  </div>;
}
