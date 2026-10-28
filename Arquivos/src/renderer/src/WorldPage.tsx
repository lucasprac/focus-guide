import { PageHeader } from './ui';
import { useMemo, type CSSProperties } from 'react';
import GoalWorld from './GoalWorld';
import type { ViewProps } from './App';
import type { GoalFocusOptions } from './GoalWorkspace';
import { totalMinutes } from '../../shared/analytics';
import { goalData, type Goal } from '../../shared/goal-types';
import { goalWorldModel } from '../../shared/goal-world';
import { Disclosure, Icon, minutesLabel } from './components';
import { t } from '../../shared/i18n';

export const palettes = [
  { id: 'cyan' as const, get name() { return t('First light'); }, color: '#62d8cd', hours: 0, get description() { return t('A quiet cyan beginning.'); } },
  { id: 'violet' as const, get name() { return t('Afterglow'); }, color: '#ac9df3', hours: 5, get description() { return t('Five hours, a softer sky.'); } },
  { id: 'amber' as const, get name() { return t('Golden hour'); }, color: '#edbe78', hours: 20, get description() { return t('Twenty hours of returning.'); } },
  { id: 'rose' as const, get name() { return t('Rose horizon'); }, color: '#eea5bb', hours: 50, get description() { return t('Fifty hours, a wider world.'); } }
];
type WorldProps = ViewProps & { openGoal: (id: string | null) => void; focusGoal: (goal: Goal, options?: GoalFocusOptions) => void };

export default function WorldPage({ data, act, openGoal, focusGoal }: WorldProps) {
  const minutes = totalMinutes(data), hours = minutes / 60;
  const model = useMemo(() => goalWorldModel(data), [data]);
  const fields = useMemo(() => data.fields.map(f => ({ ...f, minutes: data.sessions.filter(s => s.fieldId === f.id && s.status === 'completed' && !s.excluded).reduce((sum, s) => sum + s.activeMs / 60000, 0) })).sort((a, b) => b.minutes - a.minutes), [data.fields, data.sessions]);
  const next = palettes.find(p => p.hours > hours);
  const selectedPalette = palettes.find(p => p.id === data.settings.palette && hours >= p.hours) ?? palettes[0];
  const focus = (goalId: string, stepId: string | null) => { const goal = goalData(data).goals.find(g => g.id === goalId); if (goal) focusGoal(goal, { milestoneId: stepId }); };
  return <div className="world-page" style={{ '--world-color': selectedPalette.color } as CSSProperties}>
    <PageHeader title={t('Your goals, as a living network.')} description={t('Each goal is a neuron. Its roadmap grows the axon, and every focused minute makes it stronger.')} actions={<span className="world-hours tabular-nums">{hours.toFixed(1)}<small className="text-caption tracking-normal">{t('recorded hours')}</small></span>} />
    <section className="panel neural-world-panel"><GoalWorld model={model} animation={data.settings.animation} paletteName={selectedPalette.name} color={selectedPalette.color} theme={data.settings.theme} software={data.graphicsMode === 'software'} onOpenGoal={openGoal} onFocus={focus} onCreateGoal={() => openGoal(null)} /></section>
    <Disclosure title={t('Palettes & horizons')}><div className="world-progress-section"><div className="section-title"><h2>{next ? t('Your next horizon: {name}', { name: next.name }) : t('Every horizon, reached')}</h2><span className="hint">{next ? t('{v1} / {hours} hours', { v1: hours.toFixed(1), hours: next.hours }) : t('{v1} hours recorded', { v1: hours.toFixed(1) })}</span></div><div className="horizon-progress"><span style={{ width: `${next ? Math.min(100, hours / next.hours * 100) : 100}%` }} /></div><p className="hint">{t('Palettes tint the sky of your world and celebrate accumulated time. Ratings, task completion, and uninterrupted streaks are not required.')}</p></div>
    <div className="palette-grid">{palettes.map(p => <button key={p.id} aria-pressed={selectedPalette.id === p.id} className={`palette-card ${selectedPalette.id === p.id ? 'selected' : ''}`} disabled={hours < p.hours} onClick={() => void act('settings.update', { ...data.settings, palette: p.id })}><span className="palette-visual" style={{ color: p.color }}><i /><i /><i /><i /><Icon name="spark" size={26} /></span><div className="palette-card-heading"><strong className="text-label">{p.name}</strong>{hours < p.hours ? <span className="text-caption">{t('{hours}h to unlock', { hours: p.hours })}</span> : <Icon name={selectedPalette.id === p.id ? 'check' : 'arrow'} size={16} />}</div><p className="text-caption">{p.description}</p></button>)}</div>
    </Disclosure>
    <Disclosure title={t('Focus by area')}><section className="panel field-progress"><div className="section-title"><h2>{t('Every area has its own story')}</h2></div>{fields.map(f => <div className="field-progress-row text-caption" key={f.id}><span className="field-dot" style={{ background: f.color }} /><strong>{f.name}{f.archived && <small>{t('archived')}</small>}</strong><span>{minutesLabel(f.minutes)}</span></div>)}</section>
    </Disclosure>
  </div>;
}
