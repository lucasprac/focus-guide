import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Dataset, FocusSession } from '../../shared/types';
import { CHALLENGE_LABELS, DETRACTOR_LABELS, INSIGHT_THRESHOLDS, focusInsights, type FocusInsights, type HourPoint, type Interval, type ModelFeature, type Recommendation, type SessionShapeSection, type StatesSection, type SurvivalCurve } from '../../shared/focus-insights';
import { Badge, Button, Card, Plate, Segments, cn } from './ui';
import { Icon, minutesLabel } from './components';

/* Insights tab of Patterns: renders `insights.read` (or the example dataset) as figures. Charts are inline SVG drawn at the
   measured width, so 12px text stays 12px. Data marks use the info blue; intervals are bands or whiskers; missing stays a gap. */
type Props = { data: Dataset; example: boolean; from: string; to: string; fieldId: string; goalId: string; onTry: (text: string) => void };
const one = (v: number) => v.toFixed(1), whole = (v: number) => String(Math.round(v)), percent = (v: number | null) => v === null ? '—' : `${Math.round(v * 100)}%`;
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/* A cheap signature of what insights depend on in finished sessions: it changes when a session finishes or is deleted,
   or when its rating, energy, reflection answers, exclusion, area or goal change. Used to decide when to read insights again. */
export function insightsSignature(sessions: FocusSession[]): string {
  let count = 0, hash = 2166136261;
  const mix = (value: string | number | boolean | null | undefined) => { const text = String(value ?? ''); for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0; hash = Math.imul(hash ^ 124, 16777619) >>> 0; };
  for (const s of sessions) if (s.status === 'completed') { count++; mix(s.id); mix(s.focus); mix(s.energy); mix(s.excluded); mix(s.detractor); mix(s.challenge); mix(s.fieldId); mix(s.goalId); }
  return `${count}:${hash}`;
}
const intervalText = (i: Interval, digits = 1) => `${i.estimate.toFixed(digits)} (90% interval ${i.low.toFixed(digits)} to ${i.high.toFixed(digits)})`;
function medianText(c: SurvivalCurve): string {
  if (!c.median) return 'median not reached: more than half of these sessions had no drift';
  const m = c.median;
  return c.medianOpen ? `median ${whole(m.estimate)} min (90% interval: ${whole(m.low)} min or longer)` : `median ${whole(m.estimate)} min (90% interval ${whole(m.low)}–${whole(m.high)} min)`;
}

type Scale = (v: number) => number;
interface Box { left: number; right: number; top: number; bottom: number; width: number }
const linear = (d0: number, d1: number, r0: number, r1: number): Scale => v => d1 === d0 ? (r0 + r1) / 2 : r0 + (v - d0) / (d1 - d0) * (r1 - r0);
function useWidth(initial = 560) {
  const ref = useRef<HTMLDivElement>(null), [width, setWidth] = useState(initial);
  useEffect(() => {
    const element = ref.current; if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => { const next = Math.max(240, Math.round(entry.contentRect.width)); setWidth(current => current === next ? current : next); });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
/* Axes, hairline grid and the plot box; children draw the marks with the scales. One y-scale per chart. */
function Frame({ label, height, x, y, xTicks, yTicks, xTitle, yTitle, children }: {
  label: string; height: number; x: [number, number]; y: [number, number]; xTicks: Array<{ v: number; t: string }>; yTicks: Array<{ v: number; t: string }>;
  xTitle?: string; yTitle?: string; children: (sx: Scale, sy: Scale, box: Box) => ReactNode;
}) {
  const [ref, width] = useWidth();
  const box: Box = { left: 42, right: width - 12, top: yTitle ? 24 : 10, bottom: height - (xTitle ? 36 : 22), width };
  const sx = linear(x[0], x[1], box.left, box.right), sy = linear(y[0], y[1], box.bottom, box.top);
  return <div ref={ref} className="insight-chart-wrap"><svg className="insight-chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    {yTitle && <text x={box.left} y={13} className="chart-axis">{yTitle}</text>}
    {yTicks.map(t => <g key={t.v}><line x1={box.left} x2={box.right} y1={sy(t.v)} y2={sy(t.v)} className="chart-grid" /><text x={box.left - 7} y={sy(t.v) + 4} textAnchor="end" className="chart-axis">{t.t}</text></g>)}
    {xTicks.map(t => <text key={t.v} x={sx(t.v)} y={box.bottom + 16} textAnchor="middle" className="chart-axis">{t.t}</text>)}
    {xTitle && <text x={box.right} y={height - 3} textAnchor="end" className="chart-axis">{xTitle}</text>}
    {children(sx, sy, box)}
  </svg></div>;
}
/* Consecutive items that pass the test; a gap breaks a line instead of drawing through missing values. */
function runs<T>(items: T[], ok: (item: T) => boolean): T[][] {
  const out: T[][] = []; let current: T[] = [];
  for (const item of items) { if (ok(item)) current.push(item); else if (current.length) { out.push(current); current = []; } }
  if (current.length) out.push(current); return out;
}
const linePath = <T,>(rows: T[], x: (r: T) => number, y: (r: T) => number) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(r).toFixed(1)},${y(r).toFixed(1)}`).join('');
const bandPath = <T,>(rows: T[], x: (r: T) => number, high: (r: T) => number, low: (r: T) => number) => `${linePath(rows, x, high)}${[...rows].reverse().map(r => `L${x(r).toFixed(1)},${low(r).toFixed(1)}`).join('')}Z`;
/* A column with a 4px rounded data end and a square baseline. */
function columnPath(x: number, y: number, width: number, base: number): string {
  const h = Math.max(0, base - y), r = Math.min(4, width / 2, h);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${base}Z`;
}
const niceMax = (v: number) => { if (!(v > 0)) return 1; const p = 10 ** Math.floor(Math.log10(v)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const ticksTo = (max: number, format: (v: number) => string) => [0, max / 2, max].map(v => ({ v, t: format(v) }));
const rateFormat = (v: number) => v >= 10 || Number.isInteger(v) ? whole(v) : one(v);

function Columns({ label, rows, x, xTicks, xTitle, yTitle, height = 128, format = rateFormat }: {
  label: string; rows: Array<{ x: number; value: number | null; title: string }>; x: [number, number]; xTicks: Array<{ v: number; t: string }>; xTitle?: string; yTitle: string; height?: number; format?: (v: number) => string;
}) {
  const max = niceMax(Math.max(0, ...rows.map(r => r.value ?? 0)));
  return <Frame label={label} height={height} x={x} y={[0, max]} xTicks={xTicks} yTicks={ticksTo(max, format)} xTitle={xTitle} yTitle={yTitle}>{(sx, sy, box) => {
    const step = rows.length > 1 ? Math.abs(sx(rows[1].x) - sx(rows[0].x)) : 20, width = Math.max(3, Math.min(16, step - 2));
    return <>{rows.map(r => <g key={r.x}>
      {r.value !== null && r.value > 0 && <path d={columnPath(sx(r.x) - width / 2, sy(r.value), width, box.bottom)} className="chart-column" />}
      <rect x={sx(r.x) - Math.max(step, 12) / 2} y={box.top} width={Math.max(step, 12)} height={box.bottom - box.top} className="chart-hit"><title>{r.title}</title></rect>
    </g>)}</>;
  }}</Frame>;
}

/* A table twin for every figure: the same values without the chart. */
function Values({ head, rows }: { head: string[]; rows: Array<Array<ReactNode>> }) {
  if (!rows.length) return null;
  return <details className="figure-values"><summary>Show values</summary><div className="figure-values-scroll"><table><thead><tr>{head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j ? <td key={j}>{cell}</td> : <th key={j} scope="row">{cell}</th>)}</tr>)}</tbody></table></div></details>;
}
function Reason({ children }: { children: ReactNode }) { return <p className="insight-reason"><Icon name="spark" size={15} className="shrink-0 text-ink-muted" /><span>{children}</span></p>; }
const heat = (share: number | null): CSSProperties | undefined => share === null ? undefined : { '--heat': Math.max(0.04, Math.min(1, share)) } as CSSProperties;

function QualityStrip({ quality }: { quality: FocusInsights['quality'] }) {
  const q = quality, items: Array<{ label: string; value: string; detail: string }> = [
    { label: 'Sessions', value: String(q.sessions), detail: `${minutesLabel(q.activeMinutes)} active over ${plural(q.spanDays, 'day')}` },
    { label: 'Rated', value: percent(q.ratedShare), detail: q.reflectionShare === null ? 'No sessions yet' : `${percent(q.reflectionShare)} with a reflection answer` },
    { label: 'Activity coverage', value: percent(q.activityCoverage), detail: q.activityCoverage === null ? 'Collection off or no recent sessions' : 'Observed share of active time' },
    { label: 'Drift markers', value: String(q.markerSessions), detail: `of ${plural(q.sessions, 'session')} have I'm back or an interruption` },
    { label: 'Check-ins answered', value: String(q.probeAnswered), detail: q.probeSessions ? `${q.probeMissed} missed, in ${plural(q.probeSessions, 'session')}` : 'Attention check-ins are off or not seen yet' }
  ];
  return <Card className="insight-quality" title="The data behind these insights" icon="shield">
    <dl className="insight-quality-list">{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd><strong>{item.value}</strong><span>{item.detail}</span></dd></div>)}</dl>
    {q.notes.length > 0 && <ul className="insight-notes">{q.notes.map(note => <li key={note}>{note}</li>)}</ul>}
  </Card>;
}

function RhythmChart({ hours }: { hours: HourPoint[] }) {
  const shown = hours.filter(h => h.focus), peak = shown.reduce<HourPoint | null>((best, h) => !best || h.focus!.estimate > best.focus!.estimate ? h : best, null);
  const label = shown.length ? `Line chart of perceived focus by start hour, with a 90% interval band, for ${plural(shown.length, 'hour')}. Highest around ${hourLabel(peak!.hour)}: ${intervalText(peak!.focus!)}.` : 'No start hour has enough nearby rated sessions yet.';
  const hourTitle = (h: HourPoint) => [hourLabel(h.hour), h.focus ? `focus ${intervalText(h.focus)}` : 'focus not shown (too few nearby sessions)', h.driftPerHour !== null ? `${one(h.driftPerHour)} drifts per active hour` : null, h.switchesPerHour !== null ? `${whole(h.switchesPerHour)} window switches per hour` : null, h.offTaskShare !== null ? `${percent(h.offTaskShare)} of check-ins off the task` : null].filter(Boolean).join(' · ');
  const xTicks = [0, 6, 12, 18, 23].map(v => ({ v, t: String(v).padStart(2, '0') }));
  return <Frame label={label} height={210} x={[0, 23]} y={[1, 5]} xTicks={xTicks} yTicks={[1, 2, 3, 4, 5].map(v => ({ v, t: String(v) }))} xTitle="Start hour" yTitle="Perceived focus (1–5)">{(sx, sy, box) => {
    const step = sx(1) - sx(0);
    return <>
      {runs(hours, h => h.focus !== null).map(run => <g key={run[0].hour}>
        <path d={bandPath(run, h => sx(h.hour), h => sy(h.focus!.high), h => sy(h.focus!.low))} className="chart-band" />
        {run.length > 1 ? <path d={linePath(run, h => sx(h.hour), h => sy(h.focus!.estimate))} className="chart-line" /> : <circle cx={sx(run[0].hour)} cy={sy(run[0].focus!.estimate)} r={4} className="chart-dot" />}
      </g>)}
      {peak && <circle cx={sx(peak.hour)} cy={sy(peak.focus!.estimate)} r={4.5} className="chart-dot" />}
      {hours.map(h => <rect key={h.hour} x={sx(h.hour) - step / 2} y={box.top} width={step} height={box.bottom - box.top} className="chart-hit"><title>{hourTitle(h)}</title></rect>)}
    </>;
  }}</Frame>;
}
function RhythmFigure({ section }: { section: FocusInsights['rhythm'] }) {
  const shown = section.hours.filter(h => h.focus), peak = shown.reduce<HourPoint | null>((best, h) => !best || h.focus!.estimate > best.focus!.estimate ? h : best, null);
  const bands = [...new Set(section.grid.map(c => c.band))], weekdays = [...new Set(section.grid.map(c => c.weekday))];
  const drift = section.hours.some(h => h.driftPerHour !== null);
  return <Plate fig={1} className="insight-wide" title="When you focus best" hint={`${plural(section.n, 'rated session')}`} readout={peak ? `highest near ${hourLabel(peak.hour)} · ${one(peak.focus!.estimate)}` : '—'}>
    {!section.eligible ? <Reason>{section.reason}</Reason> : <>
      <RhythmChart hours={section.hours} />
      {drift && <Columns label={`Column chart of drifts per active hour by start hour. ${section.hours.filter(h => h.driftPerHour !== null).length} hours shown.`} yTitle="Drifts per active hour" x={[0, 23]} xTicks={[0, 6, 12, 18, 23].map(v => ({ v, t: String(v).padStart(2, '0') }))} xTitle="Start hour"
        rows={section.hours.map(h => ({ x: h.hour, value: h.driftPerHour, title: h.driftPerHour === null ? `${hourLabel(h.hour)} · not enough sessions recorded with I'm back` : `${hourLabel(h.hour)} · ${one(h.driftPerHour)} drifts per active hour` }))} />}
      <div className="insight-subhead"><h3>Weekday and time of day</h3><span className="hint">Mean focus where a cell has at least {INSIGHT_THRESHOLDS.rhythm.cellSessions} sessions</span></div>
      <div className="figure-values-scroll"><table className="insight-heat" aria-label="Mean perceived focus by weekday and time of day">
        <thead><tr><th scope="col"><span className="sr-only">Weekday</span></th>{bands.map(b => <th key={b} scope="col">{b.split(' · ')[0]}<small>{b.split(' · ')[1]}</small></th>)}</tr></thead>
        <tbody>{weekdays.map(day => <tr key={day}><th scope="row">{day}</th>{bands.map(band => { const cell = section.grid.find(c => c.weekday === day && c.band === band)!; return <td key={band} style={heat(cell.focusMean === null ? null : (cell.focusMean - 1) / 4)} className={cell.focusMean === null ? 'empty' : undefined} title={`${day}, ${band}: ${plural(cell.sessions, 'session')}${cell.focusMean !== null ? `, mean focus ${one(cell.focusMean)}` : ''}${cell.driftPerHour !== null ? `, ${one(cell.driftPerHour)} drifts per active hour` : ''}`}>{cell.focusMean === null ? '—' : one(cell.focusMean)}</td>; })}</tr>)}</tbody>
      </table></div>
      <p className="hint mt-3">{section.reason}</p>
      <Values head={['Start hour', 'Focus', '90% interval', 'Drifts per hour', 'Off-task check-ins']} rows={section.hours.filter(h => h.focus || h.driftPerHour !== null || h.offTaskShare !== null).map(h => [hourLabel(h.hour), h.focus ? one(h.focus.estimate) : '—', h.focus ? `${one(h.focus.low)}–${one(h.focus.high)}` : '—', h.driftPerHour === null ? '—' : one(h.driftPerHour), percent(h.offTaskShare)])} />
    </>}
  </Plate>;
}

function SurvivalChart({ curve, reference, height = 220, label }: { curve: SurvivalCurve; reference?: SurvivalCurve | null; height?: number; label: string }) {
  const start = (c: SurvivalCurve) => c.points[0]?.minute > 0 ? [{ minute: 0, survival: 1, low: 1, high: 1, atRisk: c.sessions }, ...c.points] : c.points;
  const points = start(curve), ref = reference ? start(reference) : null;
  const xMax = Math.max(5, ...points.map(p => p.minute), ...(ref ?? []).map(p => p.minute));
  const step = (rows: typeof points, value: (p: typeof points[number]) => number, sx: Scale, sy: Scale) => rows.map((p, i) => i ? `H${sx(p.minute).toFixed(1)}V${sy(value(p)).toFixed(1)}` : `M${sx(p.minute).toFixed(1)},${sy(value(p)).toFixed(1)}`).join('');
  const stepBand = (sx: Scale, sy: Scale) => {
    const n = points.length - 1; let lower = `L${sx(points[n].minute).toFixed(1)},${sy(points[n].low).toFixed(1)}`;
    for (let i = n - 1; i >= 0; i--) lower += `V${sy(points[i].low).toFixed(1)}H${sx(points[i].minute).toFixed(1)}`;
    return `${step(points, p => p.high, sx, sy)}${lower}Z`;
  };
  const xTicks = [0, xMax / 2, xMax].map(v => ({ v, t: `${Math.round(v)}` }));
  return <Frame label={label} height={height} x={[0, xMax]} y={[0, 1]} xTicks={xTicks} yTicks={[0, 0.5, 1].map(v => ({ v, t: `${v * 100}%` }))} xTitle="Active minutes" yTitle="Still without a drift">{(sx, sy, box) => <>
    <path d={stepBand(sx, sy)} className="chart-band" />
    {ref && <path d={step(ref, p => p.survival, sx, sy)} className="chart-reference" />}
    <path d={step(points, p => p.survival, sx, sy)} className="chart-line" />
    {curve.median && <><line x1={sx(curve.median.estimate)} x2={sx(curve.median.estimate)} y1={sy(0.5)} y2={box.bottom} className="chart-marker" /><circle cx={sx(curve.median.estimate)} cy={sy(0.5)} r={4} className="chart-dot" /></>}
    {points.map((p, i) => { const next = points[i + 1]?.minute ?? xMax, x0 = sx(p.minute), w = Math.max(6, sx(next) - x0); return <rect key={i} x={x0} y={box.top} width={w} height={box.bottom - box.top} className="chart-hit"><title>{`From minute ${Math.round(p.minute)}: ${percent(p.survival)} still without a drift (90% interval ${percent(p.low)}–${percent(p.high)}), ${p.atRisk} sessions still running`}</title></rect>; })}
  </>}</Frame>;
}
function AttentionSpanFigure({ section }: { section: FocusInsights['attentionSpan'] }) {
  const [group, setGroup] = useState<'all' | 'band' | 'mode'>('all');
  // A filter change can empty the chosen grouping; the figure then falls back to all sessions.
  const shown = group === 'band' && section.byBand.length ? 'band' : group === 'mode' && section.byMode.length ? 'mode' : 'all';
  const overall = section.overall, groups = shown === 'band' ? section.byBand : shown === 'mode' ? section.byMode : [];
  return <Plate fig={2} title="How long until the first drift" hint={overall ? `${plural(overall.sessions, 'session')} · ${overall.events} with a drift` : plural(section.n, 'session')} readout={overall ? medianText(overall).replace(/ \(90%.*$/, '') : '—'}>
    {!section.eligible || !overall ? <Reason>{section.reason}</Reason> : <>
      {(section.byBand.length > 0 || section.byMode.length > 0) && <Segments className="segmented insight-segments" label="Group the curve" value={shown} onChange={v => { if (v) setGroup(v as typeof group); }} options={[{ value: 'all', label: 'All sessions' }, ...(section.byBand.length ? [{ value: 'band', label: 'By time of day' }] : []), ...(section.byMode.length ? [{ value: 'mode', label: 'By mode' }] : [])]} />}
      {shown === 'all' ? <SurvivalChart curve={overall} label={`Step chart: share of sessions still without a drift by active minute, with a 90% band. ${medianText(overall)}.`} />
        : <div className="survival-multiples">{groups.map(c => <figure key={c.label}><figcaption><strong>{c.label}</strong><span>{plural(c.sessions, 'session')} · {medianText(c).replace(/ \(90%.*$/, '')}</span></figcaption><SurvivalChart curve={c} reference={overall} height={170} label={`${c.label}: step chart of sessions still without a drift, with a 90% band; the grey line shows all sessions. ${medianText(c)}.`} /></figure>)}</div>}
      {shown !== 'all' && <p className="hint"><span className="legend-key line" aria-hidden="true" />This group <span className="legend-key reference" aria-hidden="true" />All sessions</p>}
      <p className="insight-callout">All sessions: {medianText(overall)}.</p>
      <p className="hint">{section.reason}</p>
      <Values head={['Curve', 'Sessions', 'First drifts', 'Median']} rows={[overall, ...section.byBand, ...section.byMode].map(c => [c.label, c.sessions, c.events, medianText(c).replace(/^median /, '')])} />
    </>}
  </Plate>;
}

function ShapeFigure({ section }: { section: SessionShapeSection }) {
  const { blockMinutes: block, blockSessions, maxMinutes } = INSIGHT_THRESHOLDS.sessionShape, points = section.points, last = points[points.length - 1], xMax = last ? last.minute + block : maxMinutes;
  const mid = (m: number) => m + block / 2, xTicks = [0, Math.round(xMax / 2 / block) * block, xMax].map(v => ({ v, t: String(v) }));
  const pointTitle = (p: SessionShapeSection['points'][number]) => [`Minutes ${p.minute}–${p.minute + block}`, `${plural(p.sessions, 'session')}`, p.inputShare !== null ? `input in ${percent(p.inputShare)} of observed time` : null, p.switchesPerMinute !== null ? `${one(p.switchesPerMinute)} window switches per minute` : null, p.driftPerHour !== null ? `${one(p.driftPerHour)} drifts per active hour` : null, p.offTaskShare !== null ? `${percent(p.offTaskShare)} of check-ins off the task` : null].filter(Boolean).join(' · ');
  const input = points.some(p => p.inputShare !== null);
  return <Plate fig={3} title="The shape of a session" hint={plural(section.n, 'session')} readout={last ? `shown to minute ${xMax}` : '—'}>
    {!section.eligible ? <Reason>{section.reason}</Reason> : !points.length ? <Reason>No {block}-minute block has at least {blockSessions} running sessions yet.</Reason> : <>
      {input && <Frame label={`Line chart of input share by 5-minute block of the session, up to minute ${xMax}.`} height={170} x={[0, xMax]} y={[0, 1]} xTicks={xTicks} yTicks={[0, 0.5, 1].map(v => ({ v, t: `${v * 100}%` }))} yTitle="Time with keyboard or mouse input">{(sx, sy, box) => <>
        {runs(points, p => p.inputShare !== null).map(run => run.length > 1 ? <path key={run[0].minute} d={linePath(run, p => sx(mid(p.minute)), p => sy(p.inputShare!))} className="chart-line" /> : <circle key={run[0].minute} cx={sx(mid(run[0].minute))} cy={sy(run[0].inputShare!)} r={4} className="chart-dot" />)}
        {points.map(p => <rect key={p.minute} x={sx(p.minute)} y={box.top} width={Math.max(8, sx(p.minute + block) - sx(p.minute))} height={box.bottom - box.top} className="chart-hit"><title>{pointTitle(p)}</title></rect>)}
      </>}</Frame>}
      <Columns label={`Column chart of drifts per active hour by 5-minute block of the session, up to minute ${xMax}.`} yTitle="Drifts per active hour" x={[0, xMax]} xTicks={xTicks} xTitle="Active minutes" height={150} rows={points.map(p => ({ x: mid(p.minute), value: p.driftPerHour, title: pointTitle(p) }))} />
      <p className="hint">{section.reason}</p>
      <Values head={['Minutes', 'Sessions', 'Input share', 'Switches per minute', 'Drifts per hour', 'Off-task check-ins']} rows={points.map(p => [`${p.minute}–${p.minute + block}`, p.sessions, percent(p.inputShare), p.switchesPerMinute === null ? '—' : one(p.switchesPerMinute), p.driftPerHour === null ? '—' : one(p.driftPerHour), percent(p.offTaskShare)])} />
    </>}
  </Plate>;
}

function StatesFigure({ section }: { section: StatesSection }) {
  const describe = (c: StatesSection['states'][number]['centroid']) => `${one(c.keysPerMinute)} keys, ${one(c.clicksPerMinute)} clicks and ${one(c.scrollsPerMinute)} scrolls per minute; input in ${percent(c.inputShare)} and pointer movement in ${percent(c.movementShare)} of the time${c.switchesPerMinute !== null ? `; ${one(c.switchesPerMinute)} window switches per minute` : ''}.`;
  const f = section.fragmentation;
  return <Plate fig={4} title="Interaction states" hint={`${section.n} activity minutes`} readout={section.eligible ? `${section.k} states` : '—'}>
    {!section.eligible ? <Reason>{section.reason}</Reason> : <>
      <ul className="state-legend">{section.states.map(s => <li key={s.id}><div><strong>{s.label}</strong><span className="tabular-nums">{percent(s.share)} of minutes</span></div><div className="share-track" aria-hidden="true"><span style={{ width: `${s.share * 100}%` }} /></div><p>{describe(s.centroid)}</p></li>)}</ul>
      {section.byMode.length > 0 && <><div className="insight-subhead"><h3>By activity mode</h3><span className="hint">Share of each mode's minutes</span></div>
        <div className="figure-values-scroll"><table className="insight-heat" aria-label="Share of interaction states by activity mode">
          <thead><tr><th scope="col">Mode</th>{section.states.map(s => <th key={s.id} scope="col">{s.label}</th>)}</tr></thead>
          <tbody>{section.byMode.map(row => <tr key={row.mode}><th scope="row">{row.mode}<small>{minutesLabel(row.minutes)}</small></th>{row.shares.map((share, i) => <td key={i} style={heat(share)} title={`${row.mode}: ${percent(share)} ${section.states[i]?.label ?? ''}`}>{percent(share)}</td>)}</tr>)}</tbody>
        </table></div></>}
      <p className="insight-callout">{f.perHourMedian === null ? 'State changes per hour need longer runs of activity minutes.' : `A median of ${one(f.perHourMedian)} state changes per active hour.`} {f.focusRho !== null ? `Spearman ρ with focus ${f.focusRho.toFixed(2)} across ${plural(f.pairs, 'rated session')}.` : ''}</p>
      <p className="hint">{f.reason} {section.reason}</p>
    </>}
  </Plate>;
}

function MeanRows({ rows, label }: { rows: Array<{ key: string; label: string; sessions: number; focusMean: number | null }>; label: string }) {
  const max = Math.max(1, ...rows.map(r => r.sessions));
  return <div className="mean-rows" role="list" aria-label={label}>{rows.map(r => <div key={r.key} role="listitem" className="mean-row">
    <span className="mean-row-label">{r.label}</span>
    <span className="share-track" aria-hidden="true"><span style={{ width: `${r.sessions / max * 100}%` }} /></span>
    <span className="mean-row-value tabular-nums">{plural(r.sessions, 'session')}<small>{r.focusMean === null ? 'focus —' : `focus ${one(r.focusMean)}`}</small></span>
  </div>)}</div>;
}
function DetractorsFigure({ section }: { section: FocusInsights['detractors'] }) {
  const top = section.reported.find(r => r.detractor !== 'none'), s = section.switching;
  return <Plate fig={5} title="What got in the way" hint={plural(section.n, 'session')} readout={top ? `most often: ${DETRACTOR_LABELS[top.detractor].toLowerCase()}` : '—'}>
    {!section.eligible ? <Reason>{section.reason}</Reason> : <div className="detractor-grid">
      <section><h3>What you reported</h3>{section.reported.length ? <MeanRows label="Reported detractors with mean focus" rows={section.reported.map(r => ({ key: r.detractor, label: DETRACTOR_LABELS[r.detractor], sessions: r.sessions, focusMean: r.focusMean }))} /> : <p className="hint">Answer "What got in the way most?" after a session to see this.</p>}</section>
      <section><h3>How demanding it felt</h3>{section.challenge.length ? <MeanRows label="Challenge level with mean focus" rows={section.challenge.map(r => ({ key: r.challenge, label: CHALLENGE_LABELS[r.challenge], sessions: r.sessions, focusMean: r.focusMean }))} /> : <p className="hint">Answer "How demanding was it?" after a session to see this.</p>}</section>
      <section><h3>Interruptions you marked</h3>{section.interruptions.length ? <ul className="plain-rows">{section.interruptions.map(i => <li key={i.category}><span>{i.category}</span><span className="tabular-nums">{i.count}{i.perHour !== null && <small>{one(i.perHour)} per active hour</small>}</span></li>)}</ul> : <p className="hint">No interruption markers in this range.</p>}</section>
      <section><h3>By time of day</h3><ul className="plain-rows">{section.byBand.map(b => <li key={b.band}><span>{b.band}</span><span className="tabular-nums">{b.driftPerHour === null ? '—' : `${one(b.driftPerHour)} drifts/h`}<small>{[b.switchesPerHour !== null ? `${whole(b.switchesPerHour)} switches/h` : null, b.offTaskShare !== null ? `${percent(b.offTaskShare)} off-task check-ins` : null].filter(Boolean).join(' · ') || 'no switch counts or check-ins'}</small></span></li>)}</ul></section>
      <p className="insight-callout detractor-wide">Window switching: {s.perHourMedian === null ? 'no switch counts yet.' : `a median of ${whole(s.perHourMedian)} switches per observed hour.`} {s.focusRho !== null ? `Spearman ρ with focus ${s.focusRho.toFixed(2)} across ${plural(s.pairs, 'rated session')}.` : s.reason}</p>
      <p className="hint detractor-wide">{section.reason}</p>
    </div>}
  </Plate>;
}

function ForestPlot({ features }: { features: ModelFeature[] }) {
  const [ref, width] = useWidth(240);
  // The bootstrap interval is a plain percentile interval: the estimate can lie outside it, so each mark is placed on its own.
  const values = features.flatMap(f => [f.effect.low, f.effect.high, f.effect.estimate, 0]), span = Math.max(0.2, ...values.map(Math.abs)) * 1.1;
  const plot = width < 440 ? Math.max(140, width - 104) : Math.max(140, Math.min(280, Math.round(width * 0.36))), sx = linear(-span, span, 8, plot - 8);
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
  return <div ref={ref} className="forest" role="list" aria-label="Associations with perceived focus, with 90% bootstrap intervals">
    {features.map(f => <div key={f.name} role="listitem" className="forest-row">
      <span className="forest-label">{f.label}</span>
      <svg width={plot} height={22} viewBox={`0 0 ${plot} 22`} role="img" aria-label={`${f.label}: ${signed(f.effect.estimate)} points, 90% interval ${signed(f.effect.low)} to ${signed(f.effect.high)}`}>
        <line x1={sx(0)} x2={sx(0)} y1={1} y2={21} className="chart-zero" />
        <line x1={sx(Math.min(f.effect.low, f.effect.high))} x2={sx(Math.max(f.effect.low, f.effect.high))} y1={11} y2={11} className="chart-whisker" />
        <circle cx={sx(f.effect.estimate)} cy={11} r={4} className="chart-dot"><title>{`${signed(f.effect.estimate)} points (90% interval ${signed(f.effect.low)} to ${signed(f.effect.high)})`}</title></circle>
      </svg>
      <span className="forest-value tabular-nums">{signed(f.effect.estimate)}<small>{signed(f.effect.low)} to {signed(f.effect.high)}</small></span>
    </div>)}
    <div className="forest-row forest-axis" aria-hidden="true"><span /><svg width={plot} height={18} viewBox={`0 0 ${plot} 18`}><text x={sx(-span)} y={13} className="chart-axis">lower focus</text><text x={sx(0)} y={13} textAnchor="middle" className="chart-axis">0</text><text x={sx(span)} y={13} textAnchor="end" className="chart-axis">higher</text></svg><span /></div>
  </div>;
}
function ModelCard({ section }: { section: FocusInsights['model'] }) {
  return <Card className="insight-model" title="What tends to go with higher focus" icon="patterns">
    {!section.eligible ? <Reason>{section.reason}</Reason> : <>
      <p className="insight-callout">Prediction error on your next rating: model {section.mae?.toFixed(2) ?? '—'}, your average rating {section.baselineMae?.toFixed(2) ?? '—'} points, over {plural(section.tested, 'later session')}.</p>
      {section.useful && section.features.length > 0 ? <><p className="hint">Each effect is the change in perceived focus, in points, for one standard deviation more of the feature, or against the named reference, with the other features held fixed. 90% intervals come from {INSIGHT_THRESHOLDS.model.bootstrap} resamples.</p><ForestPlot features={section.features} /></> : null}
      <p className="hint">{section.reason}</p>
    </>}
  </Card>;
}
function SuggestionsCard({ items, example, onTry }: { items: Recommendation[]; example: boolean; onTry: (text: string) => void }) {
  return <Card className="insight-suggestions" title="Suggestions to try" icon="spark">
    {!items.length ? <Reason>No suggestion meets its evidence rule in this range yet. Keep rating sessions and pressing I'm back when you notice a drift.</Reason>
      : <ol className="suggestion-list">{items.map(r => <li key={r.id}>
        <div className="suggestion-head"><strong>{r.title}</strong><Badge tone={r.strength === 'moderate' ? 'info' : 'neutral'}>{r.strength === 'moderate' ? 'Moderate evidence' : 'Tentative'}</Badge></div>
        <p>{r.detail}</p><p className="hint">{r.evidence}</p>
        <Button size="sm" variant="secondary" icon="calendar" disabled={example} title={example ? 'Return to your dataset to plan your week.' : undefined} onClick={() => onTry(`${r.title}. ${r.detail}`)}>Try next week</Button>
      </li>)}</ol>}
    {example && items.length > 0 && <p className="hint mt-3">Return to your dataset to add a suggestion to your weekly review.</p>}
  </Card>;
}

export default function InsightsPanel({ data, example, from, to, fieldId, goalId, onTry }: Props) {
  const signature = useMemo(() => insightsSignature(data.sessions), [data.sessions]);
  const local = useMemo(() => example ? focusInsights(data, data.activity ?? [], { from, to, fieldId: fieldId || undefined, goalId: goalId || undefined }) : null, [example, data, from, to, fieldId, goalId]);
  const [remote, setRemote] = useState<FocusInsights | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (example || !window.focusGuide) return;
    let current = true; setLoading(true); setError('');
    void window.focusGuide.command('insights.read', { from, to, fieldId, goalId }).then(result => {
      if (!current) return;
      if (result.ok) setRemote(result.value as FocusInsights); else setError(result.error);
    }).catch(e => { if (current) setError(String(e)); }).finally(() => { if (current) setLoading(false); });
    // Cleanup clears the busy state too, so a request dropped by a switch to the example never leaves the panel dimmed.
    return () => { current = false; setLoading(false); };
  }, [example, from, to, fieldId, goalId, signature, attempt]);
  const busy = loading && !example;
  const insights = example ? local : remote;
  if (!insights) return error ? <Card title="Insights could not be read" icon="shield"><p className="hint">{error}</p><Button className="mt-3" onClick={() => setAttempt(a => a + 1)}>Try again</Button></Card>
    : <Card className="insight-loading"><p className="m-0 flex items-center gap-2 text-caption text-ink-muted" role="status"><Icon name="spark" size={16} className="text-accent" />Reading your sessions for patterns…</p></Card>;
  return <div className={cn('insights', busy && 'is-refreshing')} aria-busy={busy || undefined}>
    {busy && <p className="sr-only" role="status">Updating insights…</p>}
    {error && <div className="mb-4 flex flex-wrap items-center gap-3" role="alert"><Reason>Showing the previous result. {error}</Reason><Button size="sm" onClick={() => setAttempt(a => a + 1)}>Try again</Button></div>}
    <QualityStrip quality={insights.quality} />
    <div className="insights-grid">
      <RhythmFigure section={insights.rhythm} />
      <AttentionSpanFigure section={insights.attentionSpan} />
      <ShapeFigure section={insights.sessionShape} />
      <StatesFigure section={insights.states} />
      <DetractorsFigure section={insights.detractors} />
      <ModelCard section={insights.model} />
      <SuggestionsCard items={insights.recommendations} example={example} onTry={onTry} />
    </div>
    <p className="footnote">{insights.note} This view covers finished, included sessions started from {insights.from} to {insights.to}.</p>
  </div>;
}
