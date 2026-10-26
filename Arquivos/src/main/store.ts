import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ActivitySample, Dataset, Field, FocusSession, SessionEvent, Settings, Task, TaskCategory, WeeklyReview } from '../shared/types';
import { settings } from '../shared/validation';
import { GOAL_COLLECTIONS, upgradeGoalRecords, type GoalData, type Goal, type GoalMilestone, type GoalOccurrence } from '../shared/goal-types';

export const defaultSettings: Settings = {
  timezone: 'America/Fortaleza', defaultMinutes: 90, animation: true, sound: false, palette: 'cyan', weeklyGoalMinutes: 0, theme: 'light', sidebarCollapsed: false, autoOvertime: true
};

export class Store {
  readonly db: Database.Database;
  readonly path: string;
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true });
    this.path = join(directory, 'focus-guide.sqlite');
    this.db = new Database(this.path);
    const originalVersion = Number(this.db.pragma('user_version', { simple: true }));
    if (originalVersion > 10) { this.db.close(); throw new Error('This dataset was created by a newer Focus Guide version.'); }
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = FULL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fields (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, archived INTEGER NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, fieldId TEXT NOT NULL REFERENCES fields(id), title TEXT NOT NULL, completed INTEGER NOT NULL, archived INTEGER NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, fieldId TEXT NOT NULL REFERENCES fields(id), primaryTaskId TEXT REFERENCES tasks(id), checklistIds TEXT NOT NULL, intention TEXT NOT NULL, plannedMs REAL NOT NULL, activeMs REAL NOT NULL, status TEXT NOT NULL, startedAt TEXT NOT NULL, endedAt TEXT, timezone TEXT NOT NULL, energy INTEGER, focus INTEGER, note TEXT NOT NULL, completionReason TEXT, excluded INTEGER NOT NULL, recovered INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, kind TEXT NOT NULL, startedAt TEXT NOT NULL, endedAt TEXT, durationMs REAL NOT NULL, text TEXT NOT NULL, category TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS event_session ON events(sessionId);
      CREATE INDEX IF NOT EXISTS session_start ON sessions(startedAt);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reviews (week TEXT PRIMARY KEY, adjustment TEXT NOT NULL, updatedAt TEXT NOT NULL);

    `);
    if (originalVersion < 2) {
      // VACUUM INTO creates a consistent snapshot including committed WAL data.
      if (originalVersion === 1) {
        const backups = join(directory, 'backups'); mkdirSync(backups, { recursive: true });
        this.db.prepare('VACUUM INTO ?').run(join(backups, 'before-schema-v2-' + Date.now() + '.sqlite'));
      }
      this.db.pragma('foreign_keys = OFF');
      try { this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, archived INTEGER NOT NULL, createdAt TEXT NOT NULL);
          ALTER TABLE tasks ADD COLUMN categoryId TEXT REFERENCES categories(id);
          ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT '';
          ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
          ALTER TABLE tasks ADD COLUMN dueDate TEXT;
          CREATE TABLE sessions_v2 (id TEXT PRIMARY KEY, fieldId TEXT NOT NULL REFERENCES fields(id), primaryTaskId TEXT REFERENCES tasks(id), checklistIds TEXT NOT NULL, intention TEXT NOT NULL, plannedMs REAL, activeMs REAL NOT NULL, status TEXT NOT NULL, startedAt TEXT NOT NULL, endedAt TEXT, timezone TEXT NOT NULL, energy INTEGER, focus INTEGER, note TEXT NOT NULL, completionReason TEXT, excluded INTEGER NOT NULL, recovered INTEGER NOT NULL, timingMode TEXT NOT NULL, autoOvertime INTEGER NOT NULL, targetReached INTEGER NOT NULL);
          INSERT INTO sessions_v2 SELECT *, 'countdown', 0, CASE WHEN activeMs >= plannedMs THEN 1 ELSE 0 END FROM sessions;
          DROP TABLE sessions;
          ALTER TABLE sessions_v2 RENAME TO sessions;
          CREATE INDEX session_start ON sessions(startedAt);
          PRAGMA user_version = 2;
        `);
        if ((this.db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Migration found invalid record links.');
      })(); } finally { this.db.pragma('foreign_keys = ON'); }
    }
    if (originalVersion < 3) {
      if (originalVersion > 0) {
        const backups = join(directory, 'backups'); mkdirSync(backups, { recursive: true });
        this.db.prepare('VACUUM INTO ?').run(join(backups, 'before-schema-v3-' + Date.now() + '.sqlite'));
      }
      this.db.transaction(() => {
        this.db.exec(`ALTER TABLE sessions ADD COLUMN activityMode TEXT NOT NULL DEFAULT 'Unspecified';
          ALTER TABLE sessions ADD COLUMN behaviourVersion INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE events ADD COLUMN activeOffsetMs REAL;
          ALTER TABLE events ADD COLUMN source TEXT;
          CREATE TABLE activity (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            startMs REAL NOT NULL, endMs REAL NOT NULL, observedMs REAL NOT NULL, keys INTEGER NOT NULL,
            clicks INTEGER NOT NULL, scrolls INTEGER NOT NULL, movementMs REAL NOT NULL, status TEXT NOT NULL);
          CREATE INDEX activity_session ON activity(sessionId, startMs);
          PRAGMA user_version = 3;`);
        const previous = this.getMeta<Settings>('settings');
        if (previous) this.setMeta('settings', { ...settings(previous), collectActivity: false });
      })();
    }
    if (originalVersion < 4) {
      if (originalVersion > 0) {
        const backups = join(directory, 'backups'); mkdirSync(backups, { recursive: true });
        this.db.prepare('VACUUM INTO ?').run(join(backups, 'before-schema-v4-' + Date.now() + '.sqlite'));
      }
      this.db.transaction(() => {
        this.db.exec(`CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, fieldId TEXT NOT NULL REFERENCES fields(id), body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS milestones (id TEXT PRIMARY KEY, goalId TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE, body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS goalActions (id TEXT PRIMARY KEY, goalId TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE, body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS goalOccurrences (id TEXT PRIMARY KEY, goalId TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE, actionId TEXT NOT NULL REFERENCES goalActions(id) ON DELETE CASCADE, originalDate TEXT NOT NULL, date TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(actionId,originalDate), UNIQUE(actionId,date));
          CREATE TABLE IF NOT EXISTS goalProgress (id TEXT PRIMARY KEY, goalId TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE, body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS goalReviews (id TEXT PRIMARY KEY, goalId TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE, week TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(goalId,week));`);
        for (const [table, column, reference] of [['tasks','goalId','goals'],['tasks','milestoneId','milestones'],['sessions','goalId','goals'],['sessions','occurrenceId','goalOccurrences']]) {
          const columns = this.db.pragma(`table_info(${table})`) as Array<{ name: string }>;
          if (!columns.some(c => c.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT REFERENCES ${reference}(id);`);
        }
        if ((this.db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Migration found invalid goal links.');
        this.db.pragma('user_version = 4');
      })();
    }
    if (originalVersion < 5) {
      // Schema 5 adds goal reason tags and milestone order inside the JSON bodies; no column changes.
      if (originalVersion > 0) {
        const backups = join(directory, 'backups'); mkdirSync(backups, { recursive: true });
        this.db.prepare('VACUUM INTO ?').run(join(backups, 'before-schema-v5-' + Date.now() + '.sqlite'));
      }
      this.db.transaction(() => {
        const upgraded = upgradeGoalRecords({ goals: this.bodies<Goal>('goals'), milestones: this.bodies<GoalMilestone>('milestones') });
        upgraded.goals.forEach(row => this.putGoalRecord('goals', row));
        upgraded.milestones.forEach(row => this.putGoalRecord('milestones', row));
        this.db.pragma('user_version = 5');
      })();
    }
    if (originalVersion < 6) {
      // Schema 6 adds the milestone block kind inside the JSON bodies; every earlier milestone becomes a to-do. No column changes.
      if (originalVersion > 0) {
        const backups = join(directory, 'backups'); mkdirSync(backups, { recursive: true });
        this.db.prepare('VACUUM INTO ?').run(join(backups, 'before-schema-v6-' + Date.now() + '.sqlite'));
      }
      this.db.transaction(() => {
        upgradeGoalRecords({ milestones: this.bodies<GoalMilestone>('milestones') }).milestones.forEach(row => this.putGoalRecord('milestones', row));
        this.db.pragma('user_version = 6');
      })();
    }
    if (originalVersion < 7) {
      // Schema 7 links a session to the roadmap step it served and adds step details inside the milestone JSON bodies.
      if (originalVersion > 0) {
        const backups = join(directory, 'backups'); mkdirSync(backups, { recursive: true });
        this.db.prepare('VACUUM INTO ?').run(join(backups, 'before-schema-v7-' + Date.now() + '.sqlite'));
      }
      this.db.transaction(() => {
        const columns = this.db.pragma('table_info(sessions)') as Array<{ name: string }>;
        if (!columns.some(c => c.name === 'milestoneId')) this.db.exec('ALTER TABLE sessions ADD COLUMN milestoneId TEXT REFERENCES milestones(id);');
        this.db.exec('CREATE INDEX IF NOT EXISTS session_goal ON sessions(goalId); CREATE INDEX IF NOT EXISTS session_milestone ON sessions(milestoneId);');
        upgradeGoalRecords({ milestones: this.bodies<GoalMilestone>('milestones') }).milestones.forEach(row => this.putGoalRecord('milestones', row));
        if ((this.db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Migration found invalid roadmap links.');
        this.db.pragma('user_version = 7');
      })();
    }
    if (originalVersion < 8) {
      // Schema 8 adds proposals from a local AI agent. A new-goal proposal has no goal, so goalId can be null.
      if (originalVersion > 0) {
        const backups = join(directory, 'backups'); mkdirSync(backups, { recursive: true });
        this.db.prepare('VACUUM INTO ?').run(join(backups, 'before-schema-v8-' + Date.now() + '.sqlite'));
      }
      this.db.transaction(() => {
        this.db.exec(`CREATE TABLE IF NOT EXISTS agentProposals (id TEXT PRIMARY KEY, goalId TEXT REFERENCES goals(id) ON DELETE CASCADE, body TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS proposal_goal ON agentProposals(goalId);`);
        const previous = this.getMeta<Settings>('settings');
        if (previous) this.setMeta('settings', { ...settings(previous), agentAccess: 'off' });
        this.db.pragma('user_version = 8');
      })();
    }
    if (originalVersion < 9) {
      // Schema 9 adds the log of changes that a local AI agent made directly. Every change belongs to a goal.
      if (originalVersion > 0) {
        const backups = join(directory, 'backups'); mkdirSync(backups, { recursive: true });
        this.db.prepare('VACUUM INTO ?').run(join(backups, 'before-schema-v9-' + Date.now() + '.sqlite'));
      }
      this.db.transaction(() => {
        this.db.exec(`CREATE TABLE IF NOT EXISTS agentChanges (id TEXT PRIMARY KEY, goalId TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE, body TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS change_goal ON agentChanges(goalId);`);
        const previous = this.getMeta<Settings>('settings');
        if (previous) this.setMeta('settings', { ...settings(previous), agentAccess: 'off' });
        this.db.pragma('user_version = 9');
      })();
    }
    if (originalVersion < 10) {
      // Schema 10 adds the optional reflection answers of a session and, per activity block, input time and window switches. Old rows keep null; attention check-ins start off.
      if (originalVersion > 0) {
        const backups = join(directory, 'backups'); mkdirSync(backups, { recursive: true });
        this.db.prepare('VACUUM INTO ?').run(join(backups, 'before-schema-v10-' + Date.now() + '.sqlite'));
      }
      this.db.transaction(() => {
        this.db.exec(`ALTER TABLE sessions ADD COLUMN detractor TEXT;
          ALTER TABLE sessions ADD COLUMN challenge TEXT;
          ALTER TABLE activity ADD COLUMN inputMs REAL;
          ALTER TABLE activity ADD COLUMN switches INTEGER;`);
        const previous = this.getMeta<Settings>('settings');
        if (previous) this.setMeta('settings', { ...settings(previous), attentionProbes: false });
        this.db.pragma('user_version = 10');
      })();
    }
    if (!this.getMeta('settings')) {
      this.db.transaction(() => {
        this.setMeta('settings', defaultSettings);
        for (const [name, color] of [['Deep work', '#62d8cd'], ['Learning', '#a99af7'], ['Creative practice', '#e4b76a']]) {
          this.putField({ id: randomUUID(), name, color, archived: false, createdAt: new Date().toISOString() });
        }
      })();
    }
  }
  getMeta<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) as T : null;
  }
  setMeta(key: string, value: unknown): void {
    this.db.prepare('INSERT INTO metadata(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
  }
  getSettings(): Settings { return settings(this.getMeta<Settings>('settings') ?? defaultSettings); }
  all(includeActivity = false): Dataset {
    const fields = (this.db.prepare('SELECT * FROM fields ORDER BY createdAt, id').all() as Array<Omit<Field, 'archived'> & { archived: number }>).map(f => ({ ...f, archived: !!f.archived }));
    const tasks = (this.db.prepare('SELECT * FROM tasks ORDER BY createdAt, id').all() as Array<Omit<Task, 'completed' | 'archived'> & { completed: number; archived: number }>).map(t => ({ ...t, completed: !!t.completed, archived: !!t.archived }));
    const sessions = (this.db.prepare('SELECT * FROM sessions ORDER BY startedAt DESC, id').all() as Array<Omit<FocusSession, 'checklistIds' | 'excluded' | 'recovered'> & { checklistIds: string; excluded: number; recovered: number }>).map(s => ({ ...s, checklistIds: JSON.parse(s.checklistIds) as string[], excluded: !!s.excluded, recovered: !!s.recovered, autoOvertime: !!s.autoOvertime, targetReached: !!s.targetReached }));
    const events = this.db.prepare('SELECT * FROM events ORDER BY startedAt, id').all() as SessionEvent[];
    const reviews = this.db.prepare('SELECT * FROM reviews ORDER BY week DESC').all() as WeeklyReview[];
    const categories = (this.db.prepare('SELECT * FROM categories ORDER BY createdAt, id').all() as Array<TaskCategory>).map(c => ({ ...c, archived: !!c.archived }));
    return { fields, tasks, sessions, events, categories, settings: this.getSettings(), reviews, ...this.goalData(), ...(includeActivity ? { activity: this.activity() } : {}) };
  }
  private bodies<T = Record<string, unknown>>(table: 'goals' | 'milestones'): T[] { return (this.db.prepare(`SELECT body FROM ${table} ORDER BY id`).all() as Array<{ body: string }>).map(row => JSON.parse(row.body) as T); }
  goalData(): GoalData {
    return Object.fromEntries(GOAL_COLLECTIONS.map(key => [key, (this.db.prepare(`SELECT body FROM ${key} ORDER BY id`).all() as Array<{ body: string }>).map(row => JSON.parse(row.body))])) as unknown as GoalData;
  }
  putGoalRecord<K extends keyof GoalData>(key: K, row: GoalData[K][number]): void {
    const record = row as unknown as Record<string, unknown>;
    const columns = key === 'goals' ? ['id','fieldId'] : key === 'goalOccurrences' ? ['id','goalId','actionId','originalDate','date'] : key === 'goalReviews' ? ['id','goalId','week'] : ['id','goalId'];
    const values = Object.fromEntries(columns.map(column => [column, record[column]]));
    this.db.prepare(`INSERT INTO ${key} (${columns.join(',')},body) VALUES (${columns.map(c => '@' + c).join(',')},@body) ON CONFLICT(id) DO UPDATE SET ${columns.filter(c => c !== 'id').map(c => c + '=excluded.' + c).join(',')},body=excluded.body`).run({ ...values, body: JSON.stringify(row) });
  }
  // The change log keeps its newest entries; the oldest ones leave when the log is full.
  pruneAgentChanges(keep: number): void { this.db.prepare("DELETE FROM agentChanges WHERE id IN (SELECT id FROM agentChanges ORDER BY json_extract(body, '$.at') DESC LIMIT -1 OFFSET ?)").run(keep); }
  removeGoalProgress(id: string): void { this.db.prepare('DELETE FROM goalProgress WHERE id=?').run(id); }
  field(id: string): Field | undefined { return this.allFields().find(f => f.id === id); }
  allFields(): Field[] { return (this.db.prepare('SELECT * FROM fields').all() as Array<Omit<Field, 'archived'> & { archived: number }>).map(f => ({ ...f, archived: !!f.archived })); }
  task(id: string): Task | undefined {
    const t = this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id) as Task | undefined;
    return t ? { ...t, completed: !!t.completed, archived: !!t.archived } : undefined;
  }
  session(id: string): FocusSession | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as Record<string, unknown> | undefined;
    return row ? { ...row, checklistIds: JSON.parse(row.checklistIds as string), excluded: !!row.excluded, recovered: !!row.recovered, autoOvertime: !!row.autoOvertime, targetReached: !!row.targetReached } as unknown as FocusSession : undefined;
  }
  putField(f: Field): void {
    this.db.prepare('INSERT INTO fields VALUES (@id,@name,@color,@archived,@createdAt) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,archived=excluded.archived').run({ ...f, archived: +f.archived });
  }
  removeField(id: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM sessions WHERE fieldId = ?').run(id);
      this.db.prepare('DELETE FROM tasks WHERE fieldId = ?').run(id);
      this.db.prepare('DELETE FROM goals WHERE fieldId = ?').run(id);
      this.db.prepare('DELETE FROM fields WHERE id = ?').run(id);
      const preferences = this.getSettings();
      const activityModes = { ...preferences.activityModes };
      delete activityModes[id];
      this.setMeta('settings', { ...preferences, activityModes });
    })();
  }
  // Tasks and sessions keep their area and recorded time; only their links to the goal, its steps and its planned actions are cleared.
  // The goal's own rows (roadmap, actions, check-ins, observations, reviews, agent proposals and changes) go with it by cascade.
  removeGoal(id: string): void {
    this.db.transaction(() => {
      this.db.prepare('UPDATE sessions SET goalId = NULL, occurrenceId = NULL, milestoneId = NULL WHERE goalId = ? OR occurrenceId IN (SELECT id FROM goalOccurrences WHERE goalId = ?) OR milestoneId IN (SELECT id FROM milestones WHERE goalId = ?)').run(id, id, id);
      this.db.prepare('UPDATE tasks SET goalId = NULL, milestoneId = NULL WHERE goalId = ? OR milestoneId IN (SELECT id FROM milestones WHERE goalId = ?)').run(id, id);
      this.db.prepare('DELETE FROM goals WHERE id = ?').run(id);
    })();
  }
  category(id: string): TaskCategory | undefined { return this.all().categories.find(c => c.id === id); }
  putCategory(c: TaskCategory): void {
    this.db.prepare('INSERT INTO categories VALUES (@id,@name,@color,@archived,@createdAt) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,archived=excluded.archived').run({ ...c, archived: +c.archived });
  }
  putTask(t: Task): void {
    this.db.prepare('INSERT INTO tasks (id,fieldId,title,completed,archived,createdAt,updatedAt,categoryId,notes,priority,dueDate,goalId,milestoneId) VALUES (@id,@fieldId,@title,@completed,@archived,@createdAt,@updatedAt,@categoryId,@notes,@priority,@dueDate,@goalId,@milestoneId) ON CONFLICT(id) DO UPDATE SET title=excluded.title,completed=excluded.completed,archived=excluded.archived,updatedAt=excluded.updatedAt,categoryId=excluded.categoryId,notes=excluded.notes,priority=excluded.priority,dueDate=excluded.dueDate,goalId=excluded.goalId,milestoneId=excluded.milestoneId').run({ goalId: null, milestoneId: null, ...t, completed: +t.completed, archived: +t.archived });
  }
  putSession(s: FocusSession): void {
    this.db.prepare(`INSERT INTO sessions (id,fieldId,primaryTaskId,checklistIds,intention,plannedMs,activeMs,status,startedAt,endedAt,timezone,energy,focus,note,completionReason,excluded,recovered,timingMode,autoOvertime,targetReached,activityMode,behaviourVersion,goalId,occurrenceId,milestoneId,detractor,challenge) VALUES (@id,@fieldId,@primaryTaskId,@checklistIds,@intention,@plannedMs,@activeMs,@status,@startedAt,@endedAt,@timezone,@energy,@focus,@note,@completionReason,@excluded,@recovered,@timingMode,@autoOvertime,@targetReached,@activityMode,@behaviourVersion,@goalId,@occurrenceId,@milestoneId,@detractor,@challenge)
      ON CONFLICT(id) DO UPDATE SET fieldId=excluded.fieldId,primaryTaskId=excluded.primaryTaskId,checklistIds=excluded.checklistIds,intention=excluded.intention,plannedMs=excluded.plannedMs,activeMs=excluded.activeMs,status=excluded.status,endedAt=excluded.endedAt,energy=excluded.energy,focus=excluded.focus,note=excluded.note,completionReason=excluded.completionReason,excluded=excluded.excluded,recovered=excluded.recovered,timingMode=excluded.timingMode,autoOvertime=excluded.autoOvertime,targetReached=excluded.targetReached,goalId=excluded.goalId,occurrenceId=excluded.occurrenceId,milestoneId=excluded.milestoneId,detractor=excluded.detractor,challenge=excluded.challenge`)
      .run({ activityMode: 'Unspecified', behaviourVersion: 0, goalId: null, occurrenceId: null, milestoneId: null, ...s, detractor: s.detractor ?? null, challenge: s.challenge ?? null, checklistIds: JSON.stringify(s.checklistIds), excluded: +s.excluded, recovered: +s.recovered, autoOvertime: +s.autoOvertime, targetReached: +s.targetReached });
  }
  putEvent(e: SessionEvent): void {
    this.db.prepare('INSERT INTO events VALUES (@id,@sessionId,@kind,@startedAt,@endedAt,@durationMs,@text,@category,@activeOffsetMs,@source) ON CONFLICT(id) DO UPDATE SET endedAt=excluded.endedAt,durationMs=excluded.durationMs,text=excluded.text,category=excluded.category').run({ activeOffsetMs: null, source: null, ...e });
  }
  persist(s: FocusSession, event?: SessionEvent | null, extras: SessionEvent[] = []): void {
    this.db.transaction(() => { this.putSession(s); if (event) this.putEvent(event); extras.forEach(e => this.putEvent(e)); })();
  }
  putReview(r: WeeklyReview): void {
    this.db.prepare('INSERT INTO reviews VALUES (@week,@adjustment,@updatedAt) ON CONFLICT(week) DO UPDATE SET adjustment=excluded.adjustment,updatedAt=excluded.updatedAt').run(r);
  }
  removeSession(id: string): void { this.db.prepare('DELETE FROM sessions WHERE id=?').run(id); }
  activity(sessionId?: string): ActivitySample[] {
    return (sessionId ? this.db.prepare('SELECT * FROM activity WHERE sessionId=? ORDER BY startMs').all(sessionId) : this.db.prepare('SELECT * FROM activity ORDER BY sessionId,startMs').all()) as ActivitySample[];
  }
  putActivity(sample: ActivitySample): void {
    const session = this.session(sample.sessionId);
    if (!session || sample.startMs < 0 || sample.endMs > session.activeMs || sample.endMs <= sample.startMs) throw new Error('Activity must fit durable session time.');
    const previous = this.db.prepare('SELECT * FROM activity WHERE sessionId=? ORDER BY endMs DESC LIMIT 1').get(sample.sessionId) as ActivitySample | undefined;
    if (previous && previous.status === sample.status && previous.endMs === sample.startMs && Math.floor(previous.startMs / 60000) === Math.floor(sample.startMs / 60000)) {
      // An unknown (null) measure on either side keeps the merged block unknown; it never turns into a sum of the known part.
      const add = (a?: number | null, b?: number | null) => a == null || b == null ? null : a + b;
      this.db.prepare('UPDATE activity SET endMs=?,observedMs=observedMs+?,keys=keys+?,clicks=clicks+?,scrolls=scrolls+?,movementMs=movementMs+?,inputMs=?,switches=? WHERE id=?').run(sample.endMs, sample.observedMs, sample.keys, sample.clicks, sample.scrolls, sample.movementMs, add(previous.inputMs, sample.inputMs), add(previous.switches, sample.switches), previous.id);
    } else this.db.prepare('INSERT INTO activity (id,sessionId,startMs,endMs,observedMs,keys,clicks,scrolls,movementMs,status,inputMs,switches) VALUES (@id,@sessionId,@startMs,@endMs,@observedMs,@keys,@clicks,@scrolls,@movementMs,@status,@inputMs,@switches)').run({ ...sample, inputMs: sample.inputMs ?? null, switches: sample.switches ?? null });
  }
  removeActivity(): void { this.db.prepare('DELETE FROM activity').run(); }
  removeReturn(id: string): void { this.db.prepare("DELETE FROM events WHERE id=? AND kind='attention-return'").run(id); }
  restore(data: Dataset): void {
    this.db.transaction(() => {
      this.db.exec('DELETE FROM events; DELETE FROM sessions; DELETE FROM tasks; DELETE FROM agentProposals; DELETE FROM agentChanges; DELETE FROM goals; DELETE FROM fields; DELETE FROM categories; DELETE FROM reviews;');
      data.fields.forEach(f => this.putField(f)); data.categories.forEach(c => this.putCategory(c));
      for (const key of GOAL_COLLECTIONS) for (const row of data[key] ?? []) this.putGoalRecord(key,row);
      data.tasks.forEach(t => this.putTask(t));
      data.sessions.forEach(s => this.putSession(s)); data.events.forEach(e => this.putEvent(e));
      (data.activity ?? []).forEach(sample => this.putActivity(sample));
      data.reviews.forEach(r => this.putReview(r)); this.setMeta('settings', { ...data.settings, collectActivity: false, agentAccess: 'off', attentionProbes: false });
    })();
  }
  async backup(path: string): Promise<void> { await this.db.backup(path); }
  /** Rows changed through this connection since it opened; any INSERT, UPDATE or DELETE moves it. Null means: do not cache. */
  revision(): number | null { return (this.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n; }
  close(): void { this.db.close(); }
}
