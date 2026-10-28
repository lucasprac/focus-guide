import { randomUUID } from 'node:crypto';
import { Store } from './store';
import { TimerEngine } from './timer';
import type { ActivitySample, Command, Dataset, FocusSession, Task } from '../shared/types';
import * as v from '../shared/validation';
import { addDays, selectedSessions } from '../shared/analytics';
import { ACHIEVEMENT_IDS, PALETTES, evaluateAchievements, paletteUnlocked, paletteUnlockLabel } from '../shared/achievements';
import { INSIGHT_THRESHOLDS, focusInsights, type InsightOptions } from '../shared/focus-insights';
import type { ProbeScheduler } from './probes';
import { GoalService, dateRange } from './goal-service';
import { AgentService } from './agent-service';

export class FocusService {
  constructor(readonly store: Store, readonly timer: TimerEngine, private beforeDelete?: (kind: 'field' | 'goal') => void, readonly probes?: ProbeScheduler) {}
  // Runtime-only results of insights.read, keyed by the input and the data revision; never persisted.
  private insights: Array<{ key: string; value: unknown }> = [];
  private categoryInput(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    const id = v.id(value), category = this.store.category(id);
    if (!category || category.archived) throw new Error('Choose an active category.'); return id;
  }
  private taskSelection(input: Record<string, unknown>, fieldId: string, active = false): { primaryTaskId: string | null; checklistIds: string[] } {
    if (!Array.isArray(input.checklistIds) || input.checklistIds.length > 100) throw new Error('Select up to 100 tasks.');
    const checklistIds = input.checklistIds.map(v.id);
    if (new Set(checklistIds).size !== checklistIds.length) throw new Error('A checklist cannot contain duplicate tasks.');
    const primaryTaskId = input.primaryTaskId ? v.id(input.primaryTaskId) : null;
    if (primaryTaskId && !checklistIds.includes(primaryTaskId)) throw new Error('Include the primary task in the checklist.');
    for (const id of checklistIds) {
      const task = this.store.task(id), alreadyLinked = active && this.timer.current?.checklistIds.includes(id);
      if (!task || task.fieldId !== fieldId || (!alreadyLinked && (task.archived || task.completed))) throw new Error('Choose open tasks from the selected area.');
    }
    return { primaryTaskId, checklistIds };
  }
  // Agent code runs commands through this; permanent deletion stays a user command only.
  private agentCommand = (command: Command, input: Record<string, unknown>): unknown => {
    if (command === 'goal.delete' || command === 'field.delete') throw new Error('An agent cannot delete records.');
    return this.run(command, input);
  };
  // The local agent bridge calls only this method; it never reaches the renderer commands directly.
  agentTool(name: unknown, input: Record<string, unknown>, source: string): unknown { return new AgentService(this.store,this.agentCommand).tool(name,input,source); }
  /* insights.read in two steps, so the main process can compute outside the command queue: the job is either a cached value or the
     inputs of the engine, read in one synchronous step. The key holds the data revision at that moment. */
  insightsJob(input: Record<string, unknown>, now = new Date().toISOString()): { key: string | null; value: unknown } | { key: string | null; data: Dataset; activity: ActivitySample[]; options: InsightOptions } {
    const { from, to } = dateRange(input);
    const fieldId = input.fieldId == null || input.fieldId === '' ? undefined : v.id(input.fieldId);
    const goalId = input.goalId == null || input.goalId === '' ? undefined : v.id(input.goalId);
    const revision = this.store.revision(), key = revision === null ? null : JSON.stringify([revision, from, to, fieldId ?? '', goalId ?? '']);
    const hit = key === null ? undefined : this.insights.find(entry => entry.key === key);
    if (hit) return { key, value: structuredClone(hit.value) };
    // The cycle comparison also reads the recent and baseline windows, which can reach back further than the range.
    const data = this.store.all(), reach = addDays(to, -(INSIGHT_THRESHOLDS.cycle.recentDays + INSIGHT_THRESHOLDS.cycle.baselineDays - 1)), sessions = selectedSessions(data, from < reach ? from : reach, to, fieldId, goalId);
    return { key, data, activity: sessions.flatMap(s => this.store.activity(s.id)), options: { from, to, fieldId, goalId, now: Date.parse(now) } };
  }
  rememberInsights(key: string | null, value: unknown): void {
    // A result from a snapshot that is no longer current is dropped, so it never evicts results of the current data.
    const revision = key === null ? null : JSON.parse(key)[0];
    if (key === null || revision !== this.store.revision()) return;
    this.insights = [{ key, value: structuredClone(value) }, ...this.insights.filter(entry => entry.key !== key && JSON.parse(entry.key)[0] === revision)].slice(0, 4);
  }
  run(command: Command, input: Record<string, unknown> = {}): unknown {
    const now = new Date().toISOString();
    const goals = new GoalService(this.store);
    if (command === 'goal.delete') { goals.remove(input, this.timer.current?.goalId ?? null, this.beforeDelete); return; }
    if (command.startsWith('goal.')) return goals.run(command,input,now);
    if (command.startsWith('agent.')) return new AgentService(this.store,this.agentCommand).run(command,input,now);
    switch (command) {
      case 'field.create': {
        if (this.store.allFields().length >= 1000) throw new Error('The area limit has been reached.');
        const f = { id: randomUUID(), name: v.text(input.name, 'Field name', 60, true), color: v.color(input.color), archived: false, createdAt: now };
        this.store.putField(f); return f.id;
      }
      case 'field.update': case 'field.archive': {
        const f = this.store.field(v.id(input.id)); if (!f) throw new Error('This area no longer exists.');
        if (command === 'field.archive') { f.archived = v.bool(input.archived, 'Archived'); }
        else { f.name = v.text(input.name, 'Field name', 60, true); f.color = v.color(input.color); }
        this.store.putField(f); return;
      }
      case 'field.delete': {
        const id = v.id(input.id);
        if (!this.store.field(id)) throw new Error('This area no longer exists.');
        if (this.timer.current?.fieldId === id || this.store.all().sessions.some(s => s.fieldId === id && s.status !== 'completed')) throw new Error('Finish this area’s running or paused session before deleting it.');
        if (!this.beforeDelete) throw new Error('A recovery backup is required before deleting an area.');
        this.beforeDelete('field');
        this.store.removeField(id); return;
      }
      case 'category.create': {
        if (this.store.all().categories.length >= 1000) throw new Error('The category limit has been reached.');
        const c = { id: randomUUID(), name: v.text(input.name, 'Category name', 60, true), color: v.color(input.color), archived: false, createdAt: now };
        this.store.putCategory(c); return c.id;
      }
      case 'category.update': case 'category.archive': {
        const c = this.store.category(v.id(input.id)); if (!c) throw new Error('This category no longer exists.');
        if (command === 'category.archive') c.archived = v.bool(input.archived, 'Archived');
        else { c.name = v.text(input.name, 'Category name', 60, true); c.color = v.color(input.color); }
        this.store.putCategory(c); return;
      }
      case 'task.create': {
        const field = this.store.field(v.id(input.fieldId)); if (!field || field.archived) throw new Error('Choose an active area.');
        const t: Task = { categoryId: this.categoryInput(input.categoryId), notes: v.text(input.notes ?? '', 'Task notes', 2000), priority: v.priority(input.priority ?? 'normal'), dueDate: v.date(input.dueDate ?? null), id: randomUUID(), fieldId: field.id, title: v.text(input.title, 'Task title', 200, true), completed: false, archived: false, createdAt: now, updatedAt: now };
        Object.assign(t,goals.taskLinks(t,input));
        this.store.db.transaction(() => { this.store.putTask(t); if (input.attachToSession === true && this.timer.current?.fieldId === field.id) this.timer.addTask(t.id); })(); return t.id;
      }
      case 'task.update': case 'task.delete': {
        const t = this.store.task(v.id(input.id)); if (!t) throw new Error('This task no longer exists.');
        if (command === 'task.delete') t.archived = true;
        else { if ('archived' in input) t.archived = v.bool(input.archived, 'Archived'); if ('notes' in input) t.notes = v.text(input.notes, 'Task notes', 2000); if ('priority' in input) t.priority = v.priority(input.priority); if ('dueDate' in input) t.dueDate = v.date(input.dueDate); if ('categoryId' in input && input.categoryId !== t.categoryId) t.categoryId = this.categoryInput(input.categoryId); if ('title' in input) t.title = v.text(input.title, 'Task title', 200, true); if ('completed' in input) t.completed = v.bool(input.completed, 'Completed'); }
        Object.assign(t,goals.taskLinks(t,input));
        t.updatedAt = now; this.store.putTask(t); return;
      }
      case 'session.tasks': {
        if (!this.timer.current) throw new Error('Start a session first.');
        const selection = this.taskSelection(input, this.timer.current.fieldId, true);
        this.timer.setTasks(selection.checklistIds, selection.primaryTaskId); return;
      }
      case 'session.start': {
        if (this.timer.snapshot().mode !== 'idle') throw new Error('Finish the current session or break first.');
        const f = this.store.field(v.id(input.fieldId)); if (!f || f.archived) throw new Error('Choose an active area.');
        const { primaryTaskId, checklistIds } = this.taskSelection(input, f.id);
        const timingMode = input.timingMode ?? 'countdown';
        if (timingMode !== 'countdown' && timingMode !== 'stopwatch') throw new Error('Choose Timer or Stopwatch.');
        const activityMode = v.activityMode(input.activityMode ?? this.store.getSettings().activityModes?.[f.id] ?? 'Unspecified');
        const links = goals.sessionLinks(f.id,primaryTaskId,input,now);
        const intention = v.text(input.intention ?? '', 'Intention', 500), energy = v.rating(input.energy), warmUp = v.warmUp(input.warmUp), medication = v.medication(input.medication);
        const plannedMs = timingMode === 'stopwatch' ? null : v.number(input.durationMinutes,'Duration',1,1440) * 60000;
        try { this.store.db.transaction(() => {
          if (links.occurrence) this.store.putGoalRecord('goalOccurrences',links.occurrence);
          this.timer.start({ goalId: links.goalId,occurrenceId: links.occurrenceId,milestoneId: links.milestoneId,activityMode,behaviourVersion: 4,timingMode,autoOvertime: timingMode === 'countdown' && this.store.getSettings().autoOvertime,fieldId: f.id,primaryTaskId,checklistIds,intention,plannedMs,timezone: this.store.getSettings().timezone,energy,detractor: null,challenge: null,warmUp,medication });
          this.store.setMeta('settings',{ ...this.store.getSettings(),activityModes: { ...this.store.getSettings().activityModes,[f.id]: activityMode } });
        })(); } catch (error) { this.timer.recover(); throw error; }
        return this.timer.current!.id;
      }
      case 'session.pause': this.timer.pause(); return;
      case 'session.resume': this.timer.resume(); return;
      case 'session.finish': return this.timer.finish('early', input.excluded === undefined ? false : v.bool(input.excluded, 'Excluded'))?.id;
      case 'session.review': case 'session.edit': case 'session.exclude': case 'session.delete': {
        const s = this.store.session(v.id(input.id)); if (!s || s.status !== 'completed') throw new Error('Only a finished session can be edited or removed.');
        if (command === 'session.delete') { this.store.removeSession(s.id); return; }
        const before = { fieldId: s.fieldId, intention: s.intention, energy: s.energy, focus: s.focus, note: s.note, excluded: s.excluded, detractor: s.detractor ?? null, challenge: s.challenge ?? null };
        if (command === 'session.exclude') s.excluded = v.bool(input.excluded, 'Excluded');
        else {
          s.focus = v.rating(input.focus); s.note = v.text(input.note ?? '', 'Note', 2000);
          if ('detractor' in input) s.detractor = v.detractor(input.detractor);
          if ('challenge' in input) s.challenge = v.challenge(input.challenge);
          if (command === 'session.edit') {
            const f = this.store.field(v.id(input.fieldId)); if (!f) throw new Error('Choose an existing area.');
            if (f.id !== s.fieldId) { s.primaryTaskId = null; s.checklistIds = []; s.goalId = null; s.occurrenceId = null; s.milestoneId = null; }
            s.fieldId = f.id; s.intention = v.text(input.intention ?? '', 'Intention', 500); s.energy = v.rating(input.energy);
          }
        }
        const edit = { id: randomUUID(), sessionId: s.id, kind: 'edit' as const, startedAt: now, endedAt: now, durationMs: 0, text: JSON.stringify({ action: command, before }).slice(0, 2000), category: 'history' };
        this.store.persist(s, null, [edit]); return;
      }
      case 'attention.return': {
        const source = input.source ?? 'main';
        if (source !== 'main' && source !== 'floating' && source !== 'shortcut') throw new Error('Invalid return source.');
        return this.timer.recordReturn(source);
      }
      case 'attention.remove': this.store.removeReturn(v.id(input.id)); return;
      case 'probe.answer': {
        const id = v.id(input.id), answer = v.probeAnswer(input.answer), source = input.source;
        if (source !== 'main' && source !== 'floating') throw new Error('Invalid check-in source.');
        const pending = this.probes?.pending;
        if (!pending || pending.id !== id || pending.sessionId !== this.timer.current?.id || this.timer.current.status !== 'running') throw new Error('This check-in has expired.');
        const { offsetMs, latencyMs } = this.probes!.answer(id);
        return this.timer.recordProbe(answer, offsetMs, source, latencyMs);
      }
      case 'insights.read': {
        const job = this.insightsJob(input, now); if ('value' in job) return job.value;
        const value = focusInsights(job.data, job.activity, job.options); this.rememberInsights(job.key, value); return value;
      }
      case 'behaviour.read': {
        const sessionId = v.id(input.id); if (!this.store.session(sessionId)) throw new Error('Session no longer exists.');
        return this.store.activity(sessionId);
      }
      case 'activity.delete': this.store.removeActivity(); return;
      case 'interruption.record': this.timer.record('interruption', v.text(input.text ?? '', 'Interruption note', 500), v.text(input.category ?? 'Unspecified', 'Category', 100)); return;
      case 'thought.record': this.timer.record('thought', v.text(input.text, 'Thought', 2000, true)); return;
      case 'break.start': this.timer.beginBreak(); return;
      case 'break.stop': this.timer.endBreak(); return;
      case 'settings.update': {
        const settings = v.settings(input), previous = this.store.getSettings(), palette = PALETTES.find(p => p.id === settings.palette)!;
        if (settings.palette !== previous.palette && !paletteUnlocked(palette, this.store.all())) throw new Error(`This palette is locked. ${paletteUnlockLabel(palette)}.`);
        // Collected achievements change only through achievements.collect, so an older settings draft cannot erase them.
        this.store.setMeta('settings', { ...settings, collectedAchievements: previous.collectedAchievements ?? {} }); return;
      }
      case 'achievements.collect': {
        if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > ACHIEVEMENT_IDS.length) throw new Error('Choose achievements to collect.');
        const settings = this.store.getSettings(), states = evaluateAchievements(this.store.all()), collected = { ...settings.collectedAchievements };
        for (const value of input.ids) {
          const state = states.find(a => a.id === value);
          if (!state) throw new Error('Unknown achievement.');
          if (!state.unlocked) throw new Error(`“${state.title}” is not earned yet.`);
          collected[state.id] ??= now;
        }
        this.store.setMeta('settings', { ...settings, collectedAchievements: collected }); return;
      }
      case 'review.save': {
        const week = v.text(input.week, 'Week', 10, true);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || !Number.isFinite(Date.parse(week))) throw new Error('Invalid week.');
        this.store.putReview({ week, adjustment: v.text(input.adjustment, 'Adjustment', 2000), updatedAt: now }); return;
      }
      default: throw new Error('This command is not available.');
    }
  }
}
