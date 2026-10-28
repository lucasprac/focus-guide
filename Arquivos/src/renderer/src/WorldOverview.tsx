import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Badge, Button, cn } from './ui';
import { Icon, displayDay, minutesLabel, useMotionEnabled } from './components';
import { createWorldCanvas, type WorldCanvas, type WorldGem, type WorldHit, type WorldSelection } from './WorldCanvas';
import type { MapArea, WorldMap } from './world-map';
import type { WorldGoal, WorldStatus } from '../../shared/goal-world';
import { dateLocale, t } from '../../shared/i18n';
import { goalStatusLabel } from '../../shared/labels';

const statusTone: Record<WorldStatus, 'accent' | 'success' | 'neutral'> = { active: 'accent', achieved: 'success', paused: 'neutral', draft: 'neutral' };
const dateLabel = (at: number | null) => at === null ? '—' : new Date(at).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });

function GoalInspector({ goal, areaName, onFocus, onOpen }: { goal: WorldGoal; areaName: string; onFocus: (stepId: string | null) => void; onOpen: () => void }) {
  const next = goal.steps.find(s => s.next);
  return <>
    <div className="world-inspector-head"><Badge tone={statusTone[goal.status]} className="capitalize">{goalStatusLabel(goal.status)}</Badge><span className="goal-world-area text-caption"><i />{areaName}</span></div>
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
      {goal.steps.length > 0 && <ol>{goal.steps.map(step => <li key={step.id} className={cn('goal-world-step text-caption', step.completed && 'is-done', step.next && 'is-next')}>
        <span className="goal-world-step-mark" aria-hidden="true">{step.completed && <Icon name="check" size={11} strokeWidth={2.4} />}</span>
        <span className="goal-world-step-title">{step.title}{step.next && <small> {t('· next')}</small>}</span>
        <span className="goal-world-step-meta tabular-nums">{step.effortMinutes > 0 ? minutesLabel(step.effortMinutes) : step.targetDate ? displayDay(step.targetDate, true) : ''}</span>
      </li>)}</ol>}
    </div>
    <div className="goal-world-actions">
      {goal.status === 'active' && <Button variant="primary" icon="focus" onClick={() => onFocus(next?.id ?? null)}>{next ? t('Focus on next step') : t('Focus on this goal')}</Button>}
      <Button icon="arrow" onClick={onOpen}>{t('Open goal')}</Button>
    </div>
    {goal.status === 'achieved' && <p className="hint">{t('Achieved goals wear a golden ring.')}</p>}
  </>;
}

function AreaInspector({ area, onSelect }: { area: MapArea; onSelect: (selection: WorldSelection) => void }) {
  return <>
    <div className="world-inspector-head"><span className="goal-world-area text-caption"><i />{t('Area')}</span></div>
    <h2>{area.name}</h2>
    <dl className="goal-world-stats text-caption">
      <div><dt>{t('Focus time')}</dt><dd className="tabular-nums">{minutesLabel(area.minutes)}</dd></div>
      <div><dt>{t('Last 28 days')}</dt><dd className="tabular-nums">{minutesLabel(area.minutes28)}</dd></div>
      <div><dt>{t('Sessions')}</dt><dd className="tabular-nums">{t('{count} · last {date}', { count: area.sessions, date: dateLabel(area.lastAt) })}</dd></div>
    </dl>
    <p className="hint">{t('Every session here adds a mote to this region. Sessions linked to a goal orbit that goal.')}</p>
    {area.goals.length > 0 ? <div className="world-inspector-goals">{area.goals.map(g => <button type="button" className="text-caption" key={g.goal.id} onClick={() => onSelect({ kind: 'goal', id: g.goal.id })}><span className="constellation-field-mark" /><span>{g.goal.title}</span><small>{minutesLabel(g.goal.totalMinutes)}</small></button>)}</div>
      : <p className="hint">{t('No goal in this area yet. The area still grows with each session.')}</p>}
  </>;
}

function CoreInspector({ map, earned, total, nextHorizon, canReplay, onReplay }: { map: WorldMap; earned: number; total: number; nextHorizon: string; canReplay: boolean; onReplay: () => void }) {
  const goals = map.areas.flatMap(a => a.goals), achieved = goals.filter(g => g.goal.status === 'achieved').length;
  return <>
    <div className="world-inspector-head"><span className="goal-world-area text-caption"><i />{t('You')}</span></div>
    <h2>{t('Everything you have grown')}</h2>
    <dl className="goal-world-stats world-core-stats text-caption">
      <div><dt>{t('Focus time')}</dt><dd className="tabular-nums">{minutesLabel(map.totalMinutes)}</dd></div>
      <div><dt>{t('Last 28 days')}</dt><dd className="tabular-nums">{minutesLabel(map.minutes28)}</dd></div>
      <div><dt>{t('Sessions')}</dt><dd className="tabular-nums">{map.sparks.length}</dd></div>
      <div><dt>{t('Areas')}</dt><dd className="tabular-nums">{map.areas.length}</dd></div>
      <div><dt>{t('Goals achieved')}</dt><dd className="tabular-nums">{achieved} / {goals.length}</dd></div>
      <div><dt>{t('Achievements')}</dt><dd className="tabular-nums">{earned} / {total}</dd></div>
    </dl>
    <p className="hint">{nextHorizon}</p>
    <p className="hint">{t('The ring around you is the way to your next horizon. Pulses carry your recent time to where you spent it.')}</p>
    <div className="goal-world-actions"><Button icon="play" disabled={!canReplay} onClick={onReplay}>{t('Replay your journey')}</Button></div>
  </>;
}

export default function WorldOverview({ map, color, paletteName, animation, theme, gems, horizon, nextHorizon, earned, total, onCollect, onOpenGoal, onFocus }: {
  map: WorldMap; color: string; paletteName: string; animation: boolean; theme: 'light' | 'dark'; gems: WorldGem[]; horizon: number; nextHorizon: string;
  earned: number; total: number; onCollect: (id: string) => void; onOpenGoal: (id: string) => void; onFocus: (goalId: string, stepId: string | null) => void;
}) {
  const id = useId().replace(/:/g, '');
  const motion = useMotionEnabled(animation);
  const canvas = useRef<HTMLCanvasElement>(null), tooltip = useRef<HTMLDivElement>(null), hud = useRef<HTMLSpanElement>(null), engine = useRef<WorldCanvas | null>(null);
  const [selected, setSelected] = useState<WorldSelection | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ onCollect, select: (selection: WorldSelection | null) => {} });
  const areaOf = (goalId: string) => map.areas.find(a => a.goals.some(g => g.goal.id === goalId));
  const goal = selected?.kind === 'goal' ? areaOf(selected.id)?.goals.find(g => g.goal.id === selected.id)?.goal : undefined;
  const area = selected?.kind === 'area' ? map.areas.find(a => a.id === selected.id) : undefined;
  const live = map.live && map.areas.find(a => a.id === map.live!.areaId);

  function select(selection: WorldSelection | null) {
    const next = selection?.kind === 'core' ? null : selection;
    setSelected(next); engine.current?.focus(next);
  }
  latest.current = { onCollect, select };

  useEffect(() => {
    if (!canvas.current || !tooltip.current || !hud.current) return;
    try {
      engine.current = createWorldCanvas(canvas.current, { onSelect: s => latest.current.select(s), onCollect: gem => latest.current.onCollect(gem), onReplay: setReplaying, tooltip: tooltip.current, hud: hud.current });
    } catch { setFailed(true); }
    return () => { engine.current?.dispose(); engine.current = null; };
  }, []);
  useEffect(() => {
    const describe = (hit: WorldHit) => {
      if (hit.kind === 'gem') return { title: gems.find(g => g.id === hit.id)?.title ?? t('Achievement'), detail: t('Earned · click to collect') };
      if (hit.kind === 'core') return { title: t('You'), detail: t('{time} · {count} session|{time} · {count} sessions', { time: minutesLabel(map.totalMinutes), count: map.sparks.length }) };
      if (hit.kind === 'area') { const a = map.areas.find(row => row.id === hit.id); return { title: a?.name ?? t('Area'), detail: a ? t('{time} · {count} session|{time} · {count} sessions', { time: minutesLabel(a.minutes), count: a.sessions }) : '' }; }
      const g = areaOf(hit.id)?.goals.find(row => row.goal.id === hit.id)?.goal;
      return { title: g?.title ?? t('Goal'), detail: g ? `${minutesLabel(g.totalMinutes)}${g.steps.length ? ` · ${t('{completedSteps}/{length} steps', { completedSteps: g.completedSteps, length: g.steps.length })}` : ''}` : '' };
    };
    engine.current?.update({ map, color, theme, motion, selected, gems, horizon, describe });
  }, [map, color, theme, motion, selected, gems, horizon]);
  // A selection whose goal or area left the map returns to the overview.
  useEffect(() => { if (selected && !goal && !area) setSelected(null); }, [selected, goal, area]);
  useEffect(() => { if (!motion) engine.current?.stopReplay(); }, [motion]);

  return <div className="world-overview">
    <div className="world-overview-main">
      <div className="world-overview-scene">
        <div className="constellation-meta"><span><i />{paletteName}<small> / {goal ? t('goal view') : area ? t('area view') : t('overview')}</small></span>{live ? <span className="world-live text-caption" role="status"><i style={{ background: live.color }} />{t('Focusing now in {name}', { name: live.name })}</span> : <span className="hint">{replaying ? t('Replaying your journey…') : t('Every mote is a session you finished.')}</span>}</div>
        <div className="constellation-toolbar">
          <p id={`${id}-help`} className="hint">{t('Drag to move · Ctrl + scroll to zoom · Click a region, goal or golden gem · Arrow keys · Esc for overview')}</p>
          <div className="constellation-controls" aria-label={t('Neural World view controls')}>
            <button type="button" className="constellation-text-control text-caption" disabled={!motion || !map.sparks.length} onClick={() => replaying ? engine.current?.stopReplay() : engine.current?.replay()}><Icon name={replaying ? 'stop' : 'play'} size={14} />{replaying ? t('Stop replay') : t('Replay')}</button>
            <button type="button" aria-label={t('Zoom out')} onClick={() => engine.current?.zoom(1 / 1.25)}><Icon name="minus" size={16} /></button>
            <button type="button" aria-label={t('Zoom in')} onClick={() => engine.current?.zoom(1.25)}><Icon name="plus" size={16} /></button>
            <button type="button" className="constellation-text-control text-caption" onClick={() => select(null)}>{t('Overview')}</button>
          </div>
        </div>
        <div className="world-stage" role="group" tabIndex={0} aria-label={t('Neural World map')} aria-describedby={`${id}-help`} onKeyDown={event => {
          const step = .12, key = event.key;
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home', 'Escape'].includes(key)) return;
          event.preventDefault();
          if (key === 'Home' || key === 'Escape') select(null);
          else if (key === '+' || key === '=') engine.current?.zoom(1.2);
          else if (key === '-') engine.current?.zoom(1 / 1.2);
          else engine.current?.pan(key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0, key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0);
        }}>
          <canvas ref={canvas} className="world-canvas" aria-hidden="true" />
          <span className="world-hud tabular-nums" ref={hud} aria-hidden="true" />
          <div className="world-tooltip text-caption" ref={tooltip} hidden aria-hidden="true" />
          {failed && <p className="constellation-empty">{t('The map cannot draw on this device. Every area and goal stays in the list below.')}</p>}
        </div>
      </div>
      <aside className="panel world-inspector" aria-label={t('Selection details')} aria-live="polite" style={{ '--area-color': goal ? areaOf(goal.id)?.color : area?.color ?? color } as CSSProperties}>
        {goal ? <GoalInspector goal={goal} areaName={areaOf(goal.id)?.name ?? t('Area')} onFocus={stepId => onFocus(goal.id, stepId)} onOpen={() => onOpenGoal(goal.id)} />
          : area ? <AreaInspector area={area} onSelect={select} />
          : <CoreInspector map={map} earned={earned} total={total} nextHorizon={nextHorizon} canReplay={motion && map.sparks.length > 0} onReplay={() => engine.current?.replay()} />}
      </aside>
    </div>
    <div className="goal-world-list" aria-label={t('Areas and goals')}>
      {map.areas.map(row => <div className="goal-world-list-area" key={row.id} style={{ '--area-color': row.color } as CSSProperties}>
        <button type="button" className="world-list-area text-caption" aria-pressed={selected?.kind === 'area' && selected.id === row.id} onClick={() => select({ kind: 'area', id: row.id })}><i />{row.name}<small>{t('{time} · {count} session|{time} · {count} sessions', { time: minutesLabel(row.minutes), count: row.sessions })}</small></button>
        {row.goals.length > 0 && <div className="constellation-fields">{row.goals.map(g => <button type="button" className="text-caption" key={g.goal.id} aria-pressed={selected?.id === g.goal.id} onClick={() => select({ kind: 'goal', id: g.goal.id })}><span className="constellation-field-mark" /><span>{g.goal.title}</span><small>{g.goal.status === 'active' ? '' : `${goalStatusLabel(g.goal.status)} · `}{g.goal.steps.length ? `${g.goal.completedSteps}/${g.goal.steps.length}` : minutesLabel(g.goal.totalMinutes)}</small></button>)}</div>}
      </div>)}
      <p className="hint goal-world-list-footer">{t('There is no streak to protect. Return at your own pace.')}</p>
    </div>
  </div>;
}
