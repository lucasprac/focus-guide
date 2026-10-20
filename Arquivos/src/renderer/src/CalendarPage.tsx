import { Badge, Button, Card, EmptyState, IconButton, PageHeader, Segments } from './ui';
import { plannedOccurrences } from '../../shared/goal-planning';
import { CheckControl } from './ui';
import { BehaviourReview } from './Behaviour';
import { Choice } from './ui';
import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { ViewProps } from './App';
import type { FocusSession, SessionEvent } from '../../shared/types';
import { addDays, localDay, mean, calendarSessionIndex, summarizeDays } from '../../shared/analytics';
import { Disclosure, Icon, Modal, Rating, displayDay, minutesLabel } from './components';

export default function CalendarPage({ data, act }: ViewProps) {
  const [showPlans,setShowPlans] = useState(true);
  const today = localDay(Date.now(), data.settings.timezone);
  const [month, setMonth] = useState(today.slice(0, 7)), [selected, setSelected] = useState(today), [field, setField] = useState(''), [metric, setMetric] = useState<'minutes' | 'count' | 'focus'>('minutes');
  const [editor, setEditor] = useState<FocusSession | null>(null), [deleting, setDeleting] = useState<FocusSession | null>(null);
  const [heatmapFocus, setHeatmapFocus] = useState(today);
  const [editField, setEditField] = useState(''), [intention, setIntention] = useState(''), [energy, setEnergy] = useState<number | null>(null), [focus, setFocus] = useState<number | null>(null), [note, setNote] = useState('');
  useEffect(() => {
    if (field && !data.fields.some(f => f.id === field)) setField('');
    if (editor && !data.sessions.some(s => s.id === editor.id)) setEditor(null);
    if (deleting && !data.sessions.some(s => s.id === deleting.id)) setDeleting(null);
  }, [data.fields, data.sessions, field, editor, deleting]);
  const days = useMemo(() => summarizeDays(data, field), [data.sessions, data.events, field]);
  const summaries = new Map(days.map(d => [d.day, d]));
  const value = (day: string): number | null => { const d = summaries.get(day); return metric === 'minutes' ? d?.minutes ?? 0 : metric === 'count' ? d?.count ?? 0 : d ? mean(d.ratings) : null; };
  const max = Math.max(1, ...days.map(d => metric === 'minutes' ? d.minutes : metric === 'count' ? d.count : mean(d.ratings) ?? 0));
  const first = `${month}-01`, start = addDays(first, -((new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7));
  const monthDays = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const cells = Math.ceil((monthDays + ((new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7)) / 7) * 7;
  const year = Number(month.slice(0, 4)), yearDays = Math.round((Date.parse(`${year + 1}-01-01`) - Date.parse(`${year}-01-01`)) / 86400000);
  const yearStart = `${year}-01-01`, yearPad = (new Date(`${yearStart}T12:00:00Z`).getUTCDay() + 6) % 7;
  const sessionIndex = useMemo(() => calendarSessionIndex(data), [data.sessions, data.events]);
  const daySessions = useMemo(() => (sessionIndex.get(selected) ?? []).filter(s => !field || s.fieldId === field), [sessionIndex, field, selected]);
  const thoughts = useMemo(() => {
    const result = new Map<string, SessionEvent[]>();
    for (const event of data.events) if (event.kind === 'thought') {
      const rows = result.get(event.sessionId);
      if (rows) rows.push(event); else result.set(event.sessionId, [event]);
    }
    return result;
  }, [data.events]);
  const highestTime = [...days].filter(d => d.minutes > 0).sort((a, b) => b.minutes - a.minutes)[0];
  const highestRating = [...days].filter(d => d.ratings.length > 0).sort((a, b) => mean(b.ratings)! - mean(a.ratings)! || b.ratings.length - a.ratings.length)[0];
  const planned = showPlans ? plannedOccurrences(data,start,addDays(start,cells-1)).filter(o => !field || data.goals?.find(g => g.id === o.goalId)?.fieldId === field) : [];
  const plannedDates = new Set(planned.map(o => o.date));
  const selectedPlans = planned.filter(o => o.date === selected);
  const selectedSummary = summaries.get(selected);
  const shiftMonth = (offset: number) => { const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + offset); setMonth(date.toISOString().slice(0, 7)); };
  const sessionTime = (s: FocusSession) => new Date(s.startedAt).toLocaleTimeString('en-US', { timeZone: s.timezone, hour: '2-digit', minute: '2-digit', hour12: false });
  const edit = (s: FocusSession) => { setEditor(s); setEditField(s.fieldId); setIntention(s.intention); setEnergy(s.energy); setFocus(s.focus); setNote(s.note); };
  const heatmapKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-day]');
    if (!target) return;
    const offsets: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, ArrowRight: 7, ArrowLeft: -7 };
    const offset = offsets[e.key];
    if (offset === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const lastDay = addDays(yearStart, yearDays - 1);
    const next = e.key === 'Home' ? yearStart : e.key === 'End' ? lastDay : addDays(target.dataset.day!, offset);
    const bounded = next < yearStart ? yearStart : next > lastDay ? lastDay : next;
    e.currentTarget.querySelector<HTMLButtonElement>('button[data-day="' + bounded + '"]')?.focus();
  };
  const tooltip = (day: string) => { const d = summaries.get(day); return `${displayDay(day, true)}: ${minutesLabel(d?.minutes ?? 0)}, ${d?.count ?? 0} sessions, ${d?.ratings.length ? `${mean(d.ratings)!.toFixed(1)}/5 (${d.ratings.length} ratings)` : 'no focus rating'}`; };
  return <>
    <PageHeader title="A little time adds up." />
    <div className="filter-toolbar flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-2"><Segments className="segmented" label="Calendar measure" value={metric} onChange={m => { if (m) setMetric(m as typeof metric); }} options={[{ value: 'minutes', label: 'Recorded time' }, { value: 'count', label: 'Sessions' }, { value: 'focus', label: 'Self-rated focus' }]} /><Choice aria-label="Calendar field filter" value={field} onChange={e => setField(e.target.value)}><option value="">All focus fields</option>{data.fields.map(f => <option key={f.id} value={f.id}>{f.name}{f.archived ? ' (archived)' : ''}</option>)}</Choice></div>
    <div className="calendar-layout"><section className="panel month-panel"><div className="calendar-header"><h2>{new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })}</h2><div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>Today</Button><IconButton className="rotate" icon="chevron" label="Previous month" onClick={() => shiftMonth(-1)} /><IconButton icon="chevron" label="Next month" onClick={() => shiftMonth(1)} /></div></div><div className="weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <span key={d}>{d}</span>)}</div><div className="month-grid">{Array.from({ length: cells }, (_, i) => { const day = addDays(start, i), amount = value(day); return <button key={day} title={tooltip(day)} aria-label={`Show ${day}`} className={`day-cell ${day.slice(0, 7) !== month ? 'outside' : ''} ${selected === day ? 'selected' : ''} ${day === today ? 'today' : ''}`} style={{ '--heat': amount ? .08 + .28 * amount / max : 0 } as CSSProperties} onClick={() => setSelected(day)}><span className="day-number">{Number(day.slice(8))}</span><span className="day-value">{amount === null ? '—' : amount > 0 ? metric === 'minutes' ? minutesLabel(amount) : metric === 'focus' ? `${amount.toFixed(1)}/5` : amount : ''}</span>{plannedDates.has(day) && <span className="day-plan-dot" title="Goal action planned" />}{(summaries.get(day)?.count ?? 0) > 0 && <span className="day-session-dot" />}</button>; })}</div><div className="calendar-legend"><span>{metric === 'focus' ? 'Unrated days stay blank.' : 'Less'}</span><i className="heat-1" /><i className="heat-2" /><i className="heat-3" /><span>{metric === 'focus' ? 'Higher self-rating' : 'More'}</span></div></section>
      <section className="panel timeline-panel"><div className="tiny-label text-caption tracking-normal">A closer look</div><h2>{displayDay(selected)}</h2><div className="day-totals"><strong>{minutesLabel(selectedSummary?.minutes ?? 0)}</strong><span>{selectedSummary?.count ?? 0} sessions started here</span></div>{daySessions.length ? <div className="session-timeline">{daySessions.map(s => <article className={`timeline-session ${s.excluded ? 'excluded' : ''}`} key={s.id}><div className="timeline-session-head"><span className="field-dot" style={{ background: data.fields.find(f => f.id === s.fieldId)?.color }} /><strong>{data.fields.find(f => f.id === s.fieldId)?.name}</strong><span>{sessionTime(s)}</span></div><p>{s.intention || 'Time set aside to focus'}</p><div className="session-meta"><span>{minutesLabel(s.activeMs / 60000)} recorded</span><span>{s.focus === null ? 'Unrated' : `${s.focus}/5 focus`}</span>{s.excluded && <Badge>Excluded</Badge>}{s.recovered && <Badge tone="info">Recovered</Badge>}</div>{s.note && <p className="session-note">{s.note}</p>}<BehaviourReview session={s} data={data} act={act} />{(thoughts.get(s.id) ?? []).map(e => <p className="session-thought" key={e.id}><Icon name="thought" size={13} />{e.text}</p>)}<div className="history-actions flex flex-wrap items-center gap-1"><Button variant="ghost" size="sm" icon="edit" aria-label={`Edit session at ${sessionTime(s)}`} onClick={() => edit(s)}>Edit</Button><Button variant="ghost" size="sm" aria-label={`${s.excluded ? 'Include again' : 'Exclude'} session at ${sessionTime(s)}`} onClick={() => void act('session.exclude', { id: s.id, excluded: !s.excluded })}>{s.excluded ? 'Include again' : 'Exclude'}</Button><Button variant="danger" size="sm" icon="trash" className="ml-auto" aria-label={`Delete session at ${sessionTime(s)}`} onClick={() => setDeleting(s)}>Delete</Button></div></article>)}</div> : <div className="mt-4"><EmptyState title="A day with room">Your saved sessions will appear here. Days without records are not a measure of effort.</EmptyState></div>}</section>
    </div>
    <Card className="calendar-planned" title={<>Planned actions · {selected}</>} actions={<label className="goal-toggle flex items-center gap-2 text-caption text-ink-muted"><CheckControl aria-label="Show planned actions" checked={showPlans} onChange={e => setShowPlans(e.target.checked)} />Show plans</label>}>{showPlans && <><p className="hint">Outlined dots mark plans. The calendar’s recorded time, sessions, and ratings keep their existing meaning.</p>{selectedPlans.map(o => <div className="goal-history-row" key={o.id}><strong>{data.goalActions?.find(a => a.id === o.actionId)?.title}</strong><span>{data.goals?.find(g => g.id === o.goalId)?.title} · {o.status} · {o.plan.timezone}</span><p className="hint">{o.plan.cue} → {o.plan.normal}{o.originalDate !== o.date ? ` · Moved from ${o.originalDate}` : ''}</p></div>)}{!selectedPlans.length && <p className="hint">No goal actions planned for this date.</p>}</>}</Card>
    <Disclosure title="Year overview"><Card className="annual-panel" title={<>{year}, one day at a time</>} actions={<span className="hint" id="heatmap-help">Arrow keys move by day or week; Home/End jump to the year’s edges. Enter selects.</span>}><div className="year-heatmap" role="group" aria-describedby="heatmap-help" onKeyDown={heatmapKey} aria-label={`${year} annual focus heatmap`}>{Array.from({ length: yearPad }, (_, i) => <span key={`pad${i}`} />)}{Array.from({ length: yearDays }, (_, i) => { const day = addDays(yearStart, i), amount = value(day); return <button key={day} className={selected === day ? 'selected' : ''} title={tooltip(day)} data-day={day} tabIndex={day === (heatmapFocus.startsWith(year + '-') ? heatmapFocus : yearStart) ? 0 : -1} onFocus={() => setHeatmapFocus(day)} aria-label={`Heatmap ${day}`} style={{ '--heat': amount ? .15 + .7 * amount / max : 0 } as CSSProperties} onClick={() => { setSelected(day); setMonth(day.slice(0, 7)); }} />; })}</div><div className="year-labels"><span>January</span><span>April</span><span>July</span><span>October</span><span>December</span></div></Card>
    <div className="comparison-cards"><section className="panel"><div className="tiny-label text-caption tracking-normal">Highest recorded time · this field filter</div><h3>{highestTime ? displayDay(highestTime.day, true) : 'Still a blank page'}</h3><p>{highestTime ? `${minutesLabel(highestTime.minutes)} recorded, ${highestTime.count} sessions started` : 'Start a session to begin your record.'}</p></section><section className="panel"><div className="tiny-label text-caption tracking-normal">Highest self-rated focus · this field filter</div><h3>{highestRating ? displayDay(highestRating.day, true) : 'No ratings yet'}</h3><p>{highestRating ? `${mean(highestRating.ratings)!.toFixed(1)}/5 from ${highestRating.ratings.length} ${highestRating.ratings.length === 1 ? 'rating' : 'ratings'}` : 'Optional reflections add this perspective.'}</p></section></div>
    </Disclosure>
    <p className="footnote">Time follows each session’s recording timezone and is split at midnight. Counts and ratings belong to the starting date. Excluded sessions remain in history.</p>
    <Modal open={!!(editor)} title="Refine your session record" onClose={() => setEditor(null)}>{editor && <><p className="modal-intro">Original timing remains intact. Changing the field clears the linked task selection.</p><label className="form-label">Focus field<Choice aria-label="Edit session field" value={editField} onChange={e => setEditField(e.target.value)}>{data.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Choice></label><label className="form-label">Intention<textarea aria-label="Edit intention" value={intention} onChange={e => setIntention(e.target.value)} maxLength={500} rows={2} /></label><div className="ratings-pair"><Rating value={energy} onChange={setEnergy} label="Starting energy" /><Rating value={focus} onChange={setFocus} label="Perceived focus" /></div><label className="form-label">Reflection<textarea aria-label="Edit reflection" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={3} /></label><div className="modal-actions"><Button onClick={() => setEditor(null)}>Cancel</Button><Button variant="primary" onClick={async () => { const result = await act('session.edit', { id: editor.id, fieldId: editField, intention, energy, focus, note }); if (result.ok) setEditor(null); }}>Save changes</Button></div></>}</Modal>
    <Modal destructive description="Permanently removes this session and its events. Exclusion keeps the record instead." open={!!(deleting)} title="Delete this session?" onClose={() => setDeleting(null)}>{deleting && <><p className="modal-intro">This removes the session and its events from your dataset. Excluding it keeps the record while removing it from analysis.</p><div className="modal-actions"><Button onClick={() => setDeleting(null)}>Keep session</Button><Button variant="danger" onClick={async () => { const result = await act('session.delete', { id: deleting.id }); if (result.ok) setDeleting(null); }}>Delete session</Button></div></>}</Modal>
  </>;
}
