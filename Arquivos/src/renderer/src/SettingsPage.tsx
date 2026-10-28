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
    <input type="color" value={color} onChange={e => setColor(e.target.value)} aria-label={`Cor de ${field.name}`} />
    <input value={name} maxLength={60} onChange={e => setName(e.target.value)} aria-label={`Nome de ${field.name}`} />
    <div className="field-actions col-auto flex items-center gap-1">
      {dirty && <Button variant="primary" size="sm" aria-label={`Salvar ${field.name}`} disabled={!name.trim()} onClick={() => void act('field.update', { id: field.id, name, color })}>Salvar</Button>}
      <IconButton icon={field.archived ? 'restore' : 'archive'} label={field.archived ? `Restaurar área ${field.name}` : `Arquivar ${field.name}`} onClick={() => void act('field.archive', { id: field.id, archived: !field.archived })} />
      <IconButton icon="trash" tone="danger" label={`Excluir área ${field.name}`} onClick={onDelete} />
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
  return <><Modal open={deleteActivity} title="Excluir a atividade coletada?" onClose={() => setDeleteActivity(false)}><p>Isto exclui os resumos de teclado e mouse destes dados. Backups já exportados mantêm suas cópias.</p><div className="modal-actions"><Button onClick={() => setDeleteActivity(false)}>Cancelar</Button><Button variant="danger" onClick={async () => { const result = await act('activity.delete'); if (result.ok) setDeleteActivity(false); }}>Excluir atividade</Button></div></Modal>
    <Modal destructive busy={deletingField} open={!!deleteField} title="Excluir esta área?" description="Remove permanentemente esta área, suas metas, tarefas, sessões e atividade depois de salvar um backup de recuperação." onClose={() => { if (!deletePending.current) setDeleteFieldId(null); }}>
      {deleteField && <><p className="hint">Também remove {deleteGoals.length} metas e {deleteGoalRecords.length} registros de planejamento vinculados, incluindo check-ins de ações e observações de resultados. Eles estão incluídos no backup de recuperação.</p>
        <p className="modal-intro">Excluir <strong>{deleteField.name}</strong> e todo o seu histórico?</p>
        <div className="delete-impact"><span><strong>{deleteTasks.length}</strong> tarefas</span><span><strong>{deleteSessions.length}</strong> sessões</span><span><strong>{minutesLabel(deleteTime)}</strong> de tempo registrado</span></div>
        <p>{minutesLabel(countedTime)} sairão dos seus totais e gráficos. Os eventos associados e a atividade coletada também serão removidos.</p>
        <p className="hint">Arquivar mantém o histórico. Excluir o remove destes dados. Um backup de recuperação é salvo antes; backups existentes mantêm suas cópias.</p>
        {blocked && <p className="restore-error" role="alert">Conclua a sessão em andamento ou pausada desta área antes de excluí-la.</p>}
        {deleteError && <p className="restore-error" role="alert">{deleteError}</p>}
        <div className="modal-actions"><Button disabled={deletingField} onClick={() => setDeleteFieldId(null)}>Manter área</Button><Button variant="danger" disabled={deletingField || blocked} onClick={() => void removeField()}>{deletingField ? 'Fazendo backup e excluindo…' : 'Fazer backup e excluir área'}</Button></div>
      </>}
    </Modal>
    <PageHeader title="Deixe este espaço com a sua cara." />
    <div className="settings-grid"><Card title="Seu ritual de foco" icon="settings"><form onSubmit={async e => { e.preventDefault(); const result = await act('settings.update', { ...draft }); if (result.ok) setSaved(true); }}><div className="settings-save"><span className="hint">{saved && !dirty ? 'Preferências salvas.' : dirty ? 'Preferências não salvas' : 'Suas preferências estão em dia.'}</span><Button variant="primary" type="submit" disabled={!dirty}>Salvar preferências</Button></div><fieldset className="preference-group"><legend>Padrões da sessão</legend><label className="form-label">Duração padrão da sessão<input type="number" min={1} max={1440} value={draft.defaultMinutes} onChange={e => { setDraft({ ...draft, defaultMinutes: Number(e.target.value) }); setSaved(false); }} aria-label="Duração padrão da sessão em minutos" /><span className="hint">Minutos · escolha a duração que combina com a sua intenção.</span></label><label className="form-label">Fuso horário<input list="timezones" aria-label="Fuso horário dos relatórios" value={draft.timezone} onChange={e => { setDraft({ ...draft, timezone: e.target.value }); setSaved(false); }} /><datalist id="timezones">{['America/Fortaleza', 'America/Sao_Paulo', 'America/New_York', 'Europe/Zurich', 'Europe/Amsterdam', 'Europe/London', 'Asia/Tokyo', 'UTC'].map(t => <option key={t}>{t}</option>)}</datalist><span className="hint">As novas sessões usam este fuso horário. Os registros existentes mantêm o seu.</span></label><label className="form-label">Intenção semanal de tempo<span className="optional">opcional</span><input type="number" min={0} max={10080} value={draft.weeklyGoalMinutes} aria-label="Intenção semanal de tempo em minutos" onChange={e => { setDraft({ ...draft, weeklyGoalMinutes: Number(e.target.value) }); setSaved(false); }} /><span className="hint">Minutos · zero significa sem meta de tempo.</span></label></fieldset><fieldset className="preference-group"><legend>Aparência e retorno</legend><label className="form-label">Aparência<Choice aria-label="Aparência" value={draft.theme} onChange={e => { setDraft({ ...draft, theme: e.target.value as 'light' | 'dark' }); setSaved(false); }}><option value="light">Modo claro</option><option value="dark">Modo escuro</option></Choice></label><label className="form-label">Visual do foco<Choice aria-label="Visual do foco" value={draft.focusVisual ?? 'brain'} onChange={e => { setDraft({ ...draft, focusVisual: e.target.value as FocusVisual }); setSaved(false); }}><option value="brain">Cérebro</option><option value="instrument">Medidor de sessão</option></Choice><span className="hint">O ponteiro dá uma volta a cada 10 minutos; o mostrador pequeno conta até 2 horas.</span></label><label className="toggle-row"><span><strong>Continuar com cronômetro quando o timer terminar</strong><small>O tempo extra fica na mesma sessão. Vale para novas sessões.</small></span><SwitchControl aria-label="Continuar com cronômetro quando o timer terminar" checked={draft.autoOvertime} onChange={e => { setDraft({ ...draft, autoOvertime: e.target.checked }); setSaved(false); }} /></label><label className="toggle-row"><span><strong>Animações suaves</strong><small>Também respeita as preferências de movimento reduzido do Windows.</small></span><SwitchControl checked={draft.animation} onChange={e => { setDraft({ ...draft, animation: e.target.checked }); setSaved(false); }} aria-label="Ativar animações suaves" /></label><label className="toggle-row"><span><strong>Som de conclusão</strong><small>Usa o som de notificação do Windows.</small></span><SwitchControl checked={draft.sound} onChange={e => { setDraft({ ...draft, sound: e.target.checked }); setSaved(false); }} aria-label="Ativar som de conclusão" /></label></fieldset><fieldset className="preference-group"><legend>Atividade e atalhos</legend><label className="toggle-row"><span><strong>Coletar totais de teclado e mouse</strong><small>Somente durante sessões de foco em andamento. Agregados locais; o texto digitado e as coordenadas nunca são salvos.</small></span><SwitchControl aria-label="Coletar totais de teclado e mouse" checked={draft.collectActivity ?? false} onChange={e => { setDraft({ ...draft, collectActivity: e.target.checked }); setSaved(false); }} /></label><label className="toggle-row"><span><strong>Check-ins de atenção</strong><small>Uma pergunta de um clique sobre onde está a sua atenção aparece de vez em quando durante o foco: a primeira após 8–20 minutos ativos, depois a cada 15–35 minutos. Desativado por padrão. Não aparece no modo Offline.</small></span><SwitchControl aria-label="Check-ins de atenção" checked={draft.attentionProbes ?? false} onChange={e => { setDraft({ ...draft, attentionProbes: e.target.checked }); setSaved(false); }} /></label><div className="toggle-row"><span><strong>Tutorial de comportamento</strong><small>Um guia curto sobre a coleta, os check-ins e a aba Insights.</small></span><Button size="sm" onClick={openTutorial}>Abrir tutorial</Button></div><ShortcutControl value={draft.returnShortcut ?? 'Ctrl+Alt+Space'} visible={visible} act={act} onChange={returnShortcut => { setDraft(current => ({ ...current, returnShortcut })); setSaved(false); }} /><p className="hint">Atalho: {data.collector?.shortcut ? ({ ready: 'pronto', unavailable: 'indisponível', conflict: 'em conflito' } as const)[data.collector.shortcut] : 'requer Windows'}. Ativo: {data.collector?.effectiveShortcut || 'nenhum'}. {data.collector?.shortcutError} Um retorno salvo reconhece suavemente a sua volta no cérebro.</p>{data.collector?.shortcutError && <Button onClick={() => void act('shortcut.retry')}>Tentar atalho novamente</Button>}</fieldset></form></Card>
      <div className="settings-secondary"><Card title="Suas áreas" icon="world"><p className="hint">As áreas agrupam as suas metas, como Matemática ou Idiomas. Arquivar mantém o histórico.</p><div className="fields-edit-list">{!data.fields.length && <p className="hint">Crie uma área abaixo para começar uma meta ou uma sessão.</p>}{data.fields.map(f => <FieldEditor key={f.id} field={f} act={act} onDelete={() => { setDeleteFieldId(f.id); setDeleteError(''); }} />)}</div><form className="new-field-form" onSubmit={async e => { e.preventDefault(); const result = await act('field.create', { name, color }); if (result.ok) setName(''); }}><input type="color" aria-label="Cor da nova área" value={color} onChange={e => setColor(e.target.value)} /><input placeholder="Uma nova área…" aria-label="Nome da nova área" maxLength={60} value={name} onChange={e => setName(e.target.value)} /><Button icon="plus" type="submit" disabled={!name.trim()}>Adicionar</Button></form></Card>
    <AgentSettings data={data} act={act} />
    <Card className="data-settings" title="Seus dados, no seu computador" icon="shield" actions={<Badge tone="success">Local e offline</Badge>}><p>O Focus Guide guarda suas sessões em uma pasta local própria. Ele não envia seus registros de foco a lugar nenhum, a menos que você conecte um agente de IA. Os backups neste computador ajudam a recuperar erros; exporte uma cópia para outro lugar para se proteger contra a perda do dispositivo.</p><p className="hint">Os resumos de atividade ficam até você excluí-los. <Button variant="danger" size="sm" className="ml-2" onClick={() => setDeleteActivity(true)}>Excluir atividade coletada</Button></p><label className="form-label">Pasta de dados<input readOnly value={data.dataPath} aria-label="Pasta de dados local" onFocus={e => e.target.select()} /></label><div className="backup-status"><Icon name="check" size={16} />{data.backupStatus}</div><div className="data-action-grid"><button className="export-action" onClick={() => void act('export.activity')}><Icon name="download" /><strong>Dados de atividade</strong><span>CSV · contagens e cobertura da coleta</span></button><button className="export-action" onClick={() => void act('export.goals')}><Icon name="download" /><strong>Dados de metas</strong><span>CSV · metas, planos, check-ins e resultados</span></button><button className="export-action" onClick={() => void act('export.sessions')}><Icon name="download" /><strong>Dados de sessões</strong><span>CSV · tempo, áreas, metas, avaliações</span></button><button className="export-action" onClick={() => void act('export.events')}><Icon name="download" /><strong>Dados de eventos</strong><span>CSV · intervalos e marcadores</span></button><button className="export-action" onClick={() => void act('export.backup')}><Icon name="shield" /><strong>Backup completo</strong><span>JSON · todos os registros e configurações</span></button></div><div className="backup-bottom"><span className="hint">Sete backups diários do banco de dados são rotacionados automaticamente.</span><div><Button onClick={() => void act('backup.create')}>Fazer backup agora</Button><Button onClick={() => void restorePreview()}>Restaurar um backup JSON</Button></div></div></Card>
    </div></div>
    <div className="settings-notes"><p>Avaliações de foco e de energia são autorrelatos opcionais. O tempo registrado é o tempo que você escolheu acompanhar. O cérebro e as constelações celebram o progresso; eles não medem a atividade cerebral.</p><span>Focus Guide · versão {version}</span></div>
    <Modal destructive description="Substitui seus dados atuais depois de salvar um backup. Revise as contagens de registros validadas antes de continuar." busy={restoring} open={!!(preview)} title="Restaurar estes dados?" onClose={() => { if (!restorePending.current) setPreview(null); }}>{preview && <><p className="modal-intro">Isto substitui seus dados atuais. Um backup do banco de dados com seus registros atuais será salvo antes.</p>{restoreError && <div className="restore-error" role="alert" tabIndex={-1}><strong>A restauração precisa de atenção</strong><p>{restoreError}</p><Button disabled={restoring} onClick={() => void restorePreview()}>Escolher o backup novamente</Button></div>}<div className="restore-preview"><div><strong>{preview.goals ?? 0}</strong><span>metas</span></div><div><strong>{preview.goalOccurrences ?? 0}</strong><span>check-ins de ações</span></div><div><strong>{preview.goalProgress ?? 0}</strong><span>observações de resultados</span></div><div><strong>{preview.sessions}</strong><span>sessões</span></div><div><strong>{preview.fields}</strong><span>áreas</span></div><div><strong>{preview.tasks}</strong><span>tarefas</span></div><div><strong>{preview.events}</strong><span>eventos</span></div></div><p className="hint">Exportado em {new Date(preview.exportedAt).toLocaleString('pt-BR', { timeZone: data.settings.timezone })}. A estrutura do arquivo, as referências, as avaliações e os totais dos intervalos foram validados.</p><div className="modal-actions"><Button disabled={restoring} onClick={() => setPreview(null)}>Manter os dados atuais</Button><Button variant="primary" disabled={restoring} onClick={() => void restore()}>{restoring ? 'Trabalhando…' : 'Fazer backup e restaurar'}</Button></div></>}</Modal>
  </>;
}
