import { randomUUID } from 'node:crypto';
import type { Store } from './store';
import type { Command, Field } from '../shared/types';
import * as v from '../shared/validation';
import { goalData } from '../shared/goal-types';
import { COMMITMENT_LIMITS, clockText, commitmentEnd, commitmentStatus, overlappingCommitment, validateCommitment, type Commitment, type CommitmentOrigin } from '../shared/commitments';
import { localDay } from '../shared/analytics';
import { t } from '../shared/i18n';

const LINKS = ['fieldId', 'goalId', 'milestoneId', 'taskId'] as const;
const link = (value: unknown) => value === null || value === undefined || value === '' ? null : v.id(value);

/* Calendar commitments: validated create, change and delete, and the check when a session starts from one. A commitment
   holds its time only while it is planned or done, and two commitments that hold time never overlap, because only one
   session runs at a time. Links resolve upward: a task gives its area and goal, a goal gives its area. */
export class CommitmentService {
  constructor(private store: Store) {}
  private records(): Commitment[] { return this.store.commitments(); }
  private find(id: unknown): Commitment {
    const row = this.store.commitment(v.id(id));
    if (!row) throw new Error(t('This commitment no longer exists.'));
    return row;
  }
  /* The links of a commitment. A link that the input does not change is kept as it is, even if its record was archived since. */
  private links(input: Record<string, unknown>, existing: Commitment | undefined): Pick<Commitment, typeof LINKS[number]> {
    const given = (key: typeof LINKS[number]) => key in input && input[key] !== undefined;
    const changed = (key: typeof LINKS[number], value: string | null) => value !== null && value !== existing?.[key];
    let taskId = given('taskId') ? link(input.taskId) : existing?.taskId ?? null;
    let goalId = given('goalId') ? link(input.goalId) : existing?.goalId ?? null;
    let milestoneId = given('milestoneId') ? link(input.milestoneId) : existing?.milestoneId ?? null;
    let fieldId = given('fieldId') ? link(input.fieldId) : existing?.fieldId ?? null;
    const domain = goalData(this.store.all());
    // The task gives the area, goal and step when the input names it; a saved task link keeps the links saved with it.
    if (taskId && given('taskId')) {
      const task = this.store.task(taskId);
      if (!task || changed('taskId', taskId) && (task.archived || task.completed)) throw new Error(t('Choose an open task.'));
      if (given('fieldId') && fieldId !== null && fieldId !== task.fieldId || given('goalId') && goalId !== null && goalId !== (task.goalId ?? null)) throw new Error(t('The task belongs to another area or goal. Leave out the area and goal, or choose matching ones.'));
      fieldId = task.fieldId; goalId = task.goalId ?? null;
      // A task commitment serves the task's roadmap step unless the input names a step.
      if (!given('milestoneId')) milestoneId = task.milestoneId ?? null;
    }
    if (taskId && !given('taskId')) { if (!this.store.task(taskId)) throw new Error(t('Choose an open task.')); }
    else if (goalId) {
      const goal = domain.goals.find(g => g.id === goalId);
      if (!goal || changed('goalId', goalId) && (goal.status === 'archived' || goal.status === 'achieved')) throw new Error(t('Choose a goal that is not archived or achieved.'));
      if (given('fieldId') && fieldId !== null && fieldId !== goal.fieldId) throw new Error(t('A goal commitment keeps the goal’s area.'));
      fieldId = goal.fieldId;
    } else milestoneId = null;
    if (milestoneId && !domain.milestones.some(m => m.id === milestoneId && m.goalId === goalId && m.kind === 'todo' && (!changed('milestoneId', milestoneId) || !m.archived))) throw new Error(t('Choose a roadmap step from this goal.'));
    if (fieldId) {
      const field: Field | undefined = this.store.field(fieldId);
      if (!field || changed('fieldId', fieldId) && field.archived) throw new Error(t('Choose an active area.'));
    }
    return { fieldId, goalId, milestoneId, taskId };
  }
  /* A commitment without a title is named after what it serves. */
  private defaultTitle(links: Pick<Commitment, typeof LINKS[number]>): string {
    const domain = goalData(this.store.all());
    if (links.taskId) return this.store.task(links.taskId)?.title ?? t('Focus block');
    if (links.milestoneId) return domain.milestones.find(m => m.id === links.milestoneId)?.title ?? t('Focus block');
    if (links.goalId) return domain.goals.find(g => g.id === links.goalId)?.title ?? t('Focus block');
    if (links.fieldId) return this.store.field(links.fieldId)?.name ?? t('Focus block');
    return t('Focus block');
  }

  /* commitment.save: creates a commitment (no id, or an unknown id) or changes the fields that the input gives. */
  save(input: Record<string, unknown>, now: string, origin: CommitmentOrigin = 'user'): Commitment {
    const existing = input.id === undefined ? undefined : this.store.commitment(v.id(input.id));
    if (!existing && this.records().length >= COMMITMENT_LIMITS.count) throw new Error(t('The commitment limit has been reached.'));
    const pick = <K extends keyof Commitment>(key: K, read: (value: unknown) => Commitment[K], fallback: Commitment[K]): Commitment[K] => key in input && input[key] !== undefined ? read(input[key]) : existing ? existing[key] : fallback;
    const links = this.links(input, existing);
    const date = pick('date', value => { const day = v.date(value); if (!day) throw new Error(t('A commitment needs a date.')); return day; }, '');
    if (!date) throw new Error(t('A commitment needs a date.'));
    const startMinute = pick('startMinute', value => v.number(value, t('Start time'), 0, 1440 - COMMITMENT_LIMITS.minMinutes), -1);
    const durationMinutes = pick('durationMinutes', value => v.number(value, t('Duration'), COMMITMENT_LIMITS.minMinutes, COMMITMENT_LIMITS.maxMinutes), this.store.getSettings().defaultMinutes);
    if (startMinute < 0) throw new Error(t('A commitment needs a start time.'));
    const status = pick('status', commitmentStatus, 'planned');
    const moved = !!existing && (existing.date !== date || existing.startMinute !== startMinute);
    const title = 'title' in input && input.title !== undefined ? v.text(input.title, t('Commitment title'), COMMITMENT_LIMITS.title) : existing?.title ?? '';
    const row = validateCommitment({
      id: existing?.id ?? (input.id === undefined ? randomUUID() : v.id(input.id)), title: title || this.defaultTitle(links),
      notes: pick('notes', value => v.text(value, t('Commitment notes'), COMMITMENT_LIMITS.notes), ''), date, startMinute: Math.round(startMinute), durationMinutes: Math.round(durationMinutes),
      timezone: existing?.timezone ?? this.store.getSettings().timezone, ...links,
      activityMode: pick('activityMode', v.activityMode, links.fieldId ? this.store.getSettings().activityModes?.[links.fieldId] ?? 'Unspecified' : 'Unspecified'),
      status, origin: existing?.origin ?? origin, rescheduleCount: Math.min(COMMITMENT_LIMITS.rescheduleCount, (existing?.rescheduleCount ?? 0) + (moved && existing!.status === 'planned' ? 1 : 0)),
      createdAt: existing?.createdAt ?? now, updatedAt: now
    });
    // Sessions that started from this commitment keep their area, so the commitment keeps it too.
    if (existing && row.fieldId !== null && row.fieldId !== existing.fieldId && this.store.all().sessions.some(s => s.commitmentId === existing.id && s.fieldId !== row.fieldId)) throw new Error(t('Focus sessions started from this commitment, so it keeps their area.'));
    const clash = overlappingCommitment(this.records(), row);
    if (clash) throw new Error(t('This time overlaps “{title}” ({start}–{end}) on {date}. Choose another time, or cancel the other commitment first.', { title: clash.title, start: clockText(clash.startMinute), end: clockText(commitmentEnd(clash)), date: clash.date }));
    this.store.putCommitment(row);
    return row;
  }

  run(command: Command, input: Record<string, unknown>, now: string): unknown {
    switch (command) {
      // origin only marks who planned the block; an applied agent proposal and an agent edit send 'agent'.
      case 'commitment.save': return this.save(input, now, input.origin === 'agent' ? 'agent' : 'user').id;
      case 'commitment.delete': {
        const row = this.find(input.id);
        if (this.store.all().sessions.some(s => s.commitmentId === row.id && s.status !== 'completed')) throw new Error(t('Finish the session of this commitment before you delete it.'));
        this.store.removeCommitment(row.id); return;
      }
      default: throw new Error(t('This command is not available.'));
    }
  }

  /* session.start: a session can start from a planned commitment of today. The session keeps the commitment's area. */
  sessionLink(input: Record<string, unknown>, fieldId: string, now: string): string | null {
    if (input.commitmentId === undefined || input.commitmentId === null || input.commitmentId === '') return null;
    const row = this.find(input.commitmentId);
    if (row.status !== 'planned') throw new Error(t('Start a session only from a planned commitment.'));
    if (row.date !== localDay(now, row.timezone)) throw new Error(t('Start a session from a commitment on its own day.'));
    if (row.fieldId && row.fieldId !== fieldId) throw new Error(t('This session has another area than its commitment. Choose the commitment’s area.'));
    return row.id;
  }
}
