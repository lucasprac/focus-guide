import { useEffect, useRef, type CSSProperties } from 'react';
import * as k from '../../iso/iso-kit';
import { Dots, FaceText, Line, Solid } from '../../iso/draw';
import { useMotionEnabled } from '../../components';
import { anvil, base, dial, HEIGHT, jack, LIFT_PER_TURN, liftOffset, needleAt, planMarkAt, plunger, screwAt, smallHandAt, stand, wheelIndexAt, WIDTH } from './geometry';
import { gaugeTurns, planTurns } from './model';

const FRAME_MS = 1000 / 30;

// Static parts in painter's order: back to front, bottom to top. The moving parts are placed between them.
const BASE = <g key="base">
  <path className="iso-halo" d={base.halo} />
  {base.feet.map((foot, index) => <g key={index}><Solid paths={foot.pad} tone="lo" /><Solid paths={foot.boss} tone="mid" /></g>)}
  <Solid paths={base.plate} tone="mid" />
  <Line d={base.groove} tone="lo" />
  <Line d={base.screwRings} tone="lo" /><Dots points={base.screwDots} />
  <Solid paths={base.strip} tone="lo" crease="none" />
  <Line d={base.stripTicks.minor} tone="lo" /><Line d={base.stripTicks.major} tone="mid" /><Dots points={base.stripDots} size={0.45} />
  <Solid paths={base.label} tone="lo" crease="none" />
  <Line d={base.labelRules} tone="faint" free /><Dots points={base.labelDots} size={0.45} />
</g>;
const STAND = <g key="stand">
  <Solid paths={stand.magnetLow} tone="mid" /><Solid paths={stand.magnetHigh} tone="mid" />
  <Line d={stand.magnetGroove} tone="faint" /><Dots points={stand.magnetDots} size={0.45} />
  <Solid paths={stand.knob} tone="mid" /><Line d={stand.knobKnurl} tone="lo" /><Line d={stand.knobIndex} tone="hi" free="end" /><Dots points={stand.knobDot} tone="hi" />
  <Solid paths={stand.collar} tone="mid" />
  <Solid paths={stand.postLow} tone="mid" crease="none" /><Line d={stand.postMarks} tone="faint" />
  <Solid paths={stand.clamp} tone="mid" />
  <Solid paths={stand.postHigh} tone="mid" crease="none" /><Solid paths={stand.cap} tone="mid" />
  <Solid paths={stand.arm} tone="mid" /><Dots points={stand.armDots} size={0.45} />
  <Solid paths={stand.thumbNeck} tone="mid" crease="none" /><Solid paths={stand.thumb} tone="mid" /><Line d={stand.thumbKnurl} tone="lo" />
</g>;
const JACK = <g key="jack">
  <path className="iso-halo" d={jack.halo} style={{ filter: 'blur(4px)' }} />
  <Solid paths={jack.flange} tone="mid" /><Dots points={jack.flangeDots} size={0.45} />
  <Solid paths={jack.wheel} tone="mid" /><Line d={jack.wheelKnurl} tone="lo" /><Line d={jack.wheelRing} tone="faint" />
</g>;
const SLEEVE = <g key="sleeve"><Solid paths={jack.sleeve} tone="mid" /><Line d={jack.sleeveMark} tone="faint" /></g>;
const ANVIL = <><Solid paths={anvil.body} tone="hi" crease="lo" /><Line d={anvil.ring} tone="faint" /></>;
const PLUNGER = <><Solid paths={plunger.tip} tone="hi" lit /><Solid paths={plunger.rod} tone="hi" crease="none" lit /></>;
const DIAL = <g key="dial">
  <Solid paths={dial.stem} tone="mid" /><Line d={dial.stemMark} tone="lo" />
  <Solid paths={dial.lug} tone="mid" />
  <Solid paths={dial.body} tone="hi" crease="lo" />
  <Line d={dial.bezelKnurl} tone="lo" /><Line d={dial.bezelSeam} tone="faint" />
  <Line d={dial.faceRing} tone="lo" />
  <Line d={dial.ticks.minor} tone="lo" /><Line d={dial.ticks.major} tone="mid" />
  <Line d={dial.smallRing} tone="lo" /><Line d={dial.smallTicks.minor} tone="lo" /><Line d={dial.smallTicks.major} tone="mid" />
  <Solid paths={dial.crown} tone="mid" /><Solid paths={dial.crownCap} tone="mid" />
  <FaceText transform={dial.label} size={2.4} tone="lo" anchor="middle">10 MIN</FaceText>
</g>;

/* A dial indicator on a stand: the needle turns once per 10 minutes of elapsed timer time, the small dial counts
   turns up to 2 hours and its marker shows the plan. Only the needle, small hand, plunger, anvil and screw move;
   they are written through refs, so the timer's once-a-second state never re-renders the static art. */
export default function SessionGauge({ elapsedMs, plannedMs, running, breakMode, animation, label }: { elapsedMs: number; plannedMs: number | null; running: boolean; breakMode: boolean; animation: boolean; label: string }) {
  const motion = useMotionEnabled(animation);
  const turns = gaugeTurns(elapsedMs);
  const plan = planTurns(plannedMs);
  const shown = useRef(turns);
  const needle = useRef<SVGPathElement>(null), hand = useRef<SVGPathElement>(null), index = useRef<SVGPathElement>(null);
  const screw = useRef<SVGGElement>(null), lifted = useRef<SVGGElement>(null);

  useEffect(() => {
    const draw = (value: number) => {
      const lift = value * LIFT_PER_TURN;
      const parts = screwAt(lift);
      needle.current?.setAttribute('d', needleAt(value));
      hand.current?.setAttribute('d', smallHandAt(value));
      index.current?.setAttribute('d', wheelIndexAt(value));
      lifted.current?.setAttribute('transform', liftOffset(lift));
      if (screw.current) screw.current.innerHTML = k.solidSvg(parts.body, { tone: 'mid', crease: 'none' }) + k.lineSvg(parts.threads, { tone: 'lo' });
    };
    // Paused, still or hidden: jump to the recorded value. Running: ease toward it, then stop the loop.
    if (!motion || !running) { shown.current = turns; draw(turns); return; }
    let frame = 0, last = 0, drawn = 0;
    const step = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 1 / 15) : 1 / 30;
      last = now;
      const next = shown.current + (turns - shown.current) * (1 - Math.exp(-dt / 0.35));
      shown.current = Math.abs(turns - next) < 1e-4 ? turns : next;
      if (now - drawn >= FRAME_MS || shown.current === turns) { drawn = now; draw(shown.current); }
      frame = shown.current === turns ? 0 : requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [turns, motion, running]);

  return <svg className="iso-svg session-gauge" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label} focusable="false" style={{ '--figure-lit': breakMode ? 'var(--blue)' : 'var(--accent)' } as CSSProperties}>
    {BASE}
    {STAND}
    {JACK}
    <path ref={index} className="iso-line" data-tone="hi" data-free="end" d={wheelIndexAt(shown.current)} />
    {SLEEVE}
    <g ref={screw} />
    <g ref={lifted} transform={liftOffset(shown.current * LIFT_PER_TURN)}>{ANVIL}{PLUNGER}</g>
    {DIAL}
    {plan !== null && <path className="iso-line" data-tone="hi" d={planMarkAt(plan)} style={{ strokeWidth: 1.4 }} />}
    <path ref={hand} className="iso-line" data-tone="hi" data-free="start" d={smallHandAt(shown.current)} style={{ strokeWidth: 0.9 }} />
    <Dots points={dial.smallHub} tone="hi" size={0.6} />
    <path ref={needle} className="iso-line" data-tone="lit" data-free="start" d={needleAt(shown.current)} style={{ strokeWidth: 1.2 }} />
    <Solid paths={dial.hub} tone="mid" />
  </svg>;
}
