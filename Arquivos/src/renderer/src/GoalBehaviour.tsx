import { useEffect, useState } from 'react';
import type { ViewProps } from './App';
import type { Goal } from '../../shared/types';
import type { GoalBehaviourProfile } from '../../shared/behaviour-analytics';
import { goalData } from '../../shared/goal-types';
import { addDays, localDay, monday } from '../../shared/analytics';
import InsightsPanel from './InsightsPanel';
import { Badge, Card, Segments } from './ui';
import { BarChart, minutesLabel } from './components';
import { barrierLabel, activityModeLabel, interruptionLabel, weekdayLabel } from '../../shared/labels';
import { t } from '../../shared/i18n';

const rate = (value: number | null, digits = 1) => value === null ? '—' : value.toFixed(digits);
/* The goal's effort summary and planning counts come from `goal.behaviour`, computed in the main process because activity samples are not part of the frequent application state.
   Attention, interaction and suggestions below them are the same insights as in Patterns, limited to this goal and the chosen range. */
export function GoalBehaviour({ data, act, goal }: ViewProps & { goal: Goal }) {
  const today = localDay(Date.now(), data.settings.timezone);
  const [range, setRange] = useState('30'), [profile, setProfile] = useState<GoalBehaviourProfile | null>(null), [error, setError] = useState(''), [tried, setTried] = useState('');
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
  // A suggestion joins this week's goal review, after any adjustment already saved there.
  const week = monday(today), saved = goalData(data).goalReviews.find(r => r.goalId === goal.id && r.week === week);
  const tryNextWeek = async (text: string) => {
    const adjustment = ((saved?.adjustment.trim() ? `${saved.adjustment.trim()}\n${text}` : text)).slice(0, 2000);
    const result = await act('goal.review.save', { goalId: goal.id, week, adjustment, previousOutcome: saved?.previousOutcome ?? 'undecided' });
    setTried(result.ok ? t('Added to this week’s goal review in Plan & review.') : result.error);
  };
  return <div className="goal-behaviour">
    <div className="filter-toolbar flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-2"><Segments className="segmented" label={t('Behaviour date range')} value={range} onChange={value => { if (value) setRange(value); }} options={[{ value: '7', label: t('7 days') }, { value: '30', label: t('30 days') }, { value: '90', label: t('90 days') }, { value: 'all', label: t('All time') }]} /><span className="hint">{profile ? `${profile.from === '2000-01-01' ? t('All records') : profile.from} – ${profile.to}` : ''}</span></div>
    {error ? <p role="alert" className="goal-form-error">{error}</p> : !profile ? <p role="status" className="hint">{t('Loading this goal’s behaviour…')}</p> : !profile.sessions ? <Card title={t('No linked sessions in this range')}><p className="hint">{t('Start focus from this goal to link sessions. Sessions recorded without a goal stay unassigned.')}</p></Card> : <>
      <div className="stats-grid">
        <div className="stat-card rounded-card p-5"><span className="block text-caption font-medium tracking-normal text-ink-muted">{t('Recorded time')}</span><strong className="my-2 text-display font-light tabular-nums">{minutesLabel(profile.minutes)}</strong><small>{t('{sessions} sessions · {activeDays} days', { sessions: profile.sessions, activeDays: profile.activeDays })}</small></div>
        <div className="stat-card rounded-card p-5"><span className="block text-caption font-medium tracking-normal text-ink-muted">{t('Typical session')}</span><strong className="my-2 text-display font-light tabular-nums">{profile.medianSessionMinutes === null ? '—' : minutesLabel(profile.medianSessionMinutes)}</strong><small>{t('Median recorded duration')}</small></div>
        <div className="stat-card rounded-card p-5"><span className="block text-caption font-medium tracking-normal text-ink-muted">{t('Perceived focus')}</span><strong className="my-2 text-display font-light tabular-nums">{rate(profile.focus.median)}<em>{profile.focus.rated ? '/5' : ''}</em></strong><small>{t('{rated} ratings · energy mean {rate}', { rated: profile.focus.rated, rate: rate(profile.energy.mean) })}</small></div>
        <div className="stat-card rounded-card p-5"><span className="block text-caption font-medium tracking-normal text-ink-muted">{t('Returns & interruptions')}</span><strong className="my-2 text-display font-light tabular-nums">{profile.returns} · {profile.interruptions}</strong><small>{hours > 0 ? t('{rate} returns · {rate2} interruptions per hour', { rate: rate(profile.returnsPerHour), rate2: rate(profile.interruptionsPerHour) }) : t('Rates need recorded time')}</small></div>
      </div>
      <div className="charts-grid">
        <Card title={t('Time by activity mode')}><BarChart rows={profile.byMode.map(row => ({ label: `${activityModeLabel(row.mode)} · ${row.sessions}`, value: row.minutes }))} /></Card>
        <Card title={t('When you studied')} actions={<span className="hint">{t('Starting time')}</span>}><BarChart rows={profile.byTimeBand.map(row => ({ label: row.label, value: row.minutes }))} /></Card>
        <Card title={t('By day of the week')}><BarChart rows={profile.byWeekday.map(row => ({ label: weekdayLabel(row.label), value: row.minutes }))} /></Card>
        {profile.byMilestone.some(row => row.milestoneId) && <Card title={t('Time by roadmap step')}><BarChart rows={profile.byMilestone.map(row => ({ label: row.title, value: row.minutes }))} /></Card>}
      </div>
      <div className="charts-grid">
        <Card title={t('Planned actions in this range')}><div className="goal-counts"><span><strong>{profile.checkIns.done}</strong>{' '}{t('full actions')}</span><span><strong>{profile.checkIns.smaller}</strong>{' '}{t('smaller versions')}</span><span><strong>{profile.checkIns.skipped}</strong>{' '}{t('explicit skips')}</span><span><strong>{profile.checkIns.unrecorded}</strong>{' '}{t('unrecorded')}</span></div><div className="interruption-tags">{Object.entries(profile.checkIns.barriers).filter(([, count]) => count > 0).map(([name, count]) => <Badge key={name}>{barrierLabel(name)} · {count}</Badge>)}{!Object.values(profile.checkIns.barriers).some(Boolean) && <Badge>{t('No reported barriers')}</Badge>}</div></Card>
      </div>
      <div className="interruption-tags">{Object.entries(profile.interruptionCategories).sort((a, b) => b[1] - a[1]).map(([name, count]) => <Badge key={name}>{interruptionLabel(name)} · {count}</Badge>)}{profile.parkedThoughts > 0 && <Badge tone="accent">{t('{parkedThoughts} parked thoughts', { parkedThoughts: profile.parkedThoughts })}</Badge>}</div>
      <p className="footnote">{profile.note}</p>
      <div className="section-heading"><h2>{t('Attention and interaction for this goal')}</h2><p>{t('The same figures as in Patterns, for sessions linked to this goal in the range above. {tried}', { tried })}</p></div>
      <InsightsPanel data={data} example={false} from={from} to={today} fieldId="" goalId={goal.id} onTry={text => void tryNextWeek(text)} />
    </>}
  </div>;
}
