import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Dataset, FocusSession, SessionEvent } from '../../shared/types';
import { CHALLENGE_LABELS, DETRACTOR_LABELS, INSIGHT_THRESHOLDS, focusInsights, plural, type CycleComparisonSection, type CycleMetric, type FocusInsights, type HourPoint, type Interval, type ModelFeature, type ModelView, type PhaseRate, type PreDrift, type Recommendation, type SessionShapeSection, type StatesSection, type SurvivalCurve } from '../../shared/focus-insights';
import { Badge, Button, Card, Plate, Segments, cn } from './ui';
import { Icon, minutesLabel } from './components';
import { activityModeLabel, interruptionLabel, weekdayLabel } from '../../shared/labels';
import { t } from '../../shared/i18n';

/* Insights tab of Patterns: renders `insights.read` (or the example dataset) as figures. Charts are inline SVG drawn at the
   measured width, so 12px text stays 12px. Data marks use the info blue; intervals are bands or whiskers; missing stays a gap. */
type Props = { data: Dataset; example: boolean; from: string; to: string; fieldId: string; goalId: string; onTry: (text: string) => void };
const one = (v: number) => v.toFixed(1), whole = (v: number) => String(Math.round(v)), percent = (v: number | null) => v === null ? '—' : `${Math.round(v * 100)}%`;
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;
/* A cheap signature of what insights depend on in finished sessions: it changes when a session finishes or is deleted,
   when its rating, energy, reflection answers, exclusion, area or goal change, or when a marker of one is added or removed.
   Activity rows are not in AppState, so deleting them does not change it. Used to decide when to read insights again. */
const SIGNATURE_MARKERS = new Set<SessionEvent['kind']>(['attention-return', 'interruption', 'probe']);
export function insightsSignature(sessions: FocusSession[], events: SessionEvent[]): string {
  let count = 0, hash = 2166136261;
  const mix = (value: string | number | boolean | null | undefined) => { const text = String(value ?? ''); for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0; hash = Math.imul(hash ^ 124, 16777619) >>> 0; };
  const completed = new Set<string>();
  for (const s of sessions) if (s.status === 'completed') { count++; completed.add(s.id); mix(s.id); mix(s.focus); mix(s.energy); mix(s.excluded); mix(s.detractor); mix(s.challenge); mix(s.fieldId); mix(s.goalId); }
  let markers = 0;
  for (const e of events) if (SIGNATURE_MARKERS.has(e.kind) && completed.has(e.sessionId)) markers++;
  return `${count}:${markers}:${hash}`;
}
export function StrengthBadge({ strength }: { strength: Recommendation['strength'] }) {
  return <Badge tone={strength === 'moderate' ? 'info' : 'neutral'}>{strength === 'moderate' ? t('Moderate evidence') : t('Tentative')}</Badge>;
}
const intervalText = (i: Interval, digits = 1) => t('{v1} (90% interval {v2} to {v3})', { v1: i.estimate.toFixed(digits), v2: i.low.toFixed(digits), v3: i.high.toFixed(digits) });
/* part: the whole text, the text without its interval, or the text without the leading "median" (for a table cell). */
function medianText(c: SurvivalCurve, ending = t('these sessions had no drift'), part: 'full' | 'short' | 'cell' = 'full'): string {
  if (!c.median) return part === 'cell' ? t('not reached: more than half of {ending}', { ending }) : t('median not reached: more than half of {ending}', { ending });
  const m = c.median, values = { whole: whole(m.estimate), whole2: whole(m.low), whole3: whole(m.high) };
  if (part === 'short') return t('median {whole} min', values);
  if (part === 'cell') return c.medianOpen ? t('{whole} min (90% interval: {whole2} min or longer)', values) : t('{whole} min (90% interval {whole2}–{whole3} min)', values);
  return c.medianOpen ? t('median {whole} min (90% interval: {whole2} min or longer)', values) : t('median {whole} min (90% interval {whole2}–{whole3} min)', values);
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

/* Dashed guides where the sustain phase and the fatigue phase begin, drawn on charts whose x axis is active minutes. */
function PhaseLines({ sx, box, max }: { sx: Scale; box: Box; max: number }) {
  const { warmUpMinutes, fatigueMinutes } = INSIGHT_THRESHOLDS.attentionSpan;
  return <>{([[warmUpMinutes, t('Sustain')], [fatigueMinutes, t('Fatigue')]] as const).filter(([minute]) => minute < max).map(([minute, name]) => <g key={minute} aria-hidden="true">
    <line x1={sx(minute)} x2={sx(minute)} y1={box.top} y2={box.bottom} className="chart-phase" /><text x={sx(minute) + 4} y={box.top + 10} className="chart-axis">{t('{name} from {minute}', { name, minute })}</text>
  </g>)}</>;
}
function Columns({ label, rows, x, xTicks, xTitle, yTitle, height = 128, format = rateFormat, phases = false }: {
  label: string; rows: Array<{ x: number; value: number | null; title: string }>; x: [number, number]; xTicks: Array<{ v: number; t: string }>; xTitle?: string; yTitle: string; height?: number; format?: (v: number) => string; phases?: boolean;
}) {
  const max = niceMax(Math.max(0, ...rows.map(r => r.value ?? 0)));
  return <Frame label={label} height={height} x={x} y={[0, max]} xTicks={xTicks} yTicks={ticksTo(max, format)} xTitle={xTitle} yTitle={yTitle}>{(sx, sy, box) => {
    const step = rows.length > 1 ? Math.abs(sx(rows[1].x) - sx(rows[0].x)) : 20, width = Math.max(3, Math.min(16, step - 2));
    return <>{rows.map(r => <g key={r.x}>
      {r.value !== null && r.value > 0 && <path d={columnPath(sx(r.x) - width / 2, sy(r.value), width, box.bottom)} className="chart-column" />}
      <rect x={sx(r.x) - Math.max(step, 12) / 2} y={box.top} width={Math.max(step, 12)} height={box.bottom - box.top} className="chart-hit"><title>{r.title}</title></rect>
    </g>)}{phases && <PhaseLines sx={sx} box={box} max={x[1]} />}</>;
  }}</Frame>;
}

/* A table twin for every figure: the same values without the chart. */
function Values({ head, rows }: { head: string[]; rows: Array<Array<ReactNode>> }) {
  if (!rows.length) return null;
  return <details className="figure-values"><summary>{t('Show values')}</summary><div className="figure-values-scroll"><table><thead><tr>{head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j ? <td key={j}>{cell}</td> : <th key={j} scope="row">{cell}</th>)}</tr>)}</tbody></table></div></details>;
}
function Reason({ children }: { children: ReactNode }) { return <p className="insight-reason"><Icon name="spark" size={15} className="shrink-0 text-ink-muted" /><span>{children}</span></p>; }
const heat = (share: number | null): CSSProperties | undefined => share === null ? undefined : { '--heat': Math.max(0.04, Math.min(1, share)) } as CSSProperties;

function QualityStrip({ quality }: { quality: FocusInsights['quality'] }) {
  const q = quality, items: Array<{ label: string; value: string; detail: string }> = [
    { label: t('Sessions'), value: String(q.sessions), detail: t('{minutesLabel} active over {plural}', { minutesLabel: minutesLabel(q.activeMinutes), plural: plural(q.spanDays, 'day') }) },
    { label: t('Rated'), value: percent(q.ratedShare), detail: q.reflectionShare === null ? t('No sessions yet') : t('{percent} with a reflection answer', { percent: percent(q.reflectionShare) }) },
    { label: t('Activity coverage'), value: percent(q.activityCoverage), detail: q.activityCoverage === null ? t('Collection off or no recent sessions') : t('Observed share of active time') },
    { label: t('Drift markers'), value: String(q.markerSessions), detail: t('of {plural} have I\'m back or an interruption', { plural: plural(q.sessions, 'session') }) },
    { label: t('Check-ins answered'), value: String(q.probeAnswered), detail: q.probeSessions ? t('{probeMissed} missed, in {plural}', { probeMissed: q.probeMissed, plural: plural(q.probeSessions, 'session') }) : t('Attention check-ins are off or not seen yet') }
  ];
  return <Card className="insight-quality" title={t('The data behind these insights')} icon="shield">
    <dl className="insight-quality-list">{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd><strong>{item.value}</strong><span>{item.detail}</span></dd></div>)}</dl>
    {q.notes.length > 0 && <ul className="insight-notes">{q.notes.map(note => <li key={note}>{note}</li>)}</ul>}
  </Card>;
}

function RhythmChart({ hours }: { hours: HourPoint[] }) {
  const shown = hours.filter(h => h.focus), peak = shown.reduce<HourPoint | null>((best, h) => !best || h.focus!.estimate > best.focus!.estimate ? h : best, null);
  const label = shown.length ? t('Line chart of perceived focus by start hour, with a 90% interval band, for {plural}. Highest around {hourLabel}: {intervalText}.', { plural: plural(shown.length, 'hour'), hourLabel: hourLabel(peak!.hour), intervalText: intervalText(peak!.focus!) }) : t('No start hour has enough nearby rated sessions yet.');
  const hourTitle = (h: HourPoint) => [hourLabel(h.hour), h.focus ? t('focus {intervalText}', { intervalText: intervalText(h.focus) }) : t('focus not shown (too few nearby sessions)'), h.driftPerHour !== null ? t('{one} drifts per active hour', { one: one(h.driftPerHour) }) : null, h.switchesPerHour !== null ? t('{whole} window switches per hour', { whole: whole(h.switchesPerHour) }) : null, h.offTaskShare !== null ? t('{percent} of check-ins off the task', { percent: percent(h.offTaskShare) }) : null].filter(Boolean).join(' · ');
  const xTicks = [0, 6, 12, 18, 23].map(v => ({ v, t: String(v).padStart(2, '0') }));
  return <Frame label={label} height={210} x={[0, 23]} y={[1, 5]} xTicks={xTicks} yTicks={[1, 2, 3, 4, 5].map(v => ({ v, t: String(v) }))} xTitle={t('Start hour')} yTitle={t('Perceived focus (1–5)')}>{(sx, sy, box) => {
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
  return <Plate fig={1} className="insight-wide" title={t('When you focus best')} hint={`${plural(section.n, 'rated session')}`} readout={peak ? t('highest near {hourLabel} · {one}', { hourLabel: hourLabel(peak.hour), one: one(peak.focus!.estimate) }) : '—'}>
    {!section.eligible ? <Reason>{section.reason}</Reason> : <>
      <RhythmChart hours={section.hours} />
      {drift && <Columns label={t('Column chart of drifts per active hour by start hour. {length} hours shown.', { length: section.hours.filter(h => h.driftPerHour !== null).length })} yTitle={t('Drifts per active hour')} x={[0, 23]} xTicks={[0, 6, 12, 18, 23].map(v => ({ v, t: String(v).padStart(2, '0') }))} xTitle={t('Start hour')}
        rows={section.hours.map(h => ({ x: h.hour, value: h.driftPerHour, title: h.driftPerHour === null ? t('{hourLabel} · not enough sessions recorded with I\'m back', { hourLabel: hourLabel(h.hour) }) : t('{hourLabel} · {one} drifts per active hour', { hourLabel: hourLabel(h.hour), one: one(h.driftPerHour) }) }))} />}
      <div className="insight-subhead"><h3>{t('Weekday and time of day')}</h3><span className="hint">{t('Mean focus where a cell has at least {cellSessions} sessions', { cellSessions: INSIGHT_THRESHOLDS.rhythm.cellSessions })}</span></div>
      <div className="figure-values-scroll"><table className="insight-heat" aria-label={t('Mean perceived focus by weekday and time of day')}>
        <thead><tr><th scope="col"><span className="sr-only">{t('Weekday')}</span></th>{bands.map(b => <th key={b} scope="col">{b.split(' · ')[0]}<small>{b.split(' · ')[1]}</small></th>)}</tr></thead>
        <tbody>{weekdays.map(day => <tr key={day}><th scope="row">{weekdayLabel(day)}</th>{bands.map(band => { const cell = section.grid.find(c => c.weekday === day && c.band === band)!; return <td key={band} style={heat(cell.focusMean === null ? null : (cell.focusMean - 1) / 4)} className={cell.focusMean === null ? 'empty' : undefined} title={`${weekdayLabel(day)}, ${band}: ${plural(cell.sessions, 'session')}${cell.focusMean !== null ? t(', mean focus {one}', { one: one(cell.focusMean) }) : ''}${cell.driftPerHour !== null ? t(', {one} drifts per active hour', { one: one(cell.driftPerHour) }) : ''}`}>{cell.focusMean === null ? '—' : one(cell.focusMean)}</td>; })}</tr>)}</tbody>
      </table></div>
      <p className="hint mt-3">{section.reason}</p>
      <Values head={[t('Start hour'), t('Focus'), t('90% interval'), t('Drifts per hour'), t('Off-task check-ins')]} rows={section.hours.filter(h => h.focus || h.driftPerHour !== null || h.offTaskShare !== null).map(h => [hourLabel(h.hour), h.focus ? one(h.focus.estimate) : '—', h.focus ? `${one(h.focus.low)}–${one(h.focus.high)}` : '—', h.driftPerHour === null ? '—' : one(h.driftPerHour), percent(h.offTaskShare)])} />
    </>}
  </Plate>;
}

function SurvivalChart({ curve, reference, height = 220, label, yTitle = t('Still without a drift') }: { curve: SurvivalCurve; reference?: SurvivalCurve | null; height?: number; label: string; yTitle?: string }) {
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
  return <Frame label={label} height={height} x={[0, xMax]} y={[0, 1]} xTicks={xTicks} yTicks={[0, 0.5, 1].map(v => ({ v, t: `${v * 100}%` }))} xTitle={t('Active minutes')} yTitle={yTitle}>{(sx, sy, box) => <>
    <path d={stepBand(sx, sy)} className="chart-band" />
    {ref && <path d={step(ref, p => p.survival, sx, sy)} className="chart-reference" />}
    <path d={step(points, p => p.survival, sx, sy)} className="chart-line" />
    {curve.median && <><line x1={sx(curve.median.estimate)} x2={sx(curve.median.estimate)} y1={sy(0.5)} y2={box.bottom} className="chart-marker" /><circle cx={sx(curve.median.estimate)} cy={sy(0.5)} r={4} className="chart-dot" /></>}
    {points.map((p, i) => { const next = points[i + 1]?.minute ?? xMax, x0 = sx(p.minute), w = Math.max(6, sx(next) - x0); return <rect key={i} x={x0} y={box.top} width={w} height={box.bottom - box.top} className="chart-hit"><title>{t('From minute {v1}: {percent} {v3} (90% interval {percent2}–{percent3}), {atRisk} sessions still running', { v1: Math.round(p.minute), percent: percent(p.survival), v3: yTitle.toLowerCase(), percent2: percent(p.low), percent3: percent(p.high), atRisk: p.atRisk })}</title></rect>; })}
  </>}</Frame>;
}
function AttentionSpanFigure({ section }: { section: FocusInsights['attentionSpan'] }) {
  const [group, setGroup] = useState<'all' | 'band' | 'mode'>('all');
  // A filter change can empty the chosen grouping; the figure then falls back to all sessions.
  const shown = group === 'band' && section.byBand.length ? 'band' : group === 'mode' && section.byMode.length ? 'mode' : 'all';
  const overall = section.overall, groups = shown === 'band' ? section.byBand : shown === 'mode' ? section.byMode : [];
  return <Plate fig={2} title={t('How long your attention lasts')} hint={overall ? t('{plural} · {events} with a drift', { plural: plural(overall.sessions, 'session'), events: overall.events }) : plural(section.n, 'session')} readout={overall ? medianText(overall, undefined, 'short') : '—'}>
    {!section.eligible || !overall ? <Reason>{section.reason}</Reason> : <>
      {(section.byBand.length > 0 || section.byMode.length > 0) && <Segments className="segmented insight-segments" label={t('Group the curve')} value={shown} onChange={v => { if (v) setGroup(v as typeof group); }} options={[{ value: 'all', label: t('All sessions') }, ...(section.byBand.length ? [{ value: 'band', label: t('By time of day') }] : []), ...(section.byMode.length ? [{ value: 'mode', label: t('By mode') }] : [])]} />}
      {shown === 'all' ? <SurvivalChart curve={overall} label={t('Step chart: share of sessions still without a drift by active minute, with a 90% band. {medianText}.', { medianText: medianText(overall) })} />
        : <div className="survival-multiples">{groups.map(c => <figure key={c.label}><figcaption><strong>{c.label}</strong><span>{plural(c.sessions, 'session')} · {medianText(c, undefined, 'short')}</span></figcaption><SurvivalChart curve={c} reference={overall} height={170} label={t('{label}: step chart of sessions still without a drift, with a 90% band; the grey line shows all sessions. {medianText}.', { label: c.label, medianText: medianText(c) })} /></figure>)}</div>}
      {shown !== 'all' && <p className="hint"><span className="legend-key line" aria-hidden="true" />{t('This group')}{' '}<span className="legend-key reference" aria-hidden="true" />{t('All sessions')}</p>}
      <p className="insight-callout">{t('All sessions: {medianText}.', { medianText: medianText(overall) })}</p>
      <div className="insight-subhead"><h3>{t('Warm-up, sustain and fatigue')}</h3><span className="hint">{t('Drifts per active hour in each phase of a session')}</span></div>
      <div className="figure-values-scroll"><table className="insight-heat phase-table" aria-label={t('Drifts by phase of the session')}>
        <thead><tr><th scope="col">{t('Phase')}</th><th scope="col">{t('Sessions')}</th><th scope="col">{t('Drifts per hour')}</th><th scope="col">{t('Off-task check-ins')}</th></tr></thead>
        <tbody>{section.phases.map((p: PhaseRate) => <tr key={p.id}><th scope="row">{p.label}<small>{p.toMinute === null ? `${p.fromMinute}+ min` : `${p.fromMinute}–${p.toMinute} min`}</small></th><td>{p.sessions}</td><td title={t('{drifts} drifts in {one} active minutes', { drifts: p.drifts, one: one(p.exposureHours * 60) })}>{p.driftPerHour === null ? '—' : one(p.driftPerHour)}</td><td>{percent(p.offTaskShare)}</td></tr>)}</tbody>
      </table></div>
      {section.warmUpFriction && <p className="insight-callout">{t('Drifts cluster in the first {warmUpMinutes} minutes, so the median above mostly reflects getting started.{v2}', { warmUpMinutes: INSIGHT_THRESHOLDS.attentionSpan.warmUpMinutes, v2: section.afterWarmUp?.median ? t(' Counted after the warm-up, the median is {whole} min.', { whole: whole(section.afterWarmUp.median.estimate) }) : '' })}</p>}
      {section.recovery && <>
        <div className="insight-subhead"><h3>{t('After you press I\'m back')}</h3><span className="hint">{t('Active time until the next drift, over all returns')}</span></div>
        <SurvivalChart curve={section.recovery} yTitle={t('Still without another drift')} height={190} label={t('Step chart: share of returns still without another drift by active minute, with a 90% band. {medianText}.', { medianText: medianText(section.recovery, t('these returns were followed by another drift')) })} />
        <p className="insight-callout">{t('After a return: {medianText}.', { medianText: medianText(section.recovery, t('these returns were followed by another drift')) })}</p>
      </>}
      <p className="hint">{section.reason}</p>
      <Values head={[t('Curve'), t('Sessions'), t('Drifts'), t('Median')]} rows={[overall, ...(section.afterWarmUp ? [section.afterWarmUp] : []), ...(section.recovery ? [section.recovery] : []), ...section.byBand, ...section.byMode].map(c => [c.label, c.sessions, c.events, medianText(c, undefined, 'cell')])} />
    </>}
  </Plate>;
}

const shapeTitle = (p: SessionShapeSection['points'][number]) => { const block = INSIGHT_THRESHOLDS.sessionShape.blockMinutes; return [t('Minutes {minute}–{v2}', { minute: p.minute, v2: p.minute + block }), `${plural(p.sessions, 'session')}`, p.inputShare !== null ? t('input in {percent} of observed time', { percent: percent(p.inputShare) }) : null, p.switchesPerMinute !== null ? t('{one} window switches per minute', { one: one(p.switchesPerMinute) }) : null, p.driftPerHour !== null ? t('{one} drifts per active hour', { one: one(p.driftPerHour) }) : null, p.offTaskShare !== null ? t('{percent} of check-ins off the task', { percent: percent(p.offTaskShare) }) : null].filter(Boolean).join(' · '); };
function ShapeLine({ label, yTitle, points, pick, max, format, xMax, xTicks, height = 150 }: { label: string; yTitle: string; points: SessionShapeSection['points']; pick: (p: SessionShapeSection['points'][number]) => number | null; max: number; format: (v: number) => string; xMax: number; xTicks: Array<{ v: number; t: string }>; height?: number }) {
  const block = INSIGHT_THRESHOLDS.sessionShape.blockMinutes, mid = (m: number) => m + block / 2;
  return <Frame label={label} height={height} x={[0, xMax]} y={[0, max]} xTicks={xTicks} yTicks={ticksTo(max, format)} yTitle={yTitle}>{(sx, sy, box) => <>
    {runs(points, p => pick(p) !== null).map(run => run.length > 1 ? <path key={run[0].minute} d={linePath(run, p => sx(mid(p.minute)), p => sy(pick(p)!))} className="chart-line" /> : <circle key={run[0].minute} cx={sx(mid(run[0].minute))} cy={sy(pick(run[0])!)} r={4} className="chart-dot" />)}
    <PhaseLines sx={sx} box={box} max={xMax} />
    {points.map(p => <rect key={p.minute} x={sx(p.minute)} y={box.top} width={Math.max(8, sx(p.minute + block) - sx(p.minute))} height={box.bottom - box.top} className="chart-hit"><title>{shapeTitle(p)}</title></rect>)}
  </>}</Frame>;
}
/* The minutes just before drifts against the other minutes of the same sessions. */
function PreDriftNote({ pre }: { pre: PreDrift }) {
  if (!pre.eligible) return <Reason>{pre.reason}</Reason>;
  const pair = (a: number | null, b: number | null, format: (v: number) => string) => a === null || b === null ? null : t('{format} against {format2}', { format: format(a), format2: format(b) });
  const switches = pair(pre.preSwitchesPerMinute, pre.baselineSwitchesPerMinute, one), input = pair(pre.preInputShare, pre.baselineInputShare, v => percent(v));
  return <><p className="insight-callout">{t('In the {windowMinutes} minutes before a drift:{v2}{v3}{v4}.', { windowMinutes: pre.windowMinutes, v2: switches ? t(' {switches} window switches per minute', { switches }) : '', v3: switches && input ? ';' : '', v4: input ? t(' input in {input} of the time', { input }) : '' })}</p>
    <p className="hint">{t('{reason} The marker is the moment you pressed I\'m back, so these minutes include the time you were away. An association in your own records, not a cause.', { reason: pre.reason })}</p></>;
}
function ShapeFigure({ section }: { section: SessionShapeSection }) {
  const { blockMinutes: block, blockSessions, maxMinutes } = INSIGHT_THRESHOLDS.sessionShape, { warmUpMinutes, fatigueMinutes } = INSIGHT_THRESHOLDS.attentionSpan, points = section.points, last = points[points.length - 1], xMax = last ? last.minute + block : maxMinutes;
  const mid = (m: number) => m + block / 2, xTicks = [0, Math.round(xMax / 2 / block) * block, xMax].map(v => ({ v, t: String(v) }));
  const input = points.some(p => p.inputShare !== null), switches = points.some(p => p.switchesPerMinute !== null), offTask = points.some(p => p.offTaskShare !== null);
  const share = (v: number) => `${v * 100}%`, switchMax = niceMax(Math.max(0, ...points.map(p => p.switchesPerMinute ?? 0)));
  return <Plate fig={3} title={t('The shape of a session')} hint={plural(section.n, 'session')} readout={last ? t('shown to minute {xMax}', { xMax }) : '—'}>
    {!section.eligible ? <Reason>{section.reason}</Reason> : !points.length ? <Reason>{t('No {block}-minute block has at least {blockSessions} running sessions yet.', { block, blockSessions })}</Reason> : <>
      {input && <ShapeLine label={t('Line chart of input share by {block}-minute block of the session, up to minute {xMax}.', { block, xMax })} height={170} points={points} pick={p => p.inputShare} max={1} format={share} xMax={xMax} xTicks={xTicks} yTitle={t('Time with keyboard or mouse input')} />}
      {switches && <ShapeLine label={t('Line chart of window switches per minute by {block}-minute block of the session, up to minute {xMax}.', { block, xMax })} points={points} pick={p => p.switchesPerMinute} max={switchMax} format={v => v >= 10 ? whole(v) : String(Math.round(v * 100) / 100)} xMax={xMax} xTicks={xTicks} yTitle={t('Window switches per minute')} />}
      {offTask && <ShapeLine label={t('Line chart of the share of attention check-ins answered off the task by {block}-minute block of the session, up to minute {xMax}.', { block, xMax })} points={points} pick={p => p.offTaskShare} max={1} format={share} xMax={xMax} xTicks={xTicks} yTitle={t('Check-ins answered off the task')} />}
      <Columns label={t('Column chart of drifts per active hour by {block}-minute block of the session, up to minute {xMax}.', { block, xMax })} yTitle={t('Drifts per active hour')} x={[0, xMax]} xTicks={xTicks} xTitle={t('Active minutes')} height={150} phases rows={points.map(p => ({ x: mid(p.minute), value: p.driftPerHour, title: shapeTitle(p) }))} />
      <p className="hint">{t('Dashed lines: the warm-up ends at minute {warmUpMinutes} and fatigue begins at minute {fatigueMinutes}.', { warmUpMinutes, fatigueMinutes })}</p>
      <div className="insight-subhead"><h3>{t('Just before a drift')}</h3><span className="hint">{t('Window switches and input in the {windowMinutes} minutes before', { windowMinutes: section.preDrift.windowMinutes })}</span></div>
      <PreDriftNote pre={section.preDrift} />
      <p className="hint">{section.reason}</p>
      <Values head={[t('Minutes'), t('Sessions'), t('Input share'), t('Switches per minute'), t('Drifts per hour'), t('Off-task check-ins')]} rows={points.map(p => [`${p.minute}–${p.minute + block}`, p.sessions, percent(p.inputShare), p.switchesPerMinute === null ? '—' : one(p.switchesPerMinute), p.driftPerHour === null ? '—' : one(p.driftPerHour), percent(p.offTaskShare)])} />
    </>}
  </Plate>;
}

function StatesFigure({ section }: { section: StatesSection }) {
  const describe = (c: StatesSection['states'][number]['centroid']) => t('{one} keys, {one2} clicks and {one3} scrolls per minute; input in {percent} and pointer movement in {percent2} of the time{v6}.', { one: one(c.keysPerMinute), one2: one(c.clicksPerMinute), one3: one(c.scrollsPerMinute), percent: percent(c.inputShare), percent2: percent(c.movementShare), v6: c.switchesPerMinute !== null ? t('; {one} window switches per minute', { one: one(c.switchesPerMinute) }) : '' });
  const f = section.fragmentation, rated = section.states.filter(s => s.driftPerHour !== null);
  const busiest = rated.length > 1 ? rated.reduce((a, b) => b.driftPerHour! > a.driftPerHour! ? b : a) : null, calmest = rated.length > 1 ? rated.reduce((a, b) => b.driftPerHour! < a.driftPerHour! ? b : a) : null;
  return <Plate fig={4} title={t('Interaction states')} hint={t('{n} activity minutes', { n: section.n })} readout={section.eligible ? t('{k} states', { k: section.k }) : '—'}>
    {!section.eligible ? <Reason>{section.reason}</Reason> : <>
      <ul className="state-legend">{section.states.map(s => <li key={s.id}><div><strong>{s.label}{s.id === busiest?.id && <Badge tone="info" className="ml-2">{t('Most drifts per hour')}</Badge>}</strong><span className="tabular-nums">{t('{percent} of minutes{v2}', { percent: percent(s.share), v2: s.driftPerHour !== null ? t(' · {one} drifts per hour', { one: one(s.driftPerHour) }) : '' })}</span></div><div className="share-track" aria-hidden="true"><span style={{ width: `${s.share * 100}%` }} /></div><p>{describe(s.centroid)}</p></li>)}</ul>
      {section.byMode.length > 0 && <><div className="insight-subhead"><h3>{t('By activity mode')}</h3><span className="hint">{t('Share of each mode\'s minutes')}</span></div>
        <div className="figure-values-scroll"><table className="insight-heat" aria-label={t('Share of interaction states by activity mode')}>
          <thead><tr><th scope="col">{t('Mode')}</th>{section.states.map(s => <th key={s.id} scope="col">{s.label}</th>)}</tr></thead>
          <tbody>{section.byMode.map(row => <tr key={row.mode}><th scope="row">{activityModeLabel(row.mode)}<small>{minutesLabel(row.minutes)}</small></th>{row.shares.map((share, i) => <td key={i} style={heat(share)} title={`${activityModeLabel(row.mode)}: ${percent(share)} ${section.states[i]?.label ?? ''}`}>{percent(share)}</td>)}</tr>)}</tbody>
        </table></div></>}
      {busiest && calmest && busiest.id !== calmest.id && <p className="insight-callout">{t('{busiest} minutes hold the most drifts per hour ({busiestRate}), {calmest} the fewest ({calmestRate}). A drift is counted in the minute you pressed I\'m back or marked an interruption.', { busiest: busiest.label, busiestRate: one(busiest.driftPerHour!), calmest: calmest.label, calmestRate: one(calmest.driftPerHour!) })}</p>}
      <p className="insight-callout">{f.perHourMedian === null ? t('State changes per hour need longer runs of activity minutes.') : t('A median of {one} state changes per active hour.', { one: one(f.perHourMedian) })} {f.focusRho !== null ? t('Spearman ρ with focus {v1} across {plural}.', { v1: f.focusRho.toFixed(2), plural: plural(f.pairs, 'rated session') }) : ''}</p>
      <p className="hint">{f.reason} {section.reason}</p>
    </>}
  </Plate>;
}

function MeanRows({ rows, label }: { rows: Array<{ key: string; label: string; sessions: number; focusMean: number | null }>; label: string }) {
  const max = Math.max(1, ...rows.map(r => r.sessions));
  return <div className="mean-rows" role="list" aria-label={label}>{rows.map(r => <div key={r.key} role="listitem" className="mean-row">
    <span className="mean-row-label">{r.label}</span>
    <span className="share-track" aria-hidden="true"><span style={{ width: `${r.sessions / max * 100}%` }} /></span>
    <span className="mean-row-value tabular-nums">{plural(r.sessions, 'session')}<small>{r.focusMean === null ? t('focus —') : t('focus {one}', { one: one(r.focusMean) })}</small></span>
  </div>)}</div>;
}
function DetractorsFigure({ section }: { section: FocusInsights['detractors'] }) {
  const top = section.reported.find(r => r.detractor !== 'none'), s = section.switching;
  return <Plate fig={5} title={t('What got in the way')} hint={plural(section.n, 'session')} readout={top ? t('most often: {v1}', { v1: DETRACTOR_LABELS[top.detractor].toLowerCase() }) : '—'}>
    {!section.eligible ? <Reason>{section.reason}</Reason> : <div className="detractor-grid">
      <section><h3>{t('What you reported')}</h3>{section.reported.length ? <MeanRows label={t('Reported detractors with mean focus')} rows={section.reported.map(r => ({ key: r.detractor, label: DETRACTOR_LABELS[r.detractor], sessions: r.sessions, focusMean: r.focusMean }))} /> : <p className="hint">{t('Answer "What got in the way most?" after a session to see this.')}</p>}</section>
      <section><h3>{t('How demanding it felt')}</h3>{section.challenge.length ? <MeanRows label={t('Challenge level with mean focus')} rows={section.challenge.map(r => ({ key: r.challenge, label: CHALLENGE_LABELS[r.challenge], sessions: r.sessions, focusMean: r.focusMean }))} /> : <p className="hint">{t('Answer "How demanding was it?" after a session to see this.')}</p>}</section>
      <section><h3>{t('Interruptions you marked')}</h3>{section.interruptions.length ? <ul className="plain-rows">{section.interruptions.map(i => <li key={i.category}><span>{interruptionLabel(i.category)}</span><span className="tabular-nums">{i.count}{i.perHour !== null && <small>{t('{one} per active hour', { one: one(i.perHour) })}</small>}</span></li>)}</ul> : <p className="hint">{t('No interruption markers in this range.')}</p>}</section>
      <section><h3>{t('By time of day')}</h3><ul className="plain-rows">{section.byBand.map(b => <li key={b.band}><span>{b.band}</span><span className="tabular-nums">{b.driftPerHour === null ? '—' : t('{one} drifts/h', { one: one(b.driftPerHour) })}<small>{[b.switchesPerHour !== null ? t('{whole} switches/h', { whole: whole(b.switchesPerHour) }) : null, b.offTaskShare !== null ? t('{percent} off-task check-ins', { percent: percent(b.offTaskShare) }) : null].filter(Boolean).join(' · ') || t('no switch counts or check-ins')}</small></span></li>)}</ul></section>
      <p className="insight-callout detractor-wide">{t('Window switching: {v1} {v2}', { v1: s.perHourMedian === null ? t('no switch counts yet.') : t('a median of {whole} switches per observed hour.', { whole: whole(s.perHourMedian) }), v2: s.focusRho !== null ? t('Spearman ρ with focus {v1} across {plural}.', { v1: s.focusRho.toFixed(2), plural: plural(s.pairs, 'rated session') }) : s.reason })}</p>
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
  return <div ref={ref} className="forest" role="list" aria-label={t('Associations with perceived focus, with 90% bootstrap intervals')}>
    {features.map(f => <div key={f.name} role="listitem" className="forest-row">
      <span className="forest-label">{f.label}{f.selectionShare !== null && <small>{t('kept by the lasso in {percent} of the test windows', { percent: percent(f.selectionShare) })}</small>}</span>
      <svg width={plot} height={22} viewBox={`0 0 ${plot} 22`} role="img" aria-label={t('{label}: {signed} points, 90% interval {signed2} to {signed3}', { label: f.label, signed: signed(f.effect.estimate), signed2: signed(f.effect.low), signed3: signed(f.effect.high) })}>
        <line x1={sx(0)} x2={sx(0)} y1={1} y2={21} className="chart-zero" />
        <line x1={sx(Math.min(f.effect.low, f.effect.high))} x2={sx(Math.max(f.effect.low, f.effect.high))} y1={11} y2={11} className="chart-whisker" />
        <circle cx={sx(f.effect.estimate)} cy={11} r={4} className="chart-dot"><title>{t('{signed} points (90% interval {signed2} to {signed3})', { signed: signed(f.effect.estimate), signed2: signed(f.effect.low), signed3: signed(f.effect.high) })}</title></circle>
      </svg>
      <span className="forest-value tabular-nums">{signed(f.effect.estimate)}<small>{t('{signed} to {signed2}', { signed: signed(f.effect.low), signed2: signed(f.effect.high) })}</small></span>
    </div>)}
    <div className="forest-row forest-axis" aria-hidden="true"><span /><svg width={plot} height={18} viewBox={`0 0 ${plot} 18`}><text x={sx(-span)} y={13} className="chart-axis">{t('lower focus')}</text><text x={sx(0)} y={13} textAnchor="middle" className="chart-axis">0</text><text x={sx(span)} y={13} textAnchor="end" className="chart-axis">{t('higher')}</text></svg><span /></div>
  </div>;
}
const signedText = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
const vifText = (v: number | null) => v === null ? '—' : v > 99 ? '>99' : one(v);
function ModelBody({ view, predictive }: { view: ModelView; predictive: boolean }) {
  if (!view.eligible) return <Reason>{view.reason}</Reason>;
  const kept = view.features.filter(f => f.selected), d = view.diagnostics;
  return <>
    <p className="insight-callout">{t('{v1}: model {v2}, your average rating {v3} points, over {plural}.', { v1: predictive ? t('Prediction error on your next rating') : t('Error when the rating is predicted from these facts'), v2: view.mae?.toFixed(2) ?? '—', v3: view.baselineMae?.toFixed(2) ?? '—', plural: plural(view.tested, 'later session') })}</p>
    {view.estimator && <p className="hint"><strong>{view.candidates.find(c => c.id === view.estimator)?.label}</strong> · {view.decision}</p>}
    {d && d.pairs.length > 0 && <p className="hint">{t('Features that overlap: {v1}{v2}. Overlapping features share their effect, so read each one with care.', { v1: d.pairs.slice(0, 3).map(p => t('{a} and {b} (r {v3})', { a: p.a, b: p.b, v3: p.r.toFixed(2) })).join(', '), v2: d.maxVif !== null ? t('; largest variance inflation factor {vifText}', { vifText: vifText(d.maxVif) }) : '' })}</p>}
    {view.useful && view.features.length > 0 ? <>
      <p className="hint">{t('Each effect is the change in perceived focus, in points, for one standard deviation more of the feature, or against the named reference, with the other features held fixed. 90% intervals come from {bootstrap} resamples. Only features the lasso keeps are drawn.', { bootstrap: INSIGHT_THRESHOLDS.model.bootstrap })}</p>
      {kept.length ? <ForestPlot features={kept} /> : <p className="hint">{t('The lasso kept no feature: no clear association was found.')}</p>}
      {view.zeroed.length > 0 && <div className="insight-zeroed"><h3>{t('No clear association found (zeroed by Lasso)')}</h3><ul>{view.zeroed.map(label => <li key={label}>{label}</li>)}</ul></div>}
      <Values head={[t('Feature'), t('Effect'), t('90% interval'), t('Kept by the lasso'), t('Test windows'), t('Resamples'), t('Variance inflation')]} rows={view.features.map(f => [f.label, signedText(f.effect.estimate), t('{signedText} to {signedText2}', { signedText: signedText(f.effect.low), signedText2: signedText(f.effect.high) }), f.selected ? t('yes') : t('no'), percent(f.selectionShare), percent(f.bootstrapShare), vifText(f.vif)])} />
    </> : null}
    <p className="hint">{view.reason}</p>
    {view.candidates.length > 0 && <Values head={[t('Estimator'), t('Error (points)'), t('Selection overlap between windows')]} rows={view.candidates.map(c => [c.label + (c.id === view.estimator ? t(' (used)') : ''), c.mae.toFixed(2), c.stability === null ? t('keeps every feature') : percent(c.stability)])} />}
  </>;
}
function ModelCard({ section }: { section: FocusInsights['model'] }) {
  const [view, setView] = useState<'before' | 'during'>('before'), shown = view === 'during' ? section.sessionFactors : section;
  return <Card className="insight-model" title={t('What tends to go with higher focus')} icon="patterns">
    <Segments className="segmented insight-segments" label={t('Which facts to compare')} value={view} onChange={v => { if (v) setView(v as typeof view); }} options={[{ value: 'before', label: t('Known before you start') }, { value: 'during', label: t('During and after the session') }]} />
    <ModelBody key={view} view={shown} predictive={view === 'before'} />
  </Card>;
}
function SuggestionsCard({ items, example, onTry }: { items: Recommendation[]; example: boolean; onTry: (text: string) => void }) {
  return <Card className="insight-suggestions" title={t('Suggestions to try')} icon="spark">
    {!items.length ? <Reason>{t('No suggestion meets its evidence rule in this range yet. Keep rating sessions and pressing I\'m back when you notice a drift.')}</Reason>
      : <ol className="suggestion-list">{items.map(r => <li key={r.id}>
        <div className="suggestion-head"><strong>{r.title}</strong><StrengthBadge strength={r.strength} /></div>
        <p>{r.detail}</p><p className="hint">{r.evidence}</p>
        <Button size="sm" variant="secondary" icon="calendar" disabled={example} title={example ? t('Return to your dataset to plan your week.') : undefined} onClick={() => onTry(`${r.title}. ${r.detail}`)}>{t('Try next week')}</Button>
      </li>)}</ol>}
    {example && items.length > 0 && <p className="hint mt-3">{t('Return to your dataset to add a suggestion to your weekly review.')}</p>}
  </Card>;
}

function CycleCard({ section }: { section: CycleComparisonSection }) {
  const value = (m: CycleMetric, v: number | null) => v === null ? '—' : m.id === 'span' ? `${whole(v)} min` : m.id === 'switches' ? whole(v) : one(v);
  const change = (m: CycleMetric) => m.delta === null ? '—' : `${m.delta > 0 ? '+' : m.delta < 0 ? '−' : ''}${m.id === 'span' ? `${whole(Math.abs(m.delta))} min` : m.id === 'switches' ? whole(Math.abs(m.delta)) : Math.abs(m.delta).toFixed(1)}`;
  const verdict = (m: CycleMetric) => m.delta === null ? t('Not enough data') : m.improved === null ? t('About the same') : m.improved ? t('Better') : t('Worse');
  const note = (title: string, a: CycleComparisonSection['adjustments']['thisWeek']) => a && <aside className="goal-evidence"><strong>{title}</strong><p>{a.text}</p></aside>;
  return <Card className="insight-cycle" title={t('This week against the weeks before')} icon="calendar">
    {!section.eligible ? <Reason>{section.reason}</Reason> : <>
      <div className="figure-values-scroll"><table className="insight-cycle-table" aria-label={t('Last 7 days against the 28 days before')}>
        <thead><tr><th scope="col">{t('Measure')}</th><th scope="col">{t('Last {recentDays} days', { recentDays: INSIGHT_THRESHOLDS.cycle.recentDays })}<small>{plural(section.recent.sessions, 'session')}</small></th><th scope="col">{t('Before')}<small>{plural(section.baseline.sessions, 'session')}</small></th><th scope="col">{t('Change')}</th></tr></thead>
        <tbody>{section.metrics.map(m => <tr key={m.id}><th scope="row">{m.label}</th><td>{value(m, m.recent)}</td><td>{value(m, m.baseline)}</td><td className={m.improved === null ? undefined : m.improved ? 'is-better' : 'is-worse'}>{change(m)}<small>{verdict(m)}</small></td></tr>)}</tbody>
      </table></div>
      <p className="hint">{section.reason}</p>
    </>}
    {note(t('Adjustment for the week of {week}', { week: section.adjustments.thisWeek?.week }), section.adjustments.thisWeek)}{note(t('Adjustment for the week of {week}', { week: section.adjustments.previousWeek?.week }), section.adjustments.previousWeek)}
    {!section.adjustments.thisWeek && !section.adjustments.previousWeek && <p className="hint">{t('No weekly adjustment is saved for this week or the last one. Save one in the weekly review to see whether the measures move after it.')}</p>}
  </Card>;
}
export default function InsightsPanel({ data, example, from, to, fieldId, goalId, onTry }: Props) {
  const signature = useMemo(() => insightsSignature(data.sessions, data.events), [data.sessions, data.events]);
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
  if (!insights) return error ? <Card title={t('Insights could not be read')} icon="shield"><p className="hint">{error}</p><Button className="mt-3" onClick={() => setAttempt(a => a + 1)}>{t('Try again')}</Button></Card>
    : <Card className="insight-loading"><p className="m-0 flex items-center gap-2 text-caption text-ink-muted" role="status"><Icon name="spark" size={16} className="text-accent" />{t('Reading your sessions for patterns…')}</p></Card>;
  return <div className={cn('insights', busy && 'is-refreshing')} aria-busy={busy || undefined}>
    {busy && <p className="sr-only" role="status">{t('Updating insights…')}</p>}
    {error && <div className="mb-4 flex flex-wrap items-center gap-3" role="alert"><Reason>{t('Showing the previous result. {error}', { error })}</Reason><Button size="sm" onClick={() => setAttempt(a => a + 1)}>{t('Try again')}</Button></div>}
    <QualityStrip quality={insights.quality} />
    <CycleCard section={insights.cycleComparison} />
    <div className="insights-grid">
      <RhythmFigure section={insights.rhythm} />
      <AttentionSpanFigure section={insights.attentionSpan} />
      <ShapeFigure section={insights.sessionShape} />
      <StatesFigure section={insights.states} />
      <DetractorsFigure section={insights.detractors} />
      <ModelCard section={insights.model} />
      <SuggestionsCard items={insights.recommendations} example={example} onTry={onTry} />
    </div>
    <p className="footnote">{t('{note} This view covers finished, included sessions started from {from} to {to}.', { note: insights.note, from: insights.from, to: insights.to })}</p>
  </div>;
}
