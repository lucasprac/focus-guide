import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Dataset, FocusSession, SessionEvent } from '../../shared/types';
import { CHALLENGE_LABELS, DETRACTOR_LABELS, INSIGHT_THRESHOLDS, focusInsights, plural, type CycleComparisonSection, type CycleMetric, type FocusInsights, type HourPoint, type Interval, type ModelFeature, type ModelView, type PhaseRate, type PreDrift, type Recommendation, type SessionShapeSection, type StatesSection, type SurvivalCurve } from '../../shared/focus-insights';
import { Badge, Button, Card, Plate, Segments, cn } from './ui';
import { Icon, minutesLabel } from './components';
import { activityModeLabel, interruptionLabel, weekdayLabel } from '../../shared/labels';

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
  return <Badge tone={strength === 'moderate' ? 'info' : 'neutral'}>{strength === 'moderate' ? 'Evidência moderada' : 'Tentativa'}</Badge>;
}
const intervalText = (i: Interval, digits = 1) => `${i.estimate.toFixed(digits)} (intervalo de 90% de ${i.low.toFixed(digits)} a ${i.high.toFixed(digits)})`;
function medianText(c: SurvivalCurve, ending = 'das sessões não teve divagação'): string {
  if (!c.median) return `mediana não atingida: mais da metade ${ending}`;
  const m = c.median;
  return c.medianOpen ? `mediana de ${whole(m.estimate)} min (intervalo de 90%: ${whole(m.low)} min ou mais)` : `mediana de ${whole(m.estimate)} min (intervalo de 90% ${whole(m.low)}–${whole(m.high)} min)`;
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
  return <>{([[warmUpMinutes, 'Sustentação'], [fatigueMinutes, 'Fadiga']] as const).filter(([minute]) => minute < max).map(([minute, name]) => <g key={minute} aria-hidden="true">
    <line x1={sx(minute)} x2={sx(minute)} y1={box.top} y2={box.bottom} className="chart-phase" /><text x={sx(minute) + 4} y={box.top + 10} className="chart-axis">{name} a partir de {minute}</text>
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
  return <details className="figure-values"><summary>Mostrar valores</summary><div className="figure-values-scroll"><table><thead><tr>{head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j ? <td key={j}>{cell}</td> : <th key={j} scope="row">{cell}</th>)}</tr>)}</tbody></table></div></details>;
}
function Reason({ children }: { children: ReactNode }) { return <p className="insight-reason"><Icon name="spark" size={15} className="shrink-0 text-ink-muted" /><span>{children}</span></p>; }
const heat = (share: number | null): CSSProperties | undefined => share === null ? undefined : { '--heat': Math.max(0.04, Math.min(1, share)) } as CSSProperties;

function QualityStrip({ quality }: { quality: FocusInsights['quality'] }) {
  const q = quality, items: Array<{ label: string; value: string; detail: string }> = [
    { label: 'Sessões', value: String(q.sessions), detail: `${minutesLabel(q.activeMinutes)} ativos em ${plural(q.spanDays, 'day')}` },
    { label: 'Avaliadas', value: percent(q.ratedShare), detail: q.reflectionShare === null ? 'Ainda não há sessões' : `${percent(q.reflectionShare)} com uma resposta de reflexão` },
    { label: 'Cobertura de atividade', value: percent(q.activityCoverage), detail: q.activityCoverage === null ? 'Coleta desligada ou sem sessões recentes' : 'Parcela observada do tempo ativo' },
    { label: 'Marcadores de divagação', value: String(q.markerSessions), detail: `de ${plural(q.sessions, 'session')} têm Voltei ou uma interrupção` },
    { label: 'Check-ins respondidos', value: String(q.probeAnswered), detail: q.probeSessions ? `${q.probeMissed} perdidos, em ${plural(q.probeSessions, 'session')}` : 'Os check-ins de atenção estão desligados ou ainda não apareceram' }
  ];
  return <Card className="insight-quality" title="Os dados por trás destes insights" icon="shield">
    <dl className="insight-quality-list">{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd><strong>{item.value}</strong><span>{item.detail}</span></dd></div>)}</dl>
    {q.notes.length > 0 && <ul className="insight-notes">{q.notes.map(note => <li key={note}>{note}</li>)}</ul>}
  </Card>;
}

function RhythmChart({ hours }: { hours: HourPoint[] }) {
  const shown = hours.filter(h => h.focus), peak = shown.reduce<HourPoint | null>((best, h) => !best || h.focus!.estimate > best.focus!.estimate ? h : best, null);
  const label = shown.length ? `Gráfico de linhas do foco percebido por hora de início, com faixa de intervalo de 90%, para ${plural(shown.length, 'hour')}. Pico por volta das ${hourLabel(peak!.hour)}: ${intervalText(peak!.focus!)}.` : 'Nenhuma hora de início tem sessões avaliadas próximas em número suficiente ainda.';
  const hourTitle = (h: HourPoint) => [hourLabel(h.hour), h.focus ? `foco ${intervalText(h.focus)}` : 'foco não mostrado (poucas sessões próximas)', h.driftPerHour !== null ? `${one(h.driftPerHour)} divagações por hora ativa` : null, h.switchesPerHour !== null ? `${whole(h.switchesPerHour)} trocas de janela por hora` : null, h.offTaskShare !== null ? `${percent(h.offTaskShare)} dos check-ins fora da tarefa` : null].filter(Boolean).join(' · ');
  const xTicks = [0, 6, 12, 18, 23].map(v => ({ v, t: String(v).padStart(2, '0') }));
  return <Frame label={label} height={210} x={[0, 23]} y={[1, 5]} xTicks={xTicks} yTicks={[1, 2, 3, 4, 5].map(v => ({ v, t: String(v) }))} xTitle="Hora de início" yTitle="Foco percebido (1–5)">{(sx, sy, box) => {
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
  return <Plate fig={1} className="insight-wide" title="Quando você foca melhor" hint={`${plural(section.n, 'rated session')}`} readout={peak ? `pico perto das ${hourLabel(peak.hour)} · ${one(peak.focus!.estimate)}` : '—'}>
    {!section.eligible ? <Reason>{section.reason}</Reason> : <>
      <RhythmChart hours={section.hours} />
      {drift && <Columns label={`Gráfico de colunas das divagações por hora ativa, por hora de início. ${section.hours.filter(h => h.driftPerHour !== null).length} horas mostradas.`} yTitle="Divagações por hora ativa" x={[0, 23]} xTicks={[0, 6, 12, 18, 23].map(v => ({ v, t: String(v).padStart(2, '0') }))} xTitle="Hora de início"
        rows={section.hours.map(h => ({ x: h.hour, value: h.driftPerHour, title: h.driftPerHour === null ? `${hourLabel(h.hour)} · sessões registradas com o Voltei insuficientes` : `${hourLabel(h.hour)} · ${one(h.driftPerHour)} divagações por hora ativa` }))} />}
      <div className="insight-subhead"><h3>Dia da semana e período do dia</h3><span className="hint">Foco médio onde uma célula tem pelo menos {INSIGHT_THRESHOLDS.rhythm.cellSessions} sessões</span></div>
      <div className="figure-values-scroll"><table className="insight-heat" aria-label="Foco percebido médio por dia da semana e período do dia">
        <thead><tr><th scope="col"><span className="sr-only">Dia da semana</span></th>{bands.map(b => <th key={b} scope="col">{b.split(' · ')[0]}<small>{b.split(' · ')[1]}</small></th>)}</tr></thead>
        <tbody>{weekdays.map(day => <tr key={day}><th scope="row">{weekdayLabel(day)}</th>{bands.map(band => { const cell = section.grid.find(c => c.weekday === day && c.band === band)!; return <td key={band} style={heat(cell.focusMean === null ? null : (cell.focusMean - 1) / 4)} className={cell.focusMean === null ? 'empty' : undefined} title={`${weekdayLabel(day)}, ${band}: ${plural(cell.sessions, 'session')}${cell.focusMean !== null ? `, foco médio ${one(cell.focusMean)}` : ''}${cell.driftPerHour !== null ? `, ${one(cell.driftPerHour)} divagações por hora ativa` : ''}`}>{cell.focusMean === null ? '—' : one(cell.focusMean)}</td>; })}</tr>)}</tbody>
      </table></div>
      <p className="hint mt-3">{section.reason}</p>
      <Values head={['Hora de início', 'Foco', 'Intervalo de 90%', 'Divagações por hora', 'Check-ins fora da tarefa']} rows={section.hours.filter(h => h.focus || h.driftPerHour !== null || h.offTaskShare !== null).map(h => [hourLabel(h.hour), h.focus ? one(h.focus.estimate) : '—', h.focus ? `${one(h.focus.low)}–${one(h.focus.high)}` : '—', h.driftPerHour === null ? '—' : one(h.driftPerHour), percent(h.offTaskShare)])} />
    </>}
  </Plate>;
}

function SurvivalChart({ curve, reference, height = 220, label, yTitle = 'Ainda sem divagação' }: { curve: SurvivalCurve; reference?: SurvivalCurve | null; height?: number; label: string; yTitle?: string }) {
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
  return <Frame label={label} height={height} x={[0, xMax]} y={[0, 1]} xTicks={xTicks} yTicks={[0, 0.5, 1].map(v => ({ v, t: `${v * 100}%` }))} xTitle="Minutos ativos" yTitle={yTitle}>{(sx, sy, box) => <>
    <path d={stepBand(sx, sy)} className="chart-band" />
    {ref && <path d={step(ref, p => p.survival, sx, sy)} className="chart-reference" />}
    <path d={step(points, p => p.survival, sx, sy)} className="chart-line" />
    {curve.median && <><line x1={sx(curve.median.estimate)} x2={sx(curve.median.estimate)} y1={sy(0.5)} y2={box.bottom} className="chart-marker" /><circle cx={sx(curve.median.estimate)} cy={sy(0.5)} r={4} className="chart-dot" /></>}
    {points.map((p, i) => { const next = points[i + 1]?.minute ?? xMax, x0 = sx(p.minute), w = Math.max(6, sx(next) - x0); return <rect key={i} x={x0} y={box.top} width={w} height={box.bottom - box.top} className="chart-hit"><title>{`A partir do minuto ${Math.round(p.minute)}: ${percent(p.survival)} ${yTitle.toLowerCase()} (intervalo de 90% ${percent(p.low)}–${percent(p.high)}), ${p.atRisk} sessões ainda em andamento`}</title></rect>; })}
  </>}</Frame>;
}
function AttentionSpanFigure({ section }: { section: FocusInsights['attentionSpan'] }) {
  const [group, setGroup] = useState<'all' | 'band' | 'mode'>('all');
  // A filter change can empty the chosen grouping; the figure then falls back to all sessions.
  const shown = group === 'band' && section.byBand.length ? 'band' : group === 'mode' && section.byMode.length ? 'mode' : 'all';
  const overall = section.overall, groups = shown === 'band' ? section.byBand : shown === 'mode' ? section.byMode : [];
  return <Plate fig={2} title="Quanto tempo a sua atenção dura" hint={overall ? `${plural(overall.sessions, 'session')} · ${overall.events} com uma divagação` : plural(section.n, 'session')} readout={overall ? medianText(overall).replace(/ \(intervalo de 90%.*$/, '') : '—'}>
    {!section.eligible || !overall ? <Reason>{section.reason}</Reason> : <>
      {(section.byBand.length > 0 || section.byMode.length > 0) && <Segments className="segmented insight-segments" label="Agrupar a curva" value={shown} onChange={v => { if (v) setGroup(v as typeof group); }} options={[{ value: 'all', label: 'Todas as sessões' }, ...(section.byBand.length ? [{ value: 'band', label: 'Por período do dia' }] : []), ...(section.byMode.length ? [{ value: 'mode', label: 'Por modo' }] : [])]} />}
      {shown === 'all' ? <SurvivalChart curve={overall} label={`Gráfico em degraus: parcela de sessões ainda sem divagação por minuto ativo, com faixa de 90%. ${medianText(overall)}.`} />
        : <div className="survival-multiples">{groups.map(c => <figure key={c.label}><figcaption><strong>{c.label}</strong><span>{plural(c.sessions, 'session')} · {medianText(c).replace(/ \(intervalo de 90%.*$/, '')}</span></figcaption><SurvivalChart curve={c} reference={overall} height={170} label={`${c.label}: gráfico em degraus das sessões ainda sem divagação, com faixa de 90%; a linha cinza mostra todas as sessões. ${medianText(c)}.`} /></figure>)}</div>}
      {shown !== 'all' && <p className="hint"><span className="legend-key line" aria-hidden="true" />Este grupo <span className="legend-key reference" aria-hidden="true" />Todas as sessões</p>}
      <p className="insight-callout">Todas as sessões: {medianText(overall)}.</p>
      <div className="insight-subhead"><h3>Aquecimento, sustentação e fadiga</h3><span className="hint">Divagações por hora ativa em cada fase de uma sessão</span></div>
      <div className="figure-values-scroll"><table className="insight-heat phase-table" aria-label="Divagações por fase da sessão">
        <thead><tr><th scope="col">Fase</th><th scope="col">Sessões</th><th scope="col">Divagações por hora</th><th scope="col">Check-ins fora da tarefa</th></tr></thead>
        <tbody>{section.phases.map((p: PhaseRate) => <tr key={p.id}><th scope="row">{p.label}<small>{p.toMinute === null ? `${p.fromMinute}+ min` : `${p.fromMinute}–${p.toMinute} min`}</small></th><td>{p.sessions}</td><td title={`${p.drifts} divagações em ${one(p.exposureHours * 60)} minutos ativos`}>{p.driftPerHour === null ? '—' : one(p.driftPerHour)}</td><td>{percent(p.offTaskShare)}</td></tr>)}</tbody>
      </table></div>
      {section.warmUpFriction && <p className="insight-callout">As divagações se concentram nos primeiros {INSIGHT_THRESHOLDS.attentionSpan.warmUpMinutes} minutos, então a mediana acima reflete principalmente o começo.{section.afterWarmUp?.median ? ` Contada depois do aquecimento, a mediana é de ${whole(section.afterWarmUp.median.estimate)} min.` : ''}</p>}
      {section.recovery && <>
        <div className="insight-subhead"><h3>Depois que você aperta Voltei</h3><span className="hint">Tempo ativo até a próxima divagação, em todos os retornos</span></div>
        <SurvivalChart curve={section.recovery} yTitle="Ainda sem outra divagação" height={190} label={`Gráfico em degraus: parcela de retornos ainda sem outra divagação por minuto ativo, com faixa de 90%. ${medianText(section.recovery, 'dos retornos foi seguida por outra divagação')}.`} />
        <p className="insight-callout">Após um retorno: {medianText(section.recovery, 'dos retornos foi seguida por outra divagação')}.</p>
      </>}
      <p className="hint">{section.reason}</p>
      <Values head={['Curva', 'Sessões', 'Divagações', 'Mediana']} rows={[overall, ...(section.afterWarmUp ? [section.afterWarmUp] : []), ...(section.recovery ? [section.recovery] : []), ...section.byBand, ...section.byMode].map(c => [c.label, c.sessions, c.events, medianText(c).replace(/^mediana de /, '')])} />
    </>}
  </Plate>;
}

const shapeTitle = (p: SessionShapeSection['points'][number]) => { const block = INSIGHT_THRESHOLDS.sessionShape.blockMinutes; return [`Minutos ${p.minute}–${p.minute + block}`, `${plural(p.sessions, 'session')}`, p.inputShare !== null ? `entrada em ${percent(p.inputShare)} do tempo observado` : null, p.switchesPerMinute !== null ? `${one(p.switchesPerMinute)} trocas de janela por minuto` : null, p.driftPerHour !== null ? `${one(p.driftPerHour)} divagações por hora ativa` : null, p.offTaskShare !== null ? `${percent(p.offTaskShare)} dos check-ins fora da tarefa` : null].filter(Boolean).join(' · '); };
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
  const pair = (a: number | null, b: number | null, format: (v: number) => string) => a === null || b === null ? null : `${format(a)} contra ${format(b)}`;
  const switches = pair(pre.preSwitchesPerMinute, pre.baselineSwitchesPerMinute, one), input = pair(pre.preInputShare, pre.baselineInputShare, v => percent(v));
  return <><p className="insight-callout">Nos {pre.windowMinutes} minutos antes de uma divagação:{switches ? ` ${switches} trocas de janela por minuto` : ''}{switches && input ? ';' : ''}{input ? ` entrada em ${input} do tempo` : ''}.</p>
    <p className="hint">{pre.reason} O marcador é o momento em que você apertou Voltei, então estes minutos incluem o tempo em que você esteve ausente. Uma associação nos seus próprios registros, não uma causa.</p></>;
}
function ShapeFigure({ section }: { section: SessionShapeSection }) {
  const { blockMinutes: block, blockSessions, maxMinutes } = INSIGHT_THRESHOLDS.sessionShape, { warmUpMinutes, fatigueMinutes } = INSIGHT_THRESHOLDS.attentionSpan, points = section.points, last = points[points.length - 1], xMax = last ? last.minute + block : maxMinutes;
  const mid = (m: number) => m + block / 2, xTicks = [0, Math.round(xMax / 2 / block) * block, xMax].map(v => ({ v, t: String(v) }));
  const input = points.some(p => p.inputShare !== null), switches = points.some(p => p.switchesPerMinute !== null), offTask = points.some(p => p.offTaskShare !== null);
  const share = (v: number) => `${v * 100}%`, switchMax = niceMax(Math.max(0, ...points.map(p => p.switchesPerMinute ?? 0)));
  return <Plate fig={3} title="O formato de uma sessão" hint={plural(section.n, 'session')} readout={last ? `mostrado até o minuto ${xMax}` : '—'}>
    {!section.eligible ? <Reason>{section.reason}</Reason> : !points.length ? <Reason>Nenhum bloco de {block} minutos tem pelo menos {blockSessions} sessões em andamento ainda.</Reason> : <>
      {input && <ShapeLine label={`Gráfico de linhas da parcela de entrada por bloco de ${block} minutos da sessão, até o minuto ${xMax}.`} height={170} points={points} pick={p => p.inputShare} max={1} format={share} xMax={xMax} xTicks={xTicks} yTitle="Tempo com entrada de teclado ou mouse" />}
      {switches && <ShapeLine label={`Gráfico de linhas das trocas de janela por minuto, por bloco de ${block} minutos da sessão, até o minuto ${xMax}.`} points={points} pick={p => p.switchesPerMinute} max={switchMax} format={v => v >= 10 ? whole(v) : String(Math.round(v * 100) / 100)} xMax={xMax} xTicks={xTicks} yTitle="Trocas de janela por minuto" />}
      {offTask && <ShapeLine label={`Gráfico de linhas da parcela de check-ins de atenção respondidos fora da tarefa, por bloco de ${block} minutos da sessão, até o minuto ${xMax}.`} points={points} pick={p => p.offTaskShare} max={1} format={share} xMax={xMax} xTicks={xTicks} yTitle="Check-ins respondidos fora da tarefa" />}
      <Columns label={`Gráfico de colunas das divagações por hora ativa, por bloco de ${block} minutos da sessão, até o minuto ${xMax}.`} yTitle="Divagações por hora ativa" x={[0, xMax]} xTicks={xTicks} xTitle="Minutos ativos" height={150} phases rows={points.map(p => ({ x: mid(p.minute), value: p.driftPerHour, title: shapeTitle(p) }))} />
      <p className="hint">Linhas tracejadas: o aquecimento termina no minuto {warmUpMinutes} e a fadiga começa no minuto {fatigueMinutes}.</p>
      <div className="insight-subhead"><h3>Logo antes de uma divagação</h3><span className="hint">Trocas de janela e entrada nos {section.preDrift.windowMinutes} minutos anteriores</span></div>
      <PreDriftNote pre={section.preDrift} />
      <p className="hint">{section.reason}</p>
      <Values head={['Minutos', 'Sessões', 'Parcela de entrada', 'Trocas por minuto', 'Divagações por hora', 'Check-ins fora da tarefa']} rows={points.map(p => [`${p.minute}–${p.minute + block}`, p.sessions, percent(p.inputShare), p.switchesPerMinute === null ? '—' : one(p.switchesPerMinute), p.driftPerHour === null ? '—' : one(p.driftPerHour), percent(p.offTaskShare)])} />
    </>}
  </Plate>;
}

function StatesFigure({ section }: { section: StatesSection }) {
  const describe = (c: StatesSection['states'][number]['centroid']) => `${one(c.keysPerMinute)} teclas, ${one(c.clicksPerMinute)} cliques e ${one(c.scrollsPerMinute)} rolagens por minuto; entrada em ${percent(c.inputShare)} e movimento do ponteiro em ${percent(c.movementShare)} do tempo${c.switchesPerMinute !== null ? `; ${one(c.switchesPerMinute)} trocas de janela por minuto` : ''}.`;
  const f = section.fragmentation, rated = section.states.filter(s => s.driftPerHour !== null);
  const busiest = rated.length > 1 ? rated.reduce((a, b) => b.driftPerHour! > a.driftPerHour! ? b : a) : null, calmest = rated.length > 1 ? rated.reduce((a, b) => b.driftPerHour! < a.driftPerHour! ? b : a) : null;
  return <Plate fig={4} title="Estados de interação" hint={`${section.n} minutos de atividade`} readout={section.eligible ? `${section.k} estados` : '—'}>
    {!section.eligible ? <Reason>{section.reason}</Reason> : <>
      <ul className="state-legend">{section.states.map(s => <li key={s.id}><div><strong>{s.label}{s.id === busiest?.id && <Badge tone="info" className="ml-2">Mais divagações por hora</Badge>}</strong><span className="tabular-nums">{percent(s.share)} dos minutos{s.driftPerHour !== null ? ` · ${one(s.driftPerHour)} divagações por hora` : ''}</span></div><div className="share-track" aria-hidden="true"><span style={{ width: `${s.share * 100}%` }} /></div><p>{describe(s.centroid)}</p></li>)}</ul>
      {section.byMode.length > 0 && <><div className="insight-subhead"><h3>Por modo de atividade</h3><span className="hint">Parcela dos minutos de cada modo</span></div>
        <div className="figure-values-scroll"><table className="insight-heat" aria-label="Parcela dos estados de interação por modo de atividade">
          <thead><tr><th scope="col">Modo</th>{section.states.map(s => <th key={s.id} scope="col">{s.label}</th>)}</tr></thead>
          <tbody>{section.byMode.map(row => <tr key={row.mode}><th scope="row">{activityModeLabel(row.mode)}<small>{minutesLabel(row.minutes)}</small></th>{row.shares.map((share, i) => <td key={i} style={heat(share)} title={`${activityModeLabel(row.mode)}: ${percent(share)} ${section.states[i]?.label ?? ''}`}>{percent(share)}</td>)}</tr>)}</tbody>
        </table></div></>}
      {busiest && calmest && busiest.id !== calmest.id && <p className="insight-callout">Os minutos de {busiest.label} concentram mais divagações por hora ({one(busiest.driftPerHour!)}), e os de {calmest.label}, menos ({one(calmest.driftPerHour!)}). Uma divagação é contada no minuto em que você apertou Voltei ou marcou uma interrupção.</p>}
      <p className="insight-callout">{f.perHourMedian === null ? 'As mudanças de estado por hora precisam de sequências mais longas de minutos de atividade.' : `Mediana de ${one(f.perHourMedian)} mudanças de estado por hora ativa.`} {f.focusRho !== null ? `ρ de Spearman com o foco ${f.focusRho.toFixed(2)} em ${plural(f.pairs, 'rated session')}.` : ''}</p>
      <p className="hint">{f.reason} {section.reason}</p>
    </>}
  </Plate>;
}

function MeanRows({ rows, label }: { rows: Array<{ key: string; label: string; sessions: number; focusMean: number | null }>; label: string }) {
  const max = Math.max(1, ...rows.map(r => r.sessions));
  return <div className="mean-rows" role="list" aria-label={label}>{rows.map(r => <div key={r.key} role="listitem" className="mean-row">
    <span className="mean-row-label">{r.label}</span>
    <span className="share-track" aria-hidden="true"><span style={{ width: `${r.sessions / max * 100}%` }} /></span>
    <span className="mean-row-value tabular-nums">{plural(r.sessions, 'session')}<small>{r.focusMean === null ? 'foco —' : `foco ${one(r.focusMean)}`}</small></span>
  </div>)}</div>;
}
function DetractorsFigure({ section }: { section: FocusInsights['detractors'] }) {
  const top = section.reported.find(r => r.detractor !== 'none'), s = section.switching;
  return <Plate fig={5} title="O que atrapalhou" hint={plural(section.n, 'session')} readout={top ? `mais frequente: ${DETRACTOR_LABELS[top.detractor].toLowerCase()}` : '—'}>
    {!section.eligible ? <Reason>{section.reason}</Reason> : <div className="detractor-grid">
      <section><h3>O que você relatou</h3>{section.reported.length ? <MeanRows label="Distrações relatadas com o foco médio" rows={section.reported.map(r => ({ key: r.detractor, label: DETRACTOR_LABELS[r.detractor], sessions: r.sessions, focusMean: r.focusMean }))} /> : <p className="hint">Responda "O que mais atrapalhou?" após uma sessão para ver isto.</p>}</section>
      <section><h3>Quão exigente pareceu</h3>{section.challenge.length ? <MeanRows label="Nível de desafio com o foco médio" rows={section.challenge.map(r => ({ key: r.challenge, label: CHALLENGE_LABELS[r.challenge], sessions: r.sessions, focusMean: r.focusMean }))} /> : <p className="hint">Responda "Quão exigente foi?" após uma sessão para ver isto.</p>}</section>
      <section><h3>Interrupções que você marcou</h3>{section.interruptions.length ? <ul className="plain-rows">{section.interruptions.map(i => <li key={i.category}><span>{interruptionLabel(i.category)}</span><span className="tabular-nums">{i.count}{i.perHour !== null && <small>{one(i.perHour)} por hora ativa</small>}</span></li>)}</ul> : <p className="hint">Nenhum marcador de interrupção neste período.</p>}</section>
      <section><h3>Por período do dia</h3><ul className="plain-rows">{section.byBand.map(b => <li key={b.band}><span>{b.band}</span><span className="tabular-nums">{b.driftPerHour === null ? '—' : `${one(b.driftPerHour)} divagações/h`}<small>{[b.switchesPerHour !== null ? `${whole(b.switchesPerHour)} trocas/h` : null, b.offTaskShare !== null ? `${percent(b.offTaskShare)} dos check-ins fora da tarefa` : null].filter(Boolean).join(' · ') || 'sem contagem de trocas nem check-ins'}</small></span></li>)}</ul></section>
      <p className="insight-callout detractor-wide">Troca de janelas: {s.perHourMedian === null ? 'ainda sem contagem de trocas.' : `mediana de ${whole(s.perHourMedian)} trocas por hora observada.`} {s.focusRho !== null ? `ρ de Spearman com o foco ${s.focusRho.toFixed(2)} em ${plural(s.pairs, 'rated session')}.` : s.reason}</p>
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
  return <div ref={ref} className="forest" role="list" aria-label="Associações com o foco percebido, com intervalos bootstrap de 90%">
    {features.map(f => <div key={f.name} role="listitem" className="forest-row">
      <span className="forest-label">{f.label}{f.selectionShare !== null && <small>mantido pelo lasso em {percent(f.selectionShare)} das janelas de teste</small>}</span>
      <svg width={plot} height={22} viewBox={`0 0 ${plot} 22`} role="img" aria-label={`${f.label}: ${signed(f.effect.estimate)} pontos, intervalo de 90% de ${signed(f.effect.low)} a ${signed(f.effect.high)}`}>
        <line x1={sx(0)} x2={sx(0)} y1={1} y2={21} className="chart-zero" />
        <line x1={sx(Math.min(f.effect.low, f.effect.high))} x2={sx(Math.max(f.effect.low, f.effect.high))} y1={11} y2={11} className="chart-whisker" />
        <circle cx={sx(f.effect.estimate)} cy={11} r={4} className="chart-dot"><title>{`${signed(f.effect.estimate)} pontos (intervalo de 90% de ${signed(f.effect.low)} a ${signed(f.effect.high)})`}</title></circle>
      </svg>
      <span className="forest-value tabular-nums">{signed(f.effect.estimate)}<small>{signed(f.effect.low)} a {signed(f.effect.high)}</small></span>
    </div>)}
    <div className="forest-row forest-axis" aria-hidden="true"><span /><svg width={plot} height={18} viewBox={`0 0 ${plot} 18`}><text x={sx(-span)} y={13} className="chart-axis">menos foco</text><text x={sx(0)} y={13} textAnchor="middle" className="chart-axis">0</text><text x={sx(span)} y={13} textAnchor="end" className="chart-axis">mais</text></svg><span /></div>
  </div>;
}
const signedText = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
const vifText = (v: number | null) => v === null ? '—' : v > 99 ? '>99' : one(v);
function ModelBody({ view, predictive }: { view: ModelView; predictive: boolean }) {
  if (!view.eligible) return <Reason>{view.reason}</Reason>;
  const kept = view.features.filter(f => f.selected), d = view.diagnostics;
  return <>
    <p className="insight-callout">{predictive ? 'Erro de previsão da sua próxima avaliação' : 'Erro quando a avaliação é prevista a partir destes fatos'}: modelo {view.mae?.toFixed(2) ?? '—'}, sua avaliação média {view.baselineMae?.toFixed(2) ?? '—'} pontos, em {plural(view.tested, 'later session')}.</p>
    {view.estimator && <p className="hint"><strong>{view.candidates.find(c => c.id === view.estimator)?.label}</strong> · {view.decision}</p>}
    {d && d.pairs.length > 0 && <p className="hint">Fatores que se sobrepõem: {d.pairs.slice(0, 3).map(p => `${p.a} e ${p.b} (r ${p.r.toFixed(2)})`).join(', ')}{d.maxVif !== null ? `; maior fator de inflação de variância ${vifText(d.maxVif)}` : ''}. Fatores que se sobrepõem dividem o efeito entre si, então leia cada um com cuidado.</p>}
    {view.useful && view.features.length > 0 ? <>
      <p className="hint">Cada efeito é a mudança no foco percebido, em pontos, para um desvio-padrão a mais do fator, ou em relação à referência indicada, mantendo os outros fatores fixos. Os intervalos de 90% vêm de {INSIGHT_THRESHOLDS.model.bootstrap} reamostragens. Somente os fatores que o lasso mantém são desenhados.</p>
      {kept.length ? <ForestPlot features={kept} /> : <p className="hint">O lasso não manteve nenhum fator: não foi encontrada associação clara.</p>}
      {view.zeroed.length > 0 && <div className="insight-zeroed"><h3>Nenhuma associação clara encontrada (zerados pelo lasso)</h3><ul>{view.zeroed.map(label => <li key={label}>{label}</li>)}</ul></div>}
      <Values head={['Fator', 'Efeito', 'Intervalo de 90%', 'Mantido pelo lasso', 'Janelas de teste', 'Reamostragens', 'Inflação de variância']} rows={view.features.map(f => [f.label, signedText(f.effect.estimate), `${signedText(f.effect.low)} a ${signedText(f.effect.high)}`, f.selected ? 'sim' : 'não', percent(f.selectionShare), percent(f.bootstrapShare), vifText(f.vif)])} />
    </> : null}
    <p className="hint">{view.reason}</p>
    {view.candidates.length > 0 && <Values head={['Estimador', 'Erro (pontos)', 'Sobreposição da seleção entre janelas']} rows={view.candidates.map(c => [c.label + (c.id === view.estimator ? ' (usado)' : ''), c.mae.toFixed(2), c.stability === null ? 'mantém todos os fatores' : percent(c.stability)])} />}
  </>;
}
function ModelCard({ section }: { section: FocusInsights['model'] }) {
  const [view, setView] = useState<'before' | 'during'>('before'), shown = view === 'during' ? section.sessionFactors : section;
  return <Card className="insight-model" title="O que costuma acompanhar um foco maior" icon="patterns">
    <Segments className="segmented insight-segments" label="Quais fatos comparar" value={view} onChange={v => { if (v) setView(v as typeof view); }} options={[{ value: 'before', label: 'Conhecidos antes de começar' }, { value: 'during', label: 'Durante e depois da sessão' }]} />
    <ModelBody key={view} view={shown} predictive={view === 'before'} />
  </Card>;
}
function SuggestionsCard({ items, example, onTry }: { items: Recommendation[]; example: boolean; onTry: (text: string) => void }) {
  return <Card className="insight-suggestions" title="Sugestões para experimentar" icon="spark">
    {!items.length ? <Reason>Nenhuma sugestão atende à sua regra de evidência neste período ainda. Continue avaliando as sessões e apertando Voltei quando perceber uma divagação.</Reason>
      : <ol className="suggestion-list">{items.map(r => <li key={r.id}>
        <div className="suggestion-head"><strong>{r.title}</strong><StrengthBadge strength={r.strength} /></div>
        <p>{r.detail}</p><p className="hint">{r.evidence}</p>
        <Button size="sm" variant="secondary" icon="calendar" disabled={example} title={example ? 'Volte aos seus dados para planejar a sua semana.' : undefined} onClick={() => onTry(`${r.title}. ${r.detail}`)}>Experimentar na próxima semana</Button>
      </li>)}</ol>}
    {example && items.length > 0 && <p className="hint mt-3">Volte aos seus dados para adicionar uma sugestão à sua revisão semanal.</p>}
  </Card>;
}

function CycleCard({ section }: { section: CycleComparisonSection }) {
  const value = (m: CycleMetric, v: number | null) => v === null ? '—' : m.id === 'span' ? `${whole(v)} min` : m.id === 'switches' ? whole(v) : one(v);
  const change = (m: CycleMetric) => m.delta === null ? '—' : `${m.delta > 0 ? '+' : m.delta < 0 ? '−' : ''}${m.id === 'span' ? `${whole(Math.abs(m.delta))} min` : m.id === 'switches' ? whole(Math.abs(m.delta)) : Math.abs(m.delta).toFixed(1)}`;
  const verdict = (m: CycleMetric) => m.delta === null ? 'Dados insuficientes' : m.improved === null ? 'Praticamente igual' : m.improved ? 'Melhor' : 'Pior';
  const note = (title: string, a: CycleComparisonSection['adjustments']['thisWeek']) => a && <aside className="goal-evidence"><strong>{title}</strong><p>{a.text}</p></aside>;
  return <Card className="insight-cycle" title="Esta semana comparada às semanas anteriores" icon="calendar">
    {!section.eligible ? <Reason>{section.reason}</Reason> : <>
      <div className="figure-values-scroll"><table className="insight-cycle-table" aria-label="Últimos 7 dias comparados aos 28 dias anteriores">
        <thead><tr><th scope="col">Medida</th><th scope="col">Últimos {INSIGHT_THRESHOLDS.cycle.recentDays} dias<small>{plural(section.recent.sessions, 'session')}</small></th><th scope="col">Antes<small>{plural(section.baseline.sessions, 'session')}</small></th><th scope="col">Mudança</th></tr></thead>
        <tbody>{section.metrics.map(m => <tr key={m.id}><th scope="row">{m.label}</th><td>{value(m, m.recent)}</td><td>{value(m, m.baseline)}</td><td className={m.improved === null ? undefined : m.improved ? 'is-better' : 'is-worse'}>{change(m)}<small>{verdict(m)}</small></td></tr>)}</tbody>
      </table></div>
      <p className="hint">{section.reason}</p>
    </>}
    {note(`Ajuste da semana de ${section.adjustments.thisWeek?.week}`, section.adjustments.thisWeek)}{note(`Ajuste da semana de ${section.adjustments.previousWeek?.week}`, section.adjustments.previousWeek)}
    {!section.adjustments.thisWeek && !section.adjustments.previousWeek && <p className="hint">Nenhum ajuste semanal está salvo para esta semana nem para a anterior. Salve um na revisão semanal para ver se as medidas mudam depois dele.</p>}
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
  if (!insights) return error ? <Card title="Não foi possível ler os insights" icon="shield"><p className="hint">{error}</p><Button className="mt-3" onClick={() => setAttempt(a => a + 1)}>Tentar novamente</Button></Card>
    : <Card className="insight-loading"><p className="m-0 flex items-center gap-2 text-caption text-ink-muted" role="status"><Icon name="spark" size={16} className="text-accent" />Lendo suas sessões em busca de padrões…</p></Card>;
  return <div className={cn('insights', busy && 'is-refreshing')} aria-busy={busy || undefined}>
    {busy && <p className="sr-only" role="status">Atualizando os insights…</p>}
    {error && <div className="mb-4 flex flex-wrap items-center gap-3" role="alert"><Reason>Mostrando o resultado anterior. {error}</Reason><Button size="sm" onClick={() => setAttempt(a => a + 1)}>Tentar novamente</Button></div>}
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
    <p className="footnote">{insights.note} Esta visão cobre as sessões concluídas e incluídas iniciadas de {insights.from} a {insights.to}.</p>
  </div>;
}
