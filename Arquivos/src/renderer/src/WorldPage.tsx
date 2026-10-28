import { PageHeader, Card } from './ui';
import { useMemo, type CSSProperties } from 'react';
import WorldOverview from './WorldOverview';
import Achievements, { progressLabel } from './Achievements';
import type { ViewProps } from './App';
import type { GoalFocusOptions } from './GoalWorkspace';
import { goalData, type Goal } from '../../shared/goal-types';
import { PALETTES, evaluateAchievements, paletteUnlocked, paletteUnlockLabel } from '../../shared/achievements';
import { buildWorldMap } from './world-map';
import { Icon } from './components';
import { t } from '../../shared/i18n';

type WorldProps = ViewProps & { openGoal: (id: string | null) => void; focusGoal: (goal: Goal, options?: GoalFocusOptions) => void };

export default function WorldPage({ data, act, openGoal, focusGoal }: WorldProps) {
  const map = useMemo(() => buildWorldMap(data), [data]);
  // Titles and palette names are read here, so they follow the language of the current data.
  const achievements = useMemo(() => evaluateAchievements(data), [data]);
  const palettes = useMemo(() => PALETTES.map(p => ({ ...p, unlocked: paletteUnlocked(p, data, achievements) })), [data, achievements]);
  const selectedPalette = palettes.find(p => p.id === data.settings.palette && p.unlocked) ?? palettes[0];
  const hours = map.totalMinutes / 60;
  // The ring around you follows the next time milestone, the ladder that never ends early.
  const nextTime = achievements.find(a => a.category === 'time' && a.unit === 'h' && !a.unlocked);
  const gems = useMemo(() => achievements.filter(a => a.unlocked && !a.collectedAt).map(a => ({ id: a.id, title: a.title })), [achievements]);
  const earned = achievements.filter(a => a.unlocked).length;
  const focus = (goalId: string, stepId: string | null) => { const goal = goalData(data).goals.find(g => g.id === goalId); if (goal) focusGoal(goal, { milestoneId: stepId }); };
  const collect = async (ids: string[]) => (await act('achievements.collect', { ids })).ok;
  return <div className="world-page" style={{ '--world-color': selectedPalette.color } as CSSProperties}>
    <PageHeader title={t('Your world, alive.')} description={t('You are at the centre. Each area is a region you tend, each goal a cell that grows, and each finished session a mote that stays.')} actions={<span className="world-hours tabular-nums">{hours.toFixed(1)}<small className="text-caption tracking-normal">{t('recorded hours')}</small></span>} />
    <section className="panel neural-world-panel">
      <WorldOverview map={map} color={selectedPalette.color} paletteName={selectedPalette.name} animation={data.settings.animation} theme={data.settings.theme}
        gems={gems} horizon={nextTime ? nextTime.fraction : 1} nextHorizon={nextTime ? t('Next time milestone: {title}, {progress}.', { title: nextTime.title, progress: progressLabel(nextTime) }) : t('Every time milestone is reached.')}
        earned={earned} total={achievements.length} onCollect={id => void collect([id])} onOpenGoal={openGoal} onFocus={focus} />
    </section>
    <Achievements achievements={achievements} onCollect={collect} />
    <Card className="world-palettes" title={t('Palettes')} icon="world" actions={<span className="hint">{t('{unlocked} / {total} unlocked', { unlocked: palettes.filter(p => p.unlocked).length, total: palettes.length })}</span>}>
      <p className="hint">{t('A palette tints the sky of your world. Hours unlock some; achievements unlock the others.')}</p>
      <div className="palette-grid">{palettes.map(p => {
        const source = p.achievement ? achievements.find(a => a.id === p.achievement) : undefined;
        return <button key={p.id} aria-pressed={selectedPalette.id === p.id} className={`palette-card ${selectedPalette.id === p.id ? 'selected' : ''}`} disabled={!p.unlocked} onClick={() => void act('settings.update', { ...data.settings, palette: p.id })}>
          <span className="palette-visual" style={{ color: p.color }}><i /><i /><i /><i /><Icon name="spark" size={26} /></span>
          <div className="palette-card-heading"><strong className="text-label">{p.name}</strong>{p.unlocked ? <Icon name={selectedPalette.id === p.id ? 'check' : 'arrow'} size={16} /> : <span className="text-caption">{t('Locked')}</span>}</div>
          <p className="text-caption">{p.unlocked ? p.description : `${paletteUnlockLabel(p)}${source && !source.hidden ? ` · ${progressLabel(source)}` : p.hours ? ` · ${hours.toFixed(1)} / ${p.hours} h` : ''}`}</p>
        </button>;
      })}</div>
    </Card>
  </div>;
}
