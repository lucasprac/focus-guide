import { useState } from 'react';
import type { ViewProps } from './App';
import { Badge, Button, Card, Choice } from './ui';
import { displayDay } from './components';
import { DETRACTOR_LABELS } from '../../shared/focus-insights';
import { DETRACTORS, type Detractor } from '../../shared/types';
import { localDay } from '../../shared/analytics';
import type { JevReflectionGap } from '../../shared/jev-decisions';
import { t } from '../../shared/i18n';

/* Sessions with text but no answer to "What got in the way most?". TypeSafe suggests an answer; the user picks it,
   picks another, or skips. Picking saves through session.review, which keeps an edit record of the old values. */
export function JevGapFill({ data, act }: ViewProps) {
  const [gaps, setGaps] = useState<JevReflectionGap[] | null>(null), [busy, setBusy] = useState(false), [chosen, setChosen] = useState<Record<string, string>>({});
  if (!data.jev || !data.settings.jevAssist || !data.jev.keyStored) return null;
  const scan = async () => { setBusy(true); try { const result = await act('jev.gaps.scan'); if (result.ok) setGaps(result.value as JevReflectionGap[]); } finally { setBusy(false); } };
  const drop = (id: string) => setGaps(list => list?.filter(gap => gap.sessionId !== id) ?? null);
  const save = async (gap: JevReflectionGap, detractor: Detractor) => {
    const session = data.sessions.find(s => s.id === gap.sessionId); if (!session) return drop(gap.sessionId);
    if ((await act('session.review', { id: session.id, focus: session.focus, note: session.note, detractor })).ok) drop(gap.sessionId);
  };
  return <Card title={t('Fill missing reflections')} icon="spark" actions={<Button size="sm" disabled={busy} onClick={() => void scan()}>{busy ? t('Checking…') : t('Check sessions')}</Button>}>
    <p className="hint">{t('Some sessions have a note, parked thoughts or interruption notes, but no answer to “What got in the way most?”. TypeSafe reads that text and suggests an answer. You decide each one. The check reads up to 50 sessions of the last 90 days.')}</p>
    {gaps && !gaps.length && <p className="hint" role="status">{t('No session needs this answer now.')}</p>}
    {gaps?.map(gap => {
      const other = (chosen[gap.sessionId] ?? '') as Detractor | '';
      return <article className="timeline-session" key={gap.sessionId}>
        <div className="timeline-session-head"><strong>{gap.fieldName}</strong><time>{displayDay(localDay(gap.startedAt, gap.timezone), true)}</time></div>
        <div className="timeline-session-body">
          {gap.intention && <p className="session-intention">{gap.intention}</p>}
          {gap.note && <p className="session-note">{gap.note}</p>}
          {gap.status === 'error' ? <p className="hint" role="alert">{gap.error}</p> : gap.status === 'unclear' || !gap.suggestion ? <p className="hint">{t('The text does not settle this answer.')}</p>
            : <div className="goal-button-row"><span className="hint">{t('Suggested')}</span><Badge tone="info">{DETRACTOR_LABELS[gap.suggestion]}</Badge>{gap.alternatives?.map(a => <Badge key={a}>{DETRACTOR_LABELS[a]}</Badge>)}<Button size="sm" variant="primary" onClick={() => void save(gap, gap.suggestion!)}>{t('Use suggestion')}</Button></div>}
          <div className="goal-button-row">
            <Choice aria-label={t('Choose another answer')} value={other} onChange={e => setChosen({ ...chosen, [gap.sessionId]: e.target.value })}><option value="">{t('Choose another answer')}</option>{DETRACTORS.map(d => <option key={d} value={d}>{DETRACTOR_LABELS[d]}</option>)}</Choice>
            <Button size="sm" disabled={!other} onClick={() => other && void save(gap, other)}>{t('Save answer')}</Button>
            <Button size="sm" variant="ghost" onClick={() => drop(gap.sessionId)}>{t('Skip')}</Button>
          </div>
        </div>
      </article>;
    })}
  </Card>;
}
