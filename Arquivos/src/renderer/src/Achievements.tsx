import { useState, type CSSProperties } from 'react';
import { Button, Card, cn } from './ui';
import { Icon } from './components';
import { ACHIEVEMENT_CATEGORIES, PALETTES, type AchievementCategory, type AchievementState } from '../../shared/achievements';
import { dateLocale, t } from '../../shared/i18n';

const amount = (a: AchievementState, value: number) => a.unit === 'h' ? value.toFixed(value < 10 ? 1 : 0) : String(Math.floor(value));
export const progressLabel = (a: AchievementState) => `${amount(a, a.current)} / ${a.target}${a.unit === 'h' ? ' h' : ''}`;
const earnedLabel = (at: string) => new Date(at).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
const categoryIcon: Record<AchievementCategory, 'focus' | 'spark' | 'world' | 'calendar' | 'thought'> = { time: 'focus', craft: 'spark', explore: 'world', rhythm: 'calendar', secret: 'thought' };

/* A medallion: its ring fills with progress, and it lights up when earned. */
function Medal({ achievement, size = 44 }: { achievement: AchievementState; size?: number }) {
  const r = size / 2 - 3, length = 2 * Math.PI * r;
  return <span className={cn('achievement-medal', achievement.unlocked && 'is-earned', achievement.unlocked && !achievement.collectedAt && 'is-ready')} style={{ width: size, height: size }} aria-hidden="true">
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} className="achievement-medal-track" />
      <circle cx={size / 2} cy={size / 2} r={r} className="achievement-medal-fill" strokeDasharray={length} strokeDashoffset={length * (1 - achievement.fraction)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
    <Icon name={achievement.hidden ? 'thought' : categoryIcon[achievement.category]} size={size * .4} />
  </span>;
}

function Tile({ achievement, fresh, onCollect, busy }: { achievement: AchievementState; fresh: boolean; onCollect: () => void; busy: boolean }) {
  const reward = PALETTES.find(p => p.id === achievement.reward);
  return <li className={cn('achievement-tile', achievement.unlocked && 'is-earned', achievement.hidden && 'is-hidden', fresh && 'is-fresh')}>
    <Medal achievement={achievement} />
    <div className="achievement-body">
      <strong className="text-label">{achievement.hidden ? t('A secret') : achievement.title}</strong>
      <p className="text-caption">{achievement.hidden ? t('Hidden until you find it. Keep exploring.') : achievement.description}</p>
      {!achievement.hidden && !achievement.unlocked && <div className="achievement-progress"><div className="horizon-progress"><span style={{ width: `${achievement.fraction * 100}%` }} /></div><span className="text-caption tabular-nums">{progressLabel(achievement)}</span></div>}
      {achievement.unlocked && achievement.unlockedAt && <span className="text-caption achievement-date">{achievement.collectedAt ? t('Earned {date} · collected', { date: earnedLabel(achievement.unlockedAt) }) : t('Earned {date}', { date: earnedLabel(achievement.unlockedAt) })}</span>}
      {reward && <span className="achievement-reward text-caption" style={{ '--reward-color': reward.color } as CSSProperties}><i />{t('Unlocks the {name} palette', { name: reward.name })}</span>}
    </div>
    {achievement.unlocked && !achievement.collectedAt && <Button size="sm" variant="primary" disabled={busy} onClick={onCollect}>{t('Collect')}</Button>}
  </li>;
}

export default function Achievements({ achievements, onCollect }: { achievements: AchievementState[]; onCollect: (ids: string[]) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string[]>([]);
  const earned = achievements.filter(a => a.unlocked), ready = earned.filter(a => !a.collectedAt);
  // The closest unearned goals come first: a near finish line is the strongest pull (goal-gradient effect).
  const close = achievements.filter(a => !a.unlocked && !a.hidden && a.fraction > 0).sort((a, b) => b.fraction - a.fraction).slice(0, 3);
  async function collect(ids: string[]) {
    setBusy(true);
    try { if (await onCollect(ids)) { setFresh(ids); window.setTimeout(() => setFresh([]), 2400); } } finally { setBusy(false); }
  }
  return <Card className="achievements" title={t('Achievements')} icon="spark" actions={<>
    <span className="hint tabular-nums">{t('{earned} / {total} earned', { earned: earned.length, total: achievements.length })}</span>
    {ready.length > 1 && <Button size="sm" variant="primary" disabled={busy} onClick={() => void collect(ready.map(a => a.id))}>{t('Collect all ({count})', { count: ready.length })}</Button>}
  </>}>
    <p className="hint achievements-intro">{t('Achievements come from your records. Nothing expires and nothing is lost if you take a break. Earned ones wait as golden gems around you on the map until you collect them.')}</p>
    {close.length > 0 && <div className="achievements-close">
      <h3 className="text-label">{t('Almost there')}</h3>
      <ul>{close.map(a => <li key={a.id}><Medal achievement={a} size={36} /><div><strong className="text-caption">{a.title}</strong><span className="text-caption tabular-nums">{progressLabel(a)}</span></div></li>)}</ul>
    </div>}
    {ACHIEVEMENT_CATEGORIES.map(category => {
      const rows = achievements.filter(a => a.category === category.id);
      return <section className="achievement-group" key={category.id} aria-label={category.name}>
        <div className="section-title"><h3 className="text-label">{category.name}</h3><span className="hint">{category.description} · {rows.filter(a => a.unlocked).length}/{rows.length}</span></div>
        <ul className="achievement-grid">{rows.map(a => <Tile key={a.id} achievement={a} fresh={fresh.includes(a.id)} busy={busy} onCollect={() => void collect([a.id])} />)}</ul>
      </section>;
    })}
  </Card>;
}
