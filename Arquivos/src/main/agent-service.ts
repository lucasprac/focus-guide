import { randomUUID } from 'node:crypto';
import type { Store } from './store';
import type { Command } from '../shared/types';
import { goalData, sortMilestones, type AgentProposal, type ProposalKind } from '../shared/goal-types';
import * as v from '../shared/validation';
import { goalDate, goalPlan, whyTags, GOAL_LIMITS, PROPOSAL_LIMITS, validateGoalRecord } from '../shared/goal-validation';
import { MILESTONE_LIMITS, formatMilestoneMarkdown, parseMilestoneMarkdown, reconnectMilestones } from '../shared/milestone-markdown';
import { addDays, localDay, monday } from '../shared/analytics';
import { actionPlan, barrierSuggestions, goalSummary, roadmapEffort, roadmapRevision, todaysOccurrences } from '../shared/goal-planning';
import { AGENT_TOOLS, accessError, allowsTool, isAgentTool } from '../shared/agent-tools';
import { AgentEditor } from './agent-edits';
import type { FocusInsights, SurvivalCurve } from '../shared/focus-insights';

type Run = (command: Command, input: Record<string, unknown>) => unknown;
const POINT_LIMIT = 60;
const round = (minutes: number) => Math.round(minutes * 10) / 10;

/* Serves the local AI agent. Read tools return copies of records. Propose tools save proposals only: the user applies
   or rejects each proposal in the app. Edit tools (the 'edit' access level) change records directly through AgentEditor,
   which audits every change. */
export class AgentService {
  constructor(private store: Store, private command: Run) {}
  private records() { return goalData(this.store.all()); }
  private timezone() { return this.store.getSettings().timezone; }
  private today(now: string) { return localDay(now, this.timezone()); }
  private goal(id: unknown, open = true) {
    const goal = this.records().goals.find(g => g.id === v.id(id));
    if (!goal) throw new Error('Esta meta não existe. Use get_overview para encontrar os identificadores das metas.');
    if (open && goal.status === 'archived') throw new Error('Esta meta está arquivada. O usuário pode restaurá-la no Focus Guide.');
    return goal;
  }
  private roadmapSignature(goalId: string): string { return roadmapRevision(this.store.all(), goalId); }

  tool(name: unknown, input: Record<string, unknown>, source: string): unknown {
    if (!isAgentTool(name)) throw new Error(`Ferramenta desconhecida. Ferramentas disponíveis: ${Object.keys(AGENT_TOOLS).join(', ')}.`);
    const access = this.store.getSettings().agentAccess ?? 'off';
    if (!allowsTool(access, name)) throw new Error(accessError(access));
    const now = new Date().toISOString();
    switch (name) {
      case 'get_overview': return this.overview(now);
      case 'get_goal': return this.goalDetail(input.goalId, now);
      case 'get_goal_behaviour': {
        const today = this.today(now), goal = this.goal(input.goalId, false);
        return this.command('goal.behaviour', { goalId: goal.id, from: input.from ?? addDays(today, -29), to: input.to ?? today });
      }
      case 'get_focus_insights': return this.focusInsights(input, now);
      case 'list_sessions': return this.sessions(input, now);
      case 'get_weekly_review': return this.weeklyReview(input, now);
      case 'list_proposals': {
        const status = input.status === undefined ? null : v.text(input.status, 'Status', 10, true), goalId = input.goalId === undefined ? null : v.id(input.goalId);
        return this.records().agentProposals.filter(p => (!status || p.status === status) && (!goalId || p.goalId === goalId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
      }
      case 'list_changes': {
        const goalId = input.goalId === undefined ? null : v.id(input.goalId), limit = input.limit === undefined ? 50 : v.number(input.limit, 'Limite', 1, 200);
        return this.records().agentChanges.filter(c => !goalId || c.goalId === goalId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, Math.floor(limit))
          .map(c => ({ id: c.id, at: c.at, tool: c.tool, target: c.target, goalId: c.goalId, summary: c.summary, rationale: c.rationale, undoneByUser: c.undoneAt !== null }));
      }
      case 'create_goal': case 'update_goal': case 'update_roadmap': case 'update_step': case 'create_tasks': case 'update_task': case 'create_action': case 'update_action': case 'add_review_note':
        return this.editor().tool(name, input, source, now);
      default: {
        const kind = ({ propose_goal: 'goal.create', propose_roadmap: 'roadmap.replace', propose_tasks: 'tasks.add', propose_action: 'action.add', propose_review_note: 'review.note' } as const)[name];
        return this.propose(kind, input, source, now);
      }
    }
  }

  private overview(now: string) {
    const data = this.store.all(), domain = goalData(data), today = this.today(now), week = monday(today);
    const open = (p: AgentProposal) => p.status === 'pending' || p.status === 'stale';
    return {
      today, timezone: this.timezone(), access: data.settings.agentAccess ?? 'off',
      areas: data.fields.map(f => ({ id: f.id, name: f.name, archived: f.archived })),
      goals: domain.goals.map(g => { const s = goalSummary(data, g.id, addDays(today, -27), today); return { id: g.id, title: g.title, status: g.status, areaId: g.fieldId, outcome: g.outcome, deadline: g.deadline, roadmap: { done: s.completedMilestones, total: s.milestones.length }, recordedMinutesLast28Days: round(s.minutes), openProposals: domain.agentProposals.filter(p => p.goalId === g.id && open(p)).length }; }),
      todaysActions: todaysOccurrences(data, Date.parse(now)).map(o => ({ goalId: o.goalId, action: domain.goalActions.find(a => a.id === o.actionId)?.title, date: o.date, status: o.status, normal: o.plan.normal, smaller: o.plan.smaller })),
      recordedMinutesThisWeek: round(data.sessions.filter(s => s.status === 'completed' && !s.excluded && localDay(s.startedAt, s.timezone) >= week).reduce((sum, s) => sum + s.activeMs / 60000, 0)),
      openNewGoalProposals: domain.agentProposals.filter(p => p.goalId === null && open(p)).length
    };
  }

  private goalDetail(goalId: unknown, now: string) {
    const data = this.store.all(), domain = goalData(data), goal = this.goal(goalId, false), today = this.today(now), effort = roadmapEffort(data, goal.id);
    const active = sortMilestones(domain.milestones.filter(m => m.goalId === goal.id && !m.archived)), summary = goalSummary(data, goal.id, addDays(today, -27), today);
    return {
      goal: { ...goal, area: data.fields.find(f => f.id === goal.fieldId)?.name },
      recordedMinutesLast28Days: round(summary.minutes),
      roadmap: active.map(m => ({ id: m.id, kind: m.kind, title: m.title, completed: m.completed, estimatedMinutes: m.estimatedMinutes, targetDate: m.targetDate, notes: m.notes, resources: m.resources, recordedMinutes: round(effort.get(m.id) ?? 0) })),
      roadmapMarkdown: formatMilestoneMarkdown(active), roadmapRevision: this.roadmapSignature(goal.id),
      archivedRoadmapRows: domain.milestones.filter(m => m.goalId === goal.id && m.archived).length,
      actions: domain.goalActions.filter(a => a.goalId === goal.id && !a.archived).map(a => { const plan = actionPlan(a, today) ?? a.plans[0]; return { id: a.id, title: a.title, weekdays: plan.weekdays, cue: plan.cue, normal: plan.normal, smaller: plan.smaller, obstacle: plan.obstacle, response: plan.response, estimatedMinutes: plan.estimatedMinutes, activityMode: plan.activityMode, enabled: plan.enabled }; }),
      tasks: data.tasks.filter(t => t.goalId === goal.id && !t.archived).map(t => ({ id: t.id, title: t.title, completed: t.completed, priority: t.priority, dueDate: t.dueDate, notes: t.notes, step: active.find(m => m.id === t.milestoneId)?.title ?? null })),
      outcomeObservations: domain.goalProgress.filter(p => p.goalId === goal.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).map(p => ({ date: p.date, value: p.value, note: p.note })),
      weeklyReviews: domain.goalReviews.filter(r => r.goalId === goal.id).sort((a, b) => b.week.localeCompare(a.week)).slice(0, 8).map(r => ({ week: r.week, adjustment: r.adjustment, previousOutcome: r.previousOutcome })),
      openProposals: domain.agentProposals.filter(p => p.goalId === goal.id && (p.status === 'pending' || p.status === 'stale')).map(p => ({ id: p.id, kind: p.kind, summary: p.summary, status: p.status, createdAt: p.createdAt })),
      recentAgentChanges: domain.agentChanges.filter(c => c.goalId === goal.id).sort((x, y) => y.at.localeCompare(x.at)).slice(0, 10).map(c => ({ at: c.at, summary: c.summary, undoneByUser: c.undoneAt !== null }))
    };
  }

  /* The same object as the Insights tab. Each survival curve keeps at most 60 points: the first, the last and evenly spaced ones. */
  private focusInsights(input: Record<string, unknown>, now: string) {
    const today = this.today(now), to = input.to === undefined ? today : goalDate(input.to), from = input.from === undefined ? addDays(to, -89) : goalDate(input.from);
    const goalId = input.goalId === undefined ? undefined : this.goal(input.goalId, false).id;
    const fieldId = input.fieldId === undefined ? undefined : v.id(input.fieldId);
    if (fieldId !== undefined && !this.store.field(fieldId)) throw new Error('Esta área não existe. Use get_overview para encontrar os identificadores das áreas.');
    const insights = this.command('insights.read', { from, to, ...(fieldId ? { fieldId } : {}), ...(goalId ? { goalId } : {}) }) as FocusInsights;
    const trim = (curve: SurvivalCurve): SurvivalCurve => curve.points.length <= POINT_LIMIT ? curve : { ...curve, points: Array.from({ length: POINT_LIMIT }, (_, i) => curve.points[Math.round(i * (curve.points.length - 1) / (POINT_LIMIT - 1))]) };
    const span = insights.attentionSpan;
    return { ...insights, attentionSpan: { ...span, overall: span.overall && trim(span.overall), recovery: span.recovery && trim(span.recovery), afterWarmUp: span.afterWarmUp && trim(span.afterWarmUp), byBand: span.byBand.map(trim), byMode: span.byMode.map(trim) } };
  }

  private sessions(input: Record<string, unknown>, now: string) {
    const data = this.store.all(), domain = goalData(data), today = this.today(now);
    const goalId = input.goalId === undefined || input.goalId === null ? null : this.goal(input.goalId, false).id;
    const from = input.from === undefined ? addDays(today, -29) : goalDate(input.from), to = input.to === undefined ? today : goalDate(input.to);
    const limit = input.limit === undefined ? 50 : v.number(input.limit, 'Limite', 1, 200);
    const events = (id: string, kind: string) => data.events.filter(e => e.sessionId === id && e.kind === kind);
    return data.sessions.filter(s => { const day = localDay(s.startedAt, s.timezone); return s.status === 'completed' && (!goalId || s.goalId === goalId) && day >= from && day <= to; })
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, Math.floor(limit))
      .map(s => ({ id: s.id, startedAt: s.startedAt, localDate: localDay(s.startedAt, s.timezone), timezone: s.timezone, area: data.fields.find(f => f.id === s.fieldId)?.name, goalId: s.goalId ?? null, goal: domain.goals.find(g => g.id === s.goalId)?.title ?? null, step: domain.milestones.find(m => m.id === s.milestoneId)?.title ?? null,
        recordedMinutes: round(s.activeMs / 60000), plannedMinutes: s.plannedMs === null ? null : round(s.plannedMs / 60000), timingMode: s.timingMode, activityMode: s.activityMode ?? 'Unspecified', intention: s.intention, energy: s.energy, focus: s.focus, note: s.note, excludedFromInsights: s.excluded,
        interruptions: events(s.id, 'interruption').length, returns: events(s.id, 'attention-return').length, pauses: events(s.id, 'pause').length, parkedThoughts: events(s.id, 'thought').map(e => e.text) }));
  }

  private weeklyReview(input: Record<string, unknown>, now: string) {
    const data = this.store.all(), domain = goalData(data), goal = this.goal(input.goalId, false), current = monday(this.today(now));
    const week = input.week === undefined ? current : goalDate(input.week);
    if (monday(week) !== week) throw new Error('Use a segunda-feira que inicia a semana, no formato AAAA-MM-DD.');
    const summary = goalSummary(data, goal.id, week, addDays(week, 6)), review = domain.goalReviews.find(r => r.goalId === goal.id && r.week === week);
    return {
      week, goal: goal.title, recordedMinutes: round(summary.minutes),
      actions: { done: summary.done, smaller: summary.smaller, skipped: summary.skipped, unrecorded: summary.unrecorded },
      occurrences: summary.occurrences.map(o => ({ action: domain.goalActions.find(a => a.id === o.actionId)?.title, date: o.date, status: o.status, barrier: o.barrier, note: o.note })),
      roadmap: { done: summary.completedMilestones, total: summary.milestones.length },
      adjustment: review?.adjustment ?? '', previousWeekAdjustment: domain.goalReviews.find(r => r.goalId === goal.id && r.week === addDays(week, -7))?.adjustment ?? '',
      barrierSuggestions: week === current ? barrierSuggestions(data, goal.id, Date.parse(now)).map(s => ({ title: s.title, proposal: s.proposal, barrier: s.barrier, reportedDates: [...new Set(s.records.map(r => r.date))] })) : [],
      note: 'Check-ins ausentes são desconhecidos, não falhas. Autorrelatos repetidos não estabelecem uma causa.'
    };
  }

  /* Each payload is rebuilt from known fields only, and checked against the current records. Apply runs the same check again. */
  private editor() { return new AgentEditor(this.store, this.command, this); }
  actionDraft(value: unknown, now: string) {
    const r = v.object(value), timezone = this.timezone();
    const plan = goalPlan({ effectiveDate: localDay(now, timezone), timezone, weekdays: r.weekdays, cue: r.cue, normal: r.normal, smaller: r.smaller, obstacle: r.obstacle ?? '', response: r.response ?? '', estimatedMinutes: r.estimatedMinutes ?? null, activityMode: r.activityMode ?? 'Unspecified', enabled: true });
    return { title: v.text(r.title, 'Título da ação', 200, true), weekdays: plan.weekdays, cue: plan.cue, normal: plan.normal, smaller: plan.smaller, obstacle: plan.obstacle, response: plan.response, estimatedMinutes: plan.estimatedMinutes, activityMode: plan.activityMode };
  }
  markdown(value: unknown, required: boolean): string {
    const text = v.text(value ?? '', 'Markdown do roteiro', MILESTONE_LIMITS.count * (MILESTONE_LIMITS.title + 12), required), rows = parseMilestoneMarkdown(text);
    if (rows.length > MILESTONE_LIMITS.count) throw new Error(`Um roteiro comporta até ${MILESTONE_LIMITS.count} linhas.`);
    if (required && !rows.some(r => r.kind === 'todo')) throw new Error('Um roteiro precisa de pelo menos uma etapa de tarefa, escrita como "- [ ] Etapa".');
    return text;
  }
  private payload(kind: ProposalKind, input: Record<string, unknown>, now: string): { goalId: string | null; payload: Record<string, unknown> } {
    if (kind === 'goal.create') {
      const field = this.store.field(v.id(input.areaId)); if (!field || field.archived) throw new Error('Escolha uma área ativa. Use get_overview para encontrar os identificadores das áreas.');
      const actions = input.actions === undefined ? [] : input.actions;
      if (!Array.isArray(actions) || actions.length > 10) throw new Error('Proponha até 10 ações semanais.');
      return { goalId: null, payload: { areaId: field.id, title: v.text(input.title, 'Título da meta', 200, true), outcome: v.text(input.outcome ?? '', 'Resultado', 2000), why: v.text(input.why ?? '', 'Por que isso importa', 2000), whyTags: whyTags(input.whyTags ?? []), deadline: v.date(input.deadline ?? null), roadmapMarkdown: this.markdown(input.roadmapMarkdown, false), actions: actions.map(a => this.actionDraft(a, now)) } };
    }
    const goal = this.goal(input.goalId);
    if (kind === 'roadmap.replace') return { goalId: goal.id, payload: { goalId: goal.id, markdown: this.markdown(input.markdown, true) } };
    if (kind === 'tasks.add') {
      if (!Array.isArray(input.tasks) || !input.tasks.length || input.tasks.length > 50) throw new Error('Proponha de 1 a 50 tarefas.');
      return { goalId: goal.id, payload: { goalId: goal.id, tasks: input.tasks.map(item => { const t = v.object(item); return { title: v.text(t.title, 'Título da tarefa', 200, true), notes: v.text(t.notes ?? '', 'Notas da tarefa', 2000), priority: v.priority(t.priority ?? 'normal'), dueDate: v.date(t.dueDate ?? null), step: v.text(t.step ?? '', 'Etapa do roteiro', MILESTONE_LIMITS.title) }; }) } };
    }
    if (kind === 'action.add') return { goalId: goal.id, payload: { goalId: goal.id, action: this.actionDraft(input.action, now) } };
    const week = goalDate(input.week ?? monday(this.today(now)));
    if (monday(week) !== week || week > monday(this.today(now))) throw new Error('Escolha a segunda-feira da semana atual ou de uma semana anterior.');
    return { goalId: goal.id, payload: { goalId: goal.id, week, text: v.text(input.text, 'Nota de revisão', 2000, true) } };
  }

  private propose(kind: ProposalKind, input: Record<string, unknown>, source: string, now: string) {
    const all = this.records().agentProposals;
    if (all.filter(p => p.status === 'pending' || p.status === 'stale').length >= PROPOSAL_LIMITS.pending) throw new Error(`Há ${PROPOSAL_LIMITS.pending} propostas em aberto. Peça ao usuário que aplique ou rejeite algumas delas primeiro.`);
    if (all.length >= GOAL_LIMITS.agentProposals) throw new Error('O histórico de propostas está cheio.');
    const { goalId, payload } = this.payload(kind, input, now);
    const defaults: Record<ProposalKind, string> = { 'goal.create': `Nova meta: ${payload.title}`, 'roadmap.replace': 'Roteiro revisado', 'tasks.add': (payload.tasks as unknown[] | undefined)?.length === 1 ? '1 nova tarefa' : `${(payload.tasks as unknown[] | undefined)?.length ?? 0} novas tarefas`, 'action.add': `Ação semanal: ${(payload.action as { title?: string } | undefined)?.title ?? ''}`, 'review.note': `Nota de revisão da semana de ${payload.week}` };
    const proposal = validateGoalRecord('agentProposals', { id: randomUUID(), goalId, kind, summary: v.text(input.summary ?? defaults[kind], 'Resumo', PROPOSAL_LIMITS.summary, true), rationale: v.text(input.rationale ?? '', 'Justificativa', PROPOSAL_LIMITS.rationale), source: source.slice(0, PROPOSAL_LIMITS.source), payload, basis: kind === 'roadmap.replace' && goalId ? this.roadmapSignature(goalId) : null, status: 'pending', createdAt: now, decidedAt: null }) as AgentProposal;
    this.store.putGoalRecord('agentProposals', proposal);
    return { proposalId: proposal.id, status: proposal.status, message: 'Salva como proposta. Nada mudou ainda. O usuário a revisa no Focus Guide e a aplica ou rejeita.' };
  }

  private apply(proposal: AgentProposal, payload: Record<string, unknown>, now: string): unknown {
    const records = this.records(), today = this.today(now), timezone = this.timezone();
    const plan = (a: Record<string, unknown>) => ({ effectiveDate: today, timezone, weekdays: a.weekdays, cue: a.cue, normal: a.normal, smaller: a.smaller, obstacle: a.obstacle, response: a.response, estimatedMinutes: a.estimatedMinutes, activityMode: a.activityMode, enabled: true });
    switch (proposal.kind) {
      case 'goal.create': {
        const goalId = this.command('goal.create', { fieldId: payload.areaId, title: payload.title, outcome: payload.outcome, why: payload.why, whyTags: payload.whyTags, deadline: payload.deadline, baseline: null, target: null, unit: '', status: payload.outcome ? 'active' : 'draft', milestones: parseMilestoneMarkdown(String(payload.roadmapMarkdown ?? '')) }) as string;
        for (const action of payload.actions as Array<Record<string, unknown>>) this.command('goal.action.save', { goalId, title: action.title, plan: plan(action) });
        return { goalId };
      }
      case 'roadmap.replace': {
        // Rows keep their identity where the title matches, so task and session links stay. A step the user checked stays checked.
        const previous = sortMilestones(records.milestones.filter(m => m.goalId === payload.goalId && !m.archived));
        const rows = reconnectMilestones(parseMilestoneMarkdown(String(payload.markdown)), previous, randomUUID).map(row => ({ ...row, completed: row.kind === 'todo' && (row.completed || !!previous.find(m => m.id === row.id && m.completed)) }));
        this.command('goal.milestones.sync', { goalId: payload.goalId, rows });
        return { goalId: payload.goalId };
      }
      case 'tasks.add': {
        const goal = this.goal(payload.goalId), steps = records.milestones.filter(m => m.goalId === goal.id && m.kind === 'todo' && !m.archived);
        const ids = (payload.tasks as Array<Record<string, unknown>>).map(t => this.command('task.create', { fieldId: goal.fieldId, title: t.title, notes: t.notes, priority: t.priority, dueDate: t.dueDate, categoryId: null, goalId: goal.id, milestoneId: steps.find(m => t.step && m.title.toLocaleLowerCase() === String(t.step).toLocaleLowerCase())?.id ?? null }));
        return { goalId: goal.id, taskIds: ids };
      }
      case 'action.add': { const action = payload.action as Record<string, unknown>; return { goalId: payload.goalId, actionId: this.command('goal.action.save', { goalId: payload.goalId, title: action.title, plan: plan(action) }) }; }
      case 'review.note': {
        const existing = records.goalReviews.find(r => r.goalId === payload.goalId && r.week === payload.week);
        const adjustment = existing?.adjustment ? `${existing.adjustment}\n\n${payload.text}` : String(payload.text);
        if (adjustment.length > 2000) throw new Error('A nota não cabe junto ao ajuste semanal existente. Edite-a para ficar mais curta.');
        this.command('goal.review.save', { goalId: payload.goalId, week: payload.week, adjustment, previousOutcome: existing?.previousOutcome ?? 'undecided' });
        return { goalId: payload.goalId };
      }
    }
  }

  run(command: Command, input: Record<string, unknown>, now: string): unknown {
    if (command === 'agent.change.undo') return this.editor().undo(input, now);
    const proposal = this.records().agentProposals.find(p => p.id === v.id(input.id));
    if (!proposal) throw new Error('Esta proposta não existe mais.');
    if (proposal.status === 'applied' || proposal.status === 'rejected') throw new Error('Esta proposta já foi decidida.');
    if (command === 'agent.proposal.reject') { this.store.putGoalRecord('agentProposals', { ...proposal, status: 'rejected', decidedAt: now }); return; }
    if (command !== 'agent.proposal.apply') throw new Error('Este comando não está disponível.');
    // The user may edit the proposal before applying it; the edited result is checked like a new proposal and kept as the audit record.
    const { payload } = this.payload(proposal.kind, { ...proposal.payload, ...(input.edits === undefined ? {} : v.object(input.edits)) }, now);
    if (proposal.kind === 'roadmap.replace' && proposal.basis !== this.roadmapSignature(String(payload.goalId)) && input.confirmStale !== true) {
      if (proposal.status !== 'stale') this.store.putGoalRecord('agentProposals', { ...proposal, status: 'stale' });
      return { stale: true };
    }
    let result: unknown;
    this.store.db.transaction(() => { result = this.apply(proposal, payload, now); this.store.putGoalRecord('agentProposals', validateGoalRecord('agentProposals', { ...proposal, payload, status: 'applied', decidedAt: now }) as AgentProposal); })();
    return result;
  }
}
