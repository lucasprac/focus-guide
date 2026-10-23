import { useEffect, useState } from 'react';
import type { ViewProps } from './App';
import type { Goal } from '../../shared/types';
import type { CorrelationSummary, GoalBehaviourProfile } from '../../shared/behaviour-analytics';
import { addDays, localDay } from '../../shared/analytics';
import { Badge, Card, Segments } from './ui';
import { BarChart, minutesLabel } from './components';

const rate = (value: number | null, digits = 1) => value === null ? '—' : value.toFixed(digits);
const percent = (value: number | null) => value === null ? '—' : `${Math.round(value * 100)}%`;
function Association({ title, result }: { title: string; result: CorrelationSummary }) {
  return <div><span className="tiny-label text-caption tracking-normal">{title}</span><strong>ρ {result.rho === null ? '—' : result.rho.toFixed(2)}</strong><p className="hint">{result.n} pairs · {result.spanDays} days. {result.reason}</p></div>;
}

/* The goal's behaviour profile is computed in the main process, because activity samples are not part of the frequent application state. */
export function GoalBehaviour({ data, goal }: ViewProps & { goal: Goal }) {
  const today = localDay(Date.now(), data.settings.timezone);
  const [range, setRange] = useState('30'), [profile, setProfile] = useState<GoalBehaviourProfile | null>(null), [error, setError] = useState('');
  const from = range === 'all' ? '2000-01-01' : addDays(today, -Number(range) + 1);
  const linked = data.sessions.filter(s => s.goalId === goal.id && s.status === 'completed');
  const signature = linked.map(s => `${s.id}:${s.activeMs}:${s.excluded}:${s.focus}:${s.activityMode}`).join('|');
  useEffect(() => {
    let mounted = true;
    void window.focusGuide.command('goal.behaviour', { goalId: goal.id, from, to: today }).then(result => {
      if (!mounted) return;
      if (result.ok) { setProfile(result.value as GoalBehaviourProfile); setError(''); } else setError(result.error);
    }).catch(e => { if (mounted) setError(String(e)); });
    return () => { mounted = false; };
  }, [goal.id, from, today, signature, data.collector?.state]);
  const hours = profile ? profile.minutes / 60 : 0;
  return <div className="goal-behaviour">
    <div className="filter-toolbar flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-2"><Segments className="segmented" label="Behaviour date range" value={range} onChange={value => { if (value) setRange(value); }} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All time' }]} /><span className="hint">{profile ? `${profile.from === '2000-01-01' ? 'All records' : profile.from} – ${profile.to}` : ''}</span></div>
    {error ? <p role="alert" className="goal-form-error">{error}</p> : !profile ? <p role="status" className="hint">Loading this goal’s behaviour…</p> : !profile.sessions ? <Card title="No linked sessions in this range"><p className="hint">Start focus from this goal to link sessions. Sessions recorded without a goal stay unassigned.</p></Card> : <>
      <div className="stats-grid">
        <div className="stat-card rounded-card p-5"><span className="block text-caption font-medium tracking-normal text-ink-muted">Recorded time</span><strong className="my-2 text-display font-light tabular-nums">{minutesLabel(profile.minutes)}</strong><small>{profile.sessions} sessions · {profile.activeDays} days</small></div>
        <div className="stat-card rounded-card p-5"><span className="block text-caption font-medium tracking-normal text-ink-muted">Typical session</span><strong className="my-2 text-display font-light tabular-nums">{profile.medianSessionMinutes === null ? '—' : minutesLabel(profile.medianSessionMinutes)}</strong><small>Median recorded duration</small></div>
        <div className="stat-card rounded-card p-5"><span className="block text-caption font-medium tracking-normal text-ink-muted">Perceived focus</span><strong className="my-2 text-display font-light tabular-nums">{rate(profile.focus.median)}<em>{profile.focus.rated ? '/5' : ''}</em></strong><small>{profile.focus.rated} ratings · energy mean {rate(profile.energy.mean)}</small></div>
        <div className="stat-card rounded-card p-5"><span className="block text-caption font-medium tracking-normal text-ink-muted">Returns & interruptions</span><strong className="my-2 text-display font-light tabular-nums">{profile.returns} · {profile.interruptions}</strong><small>{hours > 0 ? `${rate(profile.returnsPerHour)} returns · ${rate(profile.interruptionsPerHour)} interruptions per hour` : 'Rates need recorded time'}</small></div>
      </div>
      <div className="charts-grid">
        <Card title="Time by activity mode"><BarChart rows={profile.byMode.map(row => ({ label: `${row.mode} · ${row.sessions}`, value: row.minutes }))} /></Card>
        <Card title="When you studied" actions={<span className="hint">Starting time</span>}><BarChart rows={profile.byTimeBand.map(row => ({ label: row.label, value: row.minutes }))} /></Card>
        <Card title="By day of the week"><BarChart rows={profile.byWeekday.map(row => ({ label: row.label, value: row.minutes }))} /></Card>
        {profile.byMilestone.some(row => row.milestoneId) && <Card title="Time by roadmap step"><BarChart rows={profile.byMilestone.map(row => ({ label: row.title, value: row.minutes }))} /></Card>}
      </div>
      <Card title="Computer interaction by activity mode" actions={<span className="hint">Recorded minutes only</span>}>
        <div className="goal-behaviour-table" role="table" aria-label="Computer interaction by activity mode">
          <div role="row" className="goal-behaviour-row head"><span role="columnheader">Mode</span><span role="columnheader">Coverage</span><span role="columnheader">Keys/min</span><span role="columnheader">Clicks/min</span><span role="columnheader">Scrolls/min</span><span role="columnheader">Movement</span></div>
          {profile.byMode.map(row => <div role="row" className="goal-behaviour-row" key={row.mode}><span role="cell">{row.mode}</span><span role="cell">{percent(row.coverage)}</span><span role="cell">{rate(row.keysPerMinute)}</span><span role="cell">{rate(row.clicksPerMinute)}</span><span role="cell">{rate(row.scrollsPerMinute)}</span><span role="cell">{percent(row.movementShare)}</span></div>)}
        </div>
        <p className="hint">Counts use only minutes with recorded collection. Low coverage means most of the time was not observed, so the rates describe a small part of it.</p>
      </Card>
      <div className="charts-grid">
        <Card title="Planned actions in this range"><div className="goal-counts"><span><strong>{profile.checkIns.done}</strong> full actions</span><span><strong>{profile.checkIns.smaller}</strong> smaller versions</span><span><strong>{profile.checkIns.skipped}</strong> explicit skips</span><span><strong>{profile.checkIns.unrecorded}</strong> unrecorded</span></div><div className="interruption-tags">{Object.entries(profile.checkIns.barriers).filter(([, count]) => count > 0).map(([name, count]) => <Badge key={name}>{name} · {count}</Badge>)}{!Object.values(profile.checkIns.barriers).some(Boolean) && <Badge>No reported barriers</Badge>}</div></Card>
        <Card title="Possible associations"><div className="goal-outcome-grid"><Association title="Starting energy & focus" result={profile.energyFocus} /><Association title="Duration & focus" result={profile.durationFocus} /></div></Card>
      </div>
      <div className="interruption-tags">{Object.entries(profile.interruptionCategories).sort((a, b) => b[1] - a[1]).map(([name, count]) => <Badge key={name}>{name} · {count}</Badge>)}{profile.parkedThoughts > 0 && <Badge tone="accent">{profile.parkedThoughts} parked thoughts</Badge>}</div>
      <p className="footnote">{profile.note}</p>
    </>}
  </div>;
}
