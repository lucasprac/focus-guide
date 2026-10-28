import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Badge, Button, CheckControl, EmptyState, cn } from './ui';
import { Icon, displayDay, minutesLabel, useMotionEnabled } from './components';
import NeuralVisual from './NeuralVisual';
import { layoutWorld, type Vec3, type WorldLayout } from './goal-world-layout';
import { goalStatusLabel } from '../../shared/labels';
import { WORLD_GOAL_LIMIT, worldKey, type GoalWorldModel, type WorldGoal, type WorldStatus } from '../../shared/goal-world';
import { t } from '../../shared/i18n';

type View = { yaw: number; pitch: number; zoom: number };
const initialView: View = { yaw: -.32, pitch: -.38, zoom: 1 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const statusTone: Record<WorldStatus, 'accent' | 'success' | 'neutral'> = { active: 'accent', achieved: 'success', paused: 'neutral', draft: 'neutral' };

// Perspective projection for the SVG fallback. It matches the WebGL rotation order (yaw, then pitch).
function project(point: Vec3, view: View) {
  const x = point.x * Math.cos(view.yaw) + point.z * Math.sin(view.yaw);
  const z = point.z * Math.cos(view.yaw) - point.x * Math.sin(view.yaw);
  const y = point.y * Math.cos(view.pitch) - z * Math.sin(view.pitch);
  const depth = point.y * Math.sin(view.pitch) + z * Math.cos(view.pitch);
  const scale = 7.6 / (7.6 - depth) * view.zoom * 86;
  return { x: 430 + x * scale, y: 238 - y * scale, depth, scale };
}

function FallbackMap({ layout, view, selectedId, selectedStepId, id }: { layout: WorldLayout; view: View; selectedId: string | null; selectedStepId: string | null; id: string }) {
  const neurons = layout.neurons.map(n => ({ n, soma: project(n.soma, view), synapses: n.synapses.map(p => project(p, view)) })).sort((a, b) => a.soma.depth - b.soma.depth);
  const selected = neurons.find(row => row.n.goal.id === selectedId);
  return <svg className="world-map goal-world-map" viewBox="0 0 860 480" aria-hidden="true">
    <defs><radialGradient id={`${id}-aura`}><stop stopColor="currentColor" stopOpacity=".22" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></radialGradient></defs>
    {Array.from({ length: 80 }, (_, i) => <circle key={`sky-${i}`} cx={26 + i * 137 % 808} cy={24 + i * 71 % 418} r={i % 7 === 0 ? 1.25 : .65} fill="currentColor" opacity={i % 7 === 0 ? '.22' : '.12'} />)}
    {neurons.map(({ n, soma, synapses }) => {
      const muted = n.goal.status === 'paused' ? .5 : 1, active = n.goal.id === selectedId;
      const path = [soma, ...synapses].map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      return <g key={n.goal.id} data-goal-id={n.goal.id} opacity={muted * (selectedId && !active ? .7 : 1)} style={{ color: n.goal.color }}>
        <circle cx={soma.x} cy={soma.y} r={n.radius * soma.scale * 3} fill={`url(#${id}-aura)`} />
        {synapses.length > 0 && <path d={path} fill="none" stroke="currentColor" strokeWidth="1.2" strokeOpacity=".6" strokeDasharray={n.goal.status === 'draft' ? '4 4' : undefined} />}
        {synapses.map((p, i) => { const step = n.steps[i]; return <circle key={step.id} cx={p.x} cy={p.y} r={(step.completed ? 3.4 : step.next ? 3.8 : 2.2) * (step.id === selectedStepId ? 1.6 : 1)} fill={step.completed || step.next ? 'currentColor' : 'var(--panel)'} stroke="currentColor" strokeOpacity=".7" />; })}
        <circle cx={soma.x} cy={soma.y} r={n.radius * soma.scale} fill="currentColor" fillOpacity={n.goal.status === 'draft' ? .35 : .9} stroke="currentColor" strokeWidth={active ? 2 : 1} />
      </g>;
    })}
    {selected && <text x={clamp(selected.soma.x, 100, 760)} y={clamp(selected.soma.y - selected.n.radius * selected.soma.scale - 14, 20, 460)} textAnchor="middle" className="world-field-name">{selected.n.goal.title.length > 30 ? `${selected.n.goal.title.slice(0, 29)}…` : selected.n.goal.title}</text>}
  </svg>;
}

function Inspector({ goal, areaName, selectedStepId, onSelectStep, onFocus, onOpen }: { goal: WorldGoal; areaName: string; selectedStepId: string | null; onSelectStep: (id: string | null) => void; onFocus: (stepId: string | null) => void; onOpen: () => void }) {
  const next = goal.steps.find(s => s.next), chosen = goal.steps.find(s => s.id === selectedStepId);
  const target = chosen && !chosen.completed ? chosen : next;
  return <aside className="panel goal-world-inspector" aria-label={t('Selected goal')} style={{ '--area-color': goal.color } as CSSProperties}>
    <div className="goal-world-inspector-head"><Badge tone={statusTone[goal.status]} className="capitalize">{goalStatusLabel(goal.status)}</Badge><span className="goal-world-area text-caption"><i />{areaName}</span></div>
    <h2>{goal.title}</h2>
    {goal.outcome && <p className="text-caption text-ink-muted">{goal.outcome}</p>}
    <dl className="goal-world-stats text-caption">
      <div><dt>{t('Focus time')}</dt><dd className="tabular-nums">{minutesLabel(goal.totalMinutes)}</dd></div>
      <div><dt>{t('Last 28 days')}</dt><dd className="tabular-nums">{minutesLabel(goal.minutes28)}</dd></div>
      <div><dt>{t('Actions, 28 days')}</dt><dd className="tabular-nums">{t('{count} done|{count} done', { count: goal.done })}{goal.smaller ? t(' · {smaller} smaller', { smaller: goal.smaller }) : ''}</dd></div>
    </dl>
    {goal.progress && <div className="goal-world-progress text-caption"><span>{t('Progress')}</span><strong className="tabular-nums">{goal.progress.value ?? '—'} / {goal.progress.target}{goal.progress.unit ? ` ${goal.progress.unit}` : ''}</strong><div className="horizon-progress"><span style={{ width: `${goal.progress.fraction * 100}%` }} /></div></div>}
    <div className="goal-world-roadmap">
      <div className="section-title"><h3 className="text-label">{t('Roadmap')}</h3><span className="hint">{goal.steps.length ? t('{completedSteps}/{length} steps', { completedSteps: goal.completedSteps, length: goal.steps.length }) : t('No steps yet')}</span></div>
      {goal.steps.length > 0 && <ol>{goal.steps.map(step => <li key={step.id}><button type="button" className={cn('goal-world-step text-caption', step.completed && 'is-done', step.next && 'is-next')} aria-pressed={step.id === selectedStepId} onClick={() => onSelectStep(step.id === selectedStepId ? null : step.id)}>
        <span className="goal-world-step-mark" aria-hidden="true">{step.completed && <Icon name="check" size={11} strokeWidth={2.4} />}</span>
        <span className="goal-world-step-title">{step.title}{step.next && <small>{' '}{t('· next')}</small>}</span>
        <span className="goal-world-step-meta tabular-nums">{step.effortMinutes > 0 ? minutesLabel(step.effortMinutes) : step.targetDate ? displayDay(step.targetDate, true) : ''}</span>
      </button></li>)}</ol>}
    </div>
    <div className="goal-world-actions">
      {goal.status === 'active' && <Button variant="primary" icon="focus" onClick={() => onFocus(target?.id ?? null)}>{target ? target === next ? t('Focus on next step') : t('Focus on this step') : t('Focus on this goal')}</Button>}
      <Button icon="arrow" onClick={onOpen}>{t('Open goal')}</Button>
    </div>
    {goal.status !== 'active' && <p className="hint">{goal.status === 'achieved' ? t('Achieved goals stay in the outer ring.') : t('Only active goals can start a focus session. Activate it in Goals.')}</p>}
  </aside>;
}

export default function GoalWorld({ model, animation, paletteName, color, theme, software, onOpenGoal, onFocus, onCreateGoal }: {
  model: GoalWorldModel; animation: boolean; paletteName: string; color: string; theme: 'light' | 'dark'; software: boolean;
  onOpenGoal: (id: string) => void; onFocus: (goalId: string, stepId: string | null) => void; onCreateGoal: () => void;
}) {
  const id = useId().replace(/:/g, '');
  const motion = useMotionEnabled(animation);
  const [view, setView] = useState(initialView);
  const [rotating, setRotating] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showAchieved, setShowAchieved] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; pointer: number } | null>(null), label = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => model.goals.filter(g => showAchieved || g.status !== 'achieved'), [model.goals, showAchieved]);
  const sceneGoals = useMemo(() => visible.slice(0, WORLD_GOAL_LIMIT), [visible]);
  const key = worldKey(sceneGoals);
  // The layout depends only on what the scene draws, so it is rebuilt with the scene key.
  const layout = useMemo(() => layoutWorld(sceneGoals, new Map(model.areas.map(a => [a.id, a.color]))), [key]);
  const selected = visible.find(g => g.id === selectedId) ?? visible[0];
  const focusTarget = focusId && sceneGoals.some(g => g.id === focusId) ? focusId : null;
  const moving = motion && rotating && !hovered && !focused && !dragging && !focusTarget && visible.length > 0;

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
    setView(current => ({ yaw: (current.yaw + yaw) % (Math.PI * 2), pitch: clamp(current.pitch + pitch, -.65, .65), zoom: clamp(current.zoom + zoom, .8, 1.4) }));
  }
  // Selecting a goal turns the world so that its axon points right and slightly toward you, then the camera moves in.
  function select(goalId: string, stepId: string | null = null) {
    setSelectedId(goalId); setSelectedStepId(stepId);
    const neuron = layout.neurons.find(n => n.goal.id === goalId);
    if (!neuron) { setFocusId(null); return; }
    setFocusId(goalId);
    setView(current => ({ yaw: Math.atan2(neuron.direction.z, neuron.direction.x) - .3, pitch: -.25, zoom: current.zoom }));
  }
  function overview() { setFocusId(null); setSelectedStepId(null); setView(initialView); }
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

  if (!model.goals.length) return <EmptyState title={t('Your network starts with a goal.')} action={<Button variant="primary" icon="plus" onClick={onCreateGoal}>{t('Create a goal')}</Button>}>{t('Each goal becomes a neuron. Its roadmap grows the axon, and focused time makes it stronger.')}</EmptyState>;
  const areaName = (fieldId: string) => model.areas.find(a => a.id === fieldId)?.name ?? t('Area');
  return <div className="goal-world">
    <div className="goal-world-main">
      <div className="goal-world-scene">
        <div className="constellation-meta"><span><i />{paletteName}<small> / {focusTarget ? t('goal view') : t('overview')}</small></span><span className="hint" role="status">{selected ? t('{title} · {completedSteps}/{length} steps · {minutesLabel}', { title: selected.title, completedSteps: selected.completedSteps, length: selected.steps.length, minutesLabel: minutesLabel(selected.totalMinutes) }) : ''}</span></div>
        <div className="constellation-toolbar">
          <p id={`${id}-help`} className="hint">{t('Drag to explore · Click a neuron · Arrow keys · + / − · Esc for overview')}</p>
          <div className="constellation-controls" aria-label={t('Neural World view controls')}>
            <button type="button" aria-label={t('Rotate left')} onClick={() => adjust(-.2)}><Icon name="chevron-left" size={16} className="transform-none" /></button>
            <button type="button" aria-label={t('Rotate right')} onClick={() => adjust(.2)}><Icon name="chevron" size={16} className="transform-none" /></button>
            <button type="button" aria-label={t('Tilt up')} onClick={() => adjust(0, -.12)}><Icon name="chevron-up" size={16} className="transform-none" /></button>
            <button type="button" aria-label={t('Tilt down')} onClick={() => adjust(0, .12)}><Icon name="chevron-down" size={16} className="transform-none" /></button>
            <button type="button" aria-label={t('Zoom out')} disabled={view.zoom <= .8} onClick={() => adjust(0, 0, -.1)}><Icon name="minus" size={16} /></button>
            <button type="button" aria-label={t('Zoom in')} disabled={view.zoom >= 1.4} onClick={() => adjust(0, 0, .1)}><Icon name="plus" size={16} /></button>
            <button type="button" className="constellation-text-control text-caption" disabled={!focusTarget} onClick={overview}>{t('Overview')}</button>
            <button type="button" className="constellation-text-control text-caption" aria-pressed={rotating && motion} disabled={!motion} onClick={() => setRotating(value => !value)}><Icon name={rotating && motion ? 'pause' : 'play'} size={14} />{!motion ? t('Still view') : rotating ? t('Pause orbit') : t('Resume orbit')}</button>
          </div>
        </div>
        <div className={cn('constellation-stage goal-world-stage', dragging && 'is-dragging')} role="group" tabIndex={0} data-yaw={view.yaw.toFixed(3)} data-pitch={view.pitch.toFixed(3)} data-zoom={view.zoom.toFixed(2)} data-focus-id={focusTarget ?? ''} aria-label={t('3D goal network')} aria-describedby={`${id}-help`}
          onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={() => { drag.current = null; setDragging(false); }} onKeyDown={event => {
            const key = event.key;
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home', 'Escape'].includes(key)) return;
            event.preventDefault();
            if (key === 'Home' || key === 'Escape') overview();
            else adjust(key === 'ArrowLeft' ? -.15 : key === 'ArrowRight' ? .15 : 0, key === 'ArrowUp' ? -.1 : key === 'ArrowDown' ? .1 : 0, key === '+' || key === '=' ? .05 : key === '-' ? -.05 : 0);
          }}>
          <NeuralVisual kind="world" color={color} theme={theme} software={software} visible moving={motion} goals={sceneGoals} worldKey={key} selectedId={selected?.id ?? null} selectedStepId={selectedStepId} focusId={focusTarget} view={view} labelRef={label}
            onSelect={(goalId, stepId) => select(goalId, stepId ?? null)} fallback={<FallbackMap layout={layout} view={view} selectedId={selected?.id ?? null} selectedStepId={selectedStepId} id={id} />} />
          <div className="goal-world-label" ref={label} hidden aria-hidden="true"><span>{selected?.title}</span></div>
          {!visible.length && <p className="constellation-empty">{t('Every goal here is achieved. Show achieved goals to see them.')}</p>}
        </div>
      </div>
      {selected && <Inspector goal={selected} areaName={areaName(selected.fieldId)} selectedStepId={selectedStepId} onSelectStep={stepId => { if (stepId) select(selected.id, stepId); else setSelectedStepId(null); }} onFocus={stepId => onFocus(selected.id, stepId)} onOpen={() => onOpenGoal(selected.id)} />}
    </div>
    <div className="goal-world-list" aria-label={t('Goals by area')}>
      {model.areas.map(area => {
        const rows = visible.filter(g => g.fieldId === area.id);
        return rows.length > 0 && <div className="goal-world-list-area" key={area.id} style={{ '--area-color': area.color } as CSSProperties}>
          <span className="goal-world-area text-caption"><i />{area.name}</span>
          <div className="constellation-fields">{rows.map(g => <button type="button" className="text-caption" key={g.id} data-goal-id={g.id} aria-pressed={selected?.id === g.id} onClick={() => select(g.id)}><span className="constellation-field-mark" /><span>{g.title}</span><small>{g.status === 'active' ? '' : `${(goalStatusLabel(g.status)).toLowerCase()} · `}{g.steps.length ? `${g.completedSteps}/${g.steps.length}` : minutesLabel(g.totalMinutes)}</small></button>)}</div>
        </div>;
      })}
      <div className="goal-world-list-footer text-caption">
        <label className="goal-toggle"><CheckControl aria-label={t('Show achieved goals')} checked={showAchieved} onChange={e => setShowAchieved(e.target.checked)} />{t('Show achieved goals')}</label>
        <span className="hint">{visible.length > WORLD_GOAL_LIMIT ? t('The scene shows {WORLD_GOAL_LIMIT} of {length} goals. Every goal is in this list.', { WORLD_GOAL_LIMIT, length: visible.length }) : t('There is no streak to protect. Return at your own pace.')}</span>
      </div>
    </div>
  </div>;
}
