import { PageHeader } from './ui';
import { useMemo, type CSSProperties } from 'react';
import Constellation from './Constellation';
import type { ViewProps } from './App';
import { totalMinutes } from '../../shared/analytics';
import { Disclosure, Icon, minutesLabel } from './components';

export const palettes = [
  { id: 'cyan' as const, name: 'First light', color: '#62d8cd', hours: 0, description: 'A quiet cyan beginning.' },
  { id: 'violet' as const, name: 'Afterglow', color: '#ac9df3', hours: 5, description: 'Five hours, a softer sky.' },
  { id: 'amber' as const, name: 'Golden hour', color: '#edbe78', hours: 20, description: 'Twenty hours of returning.' },
  { id: 'rose' as const, name: 'Rose horizon', color: '#eea5bb', hours: 50, description: 'Fifty hours, a wider world.' }
];
export default function WorldPage({ data, act }: ViewProps) {
  const minutes = totalMinutes(data), hours = minutes / 60;
  const fields = useMemo(() => data.fields.map(f => ({ ...f, minutes: data.sessions.filter(s => s.fieldId === f.id && s.status === 'completed' && !s.excluded).reduce((sum, s) => sum + s.activeMs / 60000, 0) })).sort((a, b) => b.minutes - a.minutes), [data.fields, data.sessions]);
  const regions = fields.slice(0, 8), next = palettes.find(p => p.hours > hours);
  const selectedPalette = palettes.find(p => p.id === data.settings.palette && hours >= p.hours) ?? palettes[0];
  const starCount = regions.reduce((sum, f) => sum + 6 + Math.min(14, Math.floor(f.minutes / 30)), 0);
  return <div className="world-page" style={{ '--world-color': selectedPalette.color } as CSSProperties}>
    <PageHeader title="Your world is taking shape." description="Every field has a place. Every saved minute adds to your story." actions={<span className="world-hours tabular-nums">{hours.toFixed(1)}<small className="text-caption tracking-normal">recorded hours</small></span>} />
    <section className="panel neural-world-panel"><div className="world-caption"><span className="tiny-label text-caption tracking-normal">Your focus constellation</span><span className="hint">{starCount} visual points · {fields.length} fields</span></div><Constellation regions={regions} animation={data.settings.animation} paletteName={selectedPalette.name} color={selectedPalette.color} theme={data.settings.theme} software={data.graphicsMode === 'software'} /><div className="world-bottom"><p>There is no streak to protect. Return at your own pace.</p><span>{regions.length < fields.length ? `Showing 8 of ${fields.length} fields` : 'A visual metaphor for recorded time'}</span></div></section>
    <Disclosure title="Palettes & horizons"><div className="world-progress-section"><div className="section-title"><h2>{next ? `Your next horizon: ${next.name}` : 'Every horizon, reached'}</h2><span className="hint">{next ? `${hours.toFixed(1)} / ${next.hours} hours` : `${hours.toFixed(1)} hours recorded`}</span></div><div className="horizon-progress"><span style={{ width: `${next ? Math.min(100, hours / next.hours * 100) : 100}%` }} /></div><p className="hint">Palettes celebrate accumulated time. Ratings, task completion, and uninterrupted streaks are not required.</p></div>
    <div className="palette-grid">{palettes.map(p => <button key={p.id} aria-pressed={selectedPalette.id === p.id} className={`palette-card ${selectedPalette.id === p.id ? 'selected' : ''}`} disabled={hours < p.hours} onClick={() => void act('settings.update', { ...data.settings, palette: p.id })}><span className="palette-visual" style={{ color: p.color }}><i /><i /><i /><i /><Icon name="spark" size={26} /></span><div className="palette-card-heading"><strong className="text-label">{p.name}</strong>{hours < p.hours ? <span className="text-caption">{p.hours}h to unlock</span> : <Icon name={selectedPalette.id === p.id ? 'check' : 'arrow'} size={16} />}</div><p className="text-caption">{p.description}</p></button>)}</div>
    </Disclosure>
    <Disclosure title="Focus by field"><section className="panel field-progress"><div className="section-title"><h2>Every field has its own story</h2></div>{fields.map(f => <div className="field-progress-row text-caption" key={f.id}><span className="field-dot" style={{ background: f.color }} /><strong>{f.name}{f.archived && <small>archived</small>}</strong><span>{minutesLabel(f.minutes)}</span></div>)}</section>
    </Disclosure>
  </div>;
}
