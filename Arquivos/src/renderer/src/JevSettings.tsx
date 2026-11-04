import { useState } from 'react';
import type { ViewProps } from './App';
import { Badge, Button, Card, Fold, Segments, SwitchControl } from './ui';
import { JEV_WINDOW_CHECKS, type JevWindowCheck } from '../../shared/types';
import { t } from '../../shared/i18n';

/* TypeSafe judgments are off by default. When on, a check that the user starts sends the text of the sessions it reads
   to TypeSafe; the API key is encrypted by the main process and never comes back to this window. */
export function JevSettings({ data, act }: ViewProps) {
  const status = data.jev, enabled = data.settings.jevAssist ?? false, [key, setKey] = useState(''), [busy, setBusy] = useState(false), [log, setLog] = useState('');
  const run = async (action: () => Promise<unknown>) => { setBusy(true); try { await action(); } finally { setBusy(false); } };
  const saveKey = () => run(async () => { if ((await act('jev.key.set', { key })).ok) setKey(''); });
  const readLog = () => run(async () => { const result = await act('jev.log.read'); if (result.ok) setLog(JSON.stringify(result.value, null, 2)); });
  return <Card title={t('TypeSafe judgments (Jev)')} icon="spark" actions={<Badge tone={enabled && status?.keyStored ? 'success' : 'info'}>{enabled && status?.keyStored ? t('Ready') : t('Off')}</Badge>}>
    <p className="hint">{t('TypeSafe Jev can read the notes, parked thoughts and interruption notes of your sessions and suggest the answers you left empty, such as what got in the way most. It only suggests: nothing changes until you choose an answer.')}</p>
    <p className="alert notice" role="note">{t('TypeSafe is a cloud service. When you start a check, the text of the sessions it reads leaves this computer and goes to TypeSafe. Nothing is sent before you start a check. Restoring a backup turns this off.')}</p>
    {!status ? <p className="hint" role="status">{t('TypeSafe judgments work only in the Windows app.')}</p> : <>
      <label className="toggle-row"><span><strong>{t('Use TypeSafe judgments')}</strong><small>{t('Shows the “Fill missing reflections” check on the Patterns page.')}</small></span><SwitchControl aria-label={t('Use TypeSafe judgments')} checked={enabled} disabled={busy} onChange={e => void run(() => act('settings.update', { ...data.settings, jevAssist: e.target.checked }))} /></label>
      <div className="toggle-row"><span><strong>{t('Window check during focus')}</strong><small>{t('Every 5 minutes of focus, Jev rates how closely the window in front matches the area and the plan of the session. The ratings are kept apart for review and are not used in Patterns yet.')}</small></span>
        <Segments className="segmented" label={t('Window check during focus')} value={data.settings.jevWindowCheck ?? 'off'} onChange={value => { if ((JEV_WINDOW_CHECKS as readonly string[]).includes(value)) void run(() => act('settings.update', { ...data.settings, jevWindowCheck: value as JevWindowCheck })); }}
          options={[{ value: 'off', label: t('Off') }, { value: 'title', label: t('Title') }, { value: 'title-image', label: t('Title and capture') }]} /></div>
      {(data.settings.jevWindowCheck ?? 'off') !== 'off' && <p className="alert notice" role="note">{t('While a focus session runs, the window check sends the title and program name of the window in front, the session’s area, goal, task and intention, and with “Title and capture” a picture of that window, to TypeSafe. A picture can show private messages or other personal content. Focus Guide skips its own windows and private browsing windows, keeps the title and the ratings on this computer, and never keeps the picture.')}</p>}
      {status.windowCheck?.state === 'stopped' && <p className="hint" role="alert">{status.windowCheck.message}</p>}
      {status.keyStored
        ? <div className="goal-button-row"><span className="hint" role="status">{t('An API key is saved, encrypted with your Windows account.')}</span><Button size="sm" disabled={busy} onClick={() => void run(() => act('jev.key.clear'))}>{t('Remove key')}</Button></div>
        : <form className="goal-button-row" onSubmit={e => { e.preventDefault(); void saveKey(); }}>
          <label className="form-label">{t('TypeSafe API key')}<input type="password" autoComplete="off" spellCheck={false} maxLength={200} value={key} onChange={e => setKey(e.target.value)} disabled={busy || !status.encryption} /></label>
          <Button type="submit" variant="primary" disabled={busy || !key.trim() || !status.encryption}>{t('Save key')}</Button>
          {!status.encryption && <span className="hint" role="status">{t('Windows cannot encrypt the API key on this computer, so it was not saved.')}</span>}
        </form>}
      <Fold title={t('What was sent')}>
        <p className="hint">{t('The last 20 requests since Focus Guide started, with the answers. The API key is never shown or kept here.')}</p>
        <div className="goal-button-row"><Button size="sm" disabled={busy} onClick={() => void readLog()}>{t('Show requests')}</Button></div>
        {log && <textarea readOnly rows={12} aria-label={t('Requests sent to TypeSafe')} className="agent-config" value={log === '[]' ? t('Nothing was sent yet.') : log} />}
      </Fold>
    </>}
  </Card>;
}
