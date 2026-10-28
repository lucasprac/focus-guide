import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { animate, createScope, svg } from 'animejs';
import { Fold, Overlay, Segments } from './ui';
import floatingBrainSheet from './assets/floating-brain-sheet.png';
import { Icon, type IconName } from './icons';
import NeuralVisual from './NeuralVisual';
import { brainFormation } from '../../shared/timer-display';
import { t, dateLocale } from '../../shared/i18n';

export { Icon, type IconName };
export function time(ms: number): string { const seconds = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }
export function minutesLabel(minutes: number): string { if (minutes < 1 && minutes > 0) return `${Math.round(minutes * 60)}s`; if (minutes < 60) return `${Math.round(minutes)}m`; const h = Math.floor(minutes / 60), m = Math.round(minutes % 60); return m === 60 ? `${h + 1}h` : `${h}h${m ? ` ${m}m` : ''}`; }
/* Planned countdown length against recorded time; under a minute of difference reads as on plan. */
export function planComparison(plannedMinutes: number, differenceMinutes: number): string {
  const base = t('Planned {minutesLabel} · recorded {minutesLabel2}', { minutesLabel: minutesLabel(plannedMinutes), minutesLabel2: minutesLabel(plannedMinutes + differenceMinutes) });
  return Math.abs(differenceMinutes) < 1 ? t('{base} · on plan', { base }) : t('{base} · {minutesLabel} {v3} than planned', { base, minutesLabel: minutesLabel(Math.abs(differenceMinutes)), v3: differenceMinutes > 0 ? t('more') : t('less') });
}
export function displayDay(day: string, short = false): string { return new Date(`${day}T12:00:00Z`).toLocaleDateString(dateLocale(), { timeZone: 'UTC', month: short ? 'short' : 'long', day: 'numeric', ...(short ? {} : { weekday: 'long' }) }); }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty-state"><span className="empty-orbit"><Icon name="spark" size={23} /></span><h3>{title}</h3><p>{children}</p></div>; }
export const Disclosure = Fold;
export function useMotionEnabled(animation: boolean) {
  const [visible, setVisible] = useState(document.visibilityState !== 'hidden');
  const [windowVisible, setWindowVisible] = useState(true);
  const [reduced, setReduced] = useState(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onVisibility = () => setVisible(document.visibilityState !== 'hidden');
    const onMotion = () => setReduced(media.matches);
    document.addEventListener('visibilitychange', onVisibility);
    media.addEventListener('change', onMotion);
    // Native window visibility is authoritative when Chromium keeps a hidden renderer visible.
    const remove = window.focusGuide?.onEvent(event => { if (event.type === 'visibility') setWindowVisible(event.visible); });
    return () => { document.removeEventListener('visibilitychange', onVisibility); media.removeEventListener('change', onMotion); remove?.(); };
  }, []);
  return animation && visible && windowVisible && !reduced;
}
export function Rating({ value, onChange, label, low = t('Low'), high = t('High') }: { value: number | null; onChange: (value: number | null) => void; label: string; low?: string; high?: string }) {
  return <fieldset className="rating"><legend>{label}<span className="optional">{t('optional')}</span></legend><Segments value={value === null ? '' : String(value)} onChange={value => onChange(value ? Number(value) : null)} label={label} className="rating-values" options={[1, 2, 3, 4, 5].map(n => ({ value: String(n), label: String(n), ariaLabel: `${label}: ${n}` }))} /><div className="rating-ends"><span>{low}</span><span>{high}</span></div></fieldset>;
}
export const Modal = Overlay;
function random(seed: number): () => number { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const rand = random(84);
const neurons = Array.from({ length: 68 }, (_, i) => {
  const side = i % 2 ? 1 : -1;
  const a = rand() * Math.PI * 2, r = Math.sqrt(rand());
  return { x: 210 + side * 55 + Math.cos(a) * 89 * r, y: 156 + Math.sin(a) * 105 * r, radius: 1.7 + rand() * 1.6 };
});
const links = neurons.flatMap((p, i) => neurons.slice(i + 1).map((q, j) => ({ p, q, distance: Math.hypot(p.x - q.x, p.y - q.y), index: i + j })).filter(l => l.distance < 49)).slice(0, 130);
const outline = 'M205 59C190 31 155 31 140 46C111 34 84 56 85 79C55 84 48 107 56 127C29 144 36 171 54 186C42 210 62 235 84 234C91 262 119 273 142 261C160 282 192 270 204 252M215 59C230 31 265 31 280 46C309 34 336 56 335 79C365 84 372 107 364 127C391 144 384 171 366 186C378 210 358 235 336 234C329 262 301 273 278 261C260 282 228 270 216 252M205 63C196 111 202 145 208 174C198 215 202 239 205 252M215 63C224 111 218 145 212 174C222 215 218 239 215 252';
const folds = 'M87 80c30-5 35 28 16 43m-45 4c28-11 57 7 62 26m-66 33c14-15 42-20 62 0m-33 49c16-19 38-21 55-7m2-177c-16 20-9 42 13 52m-14 12c26-22 45-12 49 10m-73 43c8 28 43 31 53 7m-3 46c-13 19-4 36 13 40M333 80c-30-5-35 28-16 43m45 4c-28-11-57 7-62 26m66 33c-14-15-42-20-62 0m33 49c-16-19-38-21-55-7m-2-177c16 20 9 42-13 52m14 12c-26-22-45-12-49 10m73 43c-8 28-43 31-53 7m3 46c13 19 4 36-13 40';
export function Brain({ progress, running, animation, mini = false, color = 'var(--accent)' }: { progress: number; running: boolean; animation: boolean; mini?: boolean; color?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const motion = useMotionEnabled(animation);
  const revealed = Math.min(links.length, Math.max(0, Math.floor(progress * links.length)));
  const previousReveal = useRef(revealed);
  useEffect(() => {
    if (!motion || !running) return;
    const scope = createScope({ root: ref }).add(() => {
      animate('.pulse-node', { opacity: [0.45, 0.85], duration: 3500, alternate: true, loop: true, ease: 'inOutSine' });
    });
    return () => scope.revert();
  }, [motion, running]);
  useEffect(() => {
    const grew = revealed > previousReveal.current;
    previousReveal.current = revealed;
    if (!motion || !running || !grew || !revealed) return;
    const scope = createScope({ root: ref }).add(() => {
      animate(svg.createDrawable(ref.current!.querySelectorAll('.connection-new')), { draw: ['0 0', '0 1'], duration: 900, ease: 'outQuad' });
    });
    return () => scope.revert();
  }, [revealed, running, motion]);
  return <svg className={`brain ${mini ? 'mini-brain' : ''}`} ref={ref} viewBox="0 0 420 310" fill="none" role="img" aria-label={t('Brain progress illustration, {v1} percent of session', { v1: Math.round(progress * 100) })} style={{ color } as CSSProperties}>
    <defs><radialGradient id={mini ? 'brainMistMini' : 'brainMist'}><stop stopColor="currentColor" stopOpacity=".09" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></radialGradient></defs>
    <ellipse cx="210" cy="157" rx="180" ry="148" fill={`url(#${mini ? 'brainMistMini' : 'brainMist'})`} />
    <path d={outline} stroke="currentColor" strokeWidth="1.8" opacity=".7" /><path d={folds} stroke="currentColor" strokeWidth="1.1" opacity=".24" />
    {links.map((l, i) => <path key={i} className={i === revealed - 1 ? 'connection-new' : ''} d={`M${l.p.x},${l.p.y} Q${(l.p.x + l.q.x) / 2 + 8},${(l.p.y + l.q.y) / 2 - 8} ${l.q.x},${l.q.y}`} stroke="currentColor" strokeWidth={i < revealed ? 1.2 : .65} opacity={i < revealed ? .65 : .025} />)}
    {neurons.map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r={p.radius + 3} fill="currentColor" opacity={i / neurons.length < progress ? .07 : 0} /><circle className={i % 13 === 0 ? 'pulse-node' : ''} cx={p.x} cy={p.y} r={p.radius} fill="var(--blue)" opacity={i / neurons.length < progress ? .9 : i % 13 === 0 ? .6 : .22} /></g>)}
  </svg>;
}
export function FloatingBrain({ progress, running, animation }: { progress: number; running: boolean; animation: boolean }) {
  const motion = useMotionEnabled(animation);
  const bounded = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const position = bounded * 7;
  const frame = Math.floor(position);
  const blend = position - frame;
  // The supplied sheet has an irregular grid. These eight aligned cells are its pale-to-purple sequence.
  const sprite = (column: number, opacity: number) => <svg x="0" y="0" width="108" height="90" viewBox={`${16 + column * 124} 150 124 116`} opacity={opacity} overflow="hidden" aria-hidden="true">
    <image href={floatingBrainSheet} width="1028" height="1530" />
  </svg>;
  return <svg className={`floating-brain ${motion && running ? 'drawing' : ''}`} viewBox="0 0 108 90" role="img" data-progress={bounded} data-frame={frame} aria-label={t('Brain color, {v1} percent filled', { v1: Math.round(bounded * 100) })}>
    <g className="brain-sprite" style={{ filter: `saturate(${bounded})` }}>
      {sprite(frame, 1)}
      {frame < 7 && sprite(frame + 1, blend)}
    </g>
  </svg>;
}
// The floating timer's brain constellation. The brain sprite stays as its fallback.
export function FloatingNetwork({ elapsedMs, progress, running, pause, animation, software }: { elapsedMs: number; progress: number; running: boolean; pause: boolean; animation: boolean; software: boolean }) {
  const motion = useMotionEnabled(animation);
  const formed = brainFormation(elapsedMs);
  return <NeuralVisual kind="floating" color={pause ? '#5786dc' : '#6d4aff'} theme="light" progress={formed} running={running} moving={motion && running} visible software={software}
    label={t('Brain constellation, {v1} percent formed', { v1: Math.round(formed * 100) })}
    fallback={<FloatingBrain progress={progress} running={running} animation={animation} />} />;
}
export function BarChart({ rows, unit = 'm' }: { rows: Array<{ label: string; value: number; color?: string }>; unit?: string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return <div className="bar-chart">{rows.map(row => <div className="bar-row" key={row.label}><div className="bar-top"><span>{row.label}</span><strong>{unit === 'm' ? minutesLabel(row.value) : `${Math.round(row.value)}${unit}`}</strong></div><div className="bar-track"><span style={{ width: `${row.value / max * 100}%`, background: row.color ?? 'var(--accent)' }} /></div></div>)}</div>;
}
