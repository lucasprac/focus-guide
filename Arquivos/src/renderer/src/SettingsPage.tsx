import { Badge, Button, Card, Choice, IconButton, PageHeader, SwitchControl } from './ui';
import { useEffect, useRef, useState } from 'react';
import type { ViewProps } from './App';
import type { BackupPreview, Field, FocusVisual, Settings } from '../../shared/types';
import { Icon, Modal, minutesLabel } from './components';
import { ShortcutControl } from './ShortcutControl';
import { AgentSettings } from './AgentSettings';
import { version } from '../../../package.json';
import { t, dateLocale, LANGUAGES, LANGUAGE_NAMES, type Language } from '../../shared/i18n';

const sameSetting = (a: unknown, b: unknown) => typeof a === 'object' && a && b ? JSON.stringify(a) === JSON.stringify(b) : a === b;
function FieldEditor({ field, act, onDelete }: { field: Field; act: ViewProps['act']; onDelete: () => void }) {
  const [name, setName] = useState(field.name), [color, setColor] = useState(field.color);
  useEffect(() => { setName(field.name); setColor(field.color); }, [field.name, field.color]);
  const dirty = name !== field.name || color !== field.color;
  return <div className={`field-editor ${field.archived ? 'archived' : ''}`}>
    <input type="color" value={color} onChange={e => setColor(e.target.value)} aria-label={t('Color for {name}', { name: field.name })} />
    <input value={name} maxLength={60} onChange={e => setName(e.target.value)} aria-label={t('Name for {name}', { name: field.name })} />
    <div className="field-actions col-auto flex items-center gap-1">
      {dirty && <Button variant="primary" size="sm" aria-label={t('Save {name}', { name: field.name })} disabled={!name.trim()} onClick={() => void act('field.update', { id: field.id, name, color })}>{t('Save')}</Button>}
      <IconButton icon={field.archived ? 'restore' : 'archive'} label={field.archived ? t('Restore area {name}', { name: field.name }) : t('Archive {name}', { name: field.name })} onClick={() => void act('field.archive', { id: field.id, archived: !field.archived })} />
      <IconButton icon="trash" tone="danger" label={t('Delete area {name}', { name: field.name })} onClick={onDelete} />
    </div>
  </div>;
}
export default function SettingsPage({ data, act, visible, openTutorial }: ViewProps & { visible: boolean; openTutorial: () => void }) {
  const [draft, setDraft] = useState(data.settings), [name, setName] = useState(''), [color, setColor] = useState('#356AE6'), [preview, setPreview] = useState<BackupPreview | null>(null), [saved, setSaved] = useState(false);
  const [deleteActivity, setDeleteActivity] = useState(false);
  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null), [deletingField, setDeletingField] = useState(false), [deleteError, setDeleteError] = useState('');
  const deletePending = useRef(false);
  const deleteField = data.fields.find(f => f.id === deleteFieldId);
  const deleteSessions = data.sessions.filter(s => s.fieldId === deleteFieldId);
  const deleteTasks = data.tasks.filter(t => t.fieldId === deleteFieldId);
  const blocked = deleteSessions.some(s => s.status !== 'completed');
  const deleteGoals = (data.goals ?? []).filter(g => g.fieldId === deleteFieldId);
  const deleteGoalIds = new Set(deleteGoals.map(g => g.id));
  const deleteGoalRecords = [...data.milestones ?? [],...data.goalActions ?? [],...data.goalOccurrences ?? [],...data.goalProgress ?? [],...data.goalReviews ?? []].filter(r => deleteGoalIds.has(r.goalId));
  const deleteTime = deleteSessions.reduce((sum, s) => sum + s.activeMs / 60000, 0);
  const countedTime = deleteSessions.filter(s => s.status === 'completed' && !s.excluded).reduce((sum, s) => sum + s.activeMs / 60000, 0);
  const removeField = async () => {
    if (!deleteField || deletePending.current || blocked) return;
    deletePending.current = true; setDeletingField(true); setDeleteError('');
    try {
      const result = await act('field.delete', { id: deleteField.id });
      if (result.ok) setDeleteFieldId(null); else setDeleteError(result.error);
    } catch (error) { setDeleteError(String(error)); }
    finally { deletePending.current = false; setDeletingField(false); }
  };
  const baseline = useRef(data.settings), restorePending = useRef(false);
  const [restoreError, setRestoreError] = useState(''), [restoring, setRestoring] = useState(false);
  useEffect(() => {
    const previous = baseline.current;
    setDraft(current => {
      const merged = { ...current };
      for (const key of Object.keys(data.settings) as Array<keyof Settings>) {
        if (current[key] === previous[key] || ((key === 'theme' || key === 'sidebarCollapsed') && previous[key] !== data.settings[key])) {
          Object.assign(merged, { [key]: data.settings[key] });
        }
      }
      return merged;
    });
    baseline.current = data.settings;
  }, [data.settings]);
  const restorePreview = async () => {
    if (restorePending.current) return;
    restorePending.current = true; setRestoring(true);
    try {
      const result = await act('backup.preview');
      if (result.ok && result.value) { setPreview(result.value as BackupPreview); setRestoreError(''); }
      else if (!result.ok) setRestoreError(result.error);
    } finally { restorePending.current = false; setRestoring(false); }
  };
  const restore = async () => {
    if (!preview || restorePending.current) return;
    restorePending.current = true; setRestoring(true); setRestoreError('');
    try {
      const result = await act('backup.restore', { token: preview.token });
      if (!result.ok) { setRestoreError(result.error); return; }
      const restored = await window.focusGuide.getState();
      baseline.current = restored.settings; setDraft(restored.settings); setSaved(false); setPreview(null);
    } catch (error) { setRestoreError(String(error)); }
    finally { restorePending.current = false; setRestoring(false); }
  };
  // Key-by-key so a reordered settings object is not mistaken for an unsaved edit.
  const dirty = [...new Set([...Object.keys(draft), ...Object.keys(data.settings)])].some(key => !sameSetting(draft[key as keyof Settings], data.settings[key as keyof Settings]));
  return <><Modal open={deleteActivity} title={t('Delete collected activity?')} onClose={() => setDeleteActivity(false)}><p>{t('This deletes keyboard and mouse summaries from this dataset. Existing exported backups retain their copies.')}</p><div className="modal-actions"><Button onClick={() => setDeleteActivity(false)}>{t('Cancel')}</Button><Button variant="danger" onClick={async () => { const result = await act('activity.delete'); if (result.ok) setDeleteActivity(false); }}>{t('Delete activity')}</Button></div></Modal>
    <Modal destructive busy={deletingField} open={!!deleteField} title={t('Delete this area?')} description={t('Permanently removes this area, its goals, tasks, sessions and activity after saving a recovery backup.')} onClose={() => { if (!deletePending.current) setDeleteFieldId(null); }}>
      {deleteField && <><p className="hint">{t('Also removes {length} goals and {length2} linked planning records, including action check-ins and outcome observations. These are included in the recovery backup.', { length: deleteGoals.length, length2: deleteGoalRecords.length })}</p>
        <p className="modal-intro">{t('Delete')}{' '}<strong>{deleteField.name}</strong>{' '}{t('and all its history?')}</p>
        <div className="delete-impact"><span><strong>{deleteTasks.length}</strong>{' '}{t('tasks')}</span><span><strong>{deleteSessions.length}</strong>{' '}{t('sessions')}</span><span><strong>{minutesLabel(deleteTime)}</strong>{' '}{t('recorded time')}</span></div>
        <p>{t('{minutesLabel} will leave your totals and charts. Associated events and collected activity will also be removed.', { minutesLabel: minutesLabel(countedTime) })}</p>
        <p className="hint">{t('Archive keeps history. Delete removes it from this dataset. A recovery backup is saved first; existing backups retain their copies.')}</p>
        {blocked && <p className="restore-error" role="alert">{t('Finish this area’s running or paused session before deleting it.')}</p>}
        {deleteError && <p className="restore-error" role="alert">{deleteError}</p>}
        <div className="modal-actions"><Button disabled={deletingField} onClick={() => setDeleteFieldId(null)}>{t('Keep area')}</Button><Button variant="danger" disabled={deletingField || blocked} onClick={() => void removeField()}>{deletingField ? t('Backing up & deleting…') : t('Back up & delete area')}</Button></div>
      </>}
    </Modal>
    <PageHeader title={t('Make this space yours.')} />
    <div className="settings-grid"><Card title={t('Your focus ritual')} icon="settings"><form onSubmit={async e => { e.preventDefault(); const result = await act('settings.update', { ...draft }); if (result.ok) setSaved(true); }}><div className="settings-save"><span className="hint">{saved && !dirty ? t('Preferences saved.') : dirty ? t('Unsaved preferences') : t('Your preferences are up to date.')}</span><Button variant="primary" type="submit" disabled={!dirty}>{t('Save preferences')}</Button></div><fieldset className="preference-group"><legend>{t('Session defaults')}</legend><label className="form-label">{t('Default session length')}<input type="number" min={1} max={1440} value={draft.defaultMinutes} onChange={e => { setDraft({ ...draft, defaultMinutes: Number(e.target.value) }); setSaved(false); }} aria-label={t('Default session length in minutes')} /><span className="hint">{t('Minutes · choose the duration that fits your intention.')}</span></label><label className="form-label">{t('Timezone')}<input list="timezones" aria-label={t('Reporting timezone')} value={draft.timezone} onChange={e => { setDraft({ ...draft, timezone: e.target.value }); setSaved(false); }} /><datalist id="timezones">{['America/Fortaleza', 'America/Sao_Paulo', 'America/New_York', 'Europe/Zurich', 'Europe/Amsterdam', 'Europe/London', 'Asia/Tokyo', 'UTC'].map(t => <option key={t}>{t}</option>)}</datalist><span className="hint">{t('New sessions use this timezone. Existing records keep theirs.')}</span></label><label className="form-label">{t('Weekly time intention')}<span className="optional">{t('optional')}</span><input type="number" min={0} max={10080} value={draft.weeklyGoalMinutes} aria-label={t('Weekly time intention in minutes')} onChange={e => { setDraft({ ...draft, weeklyGoalMinutes: Number(e.target.value) }); setSaved(false); }} /><span className="hint">{t('Minutes · zero means no time target.')}</span></label></fieldset><fieldset className="preference-group"><legend>{t('Appearance & feedback')}</legend><label className="form-label">{t('Language')}<Choice aria-label={t('Language')} value={draft.language ?? 'en'} onChange={e => { setDraft({ ...draft, language: e.target.value as Language }); setSaved(false); }}>{LANGUAGES.map(code => <option key={code} value={code} lang={code}>{LANGUAGE_NAMES[code]}</option>)}</Choice><span className="hint">{t('The interface changes when you save your preferences.')}</span></label><label className="form-label">{t('Appearance')}<Choice aria-label={t('Appearance')} value={draft.theme} onChange={e => { setDraft({ ...draft, theme: e.target.value as 'light' | 'dark' }); setSaved(false); }}><option value="light">{t('Light mode')}</option><option value="dark">{t('Dark mode')}</option></Choice></label><label className="form-label">{t('Focus visual')}<Choice aria-label={t('Focus visual')} value={draft.focusVisual ?? 'brain'} onChange={e => { setDraft({ ...draft, focusVisual: e.target.value as FocusVisual }); setSaved(false); }}><option value="brain">{t('Brain')}</option><option value="instrument">{t('Session gauge')}</option></Choice><span className="hint">{t('The gauge turns once every 10 minutes; its small dial counts up to 2 hours.')}</span></label><label className="toggle-row"><span><strong>{t('Continue with stopwatch when the timer ends')}</strong><small>{t('Extra time stays in the same session. Applies to new sessions.')}</small></span><SwitchControl aria-label={t('Continue with stopwatch when the timer ends')} checked={draft.autoOvertime} onChange={e => { setDraft({ ...draft, autoOvertime: e.target.checked }); setSaved(false); }} /></label><label className="toggle-row"><span><strong>{t('Gentle animations')}</strong><small>{t('Also respects Windows reduced-motion preferences.')}</small></span><SwitchControl checked={draft.animation} onChange={e => { setDraft({ ...draft, animation: e.target.checked }); setSaved(false); }} aria-label={t('Enable gentle animations')} /></label><label className="toggle-row"><span><strong>{t('Completion sound')}</strong><small>{t('Uses the Windows notification sound.')}</small></span><SwitchControl checked={draft.sound} onChange={e => { setDraft({ ...draft, sound: e.target.checked }); setSaved(false); }} aria-label={t('Enable completion sound')} /></label></fieldset><fieldset className="preference-group"><legend>{t('Activity & shortcuts')}</legend><label className="toggle-row"><span><strong>{t('Collect keyboard and mouse totals')}</strong><small>{t('Only during running focus sessions. Local aggregates; typed text and coordinates are never saved.')}</small></span><SwitchControl aria-label={t('Collect keyboard and mouse totals')} checked={draft.collectActivity ?? false} onChange={e => { setDraft({ ...draft, collectActivity: e.target.checked }); setSaved(false); }} /></label><label className="toggle-row"><span><strong>{t('Attention check-ins')}</strong><small>{t('A one-click question about where your attention is appears now and then during focus: the first after 8–20 active minutes, then every 15–35 minutes. Off by default. Not shown in Offline mode.')}</small></span><SwitchControl aria-label={t('Attention check-ins')} checked={draft.attentionProbes ?? false} onChange={e => { setDraft({ ...draft, attentionProbes: e.target.checked }); setSaved(false); }} /></label><div className="toggle-row"><span><strong>{t('Behaviour tutorial')}</strong><small>{t('A short guide to collection, check-ins and the Insights tab.')}</small></span><Button size="sm" onClick={openTutorial}>{t('Open tutorial')}</Button></div><ShortcutControl value={draft.returnShortcut ?? 'Ctrl+Alt+Space'} visible={visible} act={act} onChange={returnShortcut => { setDraft(current => ({ ...current, returnShortcut })); setSaved(false); }} /><p className="hint">{t('Shortcut {state}. Active: {active}. {shortcutError} A saved return gently acknowledges your return in the brain.', { state: data.collector?.shortcut ? { ready: t('ready'), unavailable: t('unavailable'), conflict: t('conflict') }[data.collector.shortcut] : t('requires Windows'), active: data.collector?.effectiveShortcut || t('none'), shortcutError: data.collector?.shortcutError })}</p>{data.collector?.shortcutError && <Button onClick={() => void act('shortcut.retry')}>{t('Retry shortcut')}</Button>}</fieldset></form></Card>
      <div className="settings-secondary"><Card title={t('Your areas')} icon="world"><p className="hint">{t('Areas group your goals, such as Mathematics or Languages. Archiving keeps their history.')}</p><div className="fields-edit-list">{!data.fields.length && <p className="hint">{t('Create an area below to begin a goal or a session.')}</p>}{data.fields.map(f => <FieldEditor key={f.id} field={f} act={act} onDelete={() => { setDeleteFieldId(f.id); setDeleteError(''); }} />)}</div><form className="new-field-form" onSubmit={async e => { e.preventDefault(); const result = await act('field.create', { name, color }); if (result.ok) setName(''); }}><input type="color" aria-label={t('New area color')} value={color} onChange={e => setColor(e.target.value)} /><input placeholder={t('A new area…')} aria-label={t('New area name')} maxLength={60} value={name} onChange={e => setName(e.target.value)} /><Button icon="plus" type="submit" disabled={!name.trim()}>{t('Add')}</Button></form></Card>
    <AgentSettings data={data} act={act} />
    <Card className="data-settings" title={t('Your data, on your computer')} icon="shield" actions={<Badge tone="success">{t('Local & offline')}</Badge>}><p>{t('Focus Guide keeps your sessions in its own local folder. It does not send your focus records anywhere unless you connect an AI agent. Backups on this computer help recover mistakes; export a copy somewhere else to protect against a lost device.')}</p><p className="hint">{t('Activity summaries stay until you delete them.')}{' '}<Button variant="danger" size="sm" className="ml-2" onClick={() => setDeleteActivity(true)}>{t('Delete collected activity')}</Button></p><label className="form-label">{t('Data folder')}<input readOnly value={data.dataPath} aria-label={t('Local data folder')} onFocus={e => e.target.select()} /></label><div className="backup-status"><Icon name="check" size={16} />{data.backupStatus}</div><div className="data-action-grid"><button className="export-action" onClick={() => void act('export.activity')}><Icon name="download" /><strong>{t('Activity dataset')}</strong><span>{t('CSV · counts and collection coverage')}</span></button><button className="export-action" onClick={() => void act('export.goals')}><Icon name="download" /><strong>{t('Goal dataset')}</strong><span>{t('CSV · goals, plans, check-ins and outcomes')}</span></button><button className="export-action" onClick={() => void act('export.sessions')}><Icon name="download" /><strong>{t('Session dataset')}</strong><span>{t('CSV · time, areas, goals, ratings')}</span></button><button className="export-action" onClick={() => void act('export.events')}><Icon name="download" /><strong>{t('Event dataset')}</strong><span>{t('CSV · intervals & markers')}</span></button><button className="export-action" onClick={() => void act('export.backup')}><Icon name="shield" /><strong>{t('Full backup')}</strong><span>{t('JSON · all records & settings')}</span></button></div><div className="backup-bottom"><span className="hint">{t('Seven daily database backups rotate automatically.')}</span><div><Button onClick={() => void act('backup.create')}>{t('Back up now')}</Button><Button onClick={() => void restorePreview()}>{t('Restore a JSON backup')}</Button></div></div></Card>
    </div></div>
    <div className="settings-notes"><p>{t('Focus ratings and energy are optional self-reports. Recorded time is time you chose to track. The brain and constellations celebrate progress; they do not measure brain activity.')}</p><span>{t('Focus Guide · version {version}', { version })}</span></div>
    <Modal destructive description={t('Replaces your current dataset after saving a backup. Review the validated record counts before continuing.')} busy={restoring} open={!!(preview)} title={t('Restore this dataset?')} onClose={() => { if (!restorePending.current) setPreview(null); }}>{preview && <><p className="modal-intro">{t('This replaces your current dataset. A database backup of your current records will be saved first.')}</p>{restoreError && <div className="restore-error" role="alert" tabIndex={-1}><strong>{t('Restore needs attention')}</strong><p>{restoreError}</p><Button disabled={restoring} onClick={() => void restorePreview()}>{t('Choose backup again')}</Button></div>}<div className="restore-preview"><div><strong>{preview.goals ?? 0}</strong><span>{t('goals')}</span></div><div><strong>{preview.goalOccurrences ?? 0}</strong><span>{t('action check-ins')}</span></div><div><strong>{preview.goalProgress ?? 0}</strong><span>{t('outcome observations')}</span></div><div><strong>{preview.sessions}</strong><span>{t('sessions')}</span></div><div><strong>{preview.fields}</strong><span>{t('areas')}</span></div><div><strong>{preview.tasks}</strong><span>{t('tasks')}</span></div><div><strong>{preview.events}</strong><span>{t('events')}</span></div></div><p className="hint">{t('Exported {v1}. The file structure, references, ratings, and interval totals have been validated.', { v1: new Date(preview.exportedAt).toLocaleString(dateLocale(), { timeZone: data.settings.timezone }) })}</p><div className="modal-actions"><Button disabled={restoring} onClick={() => setPreview(null)}>{t('Keep current data')}</Button><Button variant="primary" disabled={restoring} onClick={() => void restore()}>{restoring ? t('Working…') : t('Back up & restore')}</Button></div></>}</Modal>
  </>;
}
