import { TimerEngine } from '../../main/timer';
import { FocusService } from '../../main/service';
import type { Store } from '../../main/store';
import { GOAL_COLLECTIONS, goalData, upgradeGoalRecords, type GoalData } from '../../shared/goal-types';
import type { Dataset, FocusGuideAPI, AppEvent, FocusSession, SessionEvent, Task, Field, TaskCategory, WeeklyReview, ActivitySample } from '../../shared/types';
import { exampleDataset } from '../../shared/demo';
import { settings } from '../../shared/validation';

const key = 'focus-guide-isolated-demo-v2';
function seed(): Dataset {
  const data = exampleDataset({ timezone: 'America/Fortaleza', defaultMinutes: 25, autoOvertime: true, animation: true, sound: false, palette: 'cyan', weeklyGoalMinutes: 0, theme: 'light', sidebarCollapsed: false });
  const now = new Date().toISOString();
  data.categories = [{ id: 'demo-study', name: 'Study', color: '#8B70DE', archived: false, createdAt: now }, { id: 'demo-personal', name: 'Personal', color: '#356AE6', archived: false, createdAt: now }];
  data.tasks = [{ id: 'demo-paper', title: 'Read one paper', fieldId: data.fields[0].id, categoryId: 'demo-study', notes: 'Capture three useful ideas.', priority: 'high', dueDate: null, completed: false, archived: false, createdAt: now, updatedAt: now }, { id: 'demo-outline', title: 'Draft the outline', fieldId: data.fields[1].id, categoryId: null, notes: '', priority: 'normal', dueDate: null, completed: false, archived: false, createdAt: now, updatedAt: now }];
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
  removeGoalProgress(id: string) { this.db.transaction(() => { this.data.goalProgress = (this.data.goalProgress ?? []).filter(p => p.id !== id); this.save(); })(); }
  all() { return structuredClone(this.data); }
  allFields() { return structuredClone(this.data.fields); }
  field(id: string) { return this.allFields().find(f => f.id === id); }
  task(id: string) { return structuredClone(this.data.tasks.find(t => t.id === id)); }
  session(id: string) { return structuredClone(this.data.sessions.find(s => s.id === id)); }
  category(id: string) { return structuredClone(this.data.categories.find(c => c.id === id)); }
  getSettings() { return structuredClone(this.data.settings); }
  getMeta() { return null; }
  activity(id?: string) { return structuredClone((this.data.activity ?? []).filter(a => !id || a.sessionId === id)); }
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
      for (const name of GOAL_COLLECTIONS.filter(k => k !== 'goals')) (this.data[name] as Array<{ goalId: string }>) = domain[name].filter(row => !goals.has(row.goalId));
      this.data.fields = this.data.fields.filter(f => f.id !== id);
      const activityModes = { ...this.data.settings.activityModes }; delete activityModes[id];
      this.data.settings = { ...this.data.settings, activityModes }; this.save();
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
    emit({ type: 'notice', message: mode === 'break' ? 'Demo break complete.' : timer.current ? 'Timer ended. Overtime is recording in this session.' : 'Demo session saved.' });
  });
  const service = new FocusService(store as unknown as Store, timer, () => {
    const data = store.all();
    const backup = { ...data,...goalData(data),format: 'focus-guide',schemaVersion: 6,exportedAt: new Date().toISOString(),activity: data.activity ?? [],tasks: data.tasks.map(t => ({ goalId: null,milestoneId: null,...t })),sessions: data.sessions.map(s => ({ activityMode: 'Unspecified',behaviourVersion: 0,goalId: null,occurrenceId: null,...s })),events: data.events.map(e => ({ activeOffsetMs: null,source: null,...e })) };
    localStorage.setItem(`${key}-before-field-delete-${Date.now()}-${crypto.randomUUID()}`, JSON.stringify(backup));
  });
  const simulate = () => {
    const session = timer.current; if (!session || session.status !== 'running') return;
    const enabled = !!store.getSettings().collectActivity;
    const startMs = store.activityCursors[session.id] ?? 0, endMs = session.activeMs;
    if (endMs <= startMs) return;
    store.db.transaction(() => {
      store.data.activity ??= [];
      for (let start = startMs; start < endMs;) {
        const end = Math.min(endMs, (Math.floor(start / 60000) + 1) * 60000);
        store.data.activity.push({ id: crypto.randomUUID(), sessionId: session.id, startMs: start, endMs: end, observedMs: enabled ? end - start : 0, keys: enabled ? Math.round((end - start) / 1000 * 2) : 0, clicks: enabled ? Math.round((end - start) / 5000) : 0, scrolls: 0, movementMs: enabled ? (end - start) * .4 : 0, status: enabled ? 'recorded' : 'disabled' } satisfies ActivitySample);
        start = end;
      }
      store.activityCursors[session.id] = endMs;
      store.save();
    })();
  };
  const state = () => ({ graphicsMode: 'auto' as const, ...store.all(), timer: timer.snapshot(), dataPath: 'Isolated browser demo — your Windows data is not connected', collector: { state: store.getSettings().collectActivity && timer.snapshot().running ? 'recording' as const : 'disabled' as const, shortcut: 'unavailable' as const, message: 'Synthetic activity preview · global shortcuts and native collection require Windows.' }, backupStatus: 'Demo changes stay in this browser profile.' });
  window.focusGuide = {
    getState: async () => state(),
    command: async (command, input = {}) => {
      try {
        if (command === 'shortcut.capture') return { ok: true };
        if (command.startsWith('window.') || command.startsWith('export.') || command.startsWith('backup.')) throw new Error('This native feature is available in the Windows app. The demo is isolated from your files.');
        if (command === 'session.pause' || command === 'session.finish' || command === 'settings.update' || command === 'field.delete' || command === 'activity.delete') { timer.checkpoint(); simulate(); }
        const value = service.run(command, input);
        if (command === 'attention.return' && value) { const marker = value as SessionEvent; emit({ type: 'attention-return', sessionId: marker.sessionId, eventId: marker.id, savedAt: marker.startedAt }); }
        emit({ type: 'state', state: state() }); return { ok: true, value };
      } catch (error) { return { ok: false, error: String(error instanceof Error ? error.message : error) }; }
    },
    onEvent: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }
  } satisfies FocusGuideAPI;
  const tick = window.setInterval(() => { try { if (timer.tick()) emit({ type: 'state', state: state() }); emit({ type: 'timer', timer: timer.snapshot() }); } catch (error) { emit({ type: 'error', message: String(error) }); } }, 250);
  const checkpoint = window.setInterval(() => { try { timer.checkpoint(); simulate(); } catch (error) { emit({ type: 'error', message: String(error) }); } }, 5000);
  const pause = () => { try { timer.pause('Demo paused — resume when ready'); emit({ type: 'state', state: state() }); } catch (error) { emit({ type: 'error', message: String(error) }); } };
  window.addEventListener('pagehide', () => { pause(); clearInterval(tick); clearInterval(checkpoint); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
}
