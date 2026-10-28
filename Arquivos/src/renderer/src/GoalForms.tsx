import { useMemo, useRef, useState } from 'react';
import type { ViewProps } from './App';
import { ACTIVITY_MODES, WHY_TAG_LIMITS, WHY_TAG_SUGGESTIONS, goalData, type Goal, type GoalAction, type GoalActionPlan, type GoalBarrier, type GoalOccurrence } from '../../shared/types';
import type { GoalSuggestion } from '../../shared/goal-planning';
import { INSIGHT_THRESHOLDS, suggestedDuration } from '../../shared/focus-insights';
import { addDays, localDay } from '../../shared/analytics';
import { Badge, Button, CheckControl, Choice, TagPicker, useDiscardGuard } from './ui';
import { MilestoneChecklist, checklistItems, filledItems, type ChecklistItem } from './MilestoneChecklist';
import { Disclosure, Modal } from './components';
import { BARRIER_LABELS, GOAL_STATUS_LABELS, activityModeLabel } from '../../shared/labels';

export const weekdayNames = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
export function GoalEditor({ data,act,goal,onClose,onSaved }: ViewProps & { goal: Goal | null; onClose: () => void; onSaved: (id: string) => void }) {
  const activeFields = data.fields.filter(f => !f.archived);
  const [id] = useState(goal?.id ?? crypto.randomUUID());
  const [title,setTitle] = useState(goal?.title ?? ''), [outcome,setOutcome] = useState(goal?.outcome ?? ''), [why,setWhy] = useState(goal?.why ?? ''), [tags,setTags] = useState<string[]>(goal?.whyTags ?? []);
  // Most goals are due the day they are made, so a new goal starts with today's local date; existing goals keep their saved value.
  const [today] = useState(() => localDay(Date.now(),data.settings.timezone));
  const [fieldId,setField] = useState(goal?.fieldId ?? activeFields[0]?.id ?? ''), [deadline,setDeadline] = useState(goal ? goal.deadline ?? '' : today);
  const [baseline,setBaseline] = useState(goal?.baseline === null || !goal ? '' : String(goal.baseline)), [target,setTarget] = useState(goal?.target === null || !goal ? '' : String(goal.target));
  const [unit,setUnit] = useState(goal?.unit ?? ''), [milestones,setMilestones] = useState<ChecklistItem[]>([]);
  const [status,setStatus] = useState(goal?.status ?? 'active'), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const pending = useRef(false), hasProgress = !!goal && goalData(data).goalProgress.some(p => p.goalId === goal.id);
  const snapshot = JSON.stringify([title,outcome,why,tags,fieldId,deadline,baseline,target,unit,status,milestones.map(m => [m.title,m.kind,m.completed])]), initial = useRef(snapshot);
  const { requestClose,discardDialog } = useDiscardGuard(snapshot !== initial.current,onClose);
  const fieldName = data.fields.find(f => f.id === fieldId)?.name;
  const needsOutcome = goal ? status === 'active' || status === 'achieved' : true;
  const save = async (draft = false) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const input = { id,title,outcome,why,whyTags: tags,fieldId,deadline: deadline || null,baseline: baseline === '' ? null : Number(baseline),target: target === '' ? null : Number(target),unit,status: draft ? 'draft' : goal ? status : 'active' };
      const result = await act(goal ? 'goal.update' : 'goal.create',goal ? input : { ...input,milestones: filledItems(milestones).map(m => ({ title: m.title,kind: m.kind,completed: m.completed })) });
      if (result.ok) onSaved(id); else setError(result.error);
    } finally { pending.current = false; setBusy(false); }
  };
  const template = (kind: string) => {
    const example = (rows: string[]) => setMilestones(checklistItems(rows.map(title => ({ title,kind: 'todo' as const,completed: false }))));
    if (kind === 'study') { setTitle('Aprender um novo assunto'); setOutcome('Explicar as ideias principais e concluir uma avaliação de prática.'); setTags(['Aprendizado','Carreira']); example(['Escolher meus materiais de estudo','Praticar as habilidades centrais','Concluir uma avaliação de prática']); }
    if (kind === 'work') { setTitle('Concluir meu projeto'); setOutcome('Entregar uma versão final que atenda à minha lista de critérios de aceitação.'); setTags(['Carreira','Contribuição']); example(['Definir a entrega','Construir uma primeira versão','Revisar e finalizar']); }
    if (kind === 'personal') { setTitle('Abrir espaço para uma rotina pessoal'); setOutcome('Encontrar uma rotina que eu consiga manter com tranquilidade e revisá-la toda semana.'); setTags(['Bem-estar','Saúde']); example(['Escolher uma primeira ação acessível','Experimentar a rotina','Rever o que combina com a minha vida']); }
  };
  const filled = (count: number,label: string) => count ? <Badge tone="accent">{count} {label}</Badge> : <span className="optional">opcional</span>;
  const measured = baseline !== '' || target !== '' || unit !== '';
  return <>
    <Modal open title={goal ? 'Editar sua meta' : 'Abrir espaço para uma meta'} busy={busy} onClose={requestClose}>
      <form className="goal-form" onSubmit={e => { e.preventDefault(); void save(); }}>
        {!goal && <div className="goal-template-row"><span className="hint">Comece com um exemplo:</span>{[['study','Estudo'],['work','Trabalho'],['personal','Pessoal']].map(([kind,label]) => <Button type="button" size="sm" key={kind} onClick={() => template(kind)}>{label}</Button>)}</div>}
        <label className="form-label">Título da meta<span className="required">Obrigatório</span><input aria-label="Título da meta" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required placeholder="Terminar meu curso, correr 5 km, lançar o app…" /></label>
        <label className="form-label">Resultado desejado{needsOutcome ? <span className="required">Obrigatório</span> : <span className="optional">opcional para metas {GOAL_STATUS_LABELS[status] ?? status}</span>}<textarea aria-label="Resultado desejado" aria-required={needsOutcome} value={outcome} onChange={e => setOutcome(e.target.value)} maxLength={2000} rows={2} placeholder="O que será diferente quando você alcançar isso?" />{!goal && <span className="hint">Você pode salvar um rascunho sem ele.</span>}</label>
        {goal || activeFields.length === 1
          ? <p className="hint goal-field-fixed">Área: <strong>{fieldName}</strong>{goal && ' · Uma meta mantém a sua área para que as tarefas e sessões fiquem juntas.'}</p>
          : <label className="form-label">Área da meta<span className="required">Obrigatório</span><Choice aria-label="Área da meta" value={fieldId} onChange={e => setField(e.target.value)}>{activeFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}{!fieldId && <option value="">Adicione uma área em Configurações</option>}</Choice></label>}
        <div className="goal-optional-folds">
          <Disclosure title="Por que isso importa" badge={filled(tags.length,tags.length === 1 ? 'escolhido' : 'escolhidos')}>
            <p className="hint">Escolha os motivos que fazem esta meta valer o seu tempo.</p>
            <TagPicker label="Por que isso importa" value={tags} onChange={setTags} suggestions={WHY_TAG_SUGGESTIONS} limit={WHY_TAG_LIMITS.count} maxLength={WHY_TAG_LIMITS.length} disabled={busy} />
            {why && <aside className="goal-evidence"><strong>Sua nota anterior</strong><p>{why}</p><Button type="button" variant="ghost" size="sm" onClick={() => setWhy('')}>Remover nota</Button></aside>}
          </Disclosure>
          {!goal && <Disclosure title="Etapas" badge={filled(filledItems(milestones).length,filledItems(milestones).length === 1 ? 'linha' : 'linhas')}>
            <p className="hint">Etapas que mostram que você está se aproximando. Você pode alterá-las depois na página da meta.</p>
            <MilestoneChecklist items={milestones} onChange={setMilestones} disabled={busy} />
          </Disclosure>}
          <Disclosure title="Prazo" badge={deadline ? <Badge tone="accent">{deadline === today ? 'Hoje' : deadline}</Badge> : <span className="optional">opcional</span>}>
            <label className="form-label">Prazo da meta<span className="optional">opcional</span><input aria-label="Prazo da meta" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></label>
            <div className="goal-button-row">{deadline ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setDeadline('')}>Sem prazo</Button> : <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setDeadline(today)}>Para hoje</Button>}</div>
            <p className="hint">{goal ? '' : 'Novas metas vencem hoje. Escolha outra data ou remova o prazo. '}Um prazo pode orientar o planejamento. Passar dele não marca a meta como fracassada.</p>
          </Disclosure>
          <Disclosure title="Resultado numérico" badge={measured ? <Badge tone="accent">{unit || 'definido'}</Badge> : <span className="optional">opcional</span>}>
            <p className="hint">Registre uma pontuação, uma distância, um número de unidades concluídas ou outra medida à sua escolha. Preencha os três campos ou deixe os três vazios. Alvos menores que o ponto de partida também são aceitos.</p>
            <div className="goal-measure-inputs"><label className="form-label">Ponto de partida<input aria-label="Ponto de partida da meta" type="number" step="any" value={baseline} onChange={e => setBaseline(e.target.value)} /></label><label className="form-label">Alvo<input aria-label="Alvo da meta" type="number" step="any" value={target} onChange={e => setTarget(e.target.value)} /></label><label className="form-label">Unidade<input aria-label="Unidade da meta" value={unit} disabled={hasProgress} onChange={e => setUnit(e.target.value)} maxLength={60} /></label></div>
          </Disclosure>
        </div>
        {goal && <label className="form-label">Status da meta<Choice aria-label="Status da meta" value={status} onChange={e => setStatus(e.target.value as Goal['status'])}>{['draft','active','paused','archived',...(goal.status === 'achieved' ? ['achieved'] : [])].map(s => <option key={s} value={s}>{GOAL_STATUS_LABELS[s]}</option>)}</Choice></label>}
        {error && <p className="goal-form-error" role="alert">{error}</p>}
        <div className="modal-actions"><Button type="button" disabled={busy} onClick={requestClose}>Cancelar</Button>{!goal && <Button variant="ghost" type="button" disabled={busy || !title.trim() || !fieldId} onClick={() => void save(true)}>Salvar como rascunho</Button>}<Button variant="primary" type="submit" disabled={busy || !title.trim() || !fieldId || needsOutcome && !outcome.trim()}>{busy ? 'Salvando…' : goal ? 'Salvar meta' : 'Criar meta'}</Button></div>
      </form>
    </Modal>
    {discardDialog}
  </>;
}

export function ActionEditor({ data,act,goal,action,onClose,suggestion,decision = 'edited' }: ViewProps & { goal: Goal; action: GoalAction | null; onClose: () => void; suggestion?: GoalSuggestion; decision?: 'applied' | 'edited' }) {
  const latest = action?.plans.at(-1), today = localDay(Date.now(),latest?.timezone ?? data.settings.timezone);
  const [id] = useState(action?.id ?? crypto.randomUUID()), [title,setTitle] = useState(action?.title ?? '');
  const [plan,setPlan] = useState<GoalActionPlan>({ effectiveDate: action ? addDays(today,1) : today,timezone: latest?.timezone ?? data.settings.timezone,weekdays: latest?.weekdays ?? [1,3,5],cue: latest?.cue ?? '',normal: suggestion?.barrier === 'other' && decision === 'applied' ? latest?.smaller ?? '' : latest?.normal ?? '',smaller: latest?.smaller ?? '',obstacle: latest?.obstacle ?? '',response: latest?.response ?? '',estimatedMinutes: latest?.estimatedMinutes ?? null,activityMode: latest?.activityMode ?? 'Unspecified',enabled: true });
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [dismissed,setDismissed] = useState(false);
  const pending = useRef(false), estimateInput = useRef<HTMLInputElement>(null);
  // One rule for "how long?": how long attention held before a drift, and only without that, the median recorded duration.
  const history = useMemo(() => suggestedDuration(data,goal.fieldId,plan.activityMode,Date.now(),goal.id),[data.sessions,data.events,data.settings.timezone,goal.fieldId,goal.id,plan.activityMode]);
  const snapshot = JSON.stringify([title,plan]), initial = useRef(snapshot);
  const { requestClose,discardDialog } = useDiscardGuard(snapshot !== initial.current,onClose);
  const change = <K extends keyof GoalActionPlan>(key: K,value: GoalActionPlan[K]) => setPlan(p => ({ ...p,[key]: value }));
  const template = (kind: string) => {
    setTitle(kind === 'study' ? 'Praticar uma habilidade' : kind === 'work' ? 'Avançar a próxima entrega' : 'Fazer uma caminhada curta');
    setPlan(p => ({ ...p,cue: kind === 'personal' ? 'Depois do almoço' : 'Depois do café da manhã',normal: kind === 'study' ? 'Fazer um exercício de prática focado e revisar os erros.' : kind === 'work' ? 'Trabalhar na próxima parte concreta da entrega.' : 'Caminhar por um trajeto confortável por perto.',smaller: kind === 'study' ? 'Resolver uma questão.' : kind === 'work' ? 'Anotar o próximo passo e trabalhar nele por cinco minutos.' : 'Sair para uma caminhada curta.',obstacle: 'Tenho menos tempo do que o esperado.',response: 'Usar a versão menor e continuar no próximo dia planejado.',estimatedMinutes: kind === 'personal' ? 15 : 25,activityMode: kind === 'personal' ? 'Offline' : kind === 'work' ? 'Writing/coding' : 'Reading' }));
  };
  const save = async () => {
    if (pending.current) return; pending.current = true; setBusy(true); setError('');
    try { const payload = { id,goalId: goal.id,title,plan,archived: false };
      const result = await act(suggestion ? 'goal.suggestion.decide' : 'goal.action.save',suggestion ? { goalId: goal.id,suggestionId: suggestion.id,decision,action: payload } : payload);
      if (result.ok) onClose(); else setError(result.error);
    } finally { pending.current = false; setBusy(false); }
  };
  return <><Modal open title={suggestion ? 'Escolha uma mudança para testar' : action ? 'Editar ação semanal' : 'Planejar uma ação semanal'} busy={busy} onClose={requestClose}>
    <form className="goal-form" onSubmit={e => { e.preventDefault(); void save(); }}>
      <p className="modal-intro">Para <strong>{goal.title}</strong>. Escolha um gatilho, uma ação prática e uma versão menor para um dia difícil.</p>
      {!action && <div className="goal-template-row">{[['study','Ação de estudo'],['work','Ação de trabalho'],['personal','Ação pessoal']].map(([kind,label]) => <Button type="button" key={kind} onClick={() => template(kind)}>{label}</Button>)}</div>}
      <label className="form-label">Título da ação<input aria-label="Título da ação" value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} /></label>
      <label className="form-label">Quando ou depois de quê?<input aria-label="Gatilho da ação" placeholder="Depois do café da manhã, quando eu sentar à mesa…" value={plan.cue} onChange={e => change('cue',e.target.value)} required maxLength={500} /></label>
      <label className="form-label">Ação normal<textarea aria-label="Ação normal" rows={2} maxLength={500} value={plan.normal} onChange={e => change('normal',e.target.value)} required /></label>
      <label className="form-label">Versão menor<textarea aria-label="Versão menor" rows={2} maxLength={500} value={plan.smaller} onChange={e => change('smaller',e.target.value)} required /></label>
      <fieldset className="goal-weekdays"><legend>Dias da semana planejados</legend>{[1,2,3,4,5,6,0].map(day => <label key={day}><CheckControl aria-label={weekdayNames[day]} checked={plan.weekdays.includes(day)} onChange={e => change('weekdays',e.target.checked ? [...plan.weekdays,day] : plan.weekdays.filter(d => d !== day))} />{weekdayNames[day].slice(0,3)}</label>)}</fieldset>
      <div className="goal-measure-inputs"><label className="form-label">Contexto da atividade<Choice aria-label="Contexto da atividade da ação" value={plan.activityMode} onChange={e => { change('activityMode',e.target.value as GoalActionPlan['activityMode']); setDismissed(false); }}>{ACTIVITY_MODES.map(mode => <option key={mode} value={mode}>{activityModeLabel(mode)}</option>)}</Choice></label><label className="form-label">Minutos estimados <span className="optional">opcional</span><input ref={estimateInput} aria-label="Minutos estimados da ação" type="number" min={1} max={1440} value={plan.estimatedMinutes ?? ''} onChange={e => change('estimatedMinutes',e.target.value ? Number(e.target.value) : null)} /></label></div>
      {history.eligible && !dismissed ? <aside className="goal-evidence"><strong>Uma possível duração inicial: {history.minutes} minutos</strong><p>{history.n} {history.n === 1 ? 'sessão incluída' : 'sessões incluídas'} de {activityModeLabel(plan.activityMode).toLowerCase()} {history.scope === 'goal' ? 'nesta meta' : 'nesta área'}, ao longo de {history.spanDays} dias, {history.from}–{history.to}. {history.evidence} Isto descreve sessões registradas, não uma duração ideal.</p><details><summary>Registros de sessão que sustentam isto</summary><ul>{history.sessionIds.map(id => { const s = data.sessions.find(s => s.id === id)!; return <li key={id}>{localDay(s.startedAt,s.timezone)} · {Math.round(s.activeMs/60000)} minutos · {id}</li>; })}</ul></details><div className="goal-button-row"><Button type="button" onClick={() => { change('estimatedMinutes',history.minutes); setDismissed(true); }}>Aplicar duração</Button><Button type="button" variant="ghost" size="sm" onClick={() => estimateInput.current?.focus()}>Editar duração</Button><Button type="button" variant="ghost" size="sm" onClick={() => setDismissed(true)}>Dispensar duração</Button></div></aside> : !history.eligible && <p className="hint">Escolha uma estimativa ou deixe em branco. As sugestões pessoais de duração precisam de {INSIGHT_THRESHOLDS.attentionSpan.sessions} sessões correspondentes com marcadores de Voltei nos últimos {INSIGHT_THRESHOLDS.duration.days} dias, ou de {INSIGHT_THRESHOLDS.duration.recordedSessions} sessões incluídas correspondentes ao longo de {INSIGHT_THRESHOLDS.duration.recordedDays} dias dentro dos últimos {INSIGHT_THRESHOLDS.duration.recordedWindowDays} dias.</p>}
      <Disclosure title="Prepare-se para um obstáculo"><label className="form-label">Obstáculo provável<textarea aria-label="Obstáculo provável" rows={2} maxLength={500} value={plan.obstacle} onChange={e => change('obstacle',e.target.value)} /></label><label className="form-label">Se isso acontecer, eu vou…<textarea aria-label="Resposta ao obstáculo" rows={2} maxLength={500} value={plan.response} onChange={e => change('response',e.target.value)} /></label></Disclosure>
      <label className="form-label">A programação passa a valer em<input aria-label="A programação passa a valer em" type="date" min={action ? addDays(today,1) : today} value={plan.effectiveDate} onChange={e => change('effectiveDate',e.target.value)} required /></label>
      <p className="hint">Fuso horário do planejamento: {plan.timezone}. {action ? 'As mudanças afetam datas futuras; o plano de hoje e os check-ins passados mantêm o contexto.' : 'Uma ocorrência por dia da semana selecionado. Perder um dia não apaga o progresso anterior.'}</p>
      {error && <p className="goal-form-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button type="button" disabled={busy} onClick={requestClose}>Cancelar</Button><Button variant="primary" type="submit" disabled={busy || !title.trim() || !plan.weekdays.length || !plan.cue.trim() || !plan.normal.trim() || !plan.smaller.trim()}>{busy ? 'Salvando…' : suggestion ? 'Salvar ajuste' : 'Salvar ação'}</Button></div>
    </form>
  </Modal>{discardDialog}</>;
}

export function ActionCheckIn({ row,act,title }: { row: GoalOccurrence; act: ViewProps['act']; title: string }) {
  const [barrier,setBarrier] = useState<GoalBarrier | ''>(row.barrier ?? ''), [note,setNote] = useState(row.note), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const pending = useRef(false);
  const save = async (status: GoalOccurrence['status']) => { if (pending.current) return; pending.current = true; setBusy(true); setError(''); try { const result = await act('goal.occurrence.save',{ id: row.id,goalId: row.goalId,originalDate: row.originalDate,status,barrier: barrier || null,note }); if (!result.ok) setError(result.error); } finally { pending.current = false; setBusy(false); } };
  return <div className="goal-check-in">
    <p className="hint">Status: {row.status === 'done' ? 'Feita' : row.status === 'smaller' ? 'Versão menor' : row.status === 'skipped' ? 'Pulada' : 'Sem registro'}. Os check-ins são opcionais e podem ser corrigidos.</p>
    <div className="goal-button-row">{[['done','Feita'],['smaller','Fiz a versão menor'],['skipped','Pular']] .map(([status,label]) => <Button key={status} className="aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent" disabled={busy} aria-label={`${label}: ${title}`} aria-pressed={row.status === status} onClick={() => void save(status as GoalOccurrence['status'])}>{label}</Button>)}{row.status !== 'unrecorded' && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void save('unrecorded')}>Limpar check-in</Button>}</div>
    <Disclosure title="O que ajudou ou atrapalhou?"><label className="form-label">Barreira relatada<Choice aria-label={`Barreira relatada: ${title}`} value={barrier} onChange={e => setBarrier(e.target.value as GoalBarrier | '')}><option value="">Nenhuma barreira registrada</option>{Object.entries(BARRIER_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</Choice></label><label className="form-label">Nota da ação<textarea aria-label={`Nota da ação: ${title}`} rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label><Button disabled={busy || row.status === 'unrecorded'} onClick={() => void save(row.status)}>Salvar detalhes do check-in</Button></Disclosure>
    {error && <p className="goal-form-error" role="alert">{error}</p>}
  </div>;
}
