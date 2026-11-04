import { useState } from 'react';
import type { ViewProps } from './App';
import { Badge, Button, Card, Overlay } from './ui';
import { JEV_WINDOW_LIMITS, type JevScore, type WindowJudgment } from '../../shared/jev-decisions';
import { t } from '../../shared/i18n';

const LEVELS = () => [t('Unrelated'), t('General tool'), t('Near the subject'), t('The work itself')];
const REASONS = (): Record<NonNullable<WindowJudgment['reason']>, string> => ({ 'own-window': t('Focus Guide was in front'), 'no-window': t('No window was in front'), 'private-window': t('Private browsing window'), 'no-title': t('The window had no title or picture') });

function Rating({ label, score }: { label: string; score: JevScore | null }) {
  if (!score) return null;
  const top = score.probabilities.indexOf(Math.max(...score.probabilities));
  return <span className="hint">{label}: <strong>{score.score.toFixed(2)}</strong> / 3 · {LEVELS()[top]} · {t('confidence {value}', { value: score.confidence.toFixed(2) })}</span>;
}

/* The window checks, kept apart from the analysis so their quality can be judged first: the window as Jev saw it, and its ratings.
   Nothing here changes a record. */
export function JevWindowJudgments({ data, act }: ViewProps) {
  const [rows, setRows] = useState<WindowJudgment[] | null>(null), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  if (!data.jev || !data.settings.jevAssist) return null;
  const run = async (action: () => Promise<unknown>) => { setBusy(true); try { await action(); } finally { setBusy(false); } };
  const load = () => run(async () => { const result = await act('jev.window.read'); if (result.ok) setRows(result.value as WindowJudgment[]); });
  const clear = () => run(async () => { if ((await act('jev.window.clear')).ok) { setRows([]); setConfirm(false); } });
  return <Card title={t('Window checks (review)')} icon="spark" actions={<div className="goal-button-row">
    <Button size="sm" disabled={busy} onClick={() => void load()}>{rows ? t('Refresh') : t('Show checks')}</Button>
    <Button size="sm" disabled={busy} onClick={() => void act('export.windowJudgments')}>{t('Export CSV')}</Button>
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm(true)}>{t('Delete all')}</Button></div>}>
    <p className="hint">{t('Each row is one look at the window in front during focus. Ratings go from 0 (unrelated) to 3 (the work itself). Compare them with what you were doing; they are not used in Patterns yet. The list shows the newest {count}.', { count: JEV_WINDOW_LIMITS.shown })}</p>
    {rows && !rows.length && <p className="hint" role="status">{t('No window check was saved yet.')}</p>}
    {rows?.map(row => <article className="timeline-session" key={row.id}>
      <div className="timeline-session-head"><strong>{row.app || t('Unknown program')}</strong><time>{new Date(row.at).toLocaleString()}</time></div>
      <div className="timeline-session-body">
        {row.title && <p className="session-note">{row.title}</p>}
        {row.status === 'skipped' ? <p className="hint">{t('Not checked')}: {row.reason ? REASONS()[row.reason] : ''}</p>
          : row.status === 'error' ? <p className="hint" role="alert">{row.error}</p>
          : <div className="goal-button-row">
            <Rating label={t('Area')} score={row.area} /><Rating label={t('Plan')} score={row.plan} />
            {row.readable !== null && <Badge tone={row.readable > 0.7 ? 'success' : row.readable < 0.3 ? 'neutral' : 'info'}>{t('Readable {value}', { value: row.readable.toFixed(2) })}</Badge>}
            <Badge>{row.image === 'sent' ? t('With capture') : row.image === 'unusable' ? t('Capture unusable') : t('Title only')}</Badge>
          </div>}
      </div>
    </article>)}
    <Overlay open={confirm} title={t('Delete all window checks?')} destructive busy={busy} onClose={() => setConfirm(false)} description={t('This deletes every saved window title and rating. Your sessions do not change.')}>
      <div className="modal-actions"><Button variant="danger" disabled={busy} onClick={() => void clear()}>{t('Delete all')}</Button><Button disabled={busy} onClick={() => setConfirm(false)}>{t('Cancel')}</Button></div>
    </Overlay>
  </Card>;
}
