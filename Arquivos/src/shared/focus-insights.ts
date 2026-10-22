import { ACTIVITY_MODES, CHALLENGES, DETRACTORS, PROBE_ANSWERS, type ActivityMode, type ActivitySample, type Challenge, type Dataset, type Detractor, type FocusSession, type ProbeAnswer, type SessionEvent } from './types';
import { localDay, mean, median, parts, selectedSessions, spearman } from './analytics';
import { TIME_BANDS, WEEKDAYS } from './behaviour-analytics';
import { Z90, differenceInterval, kMeans, kaplanMeier, meanInterval, mulberry32, quantile, ridgeFit, ridgeSelect, silhouettes, t90, zUpper } from './insight-stats';

/* Personal insight engine: processing rules, analyses and suggestions over the selected sessions.
   The main process runs it for `insights.read`; the renderer runs it for the example dataset. It is pure
   and deterministic. Drift = an attention-return or an interruption; probe answers count only as offTaskShare. */
export const INSIGHTS_LIMITS_NOTE = 'Patterns in your own records, with intervals that show their uncertainty. Self-ratings and markers describe what you reported; they are not measures of attention. You choose when to focus, so associations do not establish causes. Missing reports stay unknown.';
export const DETRACTOR_LABELS: Record<Detractor, string> = { none: 'Nothing notable', notifications: 'Phone or notifications', people: 'People or noise', thoughts: 'Wandering thoughts', tiredness: 'Tiredness or hunger', task: 'Unclear or too hard task', other: 'Something else' };
export const CHALLENGE_LABELS: Record<Challenge, string> = { 'too-easy': 'Too easy', right: 'About right', 'too-hard': 'Too hard' };
export const PROBE_ANSWER_LABELS: Record<ProbeAnswer, string> = { 'on-task': 'On the task', drifting: 'Drifting', elsewhere: 'Somewhere else' };
/* Processing rules, eligibility and suggestion thresholds of the design (sections 6, 7 and 12). */
export const INSIGHT_THRESHOLDS = {
  longSessionMs: 8 * 3600000, minObservedMs: 30000, returnVersion: 3, inputVersion: 4,
  rhythm: { ratedSessions: 10, bandwidthHours: 1.5, hourWeight: 3, cellSessions: 3 },
  attentionSpan: { sessions: 15, events: 8, groupSessions: 8, groupEvents: 4 },
  sessionShape: { sessions: 10, blockMinutes: 5, maxMinutes: 120, blockSessions: 5 },
  states: { minutes: 300, sessions: 5, minK: 2, maxK: 5, starts: 4, trainMinutes: 5000, silhouettePoints: 1500, quietInputShare: 0.15, fragmentationPairs: 10 },
  detractors: { sessions: 10, meanSessions: 3 },
  correlation: { pairs: 20, spanDays: 7 },
  model: { ratedSessions: 30, spanDays: 14, testPoints: 10, maxTestPoints: 40, minTrainSessions: 20, usefulGain: 0.05, bootstrap: 200, modeSessions: 5, gapCapHours: 24, lambdaPerRow: [0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10] },
  suggestions: { max: 5, windowSessions: 5, windowGain: 0.3, lengthStep: 5, lengthMinimum: 15, breakEarlyMinutes: 20, breakRatio: 1.5, breakDrifts: 8, switchingRho: -0.3, comparisonSessions: 3, ratedShare: 0.6, activityCoverage: 0.5, markerShare: 0.2 }
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
export interface AttentionSpanSection extends Eligibility { overall: SurvivalCurve | null; byBand: SurvivalCurve[]; byMode: SurvivalCurve[] }
export interface SessionShapeSection extends Eligibility {
  points: Array<{ minute: number; sessions: number; inputShare: number | null; switchesPerMinute: number | null; driftPerHour: number | null; offTaskShare: number | null }>;
}
export interface InteractionState {
  id: number; label: string; share: number;
  centroid: { inputShare: number; keysPerMinute: number; clicksPerMinute: number; scrollsPerMinute: number; movementShare: number; switchesPerMinute: number | null };
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
export interface ModelFeature { name: string; label: string; effect: Interval }
export interface FocusModelSection extends Eligibility {
  useful: boolean; trainedOn: number; tested: number; lambda: number | null;
  mae: number | null; baselineMae: number | null; features: ModelFeature[];
}
export interface Recommendation {
  id: string; kind: 'window' | 'length' | 'break' | 'detractor' | 'switching' | 'challenge' | 'data';
  title: string; detail: string; evidence: string; strength: 'tentative' | 'moderate';
  /* Only on 'length': the suggested session length. */
  minutes?: number;
}
export interface FocusInsights {
  from: string; to: string; computedAt: string; quality: DataQuality;
  rhythm: RhythmSection; attentionSpan: AttentionSpanSection; sessionShape: SessionShapeSection;
  states: StatesSection; detractors: DetractorsSection; model: FocusModelSection;
  recommendations: Recommendation[]; note: string;
}
export interface InsightOptions { from: string; to: string; fieldId?: string; goalId?: string; now?: number }

const T = INSIGHT_THRESHOLDS;
const known = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
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
    droppedLong ? `Sessions longer than ${T.longSessionMs / 3600000} active hours are left out (${plural(droppedLong, 'session')}).` : '',
    recovered ? `Recovered sessions are left out of attention span and session shape (${plural(recovered, 'session')}).` : '',
    old ? `Sessions recorded before I'm back existed are left out of drift rates, attention span and session shape; their interruptions still count by category (${plural(old, 'session')}).` : '',
    droppedMarkers ? `Markers after the end of their session are left out (${plural(droppedMarkers, 'marker')}).` : '',
    short ? `Activity minutes with less than ${T.minObservedMs / 1000} s observed are left out of interaction states (${plural(short, 'minute')}).` : '',
    unmeasured ? `Activity minutes recorded before input time existed are left out of interaction states (${plural(unmeasured, 'minute')}).` : '',
    probeSessions ? `${plural(probeSessions, 'session')} had attention check-ins, which also interrupt a little.` : ''
  ].filter(Boolean);
  return { sessions: n, activeMinutes: facts.reduce((sum, f) => sum + f.s.activeMs, 0) / 60000, spanDays: spanOf(facts.map(f => f.day)),
    ratedShare: n ? ratingsOf(facts).length / n : null, reflectionShare: n ? facts.filter(f => f.s.detractor != null || f.s.challenge != null).length / n : null,
    activityCoverage: activeMs > 0 ? Math.min(1, current.reduce((sum, f) => sum + f.observedMs, 0) / activeMs) : null,
    markerSessions: facts.filter(f => f.drifts.length).length, probeSessions, probeAnswered: facts.reduce((sum, f) => sum + f.probes.length, 0), probeMissed: facts.reduce((sum, f) => sum + f.missed, 0),
    droppedLong, droppedRecovered: recovered, notes };
}

/* Drift needs I'm back (version 3); switches and probe shares count only sessions that have them. Each rate needs `minimum` such sessions. */
function ratesOf(rows: Facts[], minimum: number): { driftPerHour: number | null; switchesPerHour: number | null; offTaskShare: number | null } {
  const drift = rows.filter(f => f.version >= T.returnVersion), switching = rows.filter(f => f.switchObservedMs > 0), probed = rows.filter(f => f.probes.length);
  const exposure = drift.reduce((sum, f) => sum + f.hours, 0), switchHours = switching.reduce((sum, f) => sum + f.switchObservedMs, 0) / 3600000;
  return { driftPerHour: drift.length >= minimum && exposure > 0 ? drift.reduce((sum, f) => sum + f.drifts.length, 0) / exposure : null,
    switchesPerHour: switching.length >= minimum && switchHours > 0 ? switching.reduce((sum, f) => sum + f.switches, 0) / switchHours : null,
    offTaskShare: probed.length >= minimum ? probed.reduce((sum, f) => sum + f.offTask, 0) / probed.reduce((sum, f) => sum + f.probes.length, 0) : null };
}

function rhythmSection(facts: Facts[]): RhythmSection {
  const R = T.rhythm, rated = ratingsOf(facts).length;
  if (rated < R.ratedSessions) return { eligible: false, n: rated, reason: `Rate at least ${R.ratedSessions} sessions to see when you focus best (${rated} so far).`, hours: [], grid: [] };
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
  return { eligible: true, n: rated, reason: `Perceived focus by start hour, smoothed over about ${R.bandwidthHours} hours, with 90% intervals. An hour appears when nearby sessions weigh at least ${R.hourWeight}; a grid cell needs ${R.cellSessions} sessions.`, hours, grid };
}

function survivalCurve(label: string, rows: Facts[]): SurvivalCurve {
  const times = rows.map(f => ({ time: (f.drifts[0] ?? f.s.activeMs) / 60000, event: f.drifts.length > 0 })), km = kaplanMeier(times), points: SurvivalCurve['points'] = [];
  // One point per minute: the survival after that minute's last drift, with the number at risk before its first.
  let bucket = -1;
  for (const [i, p] of km.points.entries()) {
    const key = i ? Math.floor(p.time) : -1, last = points[points.length - 1];
    if (last && key === bucket) Object.assign(last, { survival: p.survival, low: p.low, high: p.high });
    else { points.push({ minute: p.time, survival: p.survival, low: p.low, high: p.high, atRisk: p.atRisk }); bucket = key; }
  }
  const end = Math.max(...times.map(t => t.time)), last = points[points.length - 1];
  if (end > last.minute) points.push({ ...last, minute: end, atRisk: times.filter(t => t.time >= end).length });
  return { label, sessions: rows.length, events: times.filter(t => t.event).length, median: km.median, medianOpen: !km.points.some(p => p.high <= 0.5), points };
}

function attentionSpanSection(base: Facts[]): AttentionSpanSection {
  const A = T.attentionSpan, events = base.filter(f => f.drifts.length).length;
  if (base.length < A.sessions || events < A.events) return { eligible: false, n: base.length, reason: `Needs ${A.sessions} sessions recorded with I'm back and ${A.events} first drifts (${plural(base.length, 'session')}, ${plural(events, 'drift')} so far).`, overall: null, byBand: [], byMode: [] };
  const group = (label: string, rows: Facts[]) => rows.length >= A.groupSessions && rows.filter(f => f.drifts.length).length >= A.groupEvents ? [survivalCurve(label, rows)] : [];
  return { eligible: true, n: base.length, reason: `Active time until the first I'm back or interruption. A session without one counts until it ends. Group curves need ${A.groupSessions} sessions and ${A.groupEvents} drifts.`,
    overall: survivalCurve('All sessions', base), byBand: TIME_BANDS.flatMap((band, b) => group(band.label, base.filter(f => f.band === b))), byMode: ACTIVITY_MODES.flatMap(mode => group(mode, base.filter(f => f.mode === mode))) };
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

function sessionShapeSection(base: Facts[], blocks: Block[]): SessionShapeSection {
  const S = T.sessionShape, withActivity = base.filter(f => f.rows.some(a => a.observedMs >= T.minObservedMs)).length;
  if (withActivity < S.sessions) return { eligible: false, n: withActivity, reason: `Needs ${S.sessions} sessions with activity collection on (${withActivity} so far).`, points: [] };
  return { eligible: true, n: withActivity, reason: `Blocks of ${S.blockMinutes} active minutes, up to ${S.maxMinutes} minutes. A block appears while at least ${S.blockSessions} sessions are still running.`,
    points: blocks.filter(b => b.sessions >= S.blockSessions).map(b => ({ minute: b.minute, sessions: b.sessions, inputShare: b.inputObserved > 0 ? b.input / b.inputObserved : null, switchesPerMinute: b.switchObserved > 0 ? b.switches / (b.switchObserved / 60000) : null,
      driftPerHour: b.exposureMinutes > 0 ? b.drifts / (b.exposureMinutes / 60) : null, offTaskShare: b.answered ? b.offTask / b.answered : null })) };
}

function association(points: Array<{ x: number; y: number; day: string }>, what: string): { focusRho: number | null; pairs: number; reason: string } {
  const C = T.correlation, eligible = points.length >= C.pairs && spanOf(points.map(p => p.day)) >= C.spanDays, rho = eligible ? spearman(points.map(p => p.x), points.map(p => p.y)) : null;
  return { focusRho: rho, pairs: points.length, reason: !eligible ? `Collect ${C.pairs} rated sessions with ${what} over at least ${C.spanDays} days (${points.length} so far).` : rho === null ? 'No variation in one of these measures yet.' : 'Exploratory association in your recorded sessions.' };
}

const STATE_NAMES = ['Typing', 'Pointing and clicking', 'Scrolling', 'Moving the pointer'];
function statesSection(facts: Facts[]): StatesSection {
  const S = T.states, minutes: Array<{ f: Facts; a: ActivitySample; v: number[] }> = [];
  for (const f of facts) if (f.version >= T.inputVersion) for (const a of f.rows) if (a.observedMs >= T.minObservedMs && known(a.inputMs)) {
    const perMinute = 60000 / a.observedMs;
    minutes.push({ f, a, v: [Math.min(1, a.inputMs / a.observedMs), Math.log1p(a.keys * perMinute), Math.log1p(a.clicks * perMinute), Math.log1p(a.scrolls * perMinute), Math.min(1, a.movementMs / a.observedMs)] });
  }
  const sessions = new Set(minutes.map(m => m.f)).size;
  const unavailable = (reason: string): StatesSection => ({ eligible: false, n: minutes.length, reason, k: 0, silhouette: null, states: [], byMode: [], fragmentation: { perHourMedian: null, focusRho: null, pairs: 0, reason: 'Needs interaction states first.' } });
  if (minutes.length < S.minutes || sessions < S.sessions) return unavailable(`Needs ${S.minutes} activity minutes with input time from ${S.sessions} sessions (${plural(minutes.length, 'minute')} from ${plural(sessions, 'session')} so far).`);
  const means = [0, 1, 2, 3, 4].map(j => minutes.reduce((sum, m) => sum + m.v[j], 0) / minutes.length), sds = means.map((m, j) => Math.sqrt(minutes.reduce((sum, x) => sum + (x.v[j] - m) ** 2, 0) / minutes.length));
  const z = minutes.map(m => m.v.map((v, j) => sds[j] > 1e-9 ? (v - means[j]) / sds[j] : 0));
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
  if (!fits.length) return unavailable('Your activity minutes are too similar to separate into states.');
  // The silhouette picks k; on a tie the smaller k stays.
  const scores = silhouettes(sample, fits.map(fit => fit.labels.slice(0, sample.length))), chosen = scores.reduce((best, score, i) => score > scores[best] + 1e-9 ? i : best, 0);
  const best = { centroids: fits[chosen].centroids, score: scores[chosen] }, centroids = best.centroids, labels = z.map(v => { let pick = 0, low = Infinity; centroids.forEach((c, i) => { let d = 0; for (let j = 0; j < v.length; j++) d += (c[j] - v[j]) ** 2; if (d < low) { low = d; pick = i; } }); return pick; });
  const totals = centroids.map(() => ({ count: 0, observed: 0, input: 0, keys: 0, clicks: 0, scrolls: 0, movement: 0, switches: 0, switchObserved: 0 }));
  minutes.forEach(({ a }, i) => { const t = totals[labels[i]]; t.count++; t.observed += a.observedMs; t.input += a.inputMs!; t.keys += a.keys; t.clicks += a.clicks; t.scrolls += a.scrolls; t.movement += a.movementMs; if (known(a.switches)) { t.switches += a.switches; t.switchObserved += a.observedMs; } });
  const rate = (count: number, ms: number) => count / (ms / 60000);
  // Names follow the design's rule: little input time is Quiet, otherwise the largest standardized input count names the state.
  const named = centroids.map((c, cluster) => ({ c, cluster, t: totals[cluster] })).filter(x => x.t.count).map(({ c, cluster, t }) => {
    const inputShare = Math.min(1, t.input / t.observed), top = [1, 2, 3, 4].reduce((a, b) => c[b] > c[a] ? b : a);
    return { cluster, name: inputShare < S.quietInputShare ? 'Quiet' : STATE_NAMES[top - 1], share: t.count / minutes.length,
      centroid: { inputShare, keysPerMinute: rate(t.keys, t.observed), clicksPerMinute: rate(t.clicks, t.observed), scrollsPerMinute: rate(t.scrolls, t.observed), movementShare: Math.min(1, t.movement / t.observed), switchesPerMinute: t.switchObserved > 0 ? rate(t.switches, t.switchObserved) : null } };
  }).sort((a, b) => a.centroid.inputShare - b.centroid.inputShare || a.cluster - b.cluster);
  const states: InteractionState[] = named.map((x, id) => {
    const same = named.filter(y => y.name === x.name), rank = same.indexOf(x);
    return { id, label: x.name + (same.length < 2 ? '' : rank === 0 ? ' · light' : rank === same.length - 1 ? ' · heavy' : same.length === 3 ? ' · medium' : ` · medium ${rank}`), share: x.share, centroid: x.centroid };
  });
  const idOf = new Map(named.map((x, id) => [x.cluster, id])), modeCounts = new Map<ActivityMode, number[]>(), sequences = new Map<Facts, Array<{ start: number; end: number; id: number }>>();
  minutes.forEach((m, i) => {
    const id = idOf.get(labels[i])!, counts = modeCounts.get(m.f.mode) ?? states.map(() => 0); counts[id]++; modeCounts.set(m.f.mode, counts);
    push(sequences, m.f, { start: m.a.startMs, end: m.a.endMs, id });
  });
  const rates: Array<{ f: Facts; perHour: number }> = [];
  for (const [f, rows] of sequences) {
    let pairs = 0, changes = 0;
    for (let i = 1; i < rows.length; i++) if (rows[i].start - rows[i - 1].end <= 1000) { pairs++; if (rows[i].id !== rows[i - 1].id) changes++; }
    if (pairs >= S.fragmentationPairs) rates.push({ f, perHour: changes / pairs * 60 });
  }
  return { eligible: true, n: minutes.length, reason: 'Activity minutes grouped by how you used the keyboard and mouse. The number of states is the one that separates the minutes best.', k: states.length, silhouette: best.score, states,
    byMode: ACTIVITY_MODES.flatMap(mode => { const counts = modeCounts.get(mode); if (!counts) return []; const total = counts.reduce((sum, c) => sum + c, 0); return [{ mode, minutes: total, shares: counts.map(c => c / total) }]; }),
    fragmentation: { perHourMedian: median(rates.map(r => r.perHour)), ...association(rates.filter(r => r.f.s.focus !== null).map(r => ({ x: r.perHour, y: r.f.s.focus!, day: r.f.day })), 'interaction states') } };
}

function detractorsSection(facts: Facts[]): DetractorsSection {
  const D = T.detractors, n = facts.length, ratedMean = (rows: Facts[]) => { const ratings = ratingsOf(rows); return ratings.length >= D.meanSessions ? mean(ratings) : null; };
  if (n < D.sessions) return { eligible: false, n, reason: `Needs ${D.sessions} sessions (${n} so far).`, reported: [], interruptions: [], byBand: [], switching: { perHourMedian: null, focusRho: null, pairs: 0, reason: `Needs ${D.sessions} sessions first.` }, challenge: [] };
  const hours = facts.reduce((sum, f) => sum + f.hours, 0), categories = new Map<string, number>();
  for (const f of facts) for (const c of f.interruptions) categories.set(c, (categories.get(c) ?? 0) + 1);
  const switching = facts.filter(f => f.switchObservedMs > 0), perHour = (f: Facts) => f.switches / (f.switchObservedMs / 3600000);
  return { eligible: true, n, reason: `What you reported after sessions, with mean focus once ${D.meanSessions} rated sessions share an answer. Rates use active time, or observed time for window switches.`,
    reported: DETRACTORS.map(detractor => { const rows = facts.filter(f => f.s.detractor === detractor); return { detractor, sessions: rows.length, focusMean: ratedMean(rows) }; }).filter(r => r.sessions).sort((a, b) => b.sessions - a.sessions),
    interruptions: [...categories].map(([category, count]) => ({ category, count, perHour: hours > 0 ? count / hours : null })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    byBand: TIME_BANDS.map((band, b) => ({ band: band.label, ...ratesOf(facts.filter(f => f.band === b), D.meanSessions) })),
    switching: { perHourMedian: median(switching.map(perHour)), ...association(switching.filter(f => f.s.focus !== null).map(f => ({ x: perHour(f), y: f.s.focus!, day: f.day })), 'window switch counts') },
    challenge: CHALLENGES.map(challenge => { const rows = facts.filter(f => f.s.challenge === challenge); return { challenge, sessions: rows.length, focusMean: ratedMean(rows) }; }).filter(r => r.sessions) };
}

/* Pre-session features. Missing planned length and energy are NaN until scaling; 'contrast' reports twice the raw effect of a ±1 term. */
interface DayContext { sessions: number; minutes: number; gapHours: number }
interface Column { name: string; kind: 'sd' | 'binary' | 'contrast'; label: (sd: number) => string; value: (f: Facts, day: DayContext) => number }
const BASE_COLUMNS: Column[] = [
  { name: 'hourSin', kind: 'contrast', label: () => 'Starting near 06:00 rather than 18:00', value: f => Math.sin(2 * Math.PI * f.hour / 24) },
  { name: 'hourCos', kind: 'contrast', label: () => 'Starting near midnight rather than midday', value: f => Math.cos(2 * Math.PI * f.hour / 24) },
  { name: 'weekend', kind: 'binary', label: () => 'Weekend rather than weekday', value: f => f.weekday === 'Sat' || f.weekday === 'Sun' ? 1 : 0 },
  { name: 'plannedMinutes', kind: 'sd', label: sd => `Longer planned length (+1 SD ≈ ${whole(sd)} min)`, value: f => f.s.plannedMs === null ? NaN : f.s.plannedMs / 60000 },
  { name: 'stopwatch', kind: 'binary', label: () => 'Stopwatch rather than a planned countdown', value: f => f.s.plannedMs === null ? 1 : 0 },
  { name: 'energy', kind: 'sd', label: sd => `Higher starting energy (+1 SD ≈ ${one(sd)})`, value: f => f.s.energy ?? NaN },
  { name: 'energyMissing', kind: 'binary', label: () => 'Starting energy not recorded', value: f => f.s.energy === null ? 1 : 0 },
  { name: 'earlierSessions', kind: 'sd', label: sd => `More sessions earlier that day (+1 SD ≈ ${one(sd)})`, value: (_, c) => c.sessions },
  { name: 'earlierMinutes', kind: 'sd', label: sd => `More focus time earlier that day (+1 SD ≈ ${whole(sd)} min)`, value: (_, c) => c.minutes },
  { name: 'hoursSincePrevious', kind: 'sd', label: () => 'Longer gap since the previous session (+1 SD, log scale)', value: (_, c) => Math.log1p(c.gapHours) },
  { name: 'goal', kind: 'binary', label: () => 'Linked to a goal', value: f => f.s.goalId ? 1 : 0 }
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
  const reference = modes.reduce((best, m) => counts.get(m)! > counts.get(best)! ? m : best), against = counts.size > modes.length ? `${reference} and other modes` : reference;
  return modes.filter(m => m !== reference).map((mode): Column => ({ name: `mode:${mode}`, kind: 'binary', label: () => `${mode} rather than ${against}`, value: f => f.mode === mode ? 1 : 0 }));
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
function modelSection(data: Dataset, facts: Facts[]): FocusModelSection {
  const M = T.model, rated = facts.filter(f => f.s.focus !== null), n = rated.length, spanDays = spanOf(rated.map(f => f.day)), tests = Math.min(M.maxTestPoints, n - M.minTrainSessions);
  if (n < M.ratedSessions || spanDays < M.spanDays || tests < M.testPoints) return { eligible: false, n, reason: `Needs ${M.ratedSessions} rated sessions over ${M.spanDays} days (${plural(n, 'rated session')} over ${plural(spanDays, 'day')} so far).`, useful: false, trainedOn: 0, tested: 0, lambda: null, mae: null, baselineMae: null, features: [] };
  const contexts = dayContexts(data, facts, rated), base = rated.map((f, i) => BASE_COLUMNS.map(c => c.value(f, contexts[i]))), y = rated.map(f => f.s.focus!);
  // Each fit uses the mode columns of its own training rows; the penalties grow with the number of training rows.
  const design = (count: number) => { const modes = modeColumns(rated, count); return { columns: [...BASE_COLUMNS, ...modes], rows: modes.length ? base.map((row, i) => [...row, ...modes.map(c => c.value(rated[i], contexts[i]))]) : base }; };
  const lambdas = (count: number) => M.lambdaPerRow.map(l => l * count), predict = (fit: { intercept: number; coefficients: number[] }, row: number[]) => fit.intercept + fit.coefficients.reduce((sum, b, j) => sum + b * row[j], 0);
  // Rolling origin: each test session is predicted by a model that saw only the sessions before it. The baseline is their mean rating.
  let error = 0, baseline = 0;
  for (let t = n - tests; t < n; t++) {
    const { rows } = design(t), scale = scalerOf(rows, t), fit = ridgeSelect(rows.slice(0, t).map(scale.apply), y.slice(0, t), lambdas(t));
    error += Math.abs(Math.min(5, Math.max(1, predict(fit, scale.apply(rows[t])))) - y[t]); baseline += Math.abs(mean(y.slice(0, t))! - y[t]);
  }
  const mae = error / tests, baselineMae = baseline / tests, useful = baselineMae > 0 && mae <= (1 - M.usefulGain) * baselineMae;
  const { columns, rows } = design(n), scale = scalerOf(rows, n), x = rows.map(scale.apply), final = ridgeSelect(x, y, lambdas(n)), comparison = `${mae.toFixed(2)} vs ${baselineMae.toFixed(2)} points of error over ${tests} later sessions`;
  const result = { eligible: true, n, useful, trainedOn: n, tested: tests, lambda: final.lambda, mae, baselineMae };
  if (!useful) return { ...result, reason: `The model does not predict your next rating clearly better than your average rating (${comparison}), so no associations are shown.`, features: [] };
  const effects = (beta: number[]) => beta.map((b, j) => scale.sds[j] <= 1e-9 ? 0 : columns[j].kind === 'sd' ? b : b / scale.sds[j] * (columns[j].kind === 'contrast' ? 2 : 1));
  const random = mulberry32(42), draws: number[][] = [];
  for (let b = 0; b < M.bootstrap; b++) { const pick = Array.from({ length: n }, () => Math.floor(random() * n)); draws.push(effects(ridgeFit(pick.map(i => x[i]), pick.map(i => y[i]), final.lambda).coefficients)); }
  // Plain percentile intervals: with shrinkage they need not contain the estimate.
  const estimate = effects(final.coefficients);
  const features = columns.map((c, j) => { const sorted = draws.map(d => d[j]).sort((a, b) => a - b); return { name: c.name, label: c.label(scale.sds[j]), effect: { estimate: estimate[j], low: quantile(sorted, 0.05), high: quantile(sorted, 0.95) } }; })
    .filter((_, j) => scale.sds[j] > 1e-9).sort((a, b) => Math.abs(b.effect.estimate) - Math.abs(a.effect.estimate) || a.name.localeCompare(b.name));
  return { ...result, reason: `Predicts your next rating better than your average rating did (${comparison}). The effects are associations, not causes.`, features };
}

const KIND_ORDER: Recommendation['kind'][] = ['window', 'length', 'break', 'detractor', 'switching', 'challenge', 'data'];
const DETRACTOR_ACTIONS: Record<Exclude<Detractor, 'none'>, string> = {
  notifications: 'Try Do Not Disturb, or leave the phone in another room during the session.', people: 'Try headphones, a quieter place, or a focus time agreed with the people around you.',
  thoughts: 'When a thought pulls at you, use Park this thought and return to the task.', tiredness: 'Try water, a snack or a short rest before you start, or a shorter first block.',
  task: 'Before you start, write down the first small step so the task is clear.', other: 'Add a short note after these sessions to find what they have in common.'
};
function recommendationsOf(facts: Facts[], quality: DataQuality, rhythm: RhythmSection, span: AttentionSpanSection, base: Facts[], blocks: Block[], detractors: DetractorsSection): Recommendation[] {
  const S = T.suggestions, out: Recommendation[] = [], overall = mean(ratingsOf(facts)), lower = (values: number[], reference: number[]) => differenceInterval(values, reference).high < 0 ? 'moderate' as const : 'tentative' as const;
  if (rhythm.eligible && overall !== null) {
    const best = TIME_BANDS.map((band, b) => ({ band, values: ratingsOf(facts.filter(f => f.band === b)) })).filter(x => x.values.length >= S.windowSessions).map(x => ({ ...x, interval: meanInterval(x.values) }))
      .filter(x => x.interval.estimate >= overall + S.windowGain).sort((a, b) => b.interval.estimate - a.interval.estimate)[0];
    if (best) {
      const [name, range] = best.band.label.split(' · ');
      out.push({ id: `window-${name.toLowerCase()}`, kind: 'window', title: `Your best-rated sessions start ${name === 'Night' ? 'at night' : `in the ${name.toLowerCase()}`} (${range})`, detail: 'When you can, place demanding work in this window. You choose when you focus, so this is an association, not a cause.',
        evidence: `Mean focus ${one(best.interval.estimate)} vs ${one(overall)} overall, ${plural(best.values.length, 'session')} (90% interval ${one(best.interval.low)}–${one(best.interval.high)}).`, strength: best.interval.low > overall ? 'moderate' : 'tentative' });
    }
  }
  const curve = span.overall, spanMedian = curve?.median;
  if (span.eligible && curve && spanMedian) {
    const minutes = Math.max(S.lengthMinimum, Math.round(spanMedian.estimate / S.lengthStep) * S.lengthStep), open = curve.medianOpen === true;
    out.push({ id: 'length', kind: 'length', minutes, title: `Plan ${minutes}-minute blocks`, detail: `Your median time before the first drift is ${whole(spanMedian.estimate)} min (90% interval ${open ? `from ${whole(spanMedian.low)} min` : `${whole(spanMedian.low)}–${whole(spanMedian.high)} min`}). Start there and adjust.`,
      evidence: `${plural(curve.sessions, 'session')}, ${curve.events} with a first drift.`, strength: !open && spanMedian.high - spanMedian.low <= spanMedian.estimate ? 'moderate' : 'tentative' });
  }
  if (span.eligible) {
    const rate = (from: number, to: number) => { let drifts = 0, exposure = 0; for (const b of blocks) if (b.minute >= from && b.minute < to) { drifts += b.drifts; exposure += b.exposureMinutes; } return { drifts, exposure, perHour: exposure > 0 ? drifts / exposure * 60 : 0 }; };
    const early = rate(0, S.breakEarlyMinutes), likelihood = (r: { drifts: number; exposure: number }) => r.drifts > 0 ? r.drifts * Math.log(r.drifts / r.exposure) : 0;
    let best: { minute: number; sessions: number; after: ReturnType<typeof rate>; fit: number } | null = null, tried = 0;
    for (const b of blocks) {
      // The later rate must be seen over at least the early window's length in enough sessions, not only in a short tail.
      const later = blocks[(b.minute + S.breakEarlyMinutes) / T.sessionShape.blockMinutes];
      if (b.minute < S.breakEarlyMinutes || !later || later.sessions < T.sessionShape.blockSessions || early.exposure <= 0) continue;
      tried++; const after = rate(b.minute, T.sessionShape.maxMinutes);
      if (after.drifts < S.breakDrifts || after.perHour < S.breakRatio * early.perHour) continue;
      // Among the qualifying points, the change point with the highest two-rate Poisson likelihood.
      const fit = likelihood(rate(0, b.minute)) + likelihood(after);
      if (!best || fit > best.fit + 1e-12) best = { minute: b.minute, sessions: b.sessions, after, fit };
    }
    if (best) out.push({ id: 'break', kind: 'break', title: `Drift rises after about ${best.minute} minutes`, detail: `Try a short break around minute ${best.minute}, or end your blocks there.`,
      evidence: `${one(best.after.perHour)} drifts per hour after minute ${best.minute} vs ${one(early.perHour)} in the first ${S.breakEarlyMinutes} minutes; ${plural(best.sessions, 'session')} of ${base.length} reached minute ${best.minute}.`,
      // The point was chosen among `tried` points, so the rate-ratio bound uses a Bonferroni-corrected 95% one-sided level.
      strength: early.drifts > 0 && Math.log(best.after.perHour / early.perHour) - zUpper(0.05 / tried) * Math.sqrt(1 / best.after.drifts + 1 / early.drifts) > 0 ? 'moderate' : 'tentative' });
  }
  const top = detractors.eligible ? detractors.reported.find(r => r.detractor !== 'none')?.detractor : undefined, calm = ratingsOf(facts.filter(f => f.s.detractor === 'none'));
  if (top && top !== 'none' && calm.length >= S.comparisonSessions) {
    const values = ratingsOf(facts.filter(f => f.s.detractor === top));
    if (values.length >= S.comparisonSessions && mean(values)! < mean(calm)!) out.push({ id: `detractor-${top}`, kind: 'detractor', title: `${DETRACTOR_LABELS[top]} got in the way most often`, detail: DETRACTOR_ACTIONS[top],
      evidence: `${DETRACTOR_LABELS[top]}: mean focus ${one(mean(values)!)} in ${plural(values.length, 'rated session')} vs ${one(mean(calm)!)} in ${plural(calm.length, 'rated session')} with nothing notable.`, strength: lower(values, calm) });
  }
  const rho = detractors.switching.focusRho, pairs = detractors.switching.pairs;
  if (detractors.eligible && rho !== null && rho <= S.switchingRho) {
    // Fisher z interval for Spearman's rho (variance 1.06 / (n - 3)).
    const upper = Math.tanh(Math.atanh(Math.max(-0.999999, rho)) + Z90 * Math.sqrt(1.06 / Math.max(1, pairs - 3)));
    out.push({ id: 'switching', kind: 'switching', title: 'Sessions with more window switching tend to have lower focus', detail: 'Try closing what the task does not need, or keep one window for the task.', evidence: `Spearman ρ ${rho.toFixed(2)} across ${plural(pairs, 'rated session')}.`, strength: upper < 0 ? 'moderate' : 'tentative' });
  }
  const right = ratingsOf(facts.filter(f => f.s.challenge === 'right'));
  if (detractors.eligible && right.length >= S.comparisonSessions) {
    const worst = (['too-hard', 'too-easy'] as const).map(challenge => ({ challenge, values: ratingsOf(facts.filter(f => f.s.challenge === challenge)) })).filter(x => x.values.length >= S.comparisonSessions && mean(x.values)! < mean(right)!).sort((a, b) => mean(a.values)! - mean(b.values)!)[0];
    if (worst) {
      const hard = worst.challenge === 'too-hard';
      out.push({ id: `challenge-${worst.challenge}`, kind: 'challenge', title: hard ? 'Sessions that felt too hard rate lower' : 'Sessions that felt too easy rate lower', detail: hard ? 'Try starting with a smaller first step.' : 'Try adding a small challenge, such as a time box or a harder problem.',
        evidence: `${CHALLENGE_LABELS[worst.challenge]}: mean focus ${one(mean(worst.values)!)} in ${plural(worst.values.length, 'rated session')} vs ${one(mean(right)!)} in ${plural(right.length, 'rated session')} that felt about right.`, strength: lower(worst.values, right) });
    }
  }
  if (quality.sessions) {
    const M = T.model, sessions = plural(quality.sessions, 'session');
    if (quality.ratedShare !== null && quality.ratedShare < S.ratedShare) out.push({ id: 'data-ratings', kind: 'data', title: 'Rate more sessions to unlock the focus model', detail: `Rate perceived focus when a session ends. The focus model needs ${M.ratedSessions} rated sessions over ${M.spanDays} days.`, evidence: `${percent(quality.ratedShare)} of ${sessions} rated.`, strength: 'tentative' });
    else if (quality.activityCoverage === null || quality.activityCoverage < S.activityCoverage) out.push({ id: 'data-activity', kind: 'data', title: 'Turn on activity collection to see interaction states', detail: 'Keyboard and mouse counts describe how you work. They stay on this computer and never include what you type.',
      evidence: quality.activityCoverage === null ? `No activity was recorded in these ${sessions}.` : `Activity covers ${percent(quality.activityCoverage)} of active time in ${sessions}.`, strength: 'tentative' });
    else if (quality.markerSessions / quality.sessions < S.markerShare) out.push({ id: 'data-markers', kind: 'data', title: "Press I'm back when you notice a drift", detail: 'Each marker helps estimate how long your attention usually lasts before the first drift.', evidence: `${quality.markerSessions} of ${sessions} have a drift marker.`, strength: 'tentative' });
  }
  return out.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'moderate' ? -1 : 1) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)).slice(0, S.max);
}

/* `activity` holds the samples of the selected sessions; other samples are ignored. Pure and deterministic. */
export function focusInsights(data: Dataset, activity: ActivitySample[], options: InsightOptions): FocusInsights {
  const selected = selectedSessions(data, options.from, options.to, options.fieldId ?? '', options.goalId ?? '');
  const sessions = selected.filter(s => s.activeMs <= T.longSessionMs).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id));
  const { facts, droppedMarkers } = collect(data, activity, sessions), base = facts.filter(f => !f.s.recovered && f.version >= T.returnVersion && f.s.activeMs > 0), blocks = blocksOf(base);
  const quality = qualityOf(facts, selected.length - sessions.length, droppedMarkers), rhythm = rhythmSection(facts), attentionSpan = attentionSpanSection(base), detractors = detractorsSection(facts);
  return { from: options.from, to: options.to, computedAt: new Date(options.now ?? Date.now()).toISOString(), quality, rhythm, attentionSpan, sessionShape: sessionShapeSection(base, blocks),
    states: statesSection(facts), detractors, model: modelSection(data, facts), recommendations: recommendationsOf(facts, quality, rhythm, attentionSpan, base, blocks, detractors), note: INSIGHTS_LIMITS_NOTE };
}
