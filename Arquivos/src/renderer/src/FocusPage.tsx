import { Button, PageHeader, Plate, cn } from './ui';
import SessionGauge from './figures/session-gauge/SessionGauge';
import { gaugeReadout } from './figures/session-gauge/model';
import NeuralVisual from './NeuralVisual';
import { Segments } from './ui';
import { Choice } from './ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ViewProps, SessionPreparation } from './App';
import { Brain, Disclosure, Icon, Rating, time, minutesLabel, useMotionEnabled } from './components';
import { countedTime, displayedTime, timerLabel, visualProgress } from '../../shared/timer-display';
import { ACTIVITY_MODES, MEDICATION_ANSWERS, WARM_UPS, sortMilestones, type ActivityMode, type Medication, type WarmUp } from '../../shared/types';
import { ReturnFeedback, ReturnMarkers } from './Behaviour';
import type { TimingMode } from '../../shared/types';
import { addDays, localDay, monday, summarizeDays } from '../../shared/analytics';
import { goalData } from '../../shared/goal-types';
import type { FocusInsights, Recommendation } from '../../shared/focus-insights';
import { StrengthBadge, insightsSignature } from './InsightsPanel';
import { ReflectionChoice } from './ProbePrompt';
import { activityModeLabel, interruptionLabel } from '../../shared/labels';

const WARM_UP_LABELS: Record<WarmUp, string> = { yes: 'Sim', 'kind-of': 'Mais ou menos', no: 'Não' };
const MEDICATION_LABELS: Record<Medication, string> = { yes: 'Sim', no: 'Não' };

/* One hint from each group, strongest first: a block length or a pause, a time window, and something to do before starting. */
const PREVENTION_KINDS: Recommendation['kind'][] = ['warmup', 'detractor', 'challenge', 'switching'];
const HINT_GROUPS: Recommendation['kind'][][] = [['length', 'break'], ['window'], PREVENTION_KINDS];
const hintsOf = (items: Recommendation[]): Recommendation[] => HINT_GROUPS.flatMap(kinds => items.filter(r => kinds.includes(r.kind)).slice(0, 1));

export default function FocusPage({ data, act, preparation, setPreparation, visible }: ViewProps & { preparation: SessionPreparation; setPreparation: (value: SessionPreparation) => void; visible: boolean }) {
  const motion = useMotionEnabled(data.settings.animation && visible);
  const fieldId = preparation.fieldId;
  const setFieldId = (id: string) => setPreparation({ fieldId: id, checklistIds: [], primaryTaskId: null });
  const [activityMode, setActivityMode] = useState<ActivityMode>('Unspecified');
  useEffect(() => { setActivityMode(data.settings.activityModes?.[fieldId] ?? 'Unspecified'); }, [fieldId]);
  const [timingMode, setTimingMode] = useState<TimingMode>('countdown');
  const [duration, setDuration] = useState(data.settings.defaultMinutes), [intention, setIntention] = useState(''), [energy, setEnergy] = useState<number | null>(null);
  const [warmUp, setWarmUp] = useState<WarmUp | null>(null), [medication, setMedication] = useState<Medication | null>(null);
  const [sessionToolsOpen, setSessionToolsOpen] = useState(false), [recentOpen, setRecentOpen] = useState(data.timer.mode === 'idle');
  const [thought, setThought] = useState(''), [category, setCategory] = useState('Unspecified');
  const current = data.sessions.find(s => s.id === data.timer.sessionId);
  const previousSession = useRef(current?.id ?? null);
  const activeField = current?.fieldId ?? fieldId;
  const fields = data.fields.filter(f => !f.archived || f.id === current?.fieldId);
  const field = data.fields.find(f => f.id === activeField);
  const active = data.timer.mode !== 'idle'; const isBreak = data.timer.mode === 'break';
  const instrument = data.settings.focusVisual === 'instrument';
  // Before a session starts, the gauge's plan marker follows the duration being prepared.
  const gaugeElapsed = active ? data.timer.elapsedMs : 0;
  const gaugePlanned = active ? data.timer.plannedMs : timingMode === 'countdown' ? duration * 60000 : null;
  useEffect(() => { setRecentOpen(!active); setSessionToolsOpen(false); }, [active]);
  useEffect(() => { setDuration(data.settings.defaultMinutes); }, [data.settings.defaultMinutes]);
  useEffect(() => { if (!preparation.preparedAt) return; setIntention(preparation.intention ?? ''); setDuration(preparation.durationMinutes ?? data.settings.defaultMinutes); setActivityMode(preparation.activityMode ?? 'Unspecified'); setTimingMode('countdown'); }, [preparation.preparedAt]);
  useEffect(() => { if (!current && !fields.some(f => f.id === fieldId)) setFieldId(fields[0]?.id ?? ''); }, [fields, current, fieldId]);
  useEffect(() => {
    if (current) setFieldId(current.fieldId);
    if (previousSession.current && !current) { setPreparation({ fieldId, checklistIds: [], primaryTaskId: null }); setIntention(''); setEnergy(null); setWarmUp(null); setMedication(null); }
    previousSession.current = current?.id ?? null;
  }, [current?.id]);
  const start = async () => {
    const result = await act('session.start', { fieldId,activityMode,timingMode,durationMinutes: timingMode === 'countdown' ? duration : undefined,intention,energy,warmUp,medication,primaryTaskId: preparation.primaryTaskId,checklistIds: preparation.checklistIds,...(preparation.goalId !== undefined ? { goalId: preparation.goalId } : {}),milestoneId: preparation.goalId ? preparation.milestoneId ?? null : null,occurrenceId: preparation.occurrenceId,occurrenceDate: preparation.occurrenceDate });
    if (result.ok) setThought('');
  };
  const selectedGoal = preparation.goalId === undefined ? data.tasks.find(t => t.id === preparation.primaryTaskId)?.goalId ?? '' : preparation.goalId ?? '';
  const goal = data.goals?.find(g => g.id === (current ? current.goalId : selectedGoal));
  const steps = sortMilestones((data.milestones ?? []).filter(m => m.goalId === preparation.goalId && m.kind === 'todo' && !m.archived && (!m.completed || m.id === preparation.milestoneId)));
  const step = data.milestones?.find(m => m.id === (current ? current.milestoneId : preparation.milestoneId));
  const today = localDay(Date.now(), data.settings.timezone);
  const daySummaries = useMemo(() => summarizeDays(data), [data.sessions, data.events]);
  const summary = daySummaries.find(d => d.day === today);
  const recent = data.sessions.filter(s => s.status === 'completed').slice(0, 3);
  // Up to three hints from the last 90 days of the prepared goal (or the area), one from each group: a length or a pause, a time window, and something to do before starting.
  // Kept until finished sessions, their ratings or their markers change; nothing shows on error.
  const signature = useMemo(() => insightsSignature(data.sessions, data.events), [data.sessions, data.events]), hintScope = selectedGoal ? { goalId: selectedGoal } : { fieldId };
  const hintKey = `${signature}|${selectedGoal ? `goal:${selectedGoal}` : `area:${fieldId}`}`;
  const [hints, setHints] = useState<{ key: string; items: Recommendation[] } | null>(null);
  useEffect(() => {
    if (active || !visible || !window.focusGuide || (!fieldId && !selectedGoal) || hints?.key === hintKey) return;
    let current = true;
    const keep = (items: Recommendation[]) => { if (current) setHints({ key: hintKey, items }); };
    void window.focusGuide.command('insights.read', { from: addDays(today, -89), to: today, ...hintScope })
      .then(result => keep(result.ok ? hintsOf((result.value as FocusInsights).recommendations) : [])).catch(() => keep([]));
    return () => { current = false; };
  }, [active, visible, hintKey]);
  const shownHints = hints?.key === hintKey ? hints.items : [];
  // The adjustment saved for this week in the weekly review of the prepared goal, or the general one.
  const week = monday(today), weekAdjustment = (selectedGoal ? goalData(data).goalReviews.find(r => r.goalId === selectedGoal && r.week === week)?.adjustment : data.reviews.find(r => r.week === week)?.adjustment)?.trim() ?? '';
  return <>
    <PageHeader title="Uma coisa. Toda a sua atenção." description="Escolha o que importa e dê um pouco de espaço a isso." actions={<div className="today-summary"><span>Hoje</span><strong>{minutesLabel(summary?.minutes ?? 0)}</strong><small>{summary?.count ?? 0} sessões salvas</small></div>} />
    {!active && !data.fields.some(f => !f.archived) && <div className="alert notice" role="status">Crie uma área em Configurações antes de iniciar uma sessão.</div>}
    <div className={`focus-layout ${active ? 'quiet-session' : ''}`}>
      <Plate fig={1} className={cn('focus-stage', data.timer.running && 'is-running', instrument && 'bg-none')}
        title={<span className="stage-field"><span style={{ background: isBreak ? 'var(--blue)' : field?.color }} />{isBreak ? 'Uma pequena pausa' : goal ? `${goal.title}${step ? ` · ${step.title}` : ''} · ${field?.name ?? ''}` : field?.name ?? 'Sua próxima intenção'}</span>}
        hint={<span className="tiny-label"><span className={`status-light ${data.timer.running ? 'running' : ''}`} />{isBreak ? 'Intervalo' : active ? data.timer.running ? 'Focando' : 'Pausado' : 'Pronto'}</span>}
        readout={instrument ? gaugeReadout(gaugeElapsed, gaugePlanned) : `${Math.round(visualProgress(data.timer) * 100)}% ${data.timer.phase === 'stopwatch' ? 'da hora' : 'da sessão'}`}>
        <div className={cn('brain-orbit', instrument && 'gauge-orbit')}><ReturnFeedback sessionId={data.timer.sessionId} animation={data.settings.animation} visible={visible}>{instrument ? <SessionGauge elapsedMs={gaugeElapsed} plannedMs={gaugePlanned} running={data.timer.running} breakMode={isBreak} animation={data.settings.animation && visible} label="Medidor de sessão: um mostrador cujo ponteiro dá uma volta a cada 10 minutos de sessão; o mostrador pequeno conta as voltas até 2 horas e seu marcador mostra a duração planejada." /> : <NeuralVisual kind="focus" color={isBreak ? '#5786dc' : '#9472e7'} theme={data.settings.theme} progress={visualProgress(data.timer)} running={data.timer.running} moving={motion && data.timer.running} visible={visible} software={data.graphicsMode === 'software'} label={`Ilustração do progresso do cérebro, ${Math.round(visualProgress(data.timer) * 100)} por cento da sessão`} fallback={<Brain progress={visualProgress(data.timer)} running={data.timer.running} animation={false} color={isBreak ? 'var(--blue)' : undefined} />} />}</ReturnFeedback></div>
        <div className={`clock ${data.timer.phase === 'overtime' ? 'overtime-clock' : ''}`} role="timer" aria-label={active ? timerLabel(data.timer) : timingMode === 'stopwatch' ? 'Tempo registrado' : 'Tempo restante'}>{data.timer.phase === 'overtime' && <span className="clock-mode-label">Tempo extra</span>}{data.timer.phase === 'overtime' ? '+' : ''}{time(active ? displayedTime(data.timer) : timingMode === 'stopwatch' ? 0 : duration * 60000)}</div>{current && (data.timer.phase === 'overtime' || data.timer.phase === 'stopwatch') && <p className="recorded-total">Total registrado · {time(countedTime(data.timer.elapsedMs))}</p>}<p className="clock-caption">{isBreak ? 'Deixe sua atenção descansar.' : current?.intention || (active ? 'Sua atenção tem onde pousar.' : 'Um pequeno começo já basta.')}</p>
        <div className="timer-progress" role="progressbar" aria-label={data.timer.phase === 'stopwatch' ? 'Progresso visual, não uma meta' : 'Progresso da sessão'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(visualProgress(data.timer) * 100)}><span style={{ width: `${visualProgress(data.timer) * 100}%` }} /></div>
        {data.timer.pauseReason && <p className="pause-reason">{data.timer.pauseReason}</p>}
        <div className="clock-controls">{active ? <><Button variant="primary" icon={data.timer.running ? 'pause' : 'play'} onClick={() => void act(data.timer.running ? 'session.pause' : 'session.resume')}>{data.timer.running ? 'Pausar' : 'Retomar'}</Button><Button icon="stop" onClick={() => void act(isBreak ? 'break.stop' : 'session.finish')}>{isBreak ? 'Concluir intervalo' : 'Concluir sessão'}</Button></> : <Button variant="primary" icon="play" className="start-focus" disabled={!fieldId || (timingMode === 'countdown' && (!Number.isFinite(duration) || duration < 1 || duration > 1440))} onClick={() => void start()}>Iniciar foco <Icon name="arrow" size={18} /></Button>}</div>
        
        <div className="stage-foot mt-4 grid justify-items-center gap-1 text-center text-caption text-ink-muted"><p className="collector-status m-0 text-caption" role="status">{data.collector?.message ?? 'Prévia sintética · a coleta nativa exige Windows.'}</p><p className="m-0 flex items-center gap-1.5"><Icon name="spark" size={14} className="shrink-0 text-accent" />{current ? 'Menos de 2 minutos de tempo ativo são excluídos automaticamente.' : instrument ? 'O ponteiro gira conforme a sessão avança.' : 'O cérebro se ilumina conforme a sessão avança.'}</p></div>
      </Plate>
      <div className="focus-tools">
        {!active && goal && <div className="goal-focus-banner" role="status"><Icon name="spark" size={16} /><span><span className="tiny-label text-caption tracking-normal">Estudando</span><strong>{goal.title}</strong><small>{field?.name}{step ? ` · Etapa: ${step.title}` : ''}{preparation.occurrenceId ? ' · Ação planejada vinculada' : ''}{preparation.primaryTaskId ? ` · ${data.tasks.find(t => t.id === preparation.primaryTaskId)?.title}` : ''}</small></span><Button variant="ghost" size="sm" onClick={() => setPreparation({ fieldId,checklistIds: [],primaryTaskId: null,goalId: null })}>Foco livre</Button></div>}
        {!active && !goal && (preparation.primaryTaskId || preparation.checklistIds.length > 0) && <div className="prepared-summary" role="status"><Icon name="check" size={16} /><span>{data.tasks.find(t => t.id === preparation.primaryTaskId)?.title ?? `${preparation.checklistIds.length} tarefas selecionadas`}</span></div>}
        {!active && <section className="panel preparation"><div className="section-title"><h2>Dê um propósito a este tempo</h2></div>{!goal && <label className="form-label">Área<Choice value={fieldId} onChange={e => setFieldId(e.target.value)} aria-label="Área">{fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}{!fields.length && <option value="">Adicione uma área em Configurações</option>}</Choice></label>}<Segments value={timingMode} onChange={mode => { if (mode) setTimingMode(mode as TimingMode); }} label="Modo de cronometragem" className="timing-mode" options={[{ value: 'countdown', label: 'Timer' }, { value: 'stopwatch', label: 'Cronômetro' }]} />{timingMode === 'countdown' ? <><label className="form-label">Reserve um tempo</label><div className="duration-row grid grid-cols-4 gap-2">{[25, 50, 90].map(n => <button key={n} className={cn('duration-button flex h-16 flex-col items-center justify-center rounded-control border px-2 text-title tabular-nums transition-colors duration-150 ease-standard', duration === n ? 'selected border-accent bg-accent-soft text-accent' : 'border-line-strong bg-surface text-ink hover:bg-accent-soft')} aria-pressed={duration === n} onClick={() => setDuration(n)}>{n}<span className="mt-0.5 text-caption text-ink-muted">min</span></button>)}<label className={cn('custom-duration flex h-16 w-auto flex-col items-center justify-center rounded-control border px-2 transition-colors duration-150 ease-standard focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-accent', [25, 50, 90].includes(duration) ? 'border-line-strong bg-surface' : 'border-accent bg-accent-soft')}><input className="h-7 w-full rounded-none border-0 bg-transparent p-0 text-center text-title text-ink tabular-nums focus-visible:outline-none" type="number" min={1} max={1440} value={duration} onChange={e => setDuration(e.target.value ? Number(e.target.value) : 0)} aria-label="Duração personalizada em minutos" /><span className="mt-0.5 text-caption text-ink-muted">min personalizado</span></label></div><p className="hint mt-2">{data.settings.autoOvertime ? 'Ao chegar a zero, o tempo extra continua nesta sessão.' : 'Ao chegar a zero, esta sessão é salva automaticamente.'}</p></> : <p className="hint">Conta para cima a partir de zero. Conclua quando estiver pronto.</p>}{weekAdjustment && <p className="focus-adjustment" role="status"><Icon name="calendar" size={15} className="mt-0.5 shrink-0 text-accent" /><span><strong>Seu ajuste desta semana</strong>{weekAdjustment}</span></p>}{shownHints.length > 0 && <div className="focus-hints" role="group" aria-label="Sugestões dos seus últimos 90 dias">{shownHints.map(r => <div key={r.id} className="focus-hint"><Icon name="spark" size={15} className="mt-0.5 shrink-0 text-accent" /><div className="min-w-0 flex-1"><p className="m-0 flex flex-wrap items-center gap-2 text-caption text-ink">{r.title}<StrengthBadge strength={r.strength} /></p>{PREVENTION_KINDS.includes(r.kind) && <p className="m-0 text-caption text-ink">{r.detail}</p>}<p className="m-0 text-caption text-ink-muted">{r.evidence}</p></div>{(r.kind === 'length' || r.kind === 'break') && r.minutes !== undefined && <Button size="sm" variant="secondary" aria-pressed={timingMode === 'countdown' && duration === r.minutes} onClick={() => { setTimingMode('countdown'); setDuration(r.minutes!); }}>Usar {r.minutes} min</Button>}</div>)}</div>}<label className="form-label">Sua intenção<span className="optional">opcional</span><textarea value={intention} onChange={e => setIntention(e.target.value)} maxLength={500} rows={2} placeholder="O que merece a sua atenção agora?" /></label></section>}
        {active && <section className="panel current-purpose"><div className="section-title"><h2>{isBreak ? 'Você tem espaço para descansar' : 'Fique com a sua intenção'}</h2></div><p>{isBreak ? 'Levante-se, alongue-se, desvie o olhar da tela. Seu intervalo não soma tempo de foco.' : current?.intention || 'Uma coisa de cada vez. Volte quantas vezes precisar.'}</p></section>}
        {!active && <Disclosure title="Detalhes opcionais"><label className="form-label">Modo de atividade<Choice aria-label="Modo de atividade" value={activityMode} onChange={e => setActivityMode(e.target.value as ActivityMode)}>{ACTIVITY_MODES.map(mode => <option key={mode} value={mode}>{activityModeLabel(mode)}</option>)}</Choice><span className="hint">Dá contexto à interação com o computador; sem limites de foco.</span></label><label className="form-label">Meta <span className="optional">opcional</span><Choice aria-label="Meta da sessão" value={selectedGoal} onChange={e => setPreparation({ ...preparation,goalId: e.target.value || null,milestoneId: null,occurrenceId: null,occurrenceDate: undefined })}><option value="">Nenhuma meta selecionada</option>{(data.goals ?? []).filter(g => g.fieldId === fieldId && g.status === 'active').map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</Choice>{preparation.occurrenceId && <span className="hint">Vinculada a uma ação planejada. Concluí-la continua sendo opcional.</span>}</label>{preparation.goalId && <label className="form-label">Etapa do roteiro <span className="optional">opcional</span><Choice aria-label="Etapa do roteiro da sessão" value={preparation.milestoneId ?? ''} onChange={e => setPreparation({ ...preparation,milestoneId: e.target.value || null })}><option value="">Nenhuma etapa específica</option>{steps.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</Choice><span className="hint">O tempo da sessão conta para esta etapa.</span></label>}<Rating value={energy} onChange={setEnergy} label="Como você está chegando?" low="Pouca energia" high="Muita energia" /><div className="reflection-questions"><ReflectionChoice label="Já estou aquecido" value={warmUp} values={WARM_UPS} labels={WARM_UP_LABELS} onChange={setWarmUp} /><ReflectionChoice label="Você tomou medicamentos?" value={medication} values={MEDICATION_ANSWERS} labels={MEDICATION_LABELS} onChange={setMedication} /></div></Disclosure>}
        {current && <Disclosure title="Ferramentas da sessão" open={sessionToolsOpen} onOpenChange={setSessionToolsOpen}><Button icon="check" disabled={!data.timer.running} onClick={() => void act('attention.return', { source: 'main' })}>Voltei</Button><ReturnMarkers events={data.events} sessionId={current.id} act={act} />{!isBreak && <div className="interruption-control"><Choice aria-label="Categoria da interrupção" value={category} onChange={e => setCategory(e.target.value)}>{['Unspecified', 'Internal', 'External', 'Environment', 'Other'].map(c => <option key={c} value={c}>{interruptionLabel(c)}</option>)}</Choice><Button onClick={() => void act('interruption.record', { category })}>Marcar interrupção</Button></div>}<p className="hint">{!isBreak && 'Um marcador registra uma interrupção; use Pausar quando parar de trabalhar.'}</p>{current && <section className="panel thought-panel"><div className="section-title"><Icon name="thought" size={19} /><h2>Guarde este pensamento</h2></div><form onSubmit={async e => { e.preventDefault(); const result = await act('thought.record', { text: thought }); if (result.ok) setThought(''); }}><textarea value={thought} onChange={e => setThought(e.target.value)} maxLength={2000} rows={2} aria-label="Pensamento a guardar" placeholder="Coloque aqui. Você pode voltar a ele depois." /><Button variant="ghost" size="sm" disabled={!thought.trim()} type="submit">Salvar pensamento <Icon name="arrow" size={16} /></Button></form></section>}<div className="mt-2 flex justify-center"><Button variant="ghost" size="sm" icon="close" className="exclude-active m-0" title="Conclui esta sessão e a exclui dos insights; o tempo registrado continua no histórico." onClick={() => void act('session.finish', { excluded: true })}>Excluir sessão</Button></div></Disclosure>}
      </div>
    </div>
    <Disclosure title="Sessões recentes" open={recentOpen} onOpenChange={setRecentOpen}><section className="recent-section"><div className="section-title"><h2>Sessões recentes</h2><span className="hint">Gerencie a inclusão no Calendário.</span></div>{recent.length ? <div className="recent-grid">{recent.map(s => <div className="recent-card" key={s.id}><span className="field-dot" style={{ background: data.fields.find(f => f.id === s.fieldId)?.color }} /><div><strong>{data.goals?.find(g => g.id === s.goalId)?.title ?? data.fields.find(f => f.id === s.fieldId)?.name}</strong><p>{s.intention || 'Um pouco de espaço para focar'}{s.excluded && <span className="excluded-badge">Excluída</span>}</p></div><span className="recent-duration">{minutesLabel(s.activeMs / 60000)}</span></div>)}</div> : <div className="first-session-note"><Icon name="world" size={19} /><span>Sua primeira sessão é o começo da sua história pessoal de foco.</span></div>}</section></Disclosure>
  </>;
}
