import { Badge, Button, Card, Choice, IconButton, PageHeader, SwitchControl } from './ui';
import { useEffect, useRef, useState } from 'react';
import type { ViewProps } from './App';
import type { BackupPreview, Field, FocusVisual, Settings } from '../../shared/types';
import { Icon, Modal, minutesLabel } from './components';
import { ShortcutControl } from './ShortcutControl';
import { AgentSettings } from './AgentSettings';
import { version } from '../../../package.json';

const sameSetting = (a: unknown, b: unknown) => typeof a === 'object' && a && b ? JSON.stringify(a) === JSON.stringify(b) : a === b;
function FieldEditor({ field, act, onDelete }: { field: Field; act: ViewProps['act']; onDelete: () => void }) {
  const [name, setName] = useState(field.name), [color, setColor] = useState(field.color);
  useEffect(() => { setName(field.name); setColor(field.color); }, [field.name, field.color]);
  const dirty = name !== field.name || color !== field.color;
  return <div className={`field-editor ${field.archived ? 'archived' : ''}`}>
    <input type="color" value={color} onChange={e => setColor(e.target.value)} aria-label={`Color for ${field.name}`} />
    <input value={name} maxLength={60} onChange={e => setName(e.target.value)} aria-label={`Name for ${field.name}`} />
    <div className="field-actions col-auto flex items-center gap-1">
      {dirty && <Button variant="primary" size="sm" aria-label={`Save ${field.name}`} disabled={!name.trim()} onClick={() => void act('field.update', { id: field.id, name, color })}>Save</Button>}
      <IconButton icon={field.archived ? 'restore' : 'archive'} label={field.archived ? `Restore area ${field.name}` : `Archive ${field.name}`} onClick={() => void act('field.archive', { id: field.id, archived: !field.archived })} />
      <IconButton icon="trash" tone="danger" label={`Delete area ${field.name}`} onClick={onDelete} />
    </div>
  </div>;
}
export default function SettingsPage({ data, act, visible }: ViewProps & { visible: boolean }) {
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
  return <><Modal open={deleteActivity} title="Delete collected activity?" onClose={() => setDeleteActivity(false)}><p>This deletes keyboard and mouse summaries from this dataset. Existing exported backups retain their copies.</p><div className="modal-actions"><Button onClick={() => setDeleteActivity(false)}>Cancel</Button><Button variant="danger" onClick={async () => { const result = await act('activity.delete'); if (result.ok) setDeleteActivity(false); }}>Delete activity</Button></div></Modal>
    <Modal destructive busy={deletingField} open={!!deleteField} title="Delete this area?" description="Permanently removes this area, its goals, tasks, sessions and activity after saving a recovery backup." onClose={() => { if (!deletePending.current) setDeleteFieldId(null); }}>
      {deleteField && <><p className="hint">Also removes {deleteGoals.length} goals and {deleteGoalRecords.length} linked planning records, including action check-ins and outcome observations. These are included in the recovery backup.</p>
        <p className="modal-intro">Delete <strong>{deleteField.name}</strong> and all its history?</p>
        <div className="delete-impact"><span><strong>{deleteTasks.length}</strong> tasks</span><span><strong>{deleteSessions.length}</strong> sessions</span><span><strong>{minutesLabel(deleteTime)}</strong> recorded time</span></div>
        <p>{minutesLabel(countedTime)} will leave your totals and charts. Associated events and collected activity will also be removed.</p>
        <p className="hint">Archive keeps history. Delete removes it from this dataset. A recovery backup is saved first; existing backups retain their copies.</p>
        {blocked && <p className="restore-error" role="alert">Finish this area’s running or paused session before deleting it.</p>}
        {deleteError && <p className="restore-error" role="alert">{deleteError}</p>}
        <div className="modal-actions"><Button disabled={deletingField} onClick={() => setDeleteFieldId(null)}>Keep area</Button><Button variant="danger" disabled={deletingField || blocked} onClick={() => void removeField()}>{deletingField ? 'Backing up & deleting…' : 'Back up & delete area'}</Button></div>
      </>}
    </Modal>
    <PageHeader title="Make this space yours." />
    <div className="settings-grid"><Card title="Your focus ritual" icon="settings"><form onSubmit={async e => { e.preventDefault(); const result = await act('settings.update', { ...draft }); if (result.ok) setSaved(true); }}><div className="settings-save"><span className="hint">{saved && !dirty ? 'Preferences saved.' : dirty ? 'Unsaved preferences' : 'Your preferences are up to date.'}</span><Button variant="primary" type="submit" disabled={!dirty}>Save preferences</Button></div><fieldset className="preference-group"><legend>Session defaults</legend><label className="form-label">Default session length<input type="number" min={1} max={1440} value={draft.defaultMinutes} onChange={e => { setDraft({ ...draft, defaultMinutes: Number(e.target.value) }); setSaved(false); }} aria-label="Default session length in minutes" /><span className="hint">Minutes · choose the duration that fits your intention.</span></label><label className="form-label">Timezone<input list="timezones" aria-label="Reporting timezone" value={draft.timezone} onChange={e => { setDraft({ ...draft, timezone: e.target.value }); setSaved(false); }} /><datalist id="timezones">{['America/Fortaleza', 'America/Sao_Paulo', 'America/New_York', 'Europe/Zurich', 'Europe/Amsterdam', 'Europe/London', 'Asia/Tokyo', 'UTC'].map(t => <option key={t}>{t}</option>)}</datalist><span className="hint">New sessions use this timezone. Existing records keep theirs.</span></label><label className="form-label">Weekly time intention<span className="optional">optional</span><input type="number" min={0} max={10080} value={draft.weeklyGoalMinutes} aria-label="Weekly time intention in minutes" onChange={e => { setDraft({ ...draft, weeklyGoalMinutes: Number(e.target.value) }); setSaved(false); }} /><span className="hint">Minutes · zero means no time target.</span></label></fieldset><fieldset className="preference-group"><legend>Appearance & feedback</legend><label className="form-label">Appearance<Choice aria-label="Appearance" value={draft.theme} onChange={e => { setDraft({ ...draft, theme: e.target.value as 'light' | 'dark' }); setSaved(false); }}><option value="light">Light mode</option><option value="dark">Dark mode</option></Choice></label><label className="form-label">Focus visual<Choice aria-label="Focus visual" value={draft.focusVisual ?? 'brain'} onChange={e => { setDraft({ ...draft, focusVisual: e.target.value as FocusVisual }); setSaved(false); }}><option value="brain">Brain</option><option value="instrument">Session gauge</option></Choice><span className="hint">The gauge turns once every 10 minutes; its small dial counts up to 2 hours.</span></label><label className="toggle-row"><span><strong>Continue with stopwatch when the timer ends</strong><small>Extra time stays in the same session. Applies to new sessions.</small></span><SwitchControl aria-label="Continue with stopwatch when the timer ends" checked={draft.autoOvertime} onChange={e => { setDraft({ ...draft, autoOvertime: e.target.checked }); setSaved(false); }} /></label><label className="toggle-row"><span><strong>Gentle animations</strong><small>Also respects Windows reduced-motion preferences.</small></span><SwitchControl checked={draft.animation} onChange={e => { setDraft({ ...draft, animation: e.target.checked }); setSaved(false); }} aria-label="Enable gentle animations" /></label><label className="toggle-row"><span><strong>Completion sound</strong><small>Uses the Windows notification sound.</small></span><SwitchControl checked={draft.sound} onChange={e => { setDraft({ ...draft, sound: e.target.checked }); setSaved(false); }} aria-label="Enable completion sound" /></label></fieldset><fieldset className="preference-group"><legend>Activity & shortcuts</legend><label className="toggle-row"><span><strong>Collect keyboard and mouse totals</strong><small>Only during running focus sessions. Local aggregates; typed text and coordinates are never saved.</small></span><SwitchControl aria-label="Collect keyboard and mouse totals" checked={draft.collectActivity ?? false} onChange={e => { setDraft({ ...draft, collectActivity: e.target.checked }); setSaved(false); }} /></label><label className="toggle-row"><span><strong>Attention check-ins</strong><small>A one-click question about where your attention is appears now and then during focus, at most every 15–35 active minutes. Off by default. Not shown in Offline mode.</small></span><SwitchControl aria-label="Attention check-ins" checked={draft.attentionProbes ?? false} onChange={e => { setDraft({ ...draft, attentionProbes: e.target.checked }); setSaved(false); }} /></label><ShortcutControl value={draft.returnShortcut ?? 'Ctrl+Alt+Space'} visible={visible} act={act} onChange={returnShortcut => { setDraft(current => ({ ...current, returnShortcut })); setSaved(false); }} /><p className="hint">Shortcut {data.collector?.shortcut ?? 'requires Windows'}. Active: {data.collector?.effectiveShortcut || 'none'}. {data.collector?.shortcutError} A saved return gently acknowledges your return in the brain.</p>{data.collector?.shortcutError && <Button onClick={() => void act('shortcut.retry')}>Retry shortcut</Button>}</fieldset></form></Card>
      <div className="settings-secondary"><Card title="Your areas" icon="world"><p className="hint">Areas group your goals, such as Mathematics or Languages. Archiving keeps their history.</p><div className="fields-edit-list">{!data.fields.length && <p className="hint">Create an area below to begin a goal or a session.</p>}{data.fields.map(f => <FieldEditor key={f.id} field={f} act={act} onDelete={() => { setDeleteFieldId(f.id); setDeleteError(''); }} />)}</div><form className="new-field-form" onSubmit={async e => { e.preventDefault(); const result = await act('field.create', { name, color }); if (result.ok) setName(''); }}><input type="color" aria-label="New area color" value={color} onChange={e => setColor(e.target.value)} /><input placeholder="A new area…" aria-label="New area name" maxLength={60} value={name} onChange={e => setName(e.target.value)} /><Button icon="plus" type="submit" disabled={!name.trim()}>Add</Button></form></Card>
    <AgentSettings data={data} act={act} />
    <Card className="data-settings" title="Your data, on your computer" icon="shield" actions={<Badge tone="success">Local & offline</Badge>}><p>Focus Guide keeps your sessions in its own local folder. It does not send your focus records anywhere unless you connect an AI agent. Backups on this computer help recover mistakes; export a copy somewhere else to protect against a lost device.</p><p className="hint">Activity summaries stay until you delete them. <Button variant="danger" size="sm" className="ml-2" onClick={() => setDeleteActivity(true)}>Delete collected activity</Button></p><label className="form-label">Data folder<input readOnly value={data.dataPath} aria-label="Local data folder" onFocus={e => e.target.select()} /></label><div className="backup-status"><Icon name="check" size={16} />{data.backupStatus}</div><div className="data-action-grid"><button className="export-action" onClick={() => void act('export.activity')}><Icon name="download" /><strong>Activity dataset</strong><span>CSV · counts and collection coverage</span></button><button className="export-action" onClick={() => void act('export.goals')}><Icon name="download" /><strong>Goal dataset</strong><span>CSV · goals, plans, check-ins and outcomes</span></button><button className="export-action" onClick={() => void act('export.sessions')}><Icon name="download" /><strong>Session dataset</strong><span>CSV · time, areas, goals, ratings</span></button><button className="export-action" onClick={() => void act('export.events')}><Icon name="download" /><strong>Event dataset</strong><span>CSV · intervals & markers</span></button><button className="export-action" onClick={() => void act('export.backup')}><Icon name="shield" /><strong>Full backup</strong><span>JSON · all records & settings</span></button></div><div className="backup-bottom"><span className="hint">Seven daily database backups rotate automatically.</span><div><Button onClick={() => void act('backup.create')}>Back up now</Button><Button onClick={() => void restorePreview()}>Restore a JSON backup</Button></div></div></Card>
    </div></div>
    <div className="settings-notes"><p>Focus ratings and energy are optional self-reports. Recorded time is time you chose to track. The brain and constellations celebrate progress; they do not measure brain activity.</p><span>Focus Guide · version {version}</span></div>
    <Modal destructive description="Replaces your current dataset after saving a backup. Review the validated record counts before continuing." busy={restoring} open={!!(preview)} title="Restore this dataset?" onClose={() => { if (!restorePending.current) setPreview(null); }}>{preview && <><p className="modal-intro">This replaces your current dataset. A database backup of your current records will be saved first.</p>{restoreError && <div className="restore-error" role="alert" tabIndex={-1}><strong>Restore needs attention</strong><p>{restoreError}</p><Button disabled={restoring} onClick={() => void restorePreview()}>Choose backup again</Button></div>}<div className="restore-preview"><div><strong>{preview.goals ?? 0}</strong><span>goals</span></div><div><strong>{preview.goalOccurrences ?? 0}</strong><span>action check-ins</span></div><div><strong>{preview.goalProgress ?? 0}</strong><span>outcome observations</span></div><div><strong>{preview.sessions}</strong><span>sessions</span></div><div><strong>{preview.fields}</strong><span>areas</span></div><div><strong>{preview.tasks}</strong><span>tasks</span></div><div><strong>{preview.events}</strong><span>events</span></div></div><p className="hint">Exported {new Date(preview.exportedAt).toLocaleString('en-US', { timeZone: data.settings.timezone })}. The file structure, references, ratings, and interval totals have been validated.</p><div className="modal-actions"><Button disabled={restoring} onClick={() => setPreview(null)}>Keep current data</Button><Button variant="primary" disabled={restoring} onClick={() => void restore()}>{restoring ? 'Working…' : 'Back up & restore'}</Button></div></>}</Modal>
  </>;
}
