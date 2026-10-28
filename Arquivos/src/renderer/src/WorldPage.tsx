import { PageHeader } from './ui';
import { useMemo, type CSSProperties } from 'react';
import GoalWorld from './GoalWorld';
import type { ViewProps } from './App';
import type { GoalFocusOptions } from './GoalWorkspace';
import { totalMinutes } from '../../shared/analytics';
import { goalData, type Goal } from '../../shared/goal-types';
import { goalWorldModel } from '../../shared/goal-world';
import { Disclosure, Icon, minutesLabel } from './components';

export const palettes = [
  { id: 'cyan' as const, name: 'Primeira luz', color: '#62d8cd', hours: 0, description: 'Um começo calmo em ciano.' },
  { id: 'violet' as const, name: 'Luz do entardecer', color: '#ac9df3', hours: 5, description: 'Cinco horas, um céu mais suave.' },
  { id: 'amber' as const, name: 'Hora dourada', color: '#edbe78', hours: 20, description: 'Vinte horas de retornos.' },
  { id: 'rose' as const, name: 'Horizonte rosa', color: '#eea5bb', hours: 50, description: 'Cinquenta horas, um mundo mais amplo.' }
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
    <PageHeader title="Suas metas, como uma rede viva." description="Cada meta é um neurônio. O roteiro faz o axônio crescer, e cada minuto de foco o fortalece." actions={<span className="world-hours tabular-nums">{hours.toFixed(1)}<small className="text-caption tracking-normal">horas registradas</small></span>} />
    <section className="panel neural-world-panel"><GoalWorld model={model} animation={data.settings.animation} paletteName={selectedPalette.name} color={selectedPalette.color} theme={data.settings.theme} software={data.graphicsMode === 'software'} onOpenGoal={openGoal} onFocus={focus} onCreateGoal={() => openGoal(null)} /></section>
    <Disclosure title="Paletas e horizontes"><div className="world-progress-section"><div className="section-title"><h2>{next ? `Seu próximo horizonte: ${next.name}` : 'Todos os horizontes alcançados'}</h2><span className="hint">{next ? `${hours.toFixed(1)} / ${next.hours} horas` : `${hours.toFixed(1)} horas registradas`}</span></div><div className="horizon-progress"><span style={{ width: `${next ? Math.min(100, hours / next.hours * 100) : 100}%` }} /></div><p className="hint">As paletas colorem o céu do seu mundo e celebram o tempo acumulado. Avaliações, tarefas concluídas e sequências sem interrupção não são necessárias.</p></div>
    <div className="palette-grid">{palettes.map(p => <button key={p.id} aria-pressed={selectedPalette.id === p.id} className={`palette-card ${selectedPalette.id === p.id ? 'selected' : ''}`} disabled={hours < p.hours} onClick={() => void act('settings.update', { ...data.settings, palette: p.id })}><span className="palette-visual" style={{ color: p.color }}><i /><i /><i /><i /><Icon name="spark" size={26} /></span><div className="palette-card-heading"><strong className="text-label">{p.name}</strong>{hours < p.hours ? <span className="text-caption">{p.hours}h para desbloquear</span> : <Icon name={selectedPalette.id === p.id ? 'check' : 'arrow'} size={16} />}</div><p className="text-caption">{p.description}</p></button>)}</div>
    </Disclosure>
    <Disclosure title="Foco por área"><section className="panel field-progress"><div className="section-title"><h2>Cada área tem a sua própria história</h2></div>{fields.map(f => <div className="field-progress-row text-caption" key={f.id}><span className="field-dot" style={{ background: f.color }} /><strong>{f.name}{f.archived && <small>arquivada</small>}</strong><span>{minutesLabel(f.minutes)}</span></div>)}</section>
    </Disclosure>
  </div>;
}
