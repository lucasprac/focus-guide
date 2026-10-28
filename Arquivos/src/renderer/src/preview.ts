import { TimerEngine } from '../../main/timer';
import { FocusService } from '../../main/service';
import { DEFAULT_PROBE_OPTIONS, FAST_PROBE_OPTIONS, ProbeScheduler } from '../../main/probes';
import type { Store } from '../../main/store';
import { GOAL_COLLECTIONS, goalData, milestoneDefaults, upgradeGoalRecords, type GoalData } from '../../shared/goal-types';
import type { Dataset, FocusGuideAPI, AppEvent, FocusSession, SessionEvent, Task, Field, TaskCategory, WeeklyReview, ActivitySample } from '../../shared/types';
import { exampleDataset } from '../../shared/demo';
import { settings } from '../../shared/validation';
import { addDays, localDay } from '../../shared/analytics';
import { t } from '../../shared/i18n';

const key = 'focus-guide-isolated-demo-v2';
function seed(): Dataset {
  const data = exampleDataset({ timezone: 'America/Fortaleza', defaultMinutes: 25, autoOvertime: true, animation: true, sound: false, palette: 'cyan', weeklyGoalMinutes: 0, theme: 'light', sidebarCollapsed: false });
  const now = new Date().toISOString();
  data.categories = [{ id: 'demo-study', name: t('Study'), color: '#8B70DE', archived: false, createdAt: now }, { id: 'demo-personal', name: t('Personal'), color: '#356AE6', archived: false, createdAt: now }];
  // A synthetic learning goal with a roadmap; the example study sessions are linked to it.
  const goalId = 'demo-linear-algebra', study = data.fields[0].id;
  data.goals = [{ id: goalId, fieldId: study, title: t('Learn linear algebra'), outcome: t('Solve eigenvalue problems and explain each step without notes.'), why: '', whyTags: [t('Learning'), t('Career')], deadline: null, baseline: null, target: null, unit: '', status: 'active', statusHistory: [{ at: now, status: 'active' }], createdAt: now, updatedAt: now }];
  data.milestones = ([['heading', t('Foundations')], ['todo', t('Vectors and linear combinations'), true], ['todo', t('Matrix multiplication')], ['heading', t('Core ideas')], ['todo', t('Determinants')], ['todo', t('Eigenvalues and eigenvectors')]] as const).map((row, position) => ({ id: `demo-step-${position}`, goalId, title: row[1], kind: row[0], completed: row.length > 2, archived: false, position, createdAt: now, updatedAt: now, ...milestoneDefaults(), estimatedMinutes: row[0] === 'todo' ? 240 : null }));
  // More synthetic goals, one per status, so Neural World shows every kind of neuron.
  const work = data.fields[1].id, create = data.fields[2].id, zone = 'America/Fortaleza', today = localDay(Date.now(), zone);
  const goal = (id: string, fieldId: string, title: string, outcome: string, status: 'active' | 'draft' | 'paused' | 'achieved', measure: [number, number, string] | null = null) => ({ id, fieldId, title, outcome, why: '', whyTags: [], deadline: null, baseline: measure?.[0] ?? null, target: measure?.[1] ?? null, unit: measure?.[2] ?? '', status, statusHistory: [{ at: now, status }], createdAt: now, updatedAt: now });
  data.goals.push(
    goal('demo-statistics', study, t('Read a statistics textbook'), t('Finish all chapters with the exercises.'), 'active', [0, 20, t('chapters')]),
    goal('demo-sketch', create, t('Sketch every week'), t('Fill one sketchbook with studies from life.'), 'active'),
    goal('demo-portfolio', create, t('Publish a portfolio'), t('A small site with ten finished pieces.'), 'achieved'),
    goal('demo-writing', work, t('Write a short guide'), t('A practical guide of about 30 pages.'), 'draft'),
    goal('demo-launch', work, t('Prepare a side project'), t('A first public version.'), 'paused'));
  const steps: Array<[string, string, boolean]> = [
    ['demo-statistics', t('Descriptive statistics'), true], ['demo-statistics', t('Probability basics'), false], ['demo-statistics', t('Sampling distributions'), false], ['demo-statistics', t('Hypothesis tests'), false],
    ['demo-sketch', t('Gesture drawing'), true], ['demo-sketch', t('Light and shadow'), true], ['demo-sketch', t('Perspective'), false], ['demo-sketch', t('Portraits'), false], ['demo-sketch', t('Urban sketching'), false],
    ['demo-portfolio', t('Choose ten pieces'), true], ['demo-portfolio', t('Build the site'), true], ['demo-portfolio', t('Publish'), true],
    ['demo-writing', t('Outline the chapters'), false], ['demo-writing', t('Write the first chapter'), false],
    ['demo-launch', t('Define the scope'), true], ['demo-launch', t('Build the prototype'), false], ['demo-launch', t('Invite testers'), false]];
  data.milestones = [...data.milestones ?? [], ...steps.map(([goalIdOf, title, completed], position) => ({ id: `demo-world-step-${position}`, goalId: goalIdOf, title, kind: 'todo' as const, completed, archived: false, position, createdAt: now, updatedAt: now, ...milestoneDefaults() }))];
  data.goalProgress = [{ id: 'demo-progress-statistics', goalId: 'demo-statistics', date: today, value: 6, note: '', createdAt: now, updatedAt: now }];
  const plan = { effectiveDate: addDays(today, -30), timezone: zone, weekdays: [0, 1, 2, 3, 4, 5, 6], cue: t('After lunch'), normal: t('Draw for 20 minutes'), smaller: t('Draw for 5 minutes'), obstacle: t('No time'), response: t('Draw one line'), estimatedMinutes: 20, activityMode: 'Unspecified' as const, enabled: true };
  data.goalActions = [{ id: 'demo-sketch-action', goalId: 'demo-sketch', title: t('Daily sketch'), archived: false, plans: [plan], createdAt: now, updatedAt: now }];
  data.goalOccurrences = (['done', 'done', 'smaller', 'done', 'skipped', 'done', 'smaller', 'done'] as const).map((status, i) => {
    const day = addDays(today, -(i + 1) * 2);
    return { id: `demo-sketch-action_${day}`, goalId: 'demo-sketch', actionId: 'demo-sketch-action', originalDate: day, date: day, status, barrier: null, note: '', rescheduleHistory: [], plan, updatedAt: now };
  });
  data.sessions.filter(s => s.fieldId === create).forEach(s => { s.goalId = 'demo-sketch'; s.milestoneId = 'demo-world-step-5'; });
  data.sessions.filter(s => s.fieldId === work).forEach(s => { s.goalId = 'demo-launch'; s.milestoneId = 'demo-world-step-14'; });
  data.sessions.filter(s => s.fieldId === study).forEach((s, i) => { s.goalId = goalId; s.activityMode = (['Reading', 'Writing/coding', 'Video/lecture'] as const)[i % 3]; s.milestoneId = i < 8 ? 'demo-step-1' : 'demo-step-2'; });
  // Synthetic agent proposals. The roadmap proposal has an old basis, so the preview also shows the stale case.
  const proposal = { source: t('Demo agent'), status: 'pending' as const, createdAt: now, decidedAt: null };
  data.agentProposals = [
    { ...proposal, id: 'demo-proposal-roadmap', goalId, kind: 'roadmap.replace', summary: t('Split the core ideas into smaller steps'), rationale: t('Sessions for this goal are short and spread over many days, so smaller steps can be checked more often.'), basis: 'demo', payload: { goalId, markdown: t('# Foundations\n- [x] Vectors and linear combinations\n- [ ] Matrix multiplication\n# Core ideas\n- [ ] Determinants\n- [ ] Cofactor expansion exercises\n- [ ] Eigenvalues and eigenvectors\n- [ ] Diagonalisation practice set') } },
    { ...proposal, id: 'demo-proposal-tasks', goalId, kind: 'tasks.add', summary: t('2 practice tasks'), rationale: t('Retrieval practice for the current step.'), basis: null, payload: { goalId, tasks: [{ title: t('Solve 10 matrix products without notes'), notes: '', priority: 'normal', dueDate: null, step: t('Matrix multiplication') }, { title: t('Explain matrix multiplication in your own words'), notes: '', priority: 'low', dueDate: null, step: t('Matrix multiplication') }] } },
    { ...proposal, id: 'demo-proposal-goal', goalId: null, kind: 'goal.create', summary: t('New goal: Learn probability'), rationale: t('Probability builds on the linear algebra goal.'), basis: null, payload: { areaId: study, title: t('Learn probability'), outcome: t('Solve conditional probability problems with confidence.'), why: '', whyTags: [t('Learning')], deadline: null, roadmapMarkdown: t('# Basics\n- [ ] Counting and combinatorics\n- [ ] Conditional probability\n# Distributions\n- [ ] Discrete distributions'), actions: [] } }
  ];
  // A synthetic direct change: the demo agent added one task, which Undo archives.
  data.agentChanges = [{ id: 'demo-change-task', goalId, at: now, source: t('Demo agent'), tool: 'create_tasks', target: 'task', summary: t('Added 1 task to “Learn linear algebra”'), rationale: t('A short practice set for the current step.'), before: { 'demo-agent-task': null }, after: { 'demo-agent-task': { title: t('Do 5 practice problems on matrix products'), notes: '', priority: 'normal', dueDate: null, milestoneId: 'demo-step-2', completed: false, archived: false } }, undoneAt: null }];
  data.tasks = [{ id: 'demo-agent-task', title: t('Do 5 practice problems on matrix products'), fieldId: study, categoryId: null, notes: '', priority: 'normal', dueDate: null, completed: false, archived: false, createdAt: now, updatedAt: now, goalId, milestoneId: 'demo-step-2' }, { id: 'demo-paper', title: t('Read one paper'), fieldId: study, categoryId: 'demo-study', notes: t('Capture three useful ideas.'), priority: 'high', dueDate: null, completed: false, archived: false, createdAt: now, updatedAt: now, goalId, milestoneId: 'demo-step-2' }, { id: 'demo-outline', title: t('Draft the outline'), fieldId: data.fields[1].id, categoryId: null, notes: '', priority: 'normal', dueDate: null, completed: false, archived: false, createdAt: now, updatedAt: now }];
  return data;
}
class PreviewStore {
  private transactionDepth = 0;
  data: Dataset = seed();
  activityCursors: Record<string, number> = {};
  readonly db = { transaction: <T>(fn: () => T) => () => {
    const before = structuredClone(this.data);
    const cursors = { ...this.activityCursors };
    const depth = this.transactionDepth; this.transactionDepth++;
    try { const result = fn(); this.transactionDepth = depth; this.save(); return result; }
    catch (error) { this.transactionDepth = depth; this.data = before; this.activityCursors = cursors; throw error; }
  } };
  constructor() {
    let loaded = false;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if ((saved?.version === 2 || saved?.version === 3) && ['fields', 'tasks', 'sessions', 'events', 'reviews', 'categories'].every(k => Array.isArray(saved.data?.[k]))) {
        this.data = { ...saved.data, ...upgradeGoalRecords(goalData(saved.data)), settings: settings(saved.data.settings) };
        const sessions = new Set(this.data.sessions.map(s => s.id));
        this.data.activity = (this.data.activity ?? []).filter(a => sessions.has(a.sessionId));
        for (const session of this.data.sessions) {
          const last = this.data.activity.filter(a => a.sessionId === session.id).reduce((end, a) => Math.max(end, a.endMs), 0);
          const cursor = saved.activityCursors?.[session.id];
          this.activityCursors[session.id] = typeof cursor === 'number' && Number.isFinite(cursor) && cursor >= last && cursor <= session.activeMs ? cursor : last || session.activeMs;
        }
        loaded = true;
      }
    } catch { /* Corrupt demo data is replaced with synthetic examples. */ }
    if (loaded) this.save();
  }
  save() { if (!this.transactionDepth) localStorage.setItem(key, JSON.stringify({ version: 3, data: this.data, activityCursors: this.activityCursors })); }
  goalData() { return goalData(this.data); }
  putGoalRecord<K extends keyof GoalData>(name: K, row: GoalData[K][number]) {
    this.db.transaction(() => { const domain = goalData(this.data); this.put(domain[name] as Array<{ id: string }>,row); this.data = { ...this.data,...domain }; this.save(); })();
  }
  pruneAgentChanges(keep: number) { this.db.transaction(() => { this.data.agentChanges = [...(this.data.agentChanges ?? [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, keep); this.save(); })(); }
  removeGoalProgress(id: string) { this.db.transaction(() => { this.data.goalProgress = (this.data.goalProgress ?? []).filter(p => p.id !== id); this.save(); })(); }
  all() { return structuredClone(this.data); }
  allFields() { return structuredClone(this.data.fields); }
  field(id: string) { return this.allFields().find(f => f.id === id); }
  task(id: string) { return structuredClone(this.data.tasks.find(t => t.id === id)); }
  session(id: string) { return structuredClone(this.data.sessions.find(s => s.id === id)); }
  category(id: string) { return structuredClone(this.data.categories.find(c => c.id === id)); }
  getSettings() { return structuredClone(this.data.settings); }
  getMeta() { return null; }
  revision() { return null; } // No insights cache in the preview.
  activity(id?: string) { return structuredClone((this.data.activity ?? []).filter(a => !id || a.sessionId === id)); }
  putActivity(sample: ActivitySample) {
    const rows = this.data.activity ??= [];
    let previous: ActivitySample | undefined;
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].sessionId === sample.sessionId) { previous = rows[i]; break; }
    if (previous && previous.status === sample.status && previous.endMs === sample.startMs && Math.floor(previous.startMs / 60000) === Math.floor(sample.startMs / 60000)) {
      const add = (a?: number | null, b?: number | null) => a == null || b == null ? null : a + b;
      Object.assign(previous, { endMs: sample.endMs, observedMs: previous.observedMs + sample.observedMs,
        keys: previous.keys + sample.keys, clicks: previous.clicks + sample.clicks, scrolls: previous.scrolls + sample.scrolls,
        movementMs: previous.movementMs + sample.movementMs, inputMs: add(previous.inputMs, sample.inputMs), switches: add(previous.switches, sample.switches) });
    } else rows.push(sample);
    this.save();
  }
  removeActivity() { this.db.transaction(() => {
    this.data.activity = [];
    for (const session of this.data.sessions) this.activityCursors[session.id] = session.activeMs;
    this.save();
  })(); }
  removeReturn(id: string) { this.data.events = this.data.events.filter(e => e.id !== id || e.kind !== 'attention-return'); this.save(); }
  setMeta(name: string, value: unknown) { if (name === 'settings') { this.data.settings = settings(value); this.save(); } }
  private put<T extends { id: string }>(collection: T[], value: T) {
    const index = collection.findIndex(row => row.id === value.id);
    if (index < 0) collection.push(structuredClone(value)); else collection[index] = structuredClone(value);
  }
  putTask(t: Task) { this.put(this.data.tasks, t); this.save(); }
  putField(f: Field) { this.put(this.data.fields, f); this.save(); }
  removeField(id: string) {
    this.db.transaction(() => {
      const removed = new Set(this.data.sessions.filter(s => s.fieldId === id).map(s => s.id));
      this.data.sessions = this.data.sessions.filter(s => !removed.has(s.id));
      this.data.events = this.data.events.filter(e => !removed.has(e.sessionId));
      this.data.activity = (this.data.activity ?? []).filter(a => !removed.has(a.sessionId));
      for (const sessionId of removed) delete this.activityCursors[sessionId];
      this.data.tasks = this.data.tasks.filter(t => t.fieldId !== id);
      const domain = goalData(this.data), goals = new Set(domain.goals.filter(g => g.fieldId === id).map(g => g.id));
      this.data.goals = domain.goals.filter(g => !goals.has(g.id));
      for (const name of GOAL_COLLECTIONS.filter(k => k !== 'goals')) (this.data[name] as Array<{ goalId: string | null }>) = domain[name].filter(row => row.goalId === null || !goals.has(row.goalId));
      this.data.fields = this.data.fields.filter(f => f.id !== id);
      const activityModes = { ...this.data.settings.activityModes }; delete activityModes[id];
      this.data.settings = { ...this.data.settings, activityModes }; this.save();
    })();
  }
  removeGoal(id: string) {
    this.db.transaction(() => {
      const domain = goalData(this.data), steps = new Set(domain.milestones.filter(m => m.goalId === id).map(m => m.id)), planned = new Set(domain.goalOccurrences.filter(o => o.goalId === id).map(o => o.id));
      this.data.sessions = this.data.sessions.map(s => s.goalId === id || (s.occurrenceId && planned.has(s.occurrenceId)) || (s.milestoneId && steps.has(s.milestoneId)) ? { ...s, goalId: null, occurrenceId: null, milestoneId: null } : s);
      this.data.tasks = this.data.tasks.map(t => t.goalId === id || (t.milestoneId && steps.has(t.milestoneId)) ? { ...t, goalId: null, milestoneId: null } : t);
      this.data.goals = domain.goals.filter(g => g.id !== id);
      for (const name of GOAL_COLLECTIONS.filter(k => k !== 'goals')) (this.data[name] as Array<{ goalId: string | null }>) = domain[name].filter(row => row.goalId !== id);
      this.save();
    })();
  }
  putCategory(c: TaskCategory) { this.put(this.data.categories, c); this.save(); }
  putSession(s: FocusSession) { this.put(this.data.sessions, s); this.save(); }
  putEvent(e: SessionEvent) { this.put(this.data.events, e); this.save(); }
  persist(s: FocusSession, event: SessionEvent | null = null, extras: SessionEvent[] = []) {
    const before = structuredClone(this.data);
    try { this.put(this.data.sessions, s); if (event) this.put(this.data.events, event); for (const e of extras) this.put(this.data.events, e); this.save(); }
    catch (error) { this.data = before; throw error; }
  }
  removeSession(id: string) { this.db.transaction(() => {
    this.data.sessions = this.data.sessions.filter(s => s.id !== id);
    this.data.events = this.data.events.filter(e => e.sessionId !== id);
    this.data.activity = (this.data.activity ?? []).filter(a => a.sessionId !== id);
    delete this.activityCursors[id];
    this.save();
  })(); }
  putReview(review: WeeklyReview) { this.data.reviews = [...this.data.reviews.filter(r => r.week !== review.week), review]; this.save(); }
}
export function installPreview(): void {
  if (window.focusGuide) return;
  const listeners = new Set<(event: AppEvent) => void>();
  const emit = (event: AppEvent) => listeners.forEach(listener => listener(event));
  const store = new PreviewStore();
  // The demo runs the production timer and commands against browser-only synthetic storage.
  const timer = new TimerEngine(store as unknown as Store, { utc: () => Date.now(), monotonic: () => performance.now() }, mode => {
    emit({ type: 'notice', message: mode === 'break' ? t('Demo break complete.') : timer.current ? t('Timer ended. Overtime is recording in this session.') : t('Demo session saved.') });
  });
  const probes = new ProbeScheduler(Math.random, new URLSearchParams(location.search).get('probes') === 'fast' ? FAST_PROBE_OPTIONS : DEFAULT_PROBE_OPTIONS);
  const service = new FocusService(store as unknown as Store, timer, kind => {
    const data = store.all();
    const backup = { ...data,...goalData(data),format: 'focus-guide',schemaVersion: 11,exportedAt: new Date().toISOString(),activity: (data.activity ?? []).map(a => ({ ...a,inputMs: a.inputMs ?? null,switches: a.switches ?? null })),tasks: data.tasks.map(t => ({ goalId: null,milestoneId: null,...t })),sessions: data.sessions.map(s => ({ activityMode: 'Unspecified',behaviourVersion: 0,goalId: null,occurrenceId: null,milestoneId: null,...s,detractor: s.detractor ?? null,challenge: s.challenge ?? null,warmUp: s.warmUp ?? null,medication: s.medication ?? null })),events: data.events.map(e => ({ activeOffsetMs: null,source: null,...e })) };
    localStorage.setItem(`${key}-before-${kind}-delete-${Date.now()}-${crypto.randomUUID()}`, JSON.stringify(backup));
  }, probes);
  const simulate = () => {
    const session = timer.current; if (!session || session.status !== 'running') return;
    const enabled = !!store.getSettings().collectActivity;
    const startMs = store.activityCursors[session.id] ?? 0, endMs = session.activeMs;
    if (endMs <= startMs) return;
    store.db.transaction(() => {
      store.data.activity ??= [];
      for (let start = startMs; start < endMs;) {
        const end = Math.min(endMs, (Math.floor(start / 60000) + 1) * 60000);
        store.putActivity({ id: crypto.randomUUID(), sessionId: session.id, startMs: start, endMs: end, observedMs: enabled ? end - start : 0, keys: enabled ? Math.round((end - start) / 1000 * 2) : 0, clicks: enabled ? Math.round((end - start) / 5000) : 0, scrolls: 0, movementMs: enabled ? (end - start) * .4 : 0, inputMs: enabled ? (end - start) * .8 : null, switches: enabled ? Math.floor(end / 15000) - Math.floor(start / 15000) : null, status: enabled ? 'recorded' : 'disabled' } satisfies ActivitySample);
        start = end;
      }
      store.activityCursors[session.id] = endMs;
      store.save();
    })();
  };
  const state = () => ({ graphicsMode: 'auto' as const, ...store.all(), timer: timer.snapshot(), probe: probes.pending, dataPath: t('Isolated browser demo — your Windows data is not connected'), collector: { state: store.getSettings().collectActivity && timer.snapshot().running ? 'recording' as const : 'disabled' as const, shortcut: 'unavailable' as const, message: t('Synthetic activity preview · global shortcuts and native collection require Windows.') }, backupStatus: t('Demo changes stay in this browser profile.') });
  window.focusGuide = {
    getState: async () => state(),
    command: async (command, input = {}) => {
      try {
        if (command === 'shortcut.capture') return { ok: true };
        if (command.startsWith('window.') || command.startsWith('export.') || command.startsWith('backup.')) throw new Error(t('This native feature is available in the Windows app. The demo is isolated from your files.'));
        if (command === 'session.pause' || command === 'session.finish' || command === 'settings.update' || command === 'field.delete' || command === 'goal.delete' || command === 'activity.delete') { timer.checkpoint(); simulate(); }
        const value = service.run(command, input);
        if (command === 'attention.return' && value) { const marker = value as SessionEvent; emit({ type: 'attention-return', sessionId: marker.sessionId, eventId: marker.id, savedAt: marker.startedAt }); }
        emit({ type: 'state', state: state() }); return { ok: true, value };
      } catch (error) { return { ok: false, error: String(error instanceof Error ? error.message : error) }; }
    },
    onEvent: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }
  } satisfies FocusGuideAPI;
  const tick = window.setInterval(() => { try { if (timer.tick()) emit({ type: 'state', state: state() }); emit({ type: 'timer', timer: timer.snapshot() }); } catch (error) { emit({ type: 'error', message: String(error) }); } }, 250);
  const probeTick = window.setInterval(() => {
    try {
      const result = probes.tick(timer.snapshot(), timer.current, !!store.getSettings().attentionProbes);
      if (result?.type === 'expire' && timer.current?.id === result.probe.sessionId && timer.current.status === 'running') timer.recordProbe('missed', result.offsetMs, null, null);
      if (result) emit({ type: 'state', state: state() });
    } catch (error) { emit({ type: 'error', message: String(error) }); }
  }, 1000);
  const checkpoint = window.setInterval(() => { try { timer.checkpoint(); simulate(); } catch (error) { emit({ type: 'error', message: String(error) }); } }, 5000);
  const pause = () => { try { timer.pause(t('Demo paused — resume when ready')); emit({ type: 'state', state: state() }); } catch (error) { emit({ type: 'error', message: String(error) }); } };
  window.addEventListener('pagehide', () => { pause(); clearInterval(tick); clearInterval(probeTick); clearInterval(checkpoint); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
}
