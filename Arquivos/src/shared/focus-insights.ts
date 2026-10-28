import { ACTIVITY_MODES, CHALLENGES, DETRACTORS, PROBE_ANSWERS, type ActivityMode, type ActivitySample, type Challenge, type Dataset, type Detractor, type FocusSession, type ProbeAnswer, type SessionEvent } from './types';
import { addDays, localDay, mean, median, monday, parts, selectedSessions, spearman } from './analytics';
import { TIME_BANDS, WEEKDAYS } from './behaviour-analytics';
import { durationSuggestion } from './goal-planning';
import { goalData } from './goal-types';
import { activityModeLabel } from './labels';
import { Z90, collinearity, differenceInterval, kMeans, kaplanMeier, meanInterval, mulberry32, penalizedFit, penalizedSelect, quantile, ridgeFit, ridgeSelect, silhouettes, t90, zUpper } from './insight-stats';
import { t, type Language } from './i18n';

/* Personal insight engine: processing rules, analyses and suggestions over the selected sessions.
   The main process runs it for `insights.read`; the renderer runs it for the example dataset. It is pure
   and deterministic. Drift = an attention-return or an interruption; probe answers count only as offTaskShare. */
export const insightsLimitsNote = () => t('Patterns in your own records, with intervals that show their uncertainty. Self-ratings and markers describe what you reported; they are not measures of attention. You choose when to focus, so associations do not establish causes. Missing reports stay unknown.');
export const DETRACTOR_LABELS: Record<Detractor, string> = { get none() { return t('Nothing notable'); }, get notifications() { return t('Phone or notifications'); }, get people() { return t('People or noise'); }, get thoughts() { return t('Wandering thoughts'); }, get tiredness() { return t('Tiredness or hunger'); }, get task() { return t('Unclear or too hard task'); }, get other() { return t('Something else'); } };
export const CHALLENGE_LABELS: Record<Challenge, string> = { get 'too-easy'() { return t('Too easy'); }, get right() { return t('About right'); }, get 'too-hard'() { return t('Too hard'); } };
export const PROBE_ANSWER_LABELS: Record<ProbeAnswer, string> = { get 'on-task'() { return t('On the task'); }, get drifting() { return t('Drifting'); }, get elsewhere() { return t('Somewhere else'); } };
/* Processing rules, eligibility and suggestion thresholds of the design (sections 6, 7 and 12). focusGap: the smallest mean-focus difference a window, detractor or challenge suggestion reports. */
export const INSIGHT_THRESHOLDS = {
  longSessionMs: 8 * 3600000, minObservedMs: 30000, returnVersion: 3, inputVersion: 4,
  rhythm: { ratedSessions: 10, bandwidthHours: 1.5, hourWeight: 3, cellSessions: 3 },
  /* warmUpMinutes and fatigueMinutes cut a session into warm-up (before), sustain (between) and fatigue (from). A recovery interval is censored
     when at least recoveryCensorMs of active time follow the last drift. Warm-up friction: at least warmupDrifts drifts in the warm-up phase and a rate of warmupRatio times the sustain rate. */
  attentionSpan: { sessions: 15, events: 8, groupSessions: 8, groupEvents: 4, warmUpMinutes: 10, fatigueMinutes: 25, recoveryEvents: 8, recoveryCensorMs: 60000, phaseSessions: 5, warmupDrifts: 5, warmupRatio: 1.5 },
  sessionShape: { sessions: 10, blockMinutes: 5, maxMinutes: 120, blockSessions: 5, preDriftMinutes: 2, preDriftEvents: 8 },
  states: { minutes: 300, sessions: 5, minK: 2, maxK: 5, starts: 4, trainMinutes: 5000, silhouettePoints: 1500, quietInputShare: 0.15, fragmentationPairs: 10, switchCoverage: 0.8, driftMinutes: 30 },
  detractors: { sessions: 10, meanSessions: 3 },
  correlation: { pairs: 20, spanDays: 7 },
  /* collinearR and collinearVif flag collinear features; below stableOverlap (mean Jaccard overlap of the selected sets of neighbouring windows) a selection is unstable. */
  model: { ratedSessions: 30, spanDays: 14, testPoints: 10, maxTestPoints: 40, minTrainSessions: 20, usefulGain: 0.05, bootstrap: 200, modeSessions: 5, gapCapHours: 24, lambdaPerRow: [0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10], elasticAlpha: 0.5, collinearR: 0.7, collinearVif: 5, stableOverlap: 0.6, selectedAbove: 1e-6, factorValues: 10 },
  cycle: { recentDays: 7, baselineDays: 28, recentSessions: 3, baselineSessions: 5, spanEvents: 3 },
  suggestions: { max: 5, windowSessions: 5, focusGap: 0.3, lengthStep: 5, lengthMinimum: 15, breakEarlyMinutes: 20, breakAheadMinutes: 15, breakSessions: 5, breakRatio: 1.5, breakDrifts: 8, switchingRho: -0.3, comparisonSessions: 3, ratedShare: 0.6, activityCoverage: 0.5, markerShare: 0.2 },
  duration: { days: 90, recordedSessions: 10, recordedDays: 14, recordedWindowDays: 28 }
} as const;

export interface Eligibility { eligible: boolean; n: number; reason: string }
/* A 90 % interval. */
export interface Interval { estimate: number; low: number; high: number }
export interface DataQuality {
  sessions: number; activeMinutes: number; spanDays: number;
  ratedShare: number | null; reflectionShare: number | null;
  /* Observed time divided by active time, for sessions with behaviourVersion >= 3. */
  activityCoverage: number | null;
  markerSessions: number; probeSessions: number; probeAnswered: number; probeMissed: number;
  droppedLong: number; droppedRecovered: number; notes: string[];
}
export interface HourPoint { hour: number; weight: number; focus: Interval | null; driftPerHour: number | null; switchesPerHour: number | null; offTaskShare: number | null }
export interface RhythmSection extends Eligibility {
  hours: HourPoint[];
  grid: Array<{ weekday: string; band: string; sessions: number; focusMean: number | null; driftPerHour: number | null }>;
}
export interface SurvivalCurve {
  label: string; sessions: number; events: number; median: Interval | null;
  points: Array<{ minute: number; survival: number; low: number; high: number; atRisk: number }>;
  /* True when the upper band never falls to one half: the median's upper limit is then open, and median.high is only the last observed time. */
  medianOpen?: boolean;
}
/* One phase of a session: warm-up (first minutes), sustain, fatigue (from fatigueMinutes on). toMinute is null for the open last phase. */
export interface PhaseRate {
  id: 'warm-up' | 'sustain' | 'fatigue'; label: string; fromMinute: number; toMinute: number | null;
  sessions: number; exposureHours: number; drifts: number; driftPerHour: number | null; offTaskShare: number | null;
}
export interface AttentionSpanSection extends Eligibility {
  /* The curve to the first drift of each session, the primary reference. */
  overall: SurvivalCurve | null;
  /* Active time between a return and the next drift, over all returns; censored by the end of the session. */
  recovery: SurvivalCurve | null;
  phases: PhaseRate[];
  /* True when drifts cluster in the warm-up phase: the first-drift median then mostly measures the start, not the length of a block. */
  warmUpFriction: boolean;
  /* With warm-up friction: the curve to the first drift after the warm-up, among sessions that lasted past it. */
  afterWarmUp: SurvivalCurve | null;
  byBand: SurvivalCurve[]; byMode: SurvivalCurve[];
}
/* The minutes just before drifts, against the other observed minutes of the same sessions. */
export interface PreDrift {
  eligible: boolean; drifts: number; windowMinutes: number;
  preSwitchesPerMinute: number | null; baselineSwitchesPerMinute: number | null; preInputShare: number | null; baselineInputShare: number | null; reason: string;
}
export interface SessionShapeSection extends Eligibility {
  points: Array<{ minute: number; sessions: number; inputShare: number | null; switchesPerMinute: number | null; driftPerHour: number | null; offTaskShare: number | null }>;
  preDrift: PreDrift;
}
export interface InteractionState {
  id: number; label: string; share: number;
  centroid: { inputShare: number; keysPerMinute: number; clicksPerMinute: number; scrollsPerMinute: number; movementShare: number; switchesPerMinute: number | null };
  /* Drifts that fell in minutes of this state, per observed hour; null below driftMinutes of observed time. */
  driftPerHour: number | null;
}
export interface StatesSection extends Eligibility {
  k: number; silhouette: number | null; states: InteractionState[];
  byMode: Array<{ mode: ActivityMode; minutes: number; shares: number[] }>;
  fragmentation: { perHourMedian: number | null; focusRho: number | null; pairs: number; reason: string };
}
export interface DetractorsSection extends Eligibility {
  reported: Array<{ detractor: Detractor; sessions: number; focusMean: number | null }>;
  interruptions: Array<{ category: string; count: number; perHour: number | null }>;
  byBand: Array<{ band: string; driftPerHour: number | null; switchesPerHour: number | null; offTaskShare: number | null }>;
  switching: { perHourMedian: number | null; focusRho: number | null; pairs: number; reason: string };
  challenge: Array<{ challenge: Challenge; sessions: number; focusMean: number | null }>;
}
/* Effect on perceived focus for one standard deviation of the feature, or against the reference category. */
export interface ModelFeature {
  name: string; label: string; effect: Interval;
  /* Lasso: whether the final fit keeps the feature, and the share of rolling-origin windows (selectionShare) and of bootstrap resamples (bootstrapShare) that keep it. */
  selected: boolean; selectionShare: number | null; bootstrapShare: number | null;
  vif: number | null;
}
export type ModelEstimator = 'ridge' | 'lasso' | 'elastic-net';
export interface ModelCandidate { id: ModelEstimator; label: string; mae: number; /* Mean overlap of the selected features of neighbouring windows; null for ridge, which keeps every feature. */ stability: number | null }
export interface ModelDiagnostics { maxVif: number | null; maxCorrelation: number | null; collinear: boolean; pairs: Array<{ a: string; b: string; r: number }> }
export interface ModelView extends Eligibility {
  useful: boolean; trainedOn: number; tested: number; lambda: number | null;
  mae: number | null; baselineMae: number | null; features: ModelFeature[];
  estimator: ModelEstimator | null; candidates: ModelCandidate[]; diagnostics: ModelDiagnostics | null;
  /* Labels of the features the lasso set to zero. */
  zeroed: string[];
  /* Why this estimator, in one sentence. */
  decision: string;
}
/* `sessionFactors` explains the rating by what happened during and after the session; it does not predict, because those facts are not known in advance. */
export interface FocusModelSection extends ModelView { sessionFactors: ModelView }
export interface CycleMetric { id: 'focus' | 'drift' | 'span' | 'switches'; label: string; unit: string; recent: number | null; baseline: number | null; delta: number | null; improved: boolean | null }
export interface WeeklyAdjustment { week: string; text: string }
export interface CycleComparisonSection extends Eligibility {
  recent: { from: string; to: string; sessions: number }; baseline: { from: string; to: string; sessions: number };
  metrics: CycleMetric[];
  adjustments: { thisWeek: WeeklyAdjustment | null; previousWeek: WeeklyAdjustment | null };
}
export interface Recommendation {
  id: string; kind: 'window' | 'length' | 'warmup' | 'break' | 'detractor' | 'switching' | 'challenge' | 'data';
  title: string; detail: string; evidence: string; strength: 'tentative' | 'moderate';
  /* Only on 'length' and 'break': the suggested session length, or the minute of the pause. */
  minutes?: number;
}
export interface FocusInsights {
  from: string; to: string; computedAt: string; quality: DataQuality;
  rhythm: RhythmSection; attentionSpan: AttentionSpanSection; sessionShape: SessionShapeSection;
  states: StatesSection; detractors: DetractorsSection; model: FocusModelSection; cycleComparison: CycleComparisonSection;
  recommendations: Recommendation[]; note: string;
}
/* language: the language of the generated texts; the worker thread has its own i18n state and sets it from here. */
export interface InsightOptions { from: string; to: string; fieldId?: string; goalId?: string; now?: number; language?: Language }

const T = INSIGHT_THRESHOLDS;
const known = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
/* The word counted by plural(): "1 session", "2 sessions". Another language translates the singular|plural pair. */
function pluralWord(word: string, count: number): string {
  switch (word) {
    case 'session': return t('session|sessions', { count });
    case 'rated session': return t('rated session|rated sessions', { count });
    case 'later session': return t('later session|later sessions', { count });
    case 'drift': return t('drift|drifts', { count });
    case 'marker': return t('marker|markers', { count });
    case 'minute': return t('minute|minutes', { count });
    case 'day': return t('day|days', { count });
    case 'hour': return t('hour|hours', { count });
    default: return count === 1 ? word : `${word}s`;
  }
}
export const plural = (n: number, word: string) => `${n} ${pluralWord(word, n)}`;
const one = (v: number) => v.toFixed(1), whole = (v: number) => String(Math.round(v)), percent = (v: number) => `${Math.round(v * 100)}%`;
const spanOf = (days: string[]) => { if (!days.length) return 0; const sorted = [...days].sort(); return Math.round((Date.parse(sorted[sorted.length - 1]) - Date.parse(sorted[0])) / 86400000) + 1; };
function push<K, V>(map: Map<K, V[]>, key: K, value: V): void { const rows = map.get(key); if (rows) rows.push(value); else map.set(key, [value]); }

/* One analysed session: local start, drift markers and probe answers inside its active time, and its recorded activity rows. */
interface Facts {
  s: FocusSession; version: number; hour: number; weekday: string; day: string; band: number; mode: ActivityMode; hours: number;
  drifts: number[]; interruptions: string[]; probes: Array<{ offset: number; offTask: boolean }>; offTask: number; missed: number; rows: ActivitySample[];
  observedMs: number; inputMs: number; inputObservedMs: number; switches: number; switchObservedMs: number;
}
interface Block { minute: number; sessions: number; exposureMinutes: number; drifts: number; input: number; inputObserved: number; switches: number; switchObserved: number; answered: number; offTask: number }
const ratingsOf = (rows: Facts[]) => rows.filter(f => f.s.focus !== null).map(f => f.s.focus!);

function collect(data: Dataset, activity: ActivitySample[], sessions: FocusSession[]): { facts: Facts[]; droppedMarkers: number } {
  const ids = new Set(sessions.map(s => s.id)), intervals = new Map<string, Array<{ start: number; ms: number }>>(), markers = new Map<string, SessionEvent[]>(), rows = new Map<string, ActivitySample[]>();
  for (const e of data.events) if (ids.has(e.sessionId)) {
    if (e.kind === 'active') push(intervals, e.sessionId, { start: Date.parse(e.startedAt), ms: e.durationMs });
    else if (e.kind === 'attention-return' || e.kind === 'interruption' || e.kind === 'probe') push(markers, e.sessionId, e);
  }
  for (const a of activity) if (ids.has(a.sessionId) && a.status === 'recorded') push(rows, a.sessionId, a);
  let droppedMarkers = 0;
  const facts = sessions.map(s => {
    const p = parts(s.startedAt, s.timezone), version = s.behaviourVersion ?? 0, own = (intervals.get(s.id) ?? []).sort((a, b) => a.start - b.start), started = Date.parse(s.startedAt);
    // Older markers have no offset: it is the active time before the marker, from the session's active intervals.
    const offsetOf = (e: SessionEvent) => {
      if (known(e.activeOffsetMs)) return e.activeOffsetMs;
      const at = Date.parse(e.startedAt); if (!own.length) return at - started;
      let offset = 0; for (const i of own) { if (i.start >= at) break; offset += Math.min(i.ms, at - i.start); } return offset;
    };
    const f: Facts = { s, version, hour: p.hour, weekday: p.weekday, day: p.day, band: TIME_BANDS.findIndex(b => p.hour >= b.from && p.hour < b.to), mode: s.activityMode ?? 'Unspecified', hours: s.activeMs / 3600000,
      drifts: [], interruptions: [], probes: [], offTask: 0, missed: 0, rows: (rows.get(s.id) ?? []).sort((a, b) => a.startMs - b.startMs), observedMs: 0, inputMs: 0, inputObservedMs: 0, switches: 0, switchObservedMs: 0 };
    for (const e of markers.get(s.id) ?? []) {
      const offset = offsetOf(e);
      if (!(offset >= 0 && offset <= s.activeMs)) { droppedMarkers++; continue; }
      if (e.kind !== 'probe') { f.drifts.push(offset); if (e.kind === 'interruption') f.interruptions.push(e.category || 'Unspecified'); }
      else if (e.category === 'missed') f.missed++;
      else if ((PROBE_ANSWERS as readonly string[]).includes(e.category)) { const offTask = e.category !== 'on-task'; f.probes.push({ offset, offTask }); if (offTask) f.offTask++; }
    }
    f.drifts.sort((a, b) => a - b);
    const measured = version >= T.inputVersion;
    for (const a of f.rows) {
      f.observedMs += a.observedMs;
      if (measured && known(a.inputMs)) { f.inputMs += a.inputMs; f.inputObservedMs += a.observedMs; }
      if (measured && known(a.switches)) { f.switches += a.switches; f.switchObservedMs += a.observedMs; }
    }
    return f;
  });
  return { facts, droppedMarkers };
}

function qualityOf(facts: Facts[], droppedLong: number, droppedMarkers: number): DataQuality {
  const n = facts.length, current = facts.filter(f => f.version >= T.returnVersion), activeMs = current.reduce((sum, f) => sum + f.s.activeMs, 0);
  const old = n - current.length, recovered = facts.filter(f => f.s.recovered).length, probeSessions = facts.filter(f => f.probes.length || f.missed).length;
  let short = 0, unmeasured = 0;
  for (const f of facts) for (const a of f.rows) if (a.observedMs < T.minObservedMs) short++; else if (f.version < T.inputVersion || !known(a.inputMs)) unmeasured++;
  const notes = [
    droppedLong ? t('Sessions longer than {v1} active hours are left out ({plural}).', { v1: T.longSessionMs / 3600000, plural: plural(droppedLong, 'session') }) : '',
    recovered ? t('Recovered sessions are left out of attention span and session shape ({plural}).', { plural: plural(recovered, 'session') }) : '',
    old ? t('Sessions recorded before I\'m back existed are left out of drift rates, attention span and session shape; their interruptions still count by category ({plural}).', { plural: plural(old, 'session') }) : '',
    droppedMarkers ? t('Markers after the end of their session are left out ({plural}).', { plural: plural(droppedMarkers, 'marker') }) : '',
    short ? t('Activity minutes with less than {v1} s observed are left out of interaction states ({plural}).', { v1: T.minObservedMs / 1000, plural: plural(short, 'minute') }) : '',
    unmeasured ? t('Activity minutes recorded before input time existed are left out of interaction states ({plural}).', { plural: plural(unmeasured, 'minute') }) : '',
    probeSessions ? t('{plural} had attention check-ins, which also interrupt a little.', { plural: plural(probeSessions, 'session') }) : ''
  ].filter(Boolean);
  return { sessions: n, activeMinutes: facts.reduce((sum, f) => sum + f.s.activeMs, 0) / 60000, spanDays: spanOf(facts.map(f => f.day)),
    ratedShare: n ? ratingsOf(facts).length / n : null, reflectionShare: n ? facts.filter(f => f.s.detractor != null || f.s.challenge != null).length / n : null,
    activityCoverage: activeMs > 0 ? Math.min(1, current.reduce((sum, f) => sum + f.observedMs, 0) / activeMs) : null,
    markerSessions: facts.filter(f => f.drifts.length).length, probeSessions, probeAnswered: facts.reduce((sum, f) => sum + f.probes.length, 0), probeMissed: facts.reduce((sum, f) => sum + f.missed, 0),
    droppedLong, droppedRecovered: recovered, notes };
}

/* Drift needs I'm back (Voltei, version 3); switches and probe shares count only sessions that have them. Each rate needs `minimum` such sessions. */
function ratesOf(rows: Facts[], minimum: number): { driftPerHour: number | null; switchesPerHour: number | null; offTaskShare: number | null } {
  const drift = rows.filter(f => f.version >= T.returnVersion), switching = rows.filter(f => f.switchObservedMs > 0), probed = rows.filter(f => f.probes.length);
  const exposure = drift.reduce((sum, f) => sum + f.hours, 0), switchHours = switching.reduce((sum, f) => sum + f.switchObservedMs, 0) / 3600000;
  return { driftPerHour: drift.length >= minimum && exposure > 0 ? drift.reduce((sum, f) => sum + f.drifts.length, 0) / exposure : null,
    switchesPerHour: switching.length >= minimum && switchHours > 0 ? switching.reduce((sum, f) => sum + f.switches, 0) / switchHours : null,
    offTaskShare: probed.length >= minimum ? probed.reduce((sum, f) => sum + f.offTask, 0) / probed.reduce((sum, f) => sum + f.probes.length, 0) : null };
}

function rhythmSection(facts: Facts[]): RhythmSection {
  const R = T.rhythm, rated = ratingsOf(facts).length;
  if (rated < R.ratedSessions) return { eligible: false, n: rated, reason: t('Rate at least {ratedSessions} sessions to see when you focus best ({rated} so far).', { ratedSessions: R.ratedSessions, rated }), hours: [], grid: [] };
  const kernel = (a: number, b: number) => { const d = Math.abs(a - b), c = Math.min(d, 24 - d); return Math.exp(-c * c / (2 * R.bandwidthHours ** 2)); };
  const hours = Array.from({ length: 24 }, (_, hour): HourPoint => {
    let w = 0, w2 = 0, wy = 0, wy2 = 0, dw = 0, drifts = 0, exposure = 0, sw = 0, switches = 0, switchHours = 0, pw = 0, offTask = 0, answered = 0;
    for (const f of facts) {
      const k = kernel(hour, f.hour), focus = f.s.focus;
      if (focus !== null) { w += k; w2 += k * k; wy += k * focus; wy2 += k * focus * focus; }
      if (f.version >= T.returnVersion) { dw += k; drifts += k * f.drifts.length; exposure += k * f.hours; }
      if (f.switchObservedMs > 0) { sw += k; switches += k * f.switches; switchHours += k * f.switchObservedMs / 3600000; }
      if (f.probes.length) { pw += k; offTask += k * f.offTask; answered += k * f.probes.length; }
    }
    let focus: Interval | null = null;
    if (w >= R.hourWeight) {
      // Weighted mean; its standard error uses the effective sample size (sum w)² / sum w².
      const m = wy / w, effective = w * w / w2, half = t90(effective - 1) * Math.sqrt(Math.max(0, wy2 / w - m * m) / Math.max(1, effective - 1));
      focus = { estimate: m, low: Math.max(1, m - half), high: Math.min(5, m + half) };
    }
    return { hour, weight: w, focus, driftPerHour: dw >= R.hourWeight && exposure > 0 ? drifts / exposure : null, switchesPerHour: sw >= R.hourWeight && switchHours > 0 ? switches / switchHours : null, offTaskShare: pw >= R.hourWeight && answered > 0 ? offTask / answered : null };
  });
  const grid = WEEKDAYS.flatMap(weekday => TIME_BANDS.map((band, b) => {
    const cell = facts.filter(f => f.weekday === weekday && f.band === b), ratings = ratingsOf(cell);
    return { weekday, band: band.label, sessions: cell.length, focusMean: ratings.length >= R.cellSessions ? mean(ratings) : null, driftPerHour: ratesOf(cell, R.cellSessions).driftPerHour };
  }));
  return { eligible: true, n: rated, reason: t('Perceived focus by start hour, smoothed over about {bandwidthHours} hours, with 90% intervals. An hour appears when nearby sessions weigh at least {hourWeight}; a grid cell needs {cellSessions} sessions.', { bandwidthHours: R.bandwidthHours, hourWeight: R.hourWeight, cellSessions: R.cellSessions }), hours, grid };
}

/* Kaplan–Meier curve of active minutes to an event; `sessions` is the number of sessions the times come from. */
function survivalOf(label: string, times: Array<{ time: number; event: boolean }>, sessions: number): SurvivalCurve {
  const km = kaplanMeier(times), points: SurvivalCurve['points'] = [];
  // One point per minute: the survival after that minute's last drift, with the number at risk before its first.
  let bucket = -1;
  for (const [i, p] of km.points.entries()) {
    const key = i ? Math.floor(p.time) : -1, last = points[points.length - 1];
    if (last && key === bucket) Object.assign(last, { survival: p.survival, low: p.low, high: p.high });
    else { points.push({ minute: p.time, survival: p.survival, low: p.low, high: p.high, atRisk: p.atRisk }); bucket = key; }
  }
  const end = Math.max(...times.map(tk => tk.time)), last = points[points.length - 1];
  if (end > last.minute) points.push({ ...last, minute: end, atRisk: times.filter(tk => tk.time >= end).length });
  return { label, sessions, events: times.filter(tk => tk.event).length, median: km.median, medianOpen: !km.points.some(p => p.high <= 0.5), points };
}
const survivalCurve = (label: string, rows: Facts[]) => survivalOf(label, rows.map(f => ({ time: (f.drifts[0] ?? f.s.activeMs) / 60000, event: f.drifts.length > 0 })), rows.length);

/* Warm-up, sustain and fatigue: drifts and off-task check-ins over the active time each phase covers. A rate needs phaseSessions sessions that reached the phase. */
function phasesOf(base: Facts[]): PhaseRate[] {
  const A = T.attentionSpan, cuts = [0, A.warmUpMinutes, A.fatigueMinutes], defs = [{ id: 'warm-up', label: t('Warm-up') }, { id: 'sustain', label: t('Sustain') }, { id: 'fatigue', label: t('Fatigue') }] as const;
  return defs.map((def, i): PhaseRate => {
    const from = cuts[i] * 60000, to = i < 2 ? cuts[i + 1] * 60000 : Infinity;
    let sessions = 0, exposureMs = 0, drifts = 0, answered = 0, offTask = 0;
    for (const f of base) {
      if (f.s.activeMs <= from) continue;
      sessions++; exposureMs += Math.min(f.s.activeMs, to) - from;
      for (const d of f.drifts) if (d >= from && d < to) drifts++;
      for (const p of f.probes) if (p.offset >= from && p.offset < to) { answered++; if (p.offTask) offTask++; }
    }
    const hours = exposureMs / 3600000;
    return { id: def.id, label: def.label, fromMinute: cuts[i], toMinute: i < 2 ? cuts[i + 1] : null, sessions, exposureHours: hours, drifts, driftPerHour: sessions >= A.phaseSessions && hours > 0 ? drifts / hours : null, offTaskShare: answered >= A.phaseSessions ? offTask / answered : null };
  });
}
/* Active time from a return to the next drift. The time after the last drift is censored once it lasts recoveryCensorMs. */
function recoveryTimes(base: Facts[]): Array<{ time: number; event: boolean }> {
  const out: Array<{ time: number; event: boolean }> = [];
  for (const f of base) {
    for (let k = 1; k < f.drifts.length; k++) out.push({ time: (f.drifts[k] - f.drifts[k - 1]) / 60000, event: true });
    const tail = f.drifts.length ? f.s.activeMs - f.drifts[f.drifts.length - 1] : 0;
    if (f.drifts.length && tail >= T.attentionSpan.recoveryCensorMs) out.push({ time: tail / 60000, event: false });
  }
  return out;
}
function attentionSpanSection(base: Facts[]): AttentionSpanSection {
  const A = T.attentionSpan, events = base.filter(f => f.drifts.length).length;
  if (base.length < A.sessions || events < A.events) return { eligible: false, n: base.length, reason: t('Needs {sessions} sessions recorded with I\'m back and {events} first drifts ({plural}, {plural2} so far).', { sessions: A.sessions, events: A.events, plural: plural(base.length, 'session'), plural2: plural(events, 'drift') }), overall: null, recovery: null, phases: [], warmUpFriction: false, afterWarmUp: null, byBand: [], byMode: [] };
  const group = (label: string, rows: Facts[]) => rows.length >= A.groupSessions && rows.filter(f => f.drifts.length).length >= A.groupEvents ? [survivalCurve(label, rows)] : [];
  const phases = phasesOf(base), [warm, sustain] = phases, warmUpFriction = warm.driftPerHour !== null && sustain.driftPerHour !== null && warm.drifts >= A.warmupDrifts && warm.driftPerHour >= A.warmupRatio * sustain.driftPerHour;
  const recovery = recoveryTimes(base), recoveryEvents = recovery.filter(r => r.event).length;
  // Past the warm-up, a drift before it is ignored: the clock still runs from the start of the session.
  const lasting = base.filter(f => f.s.activeMs > A.warmUpMinutes * 60000), afterWarmUp = warmUpFriction && lasting.length >= A.groupSessions
    ? survivalOf(t('After the warm-up'), lasting.map(f => { const first = f.drifts.find(d => d >= A.warmUpMinutes * 60000); return { time: (first ?? f.s.activeMs) / 60000, event: first !== undefined }; }), lasting.length) : null;
  return { eligible: true, n: base.length, reason: t('Active time until the first I\'m back or interruption. A session without one counts until it ends. Group curves need {groupSessions} sessions and {groupEvents} drifts.', { groupSessions: A.groupSessions, groupEvents: A.groupEvents }),
    overall: survivalCurve(t('All sessions'), base), recovery: recoveryEvents >= A.recoveryEvents ? survivalOf(t('After a return'), recovery, base.filter(f => f.drifts.length).length) : null, phases, warmUpFriction,
    afterWarmUp: afterWarmUp && afterWarmUp.events >= A.groupEvents ? afterWarmUp : null,
    byBand: TIME_BANDS.flatMap((band, b) => group(band.label, base.filter(f => f.band === b))), byMode: ACTIVITY_MODES.flatMap(mode => group(activityModeLabel(mode), base.filter(f => f.mode === mode))) };
}

function blocksOf(base: Facts[]): Block[] {
  const S = T.sessionShape, size = S.blockMinutes * 60000, blocks: Block[] = Array.from({ length: S.maxMinutes / S.blockMinutes }, (_, i) => ({ minute: i * S.blockMinutes, sessions: 0, exposureMinutes: 0, drifts: 0, input: 0, inputObserved: 0, switches: 0, switchObserved: 0, answered: 0, offTask: 0 }));
  const blockOf = (f: Facts, offset: number) => blocks[Math.floor(Math.min(offset, f.s.activeMs - 1) / size)];
  for (const f of base) {
    blocks.forEach((b, i) => { if (f.s.activeMs > i * size) { b.sessions++; b.exposureMinutes += (Math.min(f.s.activeMs, (i + 1) * size) - i * size) / 60000; } });
    for (const offset of f.drifts) { const b = blockOf(f, offset); if (b) b.drifts++; }
    for (const p of f.probes) { const b = blockOf(f, p.offset); if (b) { b.answered++; if (p.offTask) b.offTask++; } }
    if (f.version < T.inputVersion) continue;
    for (const a of f.rows) {
      const b = blocks[Math.floor(a.startMs / size)]; if (!b) continue;
      if (known(a.inputMs)) { b.input += a.inputMs; b.inputObserved += a.observedMs; }
      if (known(a.switches)) { b.switches += a.switches; b.switchObserved += a.observedMs; }
    }
  }
  return blocks;
}

/* The preDriftMinutes before each drift against the other observed minutes of the same sessions. Activity minutes are shared out in proportion to their overlap with a window. */
function preDriftOf(base: Facts[]): PreDrift {
  const S = T.sessionShape, window = S.preDriftMinutes * 60000, pre = { switches: 0, switchMs: 0, input: 0, inputMs: 0 }, rest = { switches: 0, switchMs: 0, input: 0, inputMs: 0 };
  let drifts = 0;
  for (const f of base) {
    if (f.version < T.inputVersion || !f.rows.length) continue;
    const windows: Array<[number, number]> = [];
    for (const d of f.drifts) {
      const low = Math.max(0, d - window);
      let observed = 0; for (const a of f.rows) { const length = a.endMs - a.startMs; if (length > 0) observed += a.observedMs * Math.max(0, Math.min(a.endMs, d) - Math.max(a.startMs, low)) / length; }
      if (observed < T.minObservedMs) continue;
      drifts++; const last = windows[windows.length - 1];
      if (last && low <= last[1]) last[1] = Math.max(last[1], d); else windows.push([low, d]);
    }
    for (const a of f.rows) {
      const length = a.endMs - a.startMs; if (length <= 0 || !windows.length) continue;
      let inside = 0; for (const [low, high] of windows) inside += Math.max(0, Math.min(a.endMs, high) - Math.max(a.startMs, low));
      const share = Math.min(1, inside / length);
      if (known(a.switches)) { pre.switches += a.switches * share; pre.switchMs += a.observedMs * share; rest.switches += a.switches * (1 - share); rest.switchMs += a.observedMs * (1 - share); }
      if (known(a.inputMs)) { pre.input += a.inputMs * share; pre.inputMs += a.observedMs * share; rest.input += a.inputMs * (1 - share); rest.inputMs += a.observedMs * (1 - share); }
    }
  }
  const per = (count: number, ms: number) => ms > 0 ? count / (ms / 60000) : null, share = (count: number, ms: number) => ms > 0 ? Math.min(1, count / ms) : null;
  if (drifts < S.preDriftEvents) return { eligible: false, drifts, windowMinutes: S.preDriftMinutes, preSwitchesPerMinute: null, baselineSwitchesPerMinute: null, preInputShare: null, baselineInputShare: null, reason: t('Needs {preDriftEvents} drifts with activity observed in the {preDriftMinutes} minutes before them ({drifts} so far).', { preDriftEvents: S.preDriftEvents, preDriftMinutes: S.preDriftMinutes, drifts }) };
  return { eligible: true, drifts, windowMinutes: S.preDriftMinutes, preSwitchesPerMinute: per(pre.switches, pre.switchMs), baselineSwitchesPerMinute: per(rest.switches, rest.switchMs), preInputShare: share(pre.input, pre.inputMs), baselineInputShare: share(rest.input, rest.inputMs),
    reason: t('The {preDriftMinutes} active minutes before {plural} against the other observed minutes of the same sessions.', { preDriftMinutes: S.preDriftMinutes, plural: plural(drifts, 'drift') }) };
}

function sessionShapeSection(base: Facts[], blocks: Block[]): SessionShapeSection {
  const S = T.sessionShape, withActivity = base.filter(f => f.rows.some(a => a.observedMs >= T.minObservedMs)).length;
  if (withActivity < S.sessions) return { eligible: false, n: withActivity, reason: t('Needs {sessions} sessions with activity collection on ({withActivity} so far).', { sessions: S.sessions, withActivity }), points: [], preDrift: preDriftOf([]) };
  return { eligible: true, n: withActivity, reason: t('Blocks of {blockMinutes} active minutes, up to {maxMinutes} minutes. A block appears while at least {blockSessions} sessions are still running.', { blockMinutes: S.blockMinutes, maxMinutes: S.maxMinutes, blockSessions: S.blockSessions }),
    points: blocks.filter(b => b.sessions >= S.blockSessions).map(b => ({ minute: b.minute, sessions: b.sessions, inputShare: b.inputObserved > 0 ? b.input / b.inputObserved : null, switchesPerMinute: b.switchObserved > 0 ? b.switches / (b.switchObserved / 60000) : null,
      driftPerHour: b.exposureMinutes > 0 ? b.drifts / (b.exposureMinutes / 60) : null, offTaskShare: b.answered ? b.offTask / b.answered : null })), preDrift: preDriftOf(base) };
}

function association(points: Array<{ x: number; y: number; day: string }>, what: string): { focusRho: number | null; pairs: number; reason: string } {
  const C = T.correlation, eligible = points.length >= C.pairs && spanOf(points.map(p => p.day)) >= C.spanDays, rho = eligible ? spearman(points.map(p => p.x), points.map(p => p.y)) : null;
  return { focusRho: rho, pairs: points.length, reason: !eligible ? t('Collect {pairs} rated sessions with {what} over at least {spanDays} days ({length} so far).', { pairs: C.pairs, what, spanDays: C.spanDays, length: points.length }) : rho === null ? t('No variation in one of these measures yet.') : t('Exploratory association in your recorded sessions.') };
}

const stateNames = () => [t('Typing'), t('Pointing and clicking'), t('Scrolling'), t('Moving the pointer'), t('Window switching')];
/* Also returns the state changes per hour of each session with long enough runs of activity minutes, for the session-factor model. */
function statesSection(facts: Facts[]): { section: StatesSection; changes: Map<Facts, number> } {
  const S = T.states, minutes: Array<{ f: Facts; a: ActivitySample; v: number[] }> = [];
  for (const f of facts) if (f.version >= T.inputVersion) for (const a of f.rows) if (a.observedMs >= T.minObservedMs && known(a.inputMs)) {
    const perMinute = 60000 / a.observedMs;
    minutes.push({ f, a, v: [Math.min(1, a.inputMs / a.observedMs), Math.log1p(a.keys * perMinute), Math.log1p(a.clicks * perMinute), Math.log1p(a.scrolls * perMinute), Math.min(1, a.movementMs / a.observedMs), known(a.switches) ? Math.log1p(a.switches * perMinute) : NaN] });
  }
  const sessions = new Set(minutes.map(m => m.f)).size, changes = new Map<Facts, number>();
  const unavailable = (reason: string) => ({ section: { eligible: false, n: minutes.length, reason, k: 0, silhouette: null, states: [], byMode: [], fragmentation: { perHourMedian: null, focusRho: null, pairs: 0, reason: t('Needs interaction states first.') } } satisfies StatesSection, changes });
  if (minutes.length < S.minutes || sessions < S.sessions) return unavailable(t('Needs {minutes} activity minutes with input time from {sessions} sessions ({plural} from {plural2} so far).', { minutes: S.minutes, sessions: S.sessions, plural: plural(minutes.length, 'minute'), plural2: plural(sessions, 'session') }));
  // Window switches join the clustering as a sixth column when most minutes have them; a minute without a count takes the mean.
  const dims = minutes.filter(m => !Number.isNaN(m.v[5])).length >= S.switchCoverage * minutes.length ? 6 : 5, columns = Array.from({ length: dims }, (_, j) => j);
  const present = (j: number) => minutes.filter(m => !Number.isNaN(m.v[j]));
  const means = columns.map(j => present(j).reduce((sum, m) => sum + m.v[j], 0) / present(j).length);
  const sds = columns.map(j => Math.sqrt(present(j).reduce((sum, x) => sum + (x.v[j] - means[j]) ** 2, 0) / present(j).length));
  const z = minutes.map(m => columns.map(j => sds[j] > 1e-9 && !Number.isNaN(m.v[j]) ? (m.v[j] - means[j]) / sds[j] : 0));
  // A seeded partial shuffle picks the training minutes; the silhouette uses the first of them.
  const random = mulberry32(42), order = minutes.map((_, i) => i), take = Math.min(order.length, S.trainMinutes);
  for (let i = 0; i < take; i++) { const j = i + Math.floor(random() * (order.length - i)); [order[i], order[j]] = [order[j], order[i]]; }
  const train = order.slice(0, take).map(i => z[i]), sample = train.slice(0, S.silhouettePoints);
  const fits: Array<{ centroids: number[][]; labels: number[] }> = [];
  for (let k = S.minK; k <= S.maxK; k++) {
    // One k-means++ start can stop in a poor local optimum; the start with the lowest within-state spread stays.
    let best: { centroids: number[][]; labels: number[]; spread: number } | null = null;
    for (let start = 0; start < S.starts; start++) {
      const fit = kMeans(train, k, random); if (fit.centroids.length < k) break;
      let spread = 0; train.forEach((v, i) => { const c = fit.centroids[fit.labels[i]]; for (let j = 0; j < v.length; j++) spread += (v[j] - c[j]) ** 2; });
      if (!best || spread < best.spread - 1e-9) best = { ...fit, spread };
    }
    if (!best) break; fits.push(best);
  }
  if (!fits.length) return unavailable(t('Your activity minutes are too similar to separate into states.'));
  // The silhouette picks k; on a tie the smaller k stays.
  const scores = silhouettes(sample, fits.map(fit => fit.labels.slice(0, sample.length))), chosen = scores.reduce((best, score, i) => score > scores[best] + 1e-9 ? i : best, 0);
  const best = { centroids: fits[chosen].centroids, score: scores[chosen] }, centroids = best.centroids, labels = z.map(v => { let pick = 0, low = Infinity; centroids.forEach((c, i) => { let d = 0; for (let j = 0; j < v.length; j++) d += (c[j] - v[j]) ** 2; if (d < low) { low = d; pick = i; } }); return pick; });
  const totals = centroids.map(() => ({ count: 0, observed: 0, input: 0, keys: 0, clicks: 0, scrolls: 0, movement: 0, switches: 0, switchObserved: 0, drifts: 0 }));
  minutes.forEach(({ a, f }, i) => {
    const tk = totals[labels[i]]; tk.count++; tk.observed += a.observedMs; tk.input += a.inputMs!; tk.keys += a.keys; tk.clicks += a.clicks; tk.scrolls += a.scrolls; tk.movement += a.movementMs;
    if (known(a.switches)) { tk.switches += a.switches; tk.switchObserved += a.observedMs; }
    for (const d of f.drifts) if (d >= a.startMs && d < a.endMs) tk.drifts++;
  });
  const rate = (count: number, ms: number) => count / (ms / 60000);
  // Names follow the design's rule: little input time is Quiet (Silêncio); input with every standardized count at or below the mean is Light interaction (Interação leve);
  // otherwise the largest standardized count above the mean names the state.
  const named = centroids.map((c, cluster) => ({ c, cluster, tk: totals[cluster] })).filter(x => x.tk.count).map(({ c, cluster, tk }) => {
    const inputShare = Math.min(1, tk.input / tk.observed), counts = c.slice(1), top = counts.reduce((a, b, j) => b > counts[a] ? j : a, 0);
    const name = inputShare < S.quietInputShare ? t('Quiet') : counts[top] <= 0 ? t('Light interaction') : stateNames()[top];
    return { cluster, name, share: tk.count / minutes.length, driftPerHour: tk.observed >= S.driftMinutes * 60000 ? tk.drifts / (tk.observed / 3600000) : null,
      centroid: { inputShare, keysPerMinute: rate(tk.keys, tk.observed), clicksPerMinute: rate(tk.clicks, tk.observed), scrollsPerMinute: rate(tk.scrolls, tk.observed), movementShare: Math.min(1, tk.movement / tk.observed), switchesPerMinute: tk.switchObserved > 0 ? rate(tk.switches, tk.switchObserved) : null } };
  }).sort((a, b) => a.centroid.inputShare - b.centroid.inputShare || a.cluster - b.cluster);
  const states: InteractionState[] = named.map((x, id) => {
    const same = named.filter(y => y.name === x.name), rank = same.indexOf(x);
    return { id, label: x.name + (same.length < 2 ? '' : rank === 0 ? t(' · light') : rank === same.length - 1 ? t(' · heavy') : same.length === 3 ? t(' · medium') : t(' · medium {rank}', { rank })), share: x.share, centroid: x.centroid, driftPerHour: x.driftPerHour };
  });
  const idOf = new Map(named.map((x, id) => [x.cluster, id])), modeCounts = new Map<ActivityMode, number[]>(), sequences = new Map<Facts, Array<{ start: number; end: number; id: number }>>();
  minutes.forEach((m, i) => {
    const id = idOf.get(labels[i])!, counts = modeCounts.get(m.f.mode) ?? states.map(() => 0); counts[id]++; modeCounts.set(m.f.mode, counts);
    push(sequences, m.f, { start: m.a.startMs, end: m.a.endMs, id });
  });
  const rates: Array<{ f: Facts; perHour: number }> = [];
  for (const [f, rows] of sequences) {
    let pairs = 0, count = 0;
    for (let i = 1; i < rows.length; i++) if (rows[i].start - rows[i - 1].end <= 1000) { pairs++; if (rows[i].id !== rows[i - 1].id) count++; }
    if (pairs >= S.fragmentationPairs) { rates.push({ f, perHour: count / pairs * 60 }); changes.set(f, count / pairs * 60); }
  }
  return { changes, section: { eligible: true, n: minutes.length, reason: t('Activity minutes grouped by how you used the keyboard and mouse. The number of states is the one that separates the minutes best.'), k: states.length, silhouette: best.score, states,
    byMode: ACTIVITY_MODES.flatMap(mode => { const counts = modeCounts.get(mode); if (!counts) return []; const total = counts.reduce((sum, c) => sum + c, 0); return [{ mode, minutes: total, shares: counts.map(c => c / total) }]; }),
    fragmentation: { perHourMedian: median(rates.map(r => r.perHour)), ...association(rates.filter(r => r.f.s.focus !== null).map(r => ({ x: r.perHour, y: r.f.s.focus!, day: r.f.day })), t('interaction states')) } } };
}

function detractorsSection(facts: Facts[]): DetractorsSection {
  const D = T.detractors, n = facts.length, ratedMean = (rows: Facts[]) => { const ratings = ratingsOf(rows); return ratings.length >= D.meanSessions ? mean(ratings) : null; };
  if (n < D.sessions) return { eligible: false, n, reason: t('Needs {sessions} sessions ({n} so far).', { sessions: D.sessions, n }), reported: [], interruptions: [], byBand: [], switching: { perHourMedian: null, focusRho: null, pairs: 0, reason: t('Needs {sessions} sessions first.', { sessions: D.sessions }) }, challenge: [] };
  const hours = facts.reduce((sum, f) => sum + f.hours, 0), categories = new Map<string, number>();
  for (const f of facts) for (const c of f.interruptions) categories.set(c, (categories.get(c) ?? 0) + 1);
  const switching = facts.filter(f => f.switchObservedMs > 0), perHour = (f: Facts) => f.switches / (f.switchObservedMs / 3600000);
  return { eligible: true, n, reason: t('What you reported after sessions, with mean focus once {meanSessions} rated sessions share an answer. Rates use active time, or observed time for window switches.', { meanSessions: D.meanSessions }),
    reported: DETRACTORS.map(detractor => { const rows = facts.filter(f => f.s.detractor === detractor); return { detractor, sessions: rows.length, focusMean: ratedMean(rows) }; }).filter(r => r.sessions).sort((a, b) => b.sessions - a.sessions),
    interruptions: [...categories].map(([category, count]) => ({ category, count, perHour: hours > 0 ? count / hours : null })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    byBand: TIME_BANDS.map((band, b) => ({ band: band.label, ...ratesOf(facts.filter(f => f.band === b), D.meanSessions) })),
    switching: { perHourMedian: median(switching.map(perHour)), ...association(switching.filter(f => f.s.focus !== null).map(f => ({ x: perHour(f), y: f.s.focus!, day: f.day })), t('window switch counts')) },
    challenge: CHALLENGES.map(challenge => { const rows = facts.filter(f => f.s.challenge === challenge); return { challenge, sessions: rows.length, focusMean: ratedMean(rows) }; }).filter(r => r.sessions) };
}

/* Pre-session features. Missing planned length and energy are NaN until scaling; 'contrast' reports twice the raw effect of a ±1 term. */
interface DayContext { sessions: number; minutes: number; gapHours: number }
interface Column { name: string; kind: 'sd' | 'binary' | 'contrast'; label: (sd: number) => string; value: (f: Facts, day: DayContext) => number }
const BASE_COLUMNS: Column[] = [
  { name: 'hourSin', kind: 'contrast', label: () => t('Starting near 06:00 rather than 18:00'), value: f => Math.sin(2 * Math.PI * f.hour / 24) },
  { name: 'hourCos', kind: 'contrast', label: () => t('Starting near midnight rather than midday'), value: f => Math.cos(2 * Math.PI * f.hour / 24) },
  { name: 'weekend', kind: 'binary', label: () => t('Weekend rather than weekday'), value: f => f.weekday === 'Sat' || f.weekday === 'Sun' ? 1 : 0 },
  { name: 'plannedMinutes', kind: 'sd', label: sd => t('Longer planned length (+1 SD ≈ {whole} min)', { whole: whole(sd) }), value: f => f.s.plannedMs === null ? NaN : f.s.plannedMs / 60000 },
  { name: 'stopwatch', kind: 'binary', label: () => t('Stopwatch rather than a planned countdown'), value: f => f.s.plannedMs === null ? 1 : 0 },
  { name: 'energy', kind: 'sd', label: sd => t('Higher starting energy (+1 SD ≈ {one})', { one: one(sd) }), value: f => f.s.energy ?? NaN },
  { name: 'energyMissing', kind: 'binary', label: () => t('Starting energy not recorded'), value: f => f.s.energy === null ? 1 : 0 },
  { name: 'earlierSessions', kind: 'sd', label: sd => t('More sessions earlier that day (+1 SD ≈ {one})', { one: one(sd) }), value: (_, c) => c.sessions },
  { name: 'earlierMinutes', kind: 'sd', label: sd => t('More focus time earlier that day (+1 SD ≈ {whole} min)', { whole: whole(sd) }), value: (_, c) => c.minutes },
  { name: 'hoursSincePrevious', kind: 'sd', label: () => t('Longer gap since the previous session (+1 SD, log scale)'), value: (_, c) => Math.log1p(c.gapHours) },
  { name: 'goal', kind: 'binary', label: () => t('Linked to a goal'), value: f => f.s.goalId ? 1 : 0 }
];
/* The day context of each rated session counts every finished, included session, also those outside the filters. */
function dayContexts(data: Dataset, facts: Facts[], rated: Facts[]): DayContext[] {
  const M = T.model, days = new Map(facts.map(f => [f.s.id, f.day]));
  const context = data.sessions.filter(s => s.status === 'completed' && !s.excluded && s.activeMs <= T.longSessionMs).map(s => ({ s, start: Date.parse(s.startedAt), end: s.endedAt ? Date.parse(s.endedAt) : Date.parse(s.startedAt) + s.activeMs, day: days.get(s.id) ?? '' })).sort((a, b) => a.start - b.start || a.s.id.localeCompare(b.s.id));
  const dayOf = (c: typeof context[number]) => c.day ||= localDay(c.s.startedAt, c.s.timezone);
  return rated.map(f => {
    const start = Date.parse(f.s.startedAt); let low = 0, high = context.length;
    while (low < high) { const mid = (low + high) >> 1; if (context[mid].start < start) low = mid + 1; else high = mid; }
    let sessions = 0, minutes = 0; for (let j = low - 1; j >= 0 && dayOf(context[j]) === f.day; j--) { sessions++; minutes += context[j].s.activeMs / 60000; }
    return { sessions, minutes, gapHours: low ? Math.min(M.gapCapHours, Math.max(0, (start - context[low - 1].end) / 3600000)) : M.gapCapHours };
  });
}
/* One-hot activity modes from the first `count` rated sessions only: modes with enough sessions, against the most frequent of them.
   Rarer modes join that reference, and the label says so. */
function modeColumns(rated: Facts[], count: number): Column[] {
  const counts = new Map<ActivityMode, number>(); for (let i = 0; i < count; i++) counts.set(rated[i].mode, (counts.get(rated[i].mode) ?? 0) + 1);
  const modes = ACTIVITY_MODES.filter(m => (counts.get(m) ?? 0) >= T.model.modeSessions); if (modes.length < 2) return [];
  const reference = modes.reduce((best, m) => counts.get(m)! > counts.get(best)! ? m : best), against = counts.size > modes.length ? t('{activityModeLabel} and other modes', { activityModeLabel: activityModeLabel(reference) }) : activityModeLabel(reference);
  return modes.filter(m => m !== reference).map((mode): Column => ({ name: `mode:${mode}`, kind: 'binary', label: () => t('{activityModeLabel} rather than {against}', { activityModeLabel: activityModeLabel(mode), against }), value: f => f.mode === mode ? 1 : 0 }));
}
/* Standardizes with the first `count` rows only. A missing value takes the training mean (0 after scaling); a constant column becomes 0. */
function scalerOf(rows: number[][], count: number): { sds: number[]; apply: (row: number[]) => number[] } {
  const means: number[] = [], sds: number[] = [];
  for (let j = 0; j < (rows[0]?.length ?? 0); j++) {
    const values: number[] = []; for (let i = 0; i < count; i++) if (!Number.isNaN(rows[i][j])) values.push(rows[i][j]);
    const m = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0; means.push(m); sds.push(values.length ? Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length) : 0);
  }
  return { sds, apply: row => row.map((v, j) => sds[j] > 1e-9 && !Number.isNaN(v) ? (v - means[j]) / sds[j] : 0) };
}
/* What happened during and after a session, for the explanatory view. A missing value stays missing and takes the training mean. */
function factorColumns(changes: Map<Facts, number>): Column[] {
  return [
    { name: 'driftPerHour', kind: 'sd', label: sd => t('More drifts per active hour (+1 SD ≈ {one})', { one: one(sd) }), value: f => f.version >= T.returnVersion && f.s.activeMs >= 300000 ? f.drifts.length / f.hours : NaN },
    { name: 'switchesPerHour', kind: 'sd', label: sd => t('More window switches per hour (+1 SD ≈ {whole})', { whole: whole(sd) }), value: f => f.switchObservedMs > 0 ? f.switches / (f.switchObservedMs / 3600000) : NaN },
    { name: 'inputShare', kind: 'sd', label: sd => t('More time with keyboard or mouse input (+1 SD ≈ {percent} of the time)', { percent: percent(sd) }), value: f => f.inputObservedMs > 0 ? f.inputMs / f.inputObservedMs : NaN },
    { name: 'fragmentation', kind: 'sd', label: sd => t('More changes between interaction states (+1 SD ≈ {whole} per hour)', { whole: whole(sd) }), value: f => changes.get(f) ?? NaN },
    { name: 'challenge:too-hard', kind: 'binary', label: () => t('Felt too hard rather than about right or too easy'), value: f => f.s.challenge == null ? NaN : f.s.challenge === 'too-hard' ? 1 : 0 },
    { name: 'challenge:too-easy', kind: 'binary', label: () => t('Felt too easy rather than about right or too hard'), value: f => f.s.challenge == null ? NaN : f.s.challenge === 'too-easy' ? 1 : 0 },
    { name: 'detractor', kind: 'binary', label: () => t('Something got in the way rather than nothing notable'), value: f => f.s.detractor == null ? NaN : f.s.detractor === 'none' ? 0 : 1 }
  ];
}
const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const overlapOf = (sets: Array<Set<string>>): number | null => {
  if (sets.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < sets.length; i++) { const a = sets[i - 1], b = sets[i], union = new Set([...a, ...b]); let both = 0; for (const name of a) if (b.has(name)) both++; sum += union.size ? both / union.size : 1; }
  return sum / (sets.length - 1);
};
const ESTIMATOR_LABELS: Record<ModelEstimator, string> = { ridge: 'Ridge', lasso: 'Lasso', get 'elastic-net'() { return t('Elastic net'); } };
function unavailableModel(n: number, reason: string): ModelView {
  return { eligible: false, n, reason, useful: false, trainedOn: 0, tested: 0, lambda: null, mae: null, baselineMae: null, features: [], estimator: null, candidates: [], diagnostics: null, zeroed: [], decision: '' };
}
/* Three estimators compete in a rolling origin test: ridge keeps every feature, the lasso keeps few, the elastic net sits between. Collinear features can make the lasso swap one
   for another from window to window; then the elastic net decides. Otherwise the better of ridge and lasso does, and the lasso always marks which features it keeps.
   `gated` models must beat the average rating before they show effects; the explanatory view of the session does not predict, so it shows its effects whenever it is eligible. */
function estimateModel(rated: Facts[], y: number[], contexts: DayContext[], baseColumns: Column[], withModes: boolean, gated: boolean, intro: string): ModelView {
  const M = T.model, n = rated.length, tests = Math.min(M.maxTestPoints, n - M.minTrainSessions), alpha = M.elasticAlpha;
  const base = rated.map((f, i) => baseColumns.map(c => c.value(f, contexts[i])));
  // Each fit uses the mode columns of its own training rows; the penalties grow with the number of training rows.
  const design = (count: number) => { const modes = withModes ? modeColumns(rated, count) : []; return { columns: [...baseColumns, ...modes], rows: modes.length ? base.map((row, i) => [...row, ...modes.map(c => c.value(rated[i], contexts[i]))]) : base }; };
  const lambdas = (count: number) => M.lambdaPerRow.map(l => l * count), predict = (fit: { intercept: number; coefficients: number[] }, row: number[]) => Math.min(5, Math.max(1, fit.intercept + fit.coefficients.reduce((sum, b, j) => sum + b * row[j], 0)));
  // Rolling origin: each test session is predicted by models that saw only the sessions before it. The baseline is their mean rating.
  const error: Record<ModelEstimator, number> = { ridge: 0, lasso: 0, 'elastic-net': 0 }, kept: Record<'lasso' | 'elastic-net', Array<Set<string>>> = { lasso: [], 'elastic-net': [] };
  let baseline = 0;
  for (let tk = n - tests; tk < n; tk++) {
    const { columns, rows } = design(tk), scale = scalerOf(rows, tk), train = rows.slice(0, tk).map(scale.apply), target = y.slice(0, tk), row = scale.apply(rows[tk]);
    const fits = { ridge: ridgeSelect(train, target, lambdas(tk)), lasso: penalizedSelect(train, target, 1), 'elastic-net': penalizedSelect(train, target, alpha) };
    for (const id of ['ridge', 'lasso', 'elastic-net'] as const) error[id] += Math.abs(predict(fits[id], row) - y[tk]);
    for (const id of ['lasso', 'elastic-net'] as const) kept[id].push(new Set(columns.filter((_, j) => scale.sds[j] > 1e-9 && Math.abs(fits[id].coefficients[j]) > M.selectedAbove).map(c => c.name)));
    baseline += Math.abs(mean(y.slice(0, tk))! - y[tk]);
  }
  const mae: Record<ModelEstimator, number> = { ridge: error.ridge / tests, lasso: error.lasso / tests, 'elastic-net': error['elastic-net'] / tests }, baselineMae = baseline / tests;
  const stability = { lasso: overlapOf(kept.lasso), 'elastic-net': overlapOf(kept['elastic-net']) };
  const { columns, rows } = design(n), scale = scalerOf(rows, n), x = rows.map(scale.apply), live = columns.map((_, j) => scale.sds[j] > 1e-9);
  const { correlation, vif } = collinearity(x), pairs: ModelDiagnostics['pairs'] = [];
  // The label without its scale note, and the two hour terms as one feature.
  const shortName = (c: Column) => c.name.startsWith('hour') && c.kind === 'contrast' ? t('Start hour') : c.label(0).replace(/ \(.*\)$/, '');
  columns.forEach((a, j) => { if (!live[j]) return; for (let k = j + 1; k < columns.length; k++) { const r = correlation[j][k]; if (live[k] && r !== null && Math.abs(r) >= M.collinearR && shortName(a) !== shortName(columns[k])) pairs.push({ a: shortName(a), b: shortName(columns[k]), r }); } });
  pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const maxVif = vif.reduce<number | null>((best, v) => v !== null && (best === null || v > best) ? v : best, null), maxCorrelation = pairs.length ? Math.abs(pairs[0].r) : correlation.flat().reduce<number | null>((best, r, i) => r !== null && Math.floor(i / columns.length) !== i % columns.length && (best === null || Math.abs(r) > best) ? Math.abs(r) : best, null);
  const collinear = (maxVif !== null && maxVif > M.collinearVif) || (maxCorrelation !== null && maxCorrelation >= M.collinearR);
  const lassoFirst = mae.lasso < mae.ridge - 1e-9, netDecides = collinear && stability.lasso !== null && stability.lasso < M.stableOverlap && (stability['elastic-net'] ?? 0) > stability.lasso && mae['elastic-net'] <= Math.min(mae.ridge, mae.lasso) + 1e-9;
  const estimator: ModelEstimator = netDecides ? 'elastic-net' : lassoFirst ? 'lasso' : 'ridge', fixed = (id: ModelEstimator) => `${mae[id].toFixed(2)}`;
  const decision = netDecides ? t('Some features overlap strongly (largest variance inflation {v1}) and the lasso\'s choice of features changed between windows (overlap {percent}), so the elastic net sets the effects (error {fixed} vs {fixed2} for ridge and {fixed3} for the lasso).', { v1: maxVif === null ? '—' : one(maxVif), percent: percent(stability.lasso!), fixed: fixed('elastic-net'), fixed2: fixed('ridge'), fixed3: fixed('lasso') })
    : lassoFirst ? t('The lasso predicted better than ridge (error {fixed} vs {fixed2}), so it sets the effects; features it sets to zero show no clear association.', { fixed: fixed('lasso'), fixed2: fixed('ridge') })
      : t('Ridge predicted at least as well as the lasso (error {fixed} vs {fixed2}), so it sets the effects; the lasso only marks which features it keeps.', { fixed: fixed('ridge'), fixed2: fixed('lasso') });
  const candidates: ModelCandidate[] = (['ridge', 'lasso', 'elastic-net'] as const).map(id => ({ id, label: ESTIMATOR_LABELS[id], mae: mae[id], stability: id === 'ridge' ? null : stability[id] }));
  const diagnostics: ModelDiagnostics = { maxVif, maxCorrelation, collinear, pairs: pairs.slice(0, 5) };
  const useful = !gated || (baselineMae > 0 && mae[estimator] <= (1 - M.usefulGain) * baselineMae);
  const comparison = t('{v1} vs {v2} points of error over {tests} later sessions', { v1: mae[estimator].toFixed(2), v2: baselineMae.toFixed(2), tests });
  const ridgeFinal = ridgeSelect(x, y, lambdas(n)), lassoFinal = penalizedSelect(x, y, 1), netFinal = penalizedSelect(x, y, alpha);
  const chosen = estimator === 'ridge' ? ridgeFinal : estimator === 'lasso' ? lassoFinal : netFinal;
  const result = { eligible: true, n, useful, trainedOn: n, tested: tests, lambda: chosen.lambda, mae: mae[estimator], baselineMae, estimator, candidates, diagnostics, decision };
  if (!useful) return { ...result, reason: t('The model does not predict your next rating clearly better than your average rating ({comparison}), so no associations are shown.', { comparison }), features: [], zeroed: [] };
  const effects = (beta: number[]) => beta.map((b, j) => scale.sds[j] <= 1e-9 ? 0 : columns[j].kind === 'sd' ? b : b / scale.sds[j] * (columns[j].kind === 'contrast' ? 2 : 1));
  const sinAt = columns.findIndex(c => c.name === 'hourSin'), cosAt = columns.findIndex(c => c.name === 'hourCos'), merged = sinAt >= 0 && cosAt >= 0 && live[sinAt] && live[cosAt];
  const peak = (effect: number[]) => Math.hypot(effect[sinAt], effect[cosAt]);
  const random = mulberry32(42), draws: number[][] = [], amplitudes: number[] = [], lassoCount = new Array<number>(columns.length).fill(0);
  let peakCount = 0;
  for (let b = 0; b < M.bootstrap; b++) {
    const pick = Array.from({ length: n }, () => Math.floor(random() * n)), xb = pick.map(i => x[i]), yb = pick.map(i => y[i]);
    const lassoDraw = penalizedFit(xb, yb, lassoFinal.lambda, 1), draw = estimator === 'lasso' ? lassoDraw : estimator === 'ridge' ? ridgeFit(xb, yb, ridgeFinal.lambda) : penalizedFit(xb, yb, netFinal.lambda, alpha);
    const effect = effects(draw.coefficients); draws.push(effect); if (merged) amplitudes.push(peak(effect));
    lassoDraw.coefficients.forEach((v, j) => { if (Math.abs(v) > M.selectedAbove) lassoCount[j]++; });
    if (merged && (Math.abs(lassoDraw.coefficients[sinAt]) > M.selectedAbove || Math.abs(lassoDraw.coefficients[cosAt]) > M.selectedAbove)) peakCount++;
  }
  // Plain percentile intervals: with shrinkage they need not contain the estimate.
  const estimate = effects(chosen.coefficients), windowShare = (matches: (name: string) => boolean) => kept.lasso.filter(set => [...set].some(matches)).length / kept.lasso.length;
  const feature = (j: number): ModelFeature => { const sorted = draws.map(d => d[j]).sort((a, b) => a - b); return { name: columns[j].name, label: columns[j].label(scale.sds[j]), effect: { estimate: estimate[j], low: quantile(sorted, 0.05), high: quantile(sorted, 0.95) },
    selected: Math.abs(lassoFinal.coefficients[j]) > M.selectedAbove, selectionShare: windowShare(name => name === columns[j].name), bootstrapShare: lassoCount[j] / M.bootstrap, vif: vif[j] }; };
  // The hour enters as a sine and a cosine; one effect reads better: the focus gap between the best starting hour and the opposite hour.
  const features: ModelFeature[] = columns.flatMap((_, j) => live[j] && !(merged && (j === sinAt || j === cosAt)) ? [feature(j)] : []);
  if (merged) {
    const sorted = [...amplitudes].sort((a, b) => a - b), hour = Math.round((Math.atan2(estimate[sinAt], estimate[cosAt]) / (2 * Math.PI) * 24 + 24) % 24) % 24;
    features.push({ name: 'peakHour', label: t('Starting near {clock} rather than {clock2}', { clock: clock(hour), clock2: clock((hour + 12) % 24) }), effect: { estimate: peak(estimate), low: quantile(sorted, 0.05), high: quantile(sorted, 0.95) },
      selected: Math.abs(lassoFinal.coefficients[sinAt]) > M.selectedAbove || Math.abs(lassoFinal.coefficients[cosAt]) > M.selectedAbove, selectionShare: windowShare(name => name === 'hourSin' || name === 'hourCos'), bootstrapShare: peakCount / M.bootstrap, vif: Math.max(vif[sinAt] ?? 1, vif[cosAt] ?? 1) });
  }
  features.sort((a, b) => Math.abs(b.effect.estimate) - Math.abs(a.effect.estimate) || a.name.localeCompare(b.name));
  return { ...result, reason: t('{intro} ({comparison}). The effects are associations, not causes.', { intro, comparison }), features, zeroed: features.filter(f => !f.selected).map(f => f.label) };
}
function modelSection(data: Dataset, facts: Facts[], changes: Map<Facts, number>): FocusModelSection {
  const M = T.model, rated = facts.filter(f => f.s.focus !== null), n = rated.length, spanDays = spanOf(rated.map(f => f.day)), tests = Math.min(M.maxTestPoints, n - M.minTrainSessions);
  if (n < M.ratedSessions || spanDays < M.spanDays || tests < M.testPoints) { const view = unavailableModel(n, t('Needs {ratedSessions} rated sessions over {spanDays} days ({plural} over {plural2} so far).', { ratedSessions: M.ratedSessions, spanDays: M.spanDays, plural: plural(n, 'rated session'), plural2: plural(spanDays, 'day') })); return { ...view, sessionFactors: view }; }
  const contexts = dayContexts(data, facts, rated), y = rated.map(f => f.s.focus!);
  const before = estimateModel(rated, y, contexts, BASE_COLUMNS, true, true, t('Predicts your next rating better than your average rating did'));
  const factors = factorColumns(changes).filter(c => rated.filter(f => !Number.isNaN(c.value(f, contexts[0]))).length >= M.factorValues);
  const during = factors.length ? estimateModel(rated, y, contexts, factors, false, false, t('Describes the ratings you gave from what happened during and after each session, with the other factors held fixed. It explains sessions that already happened and does not predict, because those facts are not known in advance'))
    : unavailableModel(n, t('Needs {factorValues} rated sessions with drift markers, activity counts or reflection answers (none of the session factors has that yet).', { factorValues: M.factorValues }));
  return { ...before, sessionFactors: during };
}

const KIND_ORDER: Recommendation['kind'][] = ['window', 'length', 'warmup', 'break', 'detractor', 'switching', 'challenge', 'data'];
/* The suggested block length. Normally it is the median time to the first drift. With warm-up friction a median under fatigueMinutes mostly measures getting started,
   so the block never falls below fatigueMinutes and follows the median of the first drift after the warm-up when that one is known. */
interface LengthPlan { minutes: number; median: Interval; open: boolean; sessions: number; events: number; afterWarmUp: boolean; firstMedian: number }
function lengthPlan(span: AttentionSpanSection): LengthPlan | null {
  const S = T.suggestions, A = T.attentionSpan, overall = span.overall;
  if (!span.eligible || !overall?.median) return null;
  const step = (minutes: number) => Math.round(minutes / S.lengthStep) * S.lengthStep;
  if (span.warmUpFriction && overall.median.estimate < A.fatigueMinutes) {
    const later = span.afterWarmUp, median = later?.median;
    return { minutes: Math.max(A.fatigueMinutes, median ? step(median.estimate) : 0), median: median ?? overall.median, open: (median ? later!.medianOpen : overall.medianOpen) === true, sessions: later?.sessions ?? overall.sessions, events: later?.events ?? overall.events, afterWarmUp: true, firstMedian: overall.median.estimate };
  }
  return { minutes: Math.max(S.lengthMinimum, step(overall.median.estimate)), median: overall.median, open: overall.medianOpen === true, sessions: overall.sessions, events: overall.events, afterWarmUp: false, firstMedian: overall.median.estimate };
}
/* Drifts per hour in [from, to) minutes of the sessions that reached minute \`reached\` (all of their time inside the window counts). */
function cohortRate(rows: Facts[], from: number, to: number): { drifts: number; exposure: number; perHour: number } {
  let drifts = 0, exposureMs = 0;
  for (const f of rows) { const low = from * 60000, high = Math.min(to * 60000, f.s.activeMs); if (high > low) exposureMs += high - low; for (const d of f.drifts) if (d >= low && d < to * 60000) drifts++; }
  return { drifts, exposure: exposureMs / 3600000, perHour: exposureMs > 0 ? drifts / (exposureMs / 3600000) : 0 };
}
const DETRACTOR_ACTIONS: Record<Exclude<Detractor, 'none'>, string> = {
  get notifications() { return t('Try Do Not Disturb, or leave the phone in another room during the session.'); }, get people() { return t('Try headphones, a quieter place, or a focus time agreed with the people around you.'); },
  get thoughts() { return t('When a thought pulls at you, use Park this thought and return to the task.'); }, get tiredness() { return t('Try water, a snack or a short rest before you start, or a shorter first block.'); },
  get task() { return t('Before you start, write down the first small step so the task is clear.'); }, get other() { return t('Add a short note after these sessions to find what they have in common.'); }
};
function recommendationsOf(facts: Facts[], quality: DataQuality, rhythm: RhythmSection, span: AttentionSpanSection, base: Facts[], detractors: DetractorsSection): Recommendation[] {
  const S = T.suggestions, out: Recommendation[] = [], overall = mean(ratingsOf(facts)), lower = (values: number[], reference: number[]) => differenceInterval(values, reference).high < 0 ? 'moderate' as const : 'tentative' as const;
  if (rhythm.eligible && overall !== null) {
    const best = TIME_BANDS.map((band, b) => ({ band, values: ratingsOf(facts.filter(f => f.band === b)) })).filter(x => x.values.length >= S.windowSessions).map(x => ({ ...x, interval: meanInterval(x.values) }))
      .filter(x => x.interval.estimate >= overall + S.focusGap - 1e-9).sort((a, b) => b.interval.estimate - a.interval.estimate)[0];
    if (best) {
      const slot = TIME_BANDS.indexOf(best.band), range = best.band.label.split(' · ')[1];
      const when = [t('Your best-rated sessions start at night ({range})', { range }), t('Your best-rated sessions start in the morning ({range})', { range }), t('Your best-rated sessions start in the afternoon ({range})', { range }), t('Your best-rated sessions start in the evening ({range})', { range })][slot];
      out.push({ id: `window-${['night', 'morning', 'afternoon', 'evening'][slot]}`, kind: 'window', title: when, detail: t('When you can, place demanding work in this window. You choose when you focus, so this is an association, not a cause.'),
        evidence: t('Mean focus {one} vs {one2} overall, {plural} (90% interval {one3}–{one4}).', { one: one(best.interval.estimate), one2: one(overall), plural: plural(best.values.length, 'session'), one3: one(best.interval.low), one4: one(best.interval.high) }), strength: best.interval.low > overall ? 'moderate' : 'tentative' });
    }
  }
  const plan = lengthPlan(span), A = T.attentionSpan, warm = span.phases[0], sustain = span.phases[1];
  if (plan) {
    const range = plan.open ? t('from {whole} min', { whole: whole(plan.median.low) }) : `${whole(plan.median.low)}–${whole(plan.median.high)} min`, later = span.afterWarmUp?.median;
    out.push({ id: 'length', kind: 'length', minutes: plan.minutes, title: t('Plan {minutes}-minute blocks', { minutes: plan.minutes }),
      detail: !plan.afterWarmUp ? t('Your median time before the first drift is {whole} min (90% interval {range}). Start there and adjust.', { whole: whole(plan.firstMedian), range })
        : later ? t('Your median time before the first drift is {whole} min, but drifts cluster in the first {warmUpMinutes} minutes, so a shorter block would not remove them. Counted after the warm-up, the median is {whole2} min (90% interval {range}). Start at {minutes} min and adjust.', { whole: whole(plan.firstMedian), warmUpMinutes: A.warmUpMinutes, whole2: whole(later.estimate), range, minutes: plan.minutes })
          : t('Your median time before the first drift is {whole} min, but drifts cluster in the first {warmUpMinutes} minutes, so a shorter block would not remove them. Start at {minutes} min and adjust.', { whole: whole(plan.firstMedian), warmUpMinutes: A.warmUpMinutes, minutes: plan.minutes }),
      evidence: t('{plural}, {events} with a first drift{v3}.', { plural: plural(plan.sessions, 'session'), events: plan.events, v3: plan.afterWarmUp && later ? t(' after minute {warmUpMinutes}', { warmUpMinutes: A.warmUpMinutes }) : '' }), strength: !plan.open && (!plan.afterWarmUp || later) && plan.median.high - plan.median.low <= plan.median.estimate ? 'moderate' : 'tentative' });
  }
  if (span.eligible && span.warmUpFriction && warm.driftPerHour !== null && sustain.driftPerHour !== null) {
    const ratio = sustain.drifts > 0 ? Math.log(warm.driftPerHour / sustain.driftPerHour) - zUpper(0.05) * Math.sqrt(1 / warm.drifts + 1 / sustain.drifts) : -1;
    out.push({ id: 'warmup', kind: 'warmup', title: t('Drifts cluster in the first {warmUpMinutes} minutes (warm-up friction)', { warmUpMinutes: A.warmUpMinutes }), detail: t('Before you start the timer, write the first concrete step in your intention, so the first minutes have somewhere to land.'),
      evidence: t('{one} drifts per hour in minutes {fromMinute}–{toMinute} vs {one2} in minutes {fromMinute2}–{toMinute2}, over {plural}.', { one: one(warm.driftPerHour), fromMinute: warm.fromMinute, toMinute: warm.toMinute, one2: one(sustain.driftPerHour), fromMinute2: sustain.fromMinute, toMinute2: sustain.toMinute, plural: plural(warm.sessions, 'session') }), strength: ratio > 0 ? 'moderate' : 'tentative' });
  }
  if (span.eligible) {
    // Each candidate is judged on the sessions that reached it, so short and long sessions are not mixed: the early rate and the later rate come from the same cohort.
    // Among the candidates that qualify, the change point is the one with the largest likelihood-ratio statistic of two Poisson rates (before and after it) against one rate, inside its cohort.
    const logLikelihood = (r: { drifts: number; exposure: number }) => r.drifts > 0 ? r.drifts * Math.log(r.drifts / r.exposure) - r.drifts : 0;
    const early = S.breakEarlyMinutes, candidates: Array<{ minute: number; cohort: number; before: ReturnType<typeof cohortRate>; after: ReturnType<typeof cohortRate>; score: number }> = [];
    let tried = 0;
    for (let minute = A.fatigueMinutes; minute + S.breakAheadMinutes <= T.sessionShape.maxMinutes; minute += T.sessionShape.blockMinutes) {
      const cohort = base.filter(f => f.s.activeMs >= minute * 60000);
      if (cohort.filter(f => f.s.activeMs >= (minute + S.breakAheadMinutes) * 60000).length < S.breakSessions) continue;
      tried++; const before = cohortRate(cohort, 0, early), after = cohortRate(cohort, minute, T.sessionShape.maxMinutes);
      if (after.drifts < S.breakDrifts || after.perHour < S.breakRatio * before.perHour) continue;
      const lead = cohortRate(cohort, 0, minute), pooled = cohortRate(cohort, 0, T.sessionShape.maxMinutes);
      candidates.push({ minute, cohort: cohort.length, before, after, score: 2 * (logLikelihood(lead) + logLikelihood(after) - logLikelihood(pooled)) });
    }
    const best = candidates.reduce<typeof candidates[number] | null>((top, c) => !top || c.score > top.score + 1e-12 ? c : top, null);
    if (best) out.push({ id: 'break', kind: 'break', minutes: best.minute, title: t('Drift rises after about {minute} minutes', { minute: best.minute }), detail: t('Try a short break around minute {minute}, or end your blocks there.', { minute: best.minute }),
      evidence: t('{one} drifts per hour after minute {minute} vs {one2} in the first {early} minutes, among the {plural} that reached minute {minute2} (of {length}).', { one: one(best.after.perHour), minute: best.minute, one2: one(best.before.perHour), early, plural: plural(best.cohort, 'session'), minute2: best.minute, length: base.length }),
      // The point was chosen among `tried` points, so the rate-ratio bound uses a Bonferroni-corrected 95% one-sided level.
      strength: best.before.drifts > 0 && Math.log(best.after.perHour / best.before.perHour) - zUpper(0.05 / tried) * Math.sqrt(1 / best.after.drifts + 1 / best.before.drifts) > 0 ? 'moderate' : 'tentative' });
  }
  const top = detractors.eligible ? detractors.reported.find(r => r.detractor !== 'none')?.detractor : undefined, calm = ratingsOf(facts.filter(f => f.s.detractor === 'none'));
  if (top && top !== 'none' && calm.length >= S.comparisonSessions) {
    const values = ratingsOf(facts.filter(f => f.s.detractor === top));
    if (values.length >= S.comparisonSessions && mean(values)! <= mean(calm)! - S.focusGap + 1e-9) out.push({ id: `detractor-${top}`, kind: 'detractor', title: t('{v1} got in the way most often', { v1: DETRACTOR_LABELS[top] }), detail: DETRACTOR_ACTIONS[top],
      evidence: t('{v1}: mean focus {one} in {plural} vs {one2} in {plural2} with nothing notable.', { v1: DETRACTOR_LABELS[top], one: one(mean(values)!), plural: plural(values.length, 'rated session'), one2: one(mean(calm)!), plural2: plural(calm.length, 'rated session') }), strength: lower(values, calm) });
  }
  const rho = detractors.switching.focusRho, pairs = detractors.switching.pairs;
  if (detractors.eligible && rho !== null && rho <= S.switchingRho) {
    // Fisher z interval for Spearman's rho (variance 1.06 / (n - 3)).
    const upper = Math.tanh(Math.atanh(Math.max(-0.999999, rho)) + Z90 * Math.sqrt(1.06 / Math.max(1, pairs - 3)));
    out.push({ id: 'switching', kind: 'switching', title: t('Sessions with more window switching tend to have lower focus'), detail: t('Try closing what the task does not need, or keep one window for the task.'), evidence: t('Spearman ρ {v1} across {plural}.', { v1: rho.toFixed(2), plural: plural(pairs, 'rated session') }), strength: upper < 0 ? 'moderate' : 'tentative' });
  }
  const right = ratingsOf(facts.filter(f => f.s.challenge === 'right'));
  if (detractors.eligible && right.length >= S.comparisonSessions) {
    const worst = (['too-hard', 'too-easy'] as const).map(challenge => ({ challenge, values: ratingsOf(facts.filter(f => f.s.challenge === challenge)) })).filter(x => x.values.length >= S.comparisonSessions && mean(x.values)! <= mean(right)! - S.focusGap + 1e-9).sort((a, b) => mean(a.values)! - mean(b.values)!)[0];
    if (worst) {
      const hard = worst.challenge === 'too-hard';
      out.push({ id: `challenge-${worst.challenge}`, kind: 'challenge', title: hard ? t('Sessions that felt too hard rate lower') : t('Sessions that felt too easy rate lower'), detail: hard ? t('Try starting with a smaller first step.') : t('Try adding a small challenge, such as a time box or a harder problem.'),
        evidence: t('{v1}: mean focus {one} in {plural} vs {one2} in {plural2} that felt about right.', { v1: CHALLENGE_LABELS[worst.challenge], one: one(mean(worst.values)!), plural: plural(worst.values.length, 'rated session'), one2: one(mean(right)!), plural2: plural(right.length, 'rated session') }), strength: lower(worst.values, right) });
    }
  }
  if (quality.sessions) {
    const M = T.model, sessions = plural(quality.sessions, 'session');
    if (quality.ratedShare !== null && quality.ratedShare < S.ratedShare) out.push({ id: 'data-ratings', kind: 'data', title: t('Rate more sessions to unlock the focus model'), detail: t('Rate perceived focus when a session ends. The focus model needs {ratedSessions} rated sessions over {spanDays} days.', { ratedSessions: M.ratedSessions, spanDays: M.spanDays }), evidence: t('{percent} of {sessions} rated.', { percent: percent(quality.ratedShare), sessions }), strength: 'tentative' });
    else if (quality.activityCoverage === null || quality.activityCoverage < S.activityCoverage) out.push({ id: 'data-activity', kind: 'data', title: t('Turn on activity collection to see interaction states'), detail: t('Keyboard and mouse counts describe how you work. They stay on this computer and never include what you type.'),
      evidence: quality.activityCoverage === null ? t('No activity was recorded in these {sessions}.', { sessions }) : t('Activity covers {percent} of active time in {sessions}.', { percent: percent(quality.activityCoverage), sessions }), strength: 'tentative' });
    else if (quality.markerSessions / quality.sessions < S.markerShare) out.push({ id: 'data-markers', kind: 'data', title: t('Press I\'m back when you notice a drift'), detail: t('Each marker helps estimate how long your attention usually lasts before the first drift.'), evidence: t('{markerSessions} of {sessions} have a drift marker.', { markerSessions: quality.markerSessions, sessions }), strength: 'tentative' });
  }
  return out.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'moderate' ? -1 : 1) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)).slice(0, S.max);
}

const baseOf = (facts: Facts[]) => facts.filter(f => !f.s.recovered && f.version >= T.returnVersion && f.s.activeMs > 0);
const chronological = (sessions: FocusSession[]) => sessions.filter(s => s.activeMs <= T.longSessionMs).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id));

/* The last recentDays days up to `to` against the baselineDays days just before them, for the same area or goal and whatever the range of the other figures.
   `activity` must hold the samples of both windows. Each measure shows only when both windows have enough sessions for it. */
function cycleComparisonSection(data: Dataset, activity: ActivitySample[], options: InsightOptions): CycleComparisonSection {
  const C = T.cycle, recentFrom = addDays(options.to, -(C.recentDays - 1)), baselineTo = addDays(options.to, -C.recentDays), baselineFrom = addDays(baselineTo, -(C.baselineDays - 1));
  const window = (from: string, to: string) => collect(data, activity, chronological(selectedSessions(data, from, to, options.fieldId ?? '', options.goalId ?? ''))).facts;
  const recent = window(recentFrom, options.to), baseline = window(baselineFrom, baselineTo);
  const week = monday(options.to), saved = (day: string): WeeklyAdjustment | null => {
    const text = (options.goalId ? goalData(data).goalReviews.find(r => r.goalId === options.goalId && r.week === day)?.adjustment : data.reviews.find(r => r.week === day)?.adjustment)?.trim();
    return text ? { week: day, text } : null;
  };
  const adjustments = { thisWeek: saved(week), previousWeek: saved(addDays(week, -7)) };
  const section = { recent: { from: recentFrom, to: options.to, sessions: recent.length }, baseline: { from: baselineFrom, to: baselineTo, sessions: baseline.length }, adjustments };
  if (recent.length < C.recentSessions || baseline.length < C.baselineSessions) {
    return { eligible: false, n: recent.length, reason: t('Needs {recentSessions} sessions in the last {recentDays} days and {baselineSessions} in the {baselineDays} days before them ({length} and {length2} so far).', { recentSessions: C.recentSessions, recentDays: C.recentDays, baselineSessions: C.baselineSessions, baselineDays: C.baselineDays, length: recent.length, length2: baseline.length }), metrics: [], ...section };
  }
  const measure = (rows: Facts[], minimum: number) => {
    const ratings = ratingsOf(rows), rates = ratesOf(rows, minimum), cases = baseOf(rows), curve = cases.length >= minimum && cases.filter(f => f.drifts.length).length >= C.spanEvents ? survivalCurve('', cases) : null;
    return { focus: ratings.length >= minimum ? mean(ratings) : null, drift: rates.driftPerHour, span: curve?.median?.estimate ?? null, switches: rates.switchesPerHour };
  };
  const now = measure(recent, C.recentSessions), before = measure(baseline, C.baselineSessions);
  const metric = (id: CycleMetric['id'], label: string, unit: string, higherIsBetter: boolean, tolerance: number): CycleMetric => {
    const a = now[id], b = before[id], delta = a !== null && b !== null ? a - b : null;
    return { id, label, unit, recent: a, baseline: b, delta, improved: delta === null || Math.abs(delta) < tolerance ? null : (delta > 0) === higherIsBetter };
  };
  return { eligible: true, n: recent.length, reason: t('Sessions of the last {recentDays} days against the {baselineDays} days before them. Both windows depend on when and what you chose to record, so a change is a hint, not a proof that your adjustment worked.', { recentDays: C.recentDays, baselineDays: C.baselineDays }),
    metrics: [metric('focus', t('Perceived focus'), t('points'), true, 0.05), metric('drift', t('Drifts per active hour'), t('per hour'), false, 0.05), metric('span', t('Median time to the first drift'), 'min', true, 0.5), metric('switches', t('Window switches per observed hour'), t('per hour'), false, 0.5)], ...section };
}

/* `activity` holds the samples of the selected sessions and of the comparison windows; other samples are ignored. Pure and deterministic. */
export function focusInsights(data: Dataset, activity: ActivitySample[], options: InsightOptions): FocusInsights {
  const selected = selectedSessions(data, options.from, options.to, options.fieldId ?? '', options.goalId ?? ''), sessions = chronological(selected);
  const { facts, droppedMarkers } = collect(data, activity, sessions), base = baseOf(facts), blocks = blocksOf(base);
  const quality = qualityOf(facts, selected.length - sessions.length, droppedMarkers), rhythm = rhythmSection(facts), attentionSpan = attentionSpanSection(base), detractors = detractorsSection(facts), states = statesSection(facts);
  return { from: options.from, to: options.to, computedAt: new Date(options.now ?? Date.now()).toISOString(), quality, rhythm, attentionSpan, sessionShape: sessionShapeSection(base, blocks),
    states: states.section, detractors, model: modelSection(data, facts, states.changes), cycleComparison: cycleComparisonSection(data, activity, options),
    recommendations: recommendationsOf(facts, quality, rhythm, attentionSpan, base, detractors), note: insightsLimitsNote() };
}

/* One answer to "how long should I plan?": the time the attention lasted before a drift, counted past the warm-up, in the last duration.days days of the goal and then of the area.
   Only when that is not known yet does the median of the recorded durations in the last recordedWindowDays days answer, and the result says which one it is. */
export interface DurationSuggestion { eligible: boolean; minutes: number | null; source: 'attention' | 'recorded' | null; scope: 'goal' | 'area'; n: number; spanDays: number; from: string; to: string; sessionIds: string[]; evidence: string }
export function suggestedDuration(data: Dataset, fieldId: string, activityMode: ActivityMode, now = Date.now(), goalId?: string): DurationSuggestion {
  const D = T.duration, today = localDay(now, data.settings.timezone), from = addDays(today, -(D.days - 1));
  for (const scope of goalId ? ['goal', 'area'] as const : ['area'] as const) {
    const rows = selectedSessions(data, from, today, scope === 'area' ? fieldId : '', scope === 'goal' ? goalId : '').filter(s => (s.activityMode ?? 'Unspecified') === activityMode);
    const base = baseOf(collect(data, [], chronological(rows)).facts), plan = lengthPlan(attentionSpanSection(base));
    if (plan) return { eligible: true, minutes: Math.max(1, Math.min(1440, plan.minutes)), source: 'attention', scope, n: base.length, spanDays: spanOf(base.map(f => f.day)), from, to: today, sessionIds: base.map(f => f.s.id),
      evidence: t('Attention held for a median of {whole} min before a drift{v2}.', { whole: whole(plan.median.estimate), v2: plan.afterWarmUp ? t(', counted after the first {warmUpMinutes} minutes', { warmUpMinutes: T.attentionSpan.warmUpMinutes }) : '' }) };
  }
  const recorded = durationSuggestion(data, fieldId, activityMode, now, goalId);
  return { eligible: recorded.eligible, minutes: recorded.minutes, source: recorded.eligible ? 'recorded' : null, scope: recorded.scope, n: recorded.n, spanDays: recorded.spanDays, from: recorded.from, to: recorded.to, sessionIds: recorded.sessionIds,
    evidence: t('The median recorded duration. There are not yet enough I\'m back markers to measure how long your attention lasts.') };
}
