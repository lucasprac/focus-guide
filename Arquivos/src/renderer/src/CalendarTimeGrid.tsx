import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { Dataset, FocusSession, TimeFormat } from '../../shared/types';
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

export function CalendarTimeGrid({ data, days, fieldId, goalId, planned, selected, focusedSession, today, timeFormat, onSelectDay, onSelectSession }: {
  data: Dataset; days: string[]; fieldId: string; goalId: string; planned: GoalOccurrence[]; selected: string; focusedSession: string | null;
  today: string; timeFormat: TimeFormat; onSelectDay: (day: string) => void; onSelectSession: (session: FocusSession, day: string) => void;
}) {
  const blocks = useMemo(() => sessionBlocks(data, days, fieldId, goalId), [data.sessions, data.events, days.join(), fieldId, goalId]);
  const scroller = useRef<HTMLDivElement>(null);
  const nowMin = days.includes(today) ? minuteOfDay(Date.now(), data.settings.timezone) : null;
  const plansFor = (day: string) => planned.filter(o => o.date === day);
  const sessionTitle = (s: FocusSession) => data.goals?.find(g => g.id === s.goalId)?.title ?? data.fields.find(f => f.id === s.fieldId)?.name ?? '';
  // Open at the first session of the range, or at 07:00 when the range is empty.
  const firstMinute = Math.min(7 * 60, ...days.flatMap(day => (blocks.get(day) ?? []).map(b => b.startMin)));
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = Math.max(0, firstMinute - 30) / 60 * (scroller.current.scrollHeight / 24); }, [days[0], days.length]);
  return <div className="time-grid" style={{ '--days': days.length } as CSSProperties}>
    <div className="time-grid-row time-grid-head"><span className="time-grid-gutter" />{days.map(day => <button key={day} type="button" className={`time-grid-day ${day === selected ? 'selected' : ''} ${day === today ? 'today' : ''}`} aria-pressed={day === selected} aria-label={t('Show {day}', { day })} onClick={() => onSelectDay(day)}><span>{new Date(`${day}T12:00:00Z`).toLocaleDateString(dateLocale(), { timeZone: 'UTC', weekday: 'short' })}</span><strong>{Number(day.slice(8))}</strong></button>)}</div>
    <div className="time-grid-row time-grid-allday"><span className="time-grid-gutter">{t('Plans')}</span>{days.map(day => { const rows = plansFor(day); return <div key={day} className="time-grid-plans">{rows.slice(0, PLAN_CHIPS).map(o => { const title = data.goalActions?.find(a => a.id === o.actionId)?.title ?? ''; return <button key={o.id} type="button" className={`time-grid-plan ${o.status}`} title={`${title} · ${occurrenceStatusLabel(o.status)}`} aria-label={t('Planned action {title}, {status}', { title, status: occurrenceStatusLabel(o.status) })} onClick={() => onSelectDay(day)}>{title}</button>; })}{rows.length > PLAN_CHIPS && <button type="button" className="time-grid-plan more" onClick={() => onSelectDay(day)}>{t('+{count} more', { count: rows.length - PLAN_CHIPS })}</button>}</div>; })}</div>
    <div className="time-grid-scroll" ref={scroller}><div className="time-grid-row time-grid-body"><div className="time-grid-hours" aria-hidden="true">{HOURS.map(hour => <span key={hour}>{hour ? hourLabel(hour, timeFormat) : ''}</span>)}</div>{days.map(day => <div key={day} className={`time-grid-col ${day === selected ? 'selected' : ''}`}>{(blocks.get(day) ?? []).map(b => { const span = b.endMin - b.startMin, color = data.fields.find(f => f.id === b.session.fieldId)?.color, startLabel = clockLabel(b.startAt, b.session.timezone, timeFormat), endLabel = clockLabel(b.endAt, b.session.timezone, timeFormat), range = `${startLabel} – ${endLabel}`, title = sessionTitle(b.session); return <button key={b.session.id} type="button" className={`time-block ${b.session.excluded ? 'excluded' : ''} ${focusedSession === b.session.id ? 'focused' : ''}`} style={{ '--start': b.startMin, '--span': span, '--field': color } as CSSProperties} title={`${title} · ${range}`} aria-label={t('{title}, {range}, {minutesLabel} recorded', { title, range, minutesLabel: minutesLabel(b.recordedMin) })} onClick={() => onSelectSession(b.session, day)}><strong>{title}</strong>{span >= 50 && <span>{startLabel}<span className="time-block-end"> – {endLabel}</span></span>}{span >= 70 && <span>{t('{minutesLabel} recorded', { minutesLabel: minutesLabel(b.recordedMin) })}</span>}</button>; })}{day === today && nowMin !== null && <span className="time-grid-now" style={{ '--start': nowMin } as CSSProperties} aria-hidden="true" />}</div>)}</div></div>
  </div>;
}
