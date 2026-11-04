import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import type { Commitment, Dataset, FocusSession, TimeFormat } from '../../shared/types';
import { clockText, commitmentEnd, commitmentSessions, commitmentState } from '../../shared/commitments';
import { commitmentStateLabel } from '../../shared/labels';
import type { GoalOccurrence } from '../../shared/goal-types';
import { localDay, minuteOfDay, splitInterval } from '../../shared/analytics';
import { occurrenceStatusLabel } from '../../shared/labels';
import { clockLabel, hourLabel, minutesLabel } from './components';
import { t, dateLocale } from '../../shared/i18n';

/* One session on one day: from its first to its last active minute there, in the session's own timezone. */
interface TimeBlock { session: FocusSession; day: string; startMin: number; endMin: number; startAt: number; endAt: number; recordedMin: number }

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
// A block shows its time range from 50 minutes and its recorded time from 70 minutes (48px an hour), so no line is cut in half.
const PLAN_CHIPS = 2;
// New and moved commitments snap to quarter hours; a pointer must travel this far before a press becomes a drag.
const SNAP = 15, DRAG_PX = 4;
interface Drag { id: string; pointerY: number; startMinute: number; day: string; minute: number; moved: boolean }
/* A commitment moves by drag only while nothing is recorded for it and its plan is still open. */
const movable = (c: Commitment, sessions: readonly FocusSession[]) => c.status === 'planned' && !commitmentSessions(sessions, c.id).length;

function sessionBlocks(data: Dataset, days: string[], fieldId: string, goalId: string): Map<string, TimeBlock[]> {
  const wanted = new Set(days), blocks = new Map<string, TimeBlock>();
  const sessions = new Map(data.sessions.filter(s => s.status === 'completed' && (!fieldId || s.fieldId === fieldId) && (!goalId || s.goalId === goalId)).map(s => [s.id, s]));
  for (const event of data.events) {
    const session = sessions.get(event.sessionId);
    if (!session || event.kind !== 'active' || event.durationMs <= 0) continue;
    let cursor = Date.parse(event.startedAt);
    for (const piece of splitInterval(event.startedAt, event.durationMs, session.timezone)) {
      const startAt = cursor, endAt = cursor + piece.ms;
      cursor = endAt;
      if (!wanted.has(piece.day)) continue;
      const startMin = localDay(startAt, session.timezone) === piece.day ? minuteOfDay(startAt, session.timezone) : 0;
      const endMin = Math.min(1440, startMin + piece.ms / 60000), key = `${session.id}_${piece.day}`, row = blocks.get(key);
      if (!row) blocks.set(key, { session, day: piece.day, startMin, endMin, startAt, endAt, recordedMin: piece.ms / 60000 });
      else {
        if (startMin < row.startMin) { row.startMin = startMin; row.startAt = startAt; }
        if (endMin > row.endMin) { row.endMin = endMin; row.endAt = endAt; }
        row.recordedMin += piece.ms / 60000;
      }
    }
  }
  const result = new Map<string, TimeBlock[]>();
  for (const block of [...blocks.values()].sort((a, b) => a.startMin - b.startMin)) {
    const rows = result.get(block.day);
    if (rows) rows.push(block); else result.set(block.day, [block]);
  }
  return result;
}

export function CalendarTimeGrid({ data, days, fieldId, goalId, planned, tasksDue, commitments, selected, focusedSession, today, timeFormat, onSelectDay, onSelectSession, onCreate, onOpenCommitment, onMoveCommitment }: {
  data: Dataset; days: string[]; fieldId: string; goalId: string; planned: GoalOccurrence[]; tasksDue: Map<string, number>; commitments: Commitment[]; selected: string; focusedSession: string | null;
  today: string; timeFormat: TimeFormat; onSelectDay: (day: string) => void; onSelectSession: (session: FocusSession, day: string) => void;
  onCreate: (day: string, minute: number) => void; onOpenCommitment: (row: Commitment) => void; onMoveCommitment: (row: Commitment, day: string, minute: number) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null), dragRef = useRef<Drag | null>(null), body = useRef<HTMLDivElement>(null), dropAt = useRef(0);
  const update = (next: Drag | null) => { dragRef.current = next; setDrag(next); };
  const commitmentsFor = (day: string) => commitments.filter(c => (drag?.moved && drag.id === c.id ? drag.day : c.date) === day);
  // A click on an empty part of a day column plans a block that starts at that quarter hour. The click that ends a drag does not.
  const create = (e: MouseEvent<HTMLDivElement>, day: string) => {
    if (e.target !== e.currentTarget || Date.now() - dropAt.current < 300) return;
    const box = e.currentTarget.getBoundingClientRect(), minute = Math.floor((e.clientY - box.top) / box.height * 1440 / SNAP) * SNAP;
    onCreate(day, Math.max(0, Math.min(1440 - SNAP, minute)));
  };
  const pointerDown = (e: PointerEvent<HTMLButtonElement>, c: Commitment) => {
    if (e.button !== 0 || !movable(c, data.sessions)) return;
    e.preventDefault();
    update({ id: c.id, pointerY: e.clientY, startMinute: c.startMinute, day: c.date, minute: c.startMinute, moved: false });
  };
  // The block can change column while it moves, so the pointer is followed on the window, not on the block.
  useEffect(() => {
    if (!drag) return;
    const row = commitments.find(c => c.id === drag.id);
    const move = (e: globalThis.PointerEvent) => {
      const current = dragRef.current, dy = current ? e.clientY - current.pointerY : 0;
      if (!current || !row || !current.moved && Math.abs(dy) < DRAG_PX) return;
      const height = body.current?.getBoundingClientRect().height ?? 1152;
      const under = document.elementsFromPoint(e.clientX, e.clientY).find(el => el instanceof HTMLElement && el.dataset.day) as HTMLElement | undefined;
      const minute = Math.max(0, Math.min(1440 - row.durationMinutes, Math.round((current.startMinute + dy / height * 1440) / SNAP) * SNAP));
      update({ ...current, moved: true, minute, day: under?.dataset.day ?? current.day });
    };
    const up = () => {
      const current = dragRef.current;
      update(null);
      if (!current || !row) return;
      if (!current.moved) { onOpenCommitment(row); return; }
      dropAt.current = Date.now();
      if (current.day !== row.date || current.minute !== row.startMinute) onMoveCommitment(row, current.day, current.minute);
    };
    const cancel = () => update(null);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
  }, [drag?.id]);
  const blocks = useMemo(() => sessionBlocks(data, days, fieldId, goalId), [data.sessions, data.events, days.join(), fieldId, goalId]);
  const scroller = useRef<HTMLDivElement>(null);
  const nowMin = days.includes(today) ? minuteOfDay(Date.now(), data.settings.timezone) : null;
  const plansFor = (day: string) => planned.filter(o => o.date === day);
  const sessionTitle = (s: FocusSession) => data.goals?.find(g => g.id === s.goalId)?.title ?? data.fields.find(f => f.id === s.fieldId)?.name ?? '';
  // Open at the first session of the range, or at 07:00 when the range is empty.
  const firstMinute = Math.min(7 * 60, ...days.flatMap(day => (blocks.get(day) ?? []).map(b => b.startMin)), ...commitments.filter(c => days.includes(c.date)).map(c => c.startMinute));
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = Math.max(0, firstMinute - 30) / 60 * (scroller.current.scrollHeight / 24); }, [days[0], days.length]);
  return <div className="time-grid" style={{ '--days': days.length } as CSSProperties}>
    <div className="time-grid-row time-grid-head"><span className="time-grid-gutter" />{days.map(day => <button key={day} type="button" className={`time-grid-day ${day === selected ? 'selected' : ''} ${day === today ? 'today' : ''}`} aria-pressed={day === selected} aria-label={t('Show {day}', { day })} onClick={() => onSelectDay(day)}><span>{new Date(`${day}T12:00:00Z`).toLocaleDateString(dateLocale(), { timeZone: 'UTC', weekday: 'short' })}</span><strong>{Number(day.slice(8))}</strong></button>)}</div>
    <div className="time-grid-row time-grid-allday"><span className="time-grid-gutter">{t('Plans')}</span>{days.map(day => { const rows = plansFor(day); return <div key={day} className="time-grid-plans">{rows.slice(0, PLAN_CHIPS).map(o => { const title = data.goalActions?.find(a => a.id === o.actionId)?.title ?? ''; return <button key={o.id} type="button" className={`time-grid-plan ${o.status}`} title={`${title} · ${occurrenceStatusLabel(o.status)}`} aria-label={t('Planned action {title}, {status}', { title, status: occurrenceStatusLabel(o.status) })} onClick={() => onSelectDay(day)}>{title}</button>; })}{rows.length > PLAN_CHIPS && <button type="button" className="time-grid-plan more" onClick={() => onSelectDay(day)}>{t('+{count} more', { count: rows.length - PLAN_CHIPS })}</button>}{!!tasksDue.get(day) && <button type="button" className="time-grid-plan time-grid-tasks" onClick={() => onSelectDay(day)}>{tasksDue.get(day) === 1 ? t('1 task due') : t('{count} tasks due', { count: tasksDue.get(day)! })}</button>}</div>; })}</div>
    <div className="time-grid-scroll" ref={scroller}><div className="time-grid-row time-grid-body" ref={body}><div className="time-grid-hours" aria-hidden="true">{HOURS.map(hour => <span key={hour}>{hour ? hourLabel(hour, timeFormat) : ''}</span>)}</div>{days.map(day => <div key={day} data-day={day} className={`time-grid-col ${day === selected ? 'selected' : ''}`} title={t('Click an empty time to plan a commitment')} onClick={e => create(e, day)}>{commitmentsFor(day).map(c => {
        const startMinute = drag?.moved && drag.id === c.id ? drag.minute : c.startMinute, range = `${clockText(startMinute)} – ${clockText(startMinute + c.durationMinutes)}`, state = commitmentState(c, data.sessions);
        return <button key={c.id} type="button" className={`time-commitment ${state} ${drag?.moved && drag.id === c.id ? 'dragging' : ''} ${movable(c, data.sessions) ? 'movable' : ''}`} style={{ '--start': startMinute, '--span': c.durationMinutes, '--field': data.fields.find(f => f.id === c.fieldId)?.color } as CSSProperties}
          title={`${c.title} · ${range} · ${commitmentStateLabel(state)}`} aria-label={t('Commitment {title}, {range}, {state}', { title: c.title, range, state: commitmentStateLabel(state) })}
          onPointerDown={e => pointerDown(e, c)} onClick={() => { if (!movable(c, data.sessions)) onOpenCommitment(c); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCommitment(c); } }}>
          <strong>{c.title}</strong>{c.durationMinutes >= 40 && <span>{range}</span>}{c.durationMinutes >= 60 && state !== 'planned' && <span>{commitmentStateLabel(state)}</span>}
        </button>;
      })}{(blocks.get(day) ?? []).map(b => { const span = b.endMin - b.startMin, color = data.fields.find(f => f.id === b.session.fieldId)?.color, startLabel = clockLabel(b.startAt, b.session.timezone, timeFormat), endLabel = clockLabel(b.endAt, b.session.timezone, timeFormat), range = `${startLabel} – ${endLabel}`, title = sessionTitle(b.session); const planned = commitmentsFor(day).some(c => c.startMinute < b.endMin && b.startMin < commitmentEnd(c)); return <button key={b.session.id} type="button" className={`time-block ${b.session.excluded ? 'excluded' : ''} ${focusedSession === b.session.id ? 'focused' : ''} ${planned ? 'over-commitment' : ''}`} style={{ '--start': b.startMin, '--span': span, '--field': color } as CSSProperties} title={`${title} · ${range}`} aria-label={t('{title}, {range}, {minutesLabel} recorded', { title, range, minutesLabel: minutesLabel(b.recordedMin) })} onClick={() => onSelectSession(b.session, day)}><strong>{title}</strong>{span >= 50 && <span>{startLabel}<span className="time-block-end"> – {endLabel}</span></span>}{span >= 70 && <span>{t('{minutesLabel} recorded', { minutesLabel: minutesLabel(b.recordedMin) })}</span>}</button>; })}{day === today && nowMin !== null && <span className="time-grid-now" style={{ '--start': nowMin } as CSSProperties} aria-hidden="true" />}</div>)}</div></div>
  </div>;
}
