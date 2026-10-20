import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Icon, minutesLabel, useMotionEnabled } from './components';
import NeuralVisual from './NeuralVisual';

type Region = { id: string; name: string; minutes: number };
type Point = { x: number; y: number; z: number };
type View = { yaw: number; pitch: number; zoom: number };
const initialView: View = { yaw: -.32, pitch: -.22, zoom: 1 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Perspective projection keeps the scene independent of a GPU or WebGL runtime.
function project(point: Point, view: View) {
  const x = point.x * Math.cos(view.yaw) + point.z * Math.sin(view.yaw);
  const z = point.z * Math.cos(view.yaw) - point.x * Math.sin(view.yaw);
  const y = point.y * Math.cos(view.pitch) - z * Math.sin(view.pitch);
  const depth = point.y * Math.sin(view.pitch) + z * Math.cos(view.pitch);
  const scale = 760 / (760 - depth) * view.zoom;
  return { x: 430 + x * scale, y: 238 + y * scale, depth, scale };
}

function clusters(regions: Region[]) {
  return regions.map((field, index) => {
    const angle = index / Math.max(1, regions.length) * Math.PI * 2 - Math.PI / 3;
    const center = { x: Math.cos(angle) * 228, y: Math.sin(angle * 2 + .5) * 76, z: Math.sin(angle) * 190 };
    const count = 6 + Math.min(14, Math.floor(Math.max(0, field.minutes) / 30));
    const stars = Array.from({ length: count }, (_, i) => {
      const theta = i * 2.399963, height = Math.sin(i * 1.73), radius = 18 + Math.sqrt(i + 1) * 9;
      return { x: center.x + Math.cos(theta) * radius, y: center.y + height * radius, z: center.z + Math.sin(theta) * radius };
    });
    return { field, center, stars };
  });
}

export default function Constellation({ regions, animation, paletteName, color, theme, software = false }: { regions: Region[]; animation: boolean; paletteName: string; color: string; theme: 'light' | 'dark'; software?: boolean }) {
  const id = useId().replace(/:/g, '');
  const motion = useMotionEnabled(animation);
  const [view, setView] = useState(initialView);
  const [rotating, setRotating] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const model = useMemo(() => clusters(regions), [regions]);
  const selected = regions.find(field => field.id === selectedId) ?? regions[0];
  const moving = motion && rotating && !hovered && !focused && !dragging && regions.length > 0;

  useEffect(() => {
    if (!moving) return;
    let frame = 0, previous = 0;
    const tick = (now: number) => {
      if (!previous) previous = now;
      const elapsed = now - previous;
      if (elapsed >= 40) {
        setView(current => ({ ...current, yaw: (current.yaw + Math.min(elapsed, 80) * .000055) % (Math.PI * 2) }));
        previous = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [moving]);

  function adjust(yaw = 0, pitch = 0, zoom = 0) {
    setView(current => ({ yaw: (current.yaw + yaw) % (Math.PI * 2), pitch: clamp(current.pitch + pitch, -.65, .65), zoom: clamp(current.zoom + zoom, .8, 1.25) }));
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    setDragging(true);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = drag.current;
    if (!previous || previous.pointer !== event.pointerId) return;
    const width = Math.max(1, event.currentTarget.clientWidth);
    adjust((event.clientX - previous.x) / width * 3.5, (event.clientY - previous.y) / width * 2.5);
    drag.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const rendered = model.map(cluster => ({ ...cluster, anchor: project(cluster.center, view), points: cluster.stars.map(point => project(point, view)) })).sort((a, b) => a.anchor.depth - b.anchor.depth);
  const orbit = (plane: number) => Array.from({ length: 97 }, (_, i) => {
    const angle = i / 96 * Math.PI * 2, x = Math.cos(angle) * 240, y = Math.sin(angle) * 240;
    const point = project(plane === 0 ? { x, y: 0, z: y } : plane === 1 ? { x, y: y * .72, z: y * .45 } : { x: x * .45, y: y * .8, z: x }, view);
    return `${i === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }).join(' ');

  function core() {
    return <g key="core" className="constellation-core">
      <circle cx="430" cy="238" r={82 * view.zoom} fill={`url(#${id}-aura)`} />
      <circle cx="430" cy="238" r={26 * view.zoom} fill={`url(#${id}-sphere)`} stroke="currentColor" strokeOpacity=".25" />
      <ellipse cx="430" cy="238" rx={36 * view.zoom} ry={12 * view.zoom} fill="none" stroke="currentColor" strokeOpacity=".3" transform="rotate(-26 430 238)" />
      <circle cx="424" cy="230" r="3" fill="var(--panel)" opacity=".9" />
    </g>;
  }
  function region(cluster: typeof rendered[number]) {
    const { field, anchor, points } = cluster;
    const active = field.id === selected?.id, opacity = field.minutes > 0 ? 1 : .45;
    return <g key={field.id} className="constellation-cluster" data-field-id={field.id} data-depth={anchor.depth.toFixed(2)} opacity={clamp(.78 + anchor.depth / 1100, .45, 1)}>
      <title>{field.name}: {minutesLabel(field.minutes)} recorded</title>
      <path className="world-link" d={`M430 238 Q${(430 + anchor.x) / 2} ${anchor.y + 30} ${anchor.x} ${anchor.y}`} fill="none" stroke="currentColor" strokeWidth=".8" strokeOpacity={active ? '.3' : '.12'} strokeDasharray="2 7" />
      <circle cx={anchor.x} cy={anchor.y} r={62 * anchor.scale} fill={`url(#${id}-aura)`} opacity={active ? 1 : .45} />
      {points.map((point, index) => <g key={index}>
        {index > 0 && <path className="world-link" d={`M${points[Math.floor((index - 1) / 2)].x} ${points[Math.floor((index - 1) / 2)].y}L${point.x} ${point.y}`} fill="none" stroke="currentColor" strokeWidth={.8 * point.scale} opacity={opacity * .55} />}
        <circle cx={point.x} cy={point.y} r={(index === 0 ? 5 : 2.5) * point.scale} fill={`url(#${id}-sphere)`} opacity={opacity} />
        {index % 4 === 0 && <circle cx={point.x} cy={point.y} r={7 * point.scale} fill="currentColor" opacity=".07" />}
      </g>)}
    </g>;
  }

  return <div className="constellation" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <div className="constellation-meta"><span><i />{paletteName}<small> / 3D space</small></span><span className="hint" role="status">{selected ? `${selected.name} · ${minutesLabel(selected.minutes)}` : 'A little space for your first field'}</span></div>
    <div className="constellation-toolbar">
      <p id={`${id}-help`} className="hint">Drag to explore · Arrow keys to turn · + / − to zoom</p>
      <div className="constellation-controls" aria-label="Constellation view controls">
        <button type="button" aria-label="Rotate left" onClick={() => adjust(-.2)}><Icon name="chevron-left" size={16} className="transform-none" /></button>
        <button type="button" aria-label="Rotate right" onClick={() => adjust(.2)}><Icon name="chevron" size={16} className="transform-none" /></button>
        <button type="button" aria-label="Tilt up" onClick={() => adjust(0, -.12)}><Icon name="chevron-up" size={16} className="transform-none" /></button>
        <button type="button" aria-label="Tilt down" onClick={() => adjust(0, .12)}><Icon name="chevron-down" size={16} className="transform-none" /></button>
        <button type="button" aria-label="Zoom out" disabled={view.zoom <= .8} onClick={() => adjust(0, 0, -.1)}><Icon name="minus" size={16} /></button>
        <button type="button" aria-label="Zoom in" disabled={view.zoom >= 1.25} onClick={() => adjust(0, 0, .1)}><Icon name="plus" size={16} /></button>
        <button type="button" className="constellation-text-control text-caption" onClick={() => setView(initialView)}>Reset view</button>
        <button type="button" className="constellation-text-control text-caption" aria-pressed={rotating && motion} disabled={!motion} onClick={() => setRotating(value => !value)}><Icon name={rotating && motion ? 'pause' : 'play'} size={14} />{!motion ? 'Still view' : rotating ? 'Pause orbit' : 'Resume orbit'}</button>
      </div>
    </div>
    <div className={`constellation-stage ${dragging ? 'is-dragging' : ''}`} role="group" tabIndex={0} data-yaw={view.yaw.toFixed(3)} data-pitch={view.pitch.toFixed(3)} data-zoom={view.zoom.toFixed(2)} aria-label="3D focus constellation" aria-describedby={`${id}-help`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={() => { drag.current = null; setDragging(false); }} onKeyDown={event => {
      const key = event.key;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(key)) return;
      event.preventDefault();
      if (key === 'Home') setView(initialView);
      else adjust(key === 'ArrowLeft' ? -.15 : key === 'ArrowRight' ? .15 : 0, key === 'ArrowUp' ? -.1 : key === 'ArrowDown' ? .1 : 0, key === '+' || key === '=' ? .05 : key === '-' ? -.05 : 0);
    }}>
      <NeuralVisual kind="world" color={color} theme={theme} software={software} visible moving={false} regions={regions} selectedId={selected?.id} view={view} onSelect={setSelectedId} fallback={<svg className="world-map constellation-map" viewBox="0 0 860 480" aria-hidden="true" data-yaw={view.yaw.toFixed(3)} data-pitch={view.pitch.toFixed(3)} data-zoom={view.zoom.toFixed(2)}>
        <defs>
          <radialGradient id={`${id}-aura`}><stop stopColor="currentColor" stopOpacity=".2" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></radialGradient>
          <radialGradient id={`${id}-sphere`} cx="30%" cy="25%" r="75%"><stop stopColor="#fff" /><stop offset=".32" stopColor="currentColor" /><stop offset="1" stopColor="color-mix(in srgb, currentColor 68%, var(--text))" stopOpacity=".85" /></radialGradient>
        </defs>
        <ellipse cx="430" cy="416" rx="235" ry="25" fill={`url(#${id}-aura)`} opacity=".55" />
        {Array.from({ length: 80 }, (_, i) => <circle key={`sky-${i}`} cx={26 + i * 137 % 808} cy={24 + i * 71 % 418} r={i % 7 === 0 ? 1.25 : .65} fill="currentColor" opacity={i % 7 === 0 ? '.22' : '.12'} />)}
        <g fill="none" stroke="currentColor" strokeWidth=".65" opacity=".23">{[0, 1, 2].map(plane => <path key={plane} d={orbit(plane)} />)}</g>
        {rendered.filter(cluster => cluster.anchor.depth < 0).map(region)}
        {core()}
        {rendered.filter(cluster => cluster.anchor.depth >= 0).map(region)}
        {rendered.filter(cluster => cluster.field.id === selected?.id).map(({ field, anchor }) => {
          const labelY = clamp(anchor.y - 65 * anchor.scale, 35, 425);
          return <g key={`label-${field.id}`} className="constellation-label"><path d={`M${anchor.x} ${labelY + 8} L${anchor.x} ${anchor.y - 40 * anchor.scale}`} stroke="currentColor" strokeOpacity=".55" /><text x={clamp(anchor.x, 100, 760)} y={labelY} textAnchor="middle" className="world-field-name">{field.name.length > 24 ? `${field.name.slice(0, 23)}…` : field.name}</text></g>;
        })}
      </svg>} />
      {!regions.length && <p className="constellation-empty">Add a focus field to begin your constellation.</p>}
    </div>
    {regions.length > 0 && <div className="constellation-fields" aria-label="Focus fields">{regions.map(field => <button type="button" className="text-caption" key={field.id} data-field-id={field.id} aria-pressed={selected?.id === field.id} onClick={() => setSelectedId(field.id)}><span className="constellation-field-mark" /><span>{field.name}</span><small>{minutesLabel(field.minutes)}</small></button>)}</div>}
  </div>;
}
