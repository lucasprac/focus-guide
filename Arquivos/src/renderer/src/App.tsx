import { Button, CheckControl, Hint, IconButton, cn } from './ui';
import { useEffect, useRef, useState } from 'react';
import { animate, createScope } from 'animejs';
import type { AppState, Challenge, Command, CommandResult, Detractor, FocusSession, Goal, GoalOccurrence, ActivityMode } from '../../shared/types';
import GoalsPage from './GoalsPage';
import type { GoalFocusOptions } from './GoalWorkspace';
import { ActionCheckIn } from './GoalForms';
import { MIN_INCLUDED_SESSION_MS } from '../../shared/types';
import { brainColorProgress } from '../../shared/brain-progress';
import { totalMinutes, localDay, planDifferenceMinutes } from '../../shared/analytics';
import { FloatingNetwork, Icon, Modal, Rating, time, minutesLabel, planComparison, type IconName, useMotionEnabled } from './components';
import TasksPage from './TasksPage';
import { displayedTime, timerLabel, visualDuration } from '../../shared/timer-display';
import FocusPage from './FocusPage';
import CalendarPage from './CalendarPage';
import PatternsPage from './PatternsPage';
import WorldPage from './WorldPage';
import SettingsPage from './SettingsPage';
import { BehaviourReview, ReturnFeedback } from './Behaviour';
import ProbePrompt, { ProbeAnnouncer, ReflectionQuestions } from './ProbePrompt';
import BehaviourTutorial from './BehaviourTutorial';
import { t, dateLocale, setLanguage } from '../../shared/i18n';

export type Action = (command: Command, input?: Record<string, unknown>) => Promise<CommandResult>;
export interface SessionPreparation { fieldId: string; checklistIds: string[]; primaryTaskId: string | null; goalId?: string | null; milestoneId?: string | null; occurrenceId?: string | null; occurrenceDate?: string; intention?: string; durationMinutes?: number; activityMode?: ActivityMode; preparedAt?: string }
export interface ViewProps { data: AppState; act: Action }
type Page = 'Goals' | 'Tasks' | 'Focus' | 'Calendar' | 'Patterns' | 'Neural World' | 'Settings';
const navigation: Array<{ page: Page; icon: IconName }> = [
  { page: 'Goals', icon: 'spark' }, { page: 'Focus', icon: 'focus' }, { page: 'Tasks', icon: 'check' }, { page: 'Calendar', icon: 'calendar' }, { page: 'Patterns', icon: 'patterns' }, { page: 'Neural World', icon: 'world' }, { page: 'Settings', icon: 'settings' }
];
export default function App() {
  const mini = new URLSearchParams(window.location.search).has('mini');
  const [data, setData] = useState<AppState | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  // Every text of this render, and of the children rendered after it, is in the saved language.
  const language = data?.settings.language ?? 'en';
  setLanguage(language);
  const [settingsVisited, setSettingsVisited] = useState(false), [tutorialOpen, setTutorialOpen] = useState(false);
  const [taskGoalId,setTaskGoalId] = useState<string | null>(null), [activeGoalId,setActiveGoalId] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('Goals'), [review, setReview] = useState<FocusSession | null>(null), [focus, setFocus] = useState<number | null>(null), [note, setNote] = useState('');
  const [detractor, setDetractor] = useState<Detractor | null>(null), [challenge, setChallenge] = useState<Challenge | null>(null);
  const [preparation, setPreparation] = useState<SessionPreparation>({ fieldId: '', checklistIds: [], primaryTaskId: null });
  useEffect(() => {
    if (!data || data.timer.sessionId) return;
    setPreparation(current => {
      const fieldId = data.fields.some(f => f.id === current.fieldId && !f.archived) ? current.fieldId : data.fields.find(f => !f.archived)?.id ?? '';
      const valid = new Set(data.tasks.filter(t => t.fieldId === fieldId && !t.archived && !t.completed).map(t => t.id));
      const checklistIds = current.checklistIds.filter(id => valid.has(id));
      const primaryTaskId = current.primaryTaskId && checklistIds.includes(current.primaryTaskId) ? current.primaryTaskId : null;
      const goalValid = !current.goalId || data.goals?.some(g => g.id === current.goalId && g.fieldId === fieldId && g.status === 'active');
      return fieldId === current.fieldId && checklistIds.length === current.checklistIds.length && primaryTaskId === current.primaryTaskId && goalValid ? current : { ...current,fieldId,checklistIds,primaryTaskId,...(!goalValid || fieldId !== current.fieldId ? { goalId: undefined,milestoneId: null,occurrenceId: null,occurrenceDate: undefined,preparedAt: undefined } : {}) };
    });
  }, [data?.tasks, data?.fields, data?.goals, data?.timer.sessionId]);
  const previous = useRef<string | null>(null), root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.focusGuide) { setError(t('Open FocusGuide.exe to connect to your local dataset.')); return; }
    let mounted = true;
    const remove = window.focusGuide.onEvent(event => {
      if (!mounted) return;
      if (event.type === 'state') setData(event.state);
      else if (event.type === 'timer') setData(current => {
        if (!current) return current;
        const a = current.timer, b = event.timer;
        if (a.mode === b.mode && a.running === b.running && a.sessionId === b.sessionId && a.elapsedMs === b.elapsedMs && a.remainingMs === b.remainingMs && a.phase === b.phase && a.overtimeMs === b.overtimeMs && a.plannedMs === b.plannedMs && a.pauseReason === b.pauseReason) return current;
        return { ...current, timer: event.timer };
      });
      else if (event.type === 'error') setError(event.message);
      else if (event.type === 'notice') setNotice(event.message);
    });
    void window.focusGuide.getState().then(state => { if (mounted) setData(state); }).catch(e => setError(String(e)));
    return () => { mounted = false; remove(); };
  }, []);
  useEffect(() => {
    if (!data || mini) return;
    if (previous.current && !data.timer.sessionId) {
      const completed = data.sessions.find(s => s.id === previous.current && s.status === 'completed');
      if (completed) { setPreparation(p => ({ fieldId: p.fieldId,checklistIds: [],primaryTaskId: null,...(completed.goalId ? { goalId: completed.goalId } : {}) })); setReview(completed); setFocus(completed.focus); setNote(completed.note); setDetractor(completed.detractor ?? null); setChallenge(completed.challenge ?? null); }
    }
    previous.current = data.timer.sessionId;
  }, [data, mini]);
  useEffect(() => { if (page === 'Settings') setSettingsVisited(true); }, [page]);
  useEffect(() => { const content = root.current?.querySelector('.main-content'); if (content) content.scrollTop = 0; }, [page]);
  useEffect(() => { document.documentElement.dataset.theme = data?.settings.theme ?? 'light'; }, [data?.settings.theme]);
  useEffect(() => { document.documentElement.lang = data?.settings.language ?? 'en'; }, [data?.settings.language]);
  const motion = useMotionEnabled(data?.settings.animation ?? false);
  useEffect(() => { if (!mini) document.documentElement.dataset.motion = motion ? 'on' : 'off'; }, [motion, mini]);
  useEffect(() => {
    if (!motion || mini) return;
    const scope = createScope({ root }).add(() => { animate('.page-heading', { opacity: [0, 1], y: [8, 0], duration: 280, ease: 'outQuad' }); });
    return () => scope.revert();
  }, [page, motion, mini]);
  useEffect(() => { if (!notice) return; const timeout = window.setTimeout(() => setNotice(''), 5000); return () => window.clearTimeout(timeout); }, [notice]);
  const act: Action = async (command, input = {}) => {
    try {
      const result = await window.focusGuide.command(command, input);
      if (!result.ok) setError(result.error);
      else if (command.startsWith('export.') && result.value) setNotice(t('Export saved. Your dataset is ready to use.'));
      else if (command === 'backup.restore') setNotice(t('Backup restored. Your previous dataset was saved first.'));
      else if (command === 'backup.create') setNotice(String(result.value));
      return result;
    } catch (e) { const message = String(e); setError(message); return { ok: false, error: message }; }
  };
  if (!data) return mini ? <div className="mini-app mini-loading" role="status"><Icon name="world" size={32} /><span>{error || t('Opening timer…')}</span></div> : <div className="loading-screen"><Icon name="world" size={42} /><h1>Focus Guide</h1><p>{error || t('Opening your focus space…')}</p></div>;
  if (mini) return <div className="mini-app" key={language} tabIndex={0} role="group" aria-label={t('Floating timer. Hover or focus to reveal time and controls.')}>
    {data.timer.mode === 'focus' && <ProbeAnnouncer probe={data.probe} />}
    <div className="mini-drag" title={t('Drag the brain to move the floating timer')}>
      <ReturnFeedback sessionId={data.timer.sessionId} animation={data.settings.animation} neutral={brainColorProgress(data.timer.elapsedMs, visualDuration(data.timer)) === 0}><FloatingNetwork elapsedMs={data.timer.elapsedMs} progress={brainColorProgress(data.timer.elapsedMs, visualDuration(data.timer))} running={data.timer.running} pause={data.timer.mode === 'break'} animation={data.settings.animation} software={data.graphicsMode === 'software'} /></ReturnFeedback>
    </div>
    {data.timer.mode === 'focus' && <button className="mini-return" aria-label={t('I\'m back')} title={t('I\'m back — save a return marker')} disabled={!data.timer.running} onClick={() => void act('attention.return', { source: 'floating' })}><Icon name="check" size={16} /></button>}
    {/* After the drag area: Electron applies app-region rects in DOM order, so an earlier no-drag rect is re-covered by a later drag rect and its clicks move the window. */}
    {data.probe && <ProbePrompt key={data.probe.id} probe={data.probe} act={act} mini />}
    <div className="mini-reveal">
      <div className="mini-time" role="timer" aria-label={data.timer.mode === 'idle' ? t('Planned duration') : timerLabel(data.timer)}>{data.timer.phase === 'overtime' ? '+' : ''}{time(data.timer.mode === 'idle' ? data.settings.defaultMinutes * 60000 : displayedTime(data.timer))}</div>
      <div className="mini-controls">
        {data.timer.mode !== 'idle' && <>
          <button onClick={() => void act(data.timer.running ? 'session.pause' : 'session.resume')} aria-label={data.timer.running ? t('Pause') : t('Resume')} title={data.timer.running ? t('Pause') : t('Resume')}><Icon name={data.timer.running ? 'pause' : 'play'} size={16} /></button>
          <button onClick={async () => { const result = await act(data.timer.mode === 'break' ? 'break.stop' : 'session.finish'); if (result.ok) await act('window.main'); }} aria-label={t('Finish')} title={t('Finish')}><Icon name="stop" size={16} /></button>
        </>}
        <button onClick={() => void act('window.main')} aria-label={t('Open your focus space')} title={t('Open your focus space')}><Icon name="arrow" size={16} /></button>
        <button onClick={() => void act('window.hide')} aria-label={t('Hide floating timer')} title={t('Hide floating timer')}><Icon name="close" size={16} /></button>
      </div>
    </div>
    {error && <div className="mini-error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label={t('Dismiss error')}><Icon name="close" size={14} /></button></div>}
  </div>;
  const today = localDay(Date.now(), data.settings.timezone);
  const reviewed = data.sessions.find(s => s.id === review?.id) ?? review;
  const reviewedOccurrence = data.goalOccurrences?.find(o => o.id === reviewed?.occurrenceId);
  const startAction = (row: GoalOccurrence) => { const goal = data.goals?.find(g => g.id === row.goalId); if (!goal || !data.fields.some(f => f.id === goal.fieldId && !f.archived) || data.timer.mode !== 'idle') return; setPreparation({ fieldId: goal.fieldId,checklistIds: [],primaryTaskId: null,goalId: goal.id,occurrenceId: row.id,occurrenceDate: row.originalDate,intention: row.plan.normal,durationMinutes: row.plan.estimatedMinutes ?? data.settings.defaultMinutes,activityMode: row.plan.activityMode,preparedAt: crypto.randomUUID() }); setPage('Focus'); };
  // Focus inside a goal: the session takes the goal's area and goal link, and the mode of the goal's latest session.
  const focusGoal = (goal: Goal, options: GoalFocusOptions = {}) => {
    if (data.timer.mode !== 'idle') { setPage('Focus'); return; }
    if (goal.status !== 'active' || !data.fields.some(f => f.id === goal.fieldId && !f.archived)) return;
    const latest = data.sessions.filter(s => s.goalId === goal.id && s.status === 'completed').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    setPreparation({ fieldId: goal.fieldId,checklistIds: options.taskId ? [options.taskId] : [],primaryTaskId: options.taskId ?? null,goalId: goal.id,milestoneId: options.milestoneId ?? null,occurrenceId: null,intention: options.intention ?? '',durationMinutes: data.settings.defaultMinutes,activityMode: latest?.activityMode ?? data.settings.activityModes?.[goal.fieldId] ?? 'Unspecified',preparedAt: crypto.randomUUID() });
    setPage('Focus');
  };
  const openGoalTasks = (goal: Goal) => { setTaskGoalId(goal.id); if (data.timer.mode === 'idle') setPreparation({ fieldId: goal.fieldId,checklistIds: [],primaryTaskId: null }); setPage('Tasks'); };
  return <div className="app-shell" key={language} ref={root} data-page={page}>
    <aside className={`sidebar ${data.settings.sidebarCollapsed ? 'collapsed' : ''}`} id="side-panel"><div className="brand"><span className="brand-mark"><img src={`${import.meta.env.BASE_URL}icon.png`} alt="" draggable={false} /></span><div>Focus Guide</div><Hint label={data.settings.sidebarCollapsed ? t('Expand side panel') : t('Collapse side panel')}><button className="sidebar-toggle" aria-label={data.settings.sidebarCollapsed ? t('Expand side panel') : t('Collapse side panel')} title={data.settings.sidebarCollapsed ? t('Expand side panel') : t('Collapse side panel')} aria-expanded={!data.settings.sidebarCollapsed} aria-controls="side-panel" onClick={() => void act('settings.update', { ...data.settings, sidebarCollapsed: !data.settings.sidebarCollapsed })}><Icon name="chevron" size={16} /></button></Hint></div>
      <nav aria-label={t('Main navigation')}>{navigation.map(item => <Hint key={item.page} label={t(item.page)} enabled={data.settings.sidebarCollapsed}><button className={cn('nav-item rounded-control text-label transition-colors duration-150 ease-standard', page === item.page ? 'active border-transparent bg-accent-soft font-medium text-accent' : 'text-ink hover:bg-accent-soft')} onClick={() => setPage(item.page)} aria-label={t(item.page)} title={t(item.page)} aria-current={page === item.page ? 'page' : undefined}><Icon name={item.icon} /><span>{t(item.page)}</span></button></Hint>)}</nav>
      <div className="sidebar-world"><div className="tiny-label text-caption">{t('Recorded focus')}</div><div className="sidebar-world-value text-display font-light tabular-nums">{minutesLabel(totalMinutes(data))}</div></div>
      <div className="sidebar-footer text-caption"><Icon name="shield" size={14} />{' '}{t('Local & personal')}</div>
    </aside>
    <main className="main-content">{import.meta.env.DEV && new URLSearchParams(location.search).has('preview') && <div className="demo-banner" role="status"><strong>{t('Demo preview')}</strong>{' '}{t('· Synthetic local data. Native floating windows, tray, system pauses, and file dialogs are available in the Windows app.')}</div>}<div className="topbar"><span className="text-caption">{new Date(`${today}T12:00:00Z`).toLocaleDateString(dateLocale(), { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' })}</span><div>
        {data.timer.mode !== 'idle' && <div className="flex items-center gap-1">
          <button className="timer-chip inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1.5 text-caption text-ink tabular-nums transition-colors duration-150 ease-standard hover:bg-accent-soft" onClick={() => setPage('Focus')} aria-label={t('Open Focus. {timerLabel}', { timerLabel: timerLabel(data.timer) })}><span className={`status-light m-0 ${data.timer.running ? 'running' : ''}`} />{data.timer.phase === 'overtime' ? '+' : ''}{time(displayedTime(data.timer))}<span className="text-ink-muted">{!data.timer.running ? t('paused') : data.timer.phase === 'overtime' ? t('overtime') : data.timer.phase === 'stopwatch' ? t('stopwatch') : data.timer.mode === 'break' ? t('break') : t('focusing')}</span></button>
          <IconButton icon={data.timer.running ? 'pause' : 'play'} label={data.timer.running ? t('Pause timer') : t('Resume timer')} onClick={() => void act(data.timer.running ? 'session.pause' : 'session.resume')} />
        </div>}
        <IconButton className="theme-toggle" icon={data.settings.theme === 'dark' ? 'sun' : 'moon'} label={data.settings.theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')} onClick={() => void act('settings.update', { ...data.settings, theme: data.settings.theme === 'dark' ? 'light' : 'dark' })} />
        <Button variant="ghost" size="sm" icon="float" onClick={() => void act('window.float')}>{t('Floating timer')}</Button>
      </div>{data.probe && <ProbePrompt key={data.probe.id} probe={data.probe} act={act} />}</div>
      {error && <div className="alert error" role="alert"><Icon name="shield" size={18} /><span>{error}</span><button className="icon-button" aria-label={t('Dismiss error')} onClick={() => setError('')}><Icon name="close" size={17} /></button></div>}
      {notice && <div className="alert notice" role="status"><Icon name="check" size={18} /><span>{notice}</span></div>}
      {data.timer.mode === 'focus' && <ProbeAnnouncer probe={data.probe} />}
      <div className="page-content">
        <div hidden={page !== 'Focus'}><FocusPage data={data} act={act} preparation={preparation} setPreparation={setPreparation} visible={page === 'Focus'} /></div>
        {page === 'Goals' && <GoalsPage data={data} act={act} startAction={startAction} openTasks={openGoalTasks} focusGoal={focusGoal} activeGoalId={activeGoalId} openGoal={setActiveGoalId} />}
        {page === 'Tasks' && <TasksPage data={data} act={act} preparation={preparation} setPreparation={setPreparation} initialGoalId={taskGoalId} openFocus={() => setPage('Focus')} />}
        {page === 'Calendar' && <CalendarPage data={data} act={act} />}
        {page === 'Patterns' && <PatternsPage data={data} act={act} openTutorial={() => setTutorialOpen(true)} />}
        {page === 'Neural World' && <WorldPage data={data} act={act} openGoal={id => { setActiveGoalId(id); setPage('Goals'); }} focusGoal={focusGoal} />}
        {settingsVisited && <div hidden={page !== 'Settings'}><SettingsPage data={data} act={act} visible={page === 'Settings'} openTutorial={() => setTutorialOpen(true)} /></div>}
      </div>
    </main>
    <BehaviourTutorial open={tutorialOpen} onClose={() => setTutorialOpen(false)} goTo={setPage} />
    <Modal open={!!(review && reviewed)} title={t('A moment to notice.')} onClose={() => setReview(null)}>{review && reviewed && <><div className="completion-symbol"><Icon name="spark" size={28} /></div><p className="modal-intro">{t('You made room for')}{' '}<strong>{minutesLabel(review.activeMs / 60000)}</strong>{' '}{t('of {v1}. What was it like?', { v1: data.goals?.find(g => g.id === reviewed.goalId)?.title ?? data.fields.find(f => f.id === review.fieldId)?.name.toLowerCase() ?? t('focus') })}</p>{planDifferenceMinutes(review) !== null && <p className="hint">{planComparison(review.plannedMs! / 60000, planDifferenceMinutes(review)!)}</p>}<div className="session-inclusion"><label><CheckControl aria-label={t('Exclude this session from insights')} checked={reviewed.excluded} onChange={e => void act('session.exclude', { id: review.id, excluded: e.target.checked })} />{t('Exclude this session from insights')}</label><p className="hint">{t('{v1} Recorded time stays in history and exports.', { v1: reviewed.excluded ? reviewed.activeMs < MIN_INCLUDED_SESSION_MS ? t('Sessions below 2 minutes of active time are excluded automatically. Uncheck to include this one.') : t('Excluded from insights. Uncheck to include it again.') : t('Included in your focus insights.') })}</p></div><Rating value={focus} onChange={setFocus} label={t('How focused did you feel?')} low={t('Scattered')} high={t('Very focused')} /><ReflectionQuestions detractor={detractor} challenge={challenge} onDetractor={setDetractor} onChallenge={setChallenge} /><label className="form-label">{t('A note to your future self')}<span className="optional">{t('optional')}</span><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder={t('What helped? What got in the way?')} rows={3} /></label>
      <BehaviourReview session={reviewed} data={data} act={act} />
      {reviewedOccurrence && <DisclosureForGoal row={reviewedOccurrence} data={data} act={act} />}
      {data.events.some(e => e.sessionId === review.id && e.kind === 'thought') && <div className="parked-review"><span className="tiny-label">{t('THOUGHTS YOU PARKED')}</span>{data.events.filter(e => e.sessionId === review.id && e.kind === 'thought').map(e => <p key={e.id}>{e.text}</p>)}</div>}
      <div className="modal-actions"><button className="text-button" onClick={() => setReview(null)}>{t('Skip check-in')}</button><button className="primary" onClick={async () => { const result = await act('session.review', { id: review.id, focus, note, detractor, challenge }); if (result.ok) setReview(null); }}>{t('Save reflection')}{' '}<Icon name="check" size={17} /></button></div><button className="break-link" onClick={async () => { const saved = await act('session.review', { id: review.id, focus, note, detractor, challenge }); if (saved.ok) { setReview(null); const result = await act('break.start'); if (result.ok) setPage('Focus'); } }}><Icon name="sun" size={18} />{t('Save & take a 10-minute break')}</button>
    </>}</Modal>
  </div>;
}
function DisclosureForGoal({ row,data,act }: { row: GoalOccurrence } & ViewProps) {
  const title = data.goalActions?.find(a => a.id === row.actionId)?.title ?? t('Planned action');
  return <div className="goal-session-check-in"><h3>{t('Did you carry out the planned action?')}</h3><p className="hint">{t('{title} · {date}. This optional check-in records the action separately from session time.', { title, date: row.date })}</p><ActionCheckIn key={`${row.id}_${row.updatedAt}`} row={row} act={act} title={title} /></div>;
}
