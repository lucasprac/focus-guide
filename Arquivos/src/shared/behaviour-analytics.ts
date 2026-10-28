import { ACTIVITY_MODES, type ActivityMode, type ActivitySample, type Dataset } from './types';
import { goalData, type GoalBarrier } from './goal-types';
import { correlation, localDay, median, mean, parts, selectedSessions } from './analytics';
import { plannedOccurrences } from './goal-planning';

/* Descriptive summaries of the sessions linked to one goal. The renderer and the local agent bridge
   use the same rules, so both describe the same records. Nothing here scores attention or productivity. */
export const TIME_BANDS = [{ label: 'Madrugada · 00–06', from: 0, to: 6 }, { label: 'Manhã · 06–12', from: 6, to: 12 }, { label: 'Tarde · 12–18', from: 12, to: 18 }, { label: 'Noite · 18–24', from: 18, to: 24 }] as const;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const BEHAVIOUR_LIMITS_NOTE = 'Resumo descritivo das sessões concluídas e incluídas vinculadas a esta meta. As contagens de teclado e mouse e os retornos registrados são contexto, não medidas de atenção. Associações não estabelecem causas, e relatos ausentes permanecem desconhecidos.';

export interface ModeActivity { mode: ActivityMode; sessions: number; minutes: number; observedMinutes: number; coverage: number | null; keysPerMinute: number | null; clicksPerMinute: number | null; scrollsPerMinute: number | null; movementShare: number | null }
export interface CorrelationSummary { n: number; spanDays: number; rho: number | null; eligible: boolean; reason: string }
export interface GoalBehaviourProfile {
  goalId: string; from: string; to: string;
  sessions: number; minutes: number; activeDays: number; medianSessionMinutes: number | null;
  byWeekday: Array<{ label: string; minutes: number }>; byTimeBand: Array<{ label: string; minutes: number }>;
  byMode: ModeActivity[]; byMilestone: Array<{ milestoneId: string | null; title: string; minutes: number; sessions: number }>;
  interruptions: number; interruptionsPerHour: number | null; interruptionCategories: Record<string, number>;
  returns: number; returnsPerHour: number | null; parkedThoughts: number;
  focus: { rated: number; mean: number | null; median: number | null }; energy: { rated: number; mean: number | null };
  checkIns: { done: number; smaller: number; skipped: number; unrecorded: number; barriers: Record<GoalBarrier, number> };
  energyFocus: CorrelationSummary; durationFocus: CorrelationSummary;
  note: string;
}
const perMinute = (count: number, observedMs: number) => observedMs > 0 ? count / (observedMs / 60000) : null;
const summary = (result: ReturnType<typeof correlation>): CorrelationSummary => ({ n: result.n, spanDays: result.spanDays, rho: result.rho, eligible: result.eligible, reason: result.reason });

/* `activity` holds the samples of the selected sessions; other samples are ignored. */
export function goalBehaviourProfile(data: Dataset, activity: ActivitySample[], goalId: string, from: string, to: string, now = Date.now()): GoalBehaviourProfile {
  const sessions = selectedSessions(data, from, to, '', goalId), ids = new Set(sessions.map(s => s.id));
  const minutes = sessions.reduce((sum, s) => sum + s.activeMs / 60000, 0), hours = minutes / 60;
  const events = data.events.filter(e => ids.has(e.sessionId));
  const interruptions = events.filter(e => e.kind === 'interruption'), returns = events.filter(e => e.kind === 'attention-return');
  const interruptionCategories: Record<string, number> = {};
  for (const e of interruptions) interruptionCategories[e.category || 'Unspecified'] = (interruptionCategories[e.category || 'Unspecified'] ?? 0) + 1;
  const samples = activity.filter(a => ids.has(a.sessionId) && a.status === 'recorded'), modeOf = new Map(sessions.map(s => [s.id, s.activityMode ?? 'Unspecified']));
  const byMode = ACTIVITY_MODES.map(mode => {
    const rows = sessions.filter(s => (s.activityMode ?? 'Unspecified') === mode), recorded = samples.filter(a => modeOf.get(a.sessionId) === mode);
    const activeMs = rows.reduce((sum, s) => sum + s.activeMs, 0), observedMs = recorded.reduce((sum, a) => sum + a.observedMs, 0);
    const inputObserved = recorded.filter(a => typeof a.inputMs === 'number').reduce((sum, a) => sum + a.observedMs, 0), switchObserved = recorded.filter(a => typeof a.switches === 'number').reduce((sum, a) => sum + a.observedMs, 0);
    return { mode, sessions: rows.length, minutes: activeMs / 60000, observedMinutes: observedMs / 60000, coverage: activeMs > 0 ? Math.min(1, observedMs / activeMs) : null,
      keysPerMinute: perMinute(recorded.reduce((sum, a) => sum + a.keys, 0), observedMs), clicksPerMinute: perMinute(recorded.reduce((sum, a) => sum + a.clicks, 0), observedMs),
      scrollsPerMinute: perMinute(recorded.reduce((sum, a) => sum + a.scrolls, 0), observedMs), movementShare: observedMs > 0 ? Math.min(1, recorded.reduce((sum, a) => sum + a.movementMs, 0) / observedMs) : null,
      inputShare: inputObserved > 0 ? Math.min(1, recorded.reduce((sum, a) => sum + (typeof a.inputMs === 'number' ? a.inputMs : 0), 0) / inputObserved) : null,
      switchesPerMinute: perMinute(recorded.reduce((sum, a) => sum + (typeof a.switches === 'number' ? a.switches : 0), 0), switchObserved) };
  }).filter(row => row.sessions > 0);
  const milestones = goalData(data).milestones, steps = new Map<string | null, { minutes: number; sessions: number }>();
  for (const s of sessions) { const key = s.milestoneId ?? null, row = steps.get(key) ?? { minutes: 0, sessions: 0 }; row.minutes += s.activeMs / 60000; row.sessions++; steps.set(key, row); }
  const occurrences = plannedOccurrences(data, from, to, goalId, now).filter(o => o.date <= localDay(now, o.plan.timezone));
  const barriers: Record<GoalBarrier, number> = { capability: 0, opportunity: 0, motivation: 0, other: 0 };
  for (const o of occurrences) if (o.barrier) barriers[o.barrier]++;
  const focus = sessions.filter(s => s.focus !== null).map(s => s.focus!), energy = sessions.filter(s => s.energy !== null).map(s => s.energy!);
  return {
    goalId, from, to, sessions: sessions.length, minutes, activeDays: new Set(sessions.map(s => localDay(s.startedAt, s.timezone))).size,
    medianSessionMinutes: median(sessions.map(s => s.activeMs / 60000)),
    byWeekday: WEEKDAYS.map(label => ({ label, minutes: sessions.filter(s => parts(s.startedAt, s.timezone).weekday === label).reduce((sum, s) => sum + s.activeMs / 60000, 0) })),
    byTimeBand: TIME_BANDS.map(band => ({ label: band.label, minutes: sessions.filter(s => { const hour = parts(s.startedAt, s.timezone).hour; return hour >= band.from && hour < band.to; }).reduce((sum, s) => sum + s.activeMs / 60000, 0) })),
    byMode, byMilestone: [...steps].map(([milestoneId, row]) => ({ milestoneId, title: milestoneId ? milestones.find(m => m.id === milestoneId)?.title ?? 'Etapa removida' : 'Sem etapa do roteiro', ...row })).sort((a, b) => b.minutes - a.minutes),
    interruptions: interruptions.length, interruptionsPerHour: hours > 0 ? interruptions.length / hours : null, interruptionCategories,
    returns: returns.length, returnsPerHour: hours > 0 ? returns.length / hours : null, parkedThoughts: events.filter(e => e.kind === 'thought').length,
    focus: { rated: focus.length, mean: mean(focus), median: median(focus) }, energy: { rated: energy.length, mean: mean(energy) },
    checkIns: { done: occurrences.filter(o => o.status === 'done').length, smaller: occurrences.filter(o => o.status === 'smaller').length, skipped: occurrences.filter(o => o.status === 'skipped').length, unrecorded: occurrences.filter(o => o.status === 'unrecorded').length, barriers },
    energyFocus: summary(correlation(sessions, 'energy')), durationFocus: summary(correlation(sessions, 'duration')),
    note: BEHAVIOUR_LIMITS_NOTE
  };
}
