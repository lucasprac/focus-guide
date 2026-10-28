import type { ActivityMode, ActivitySample, Challenge, Dataset, Detractor } from './types';
import { addDays, localDay } from './analytics';
import { mulberry32 } from './insight-stats';

/* Share of typing, scrolling and quiet minutes for each activity mode. */
const MINUTE_MIX: Record<ActivityMode, [number, number, number]> = { 'Writing/coding': [0.65, 0.2, 0.15], Reading: [0.1, 0.55, 0.35], 'Video/lecture': [0.1, 0.15, 0.75], 'Visual work': [0.35, 0.35, 0.3], Mixed: [0.4, 0.3, 0.3], Offline: [0, 0, 1], Unspecified: [0.34, 0.33, 0.33] };

// This dataset exists only in the renderer's example view; it is never inserted or exported.
// Planted patterns: mornings rate higher, evenings drift sooner, sessions with more window switching rate lower,
// and minutes fall into three interaction states (typing, scrolling, quiet). Every random choice comes from mulberry32(42).
export function exampleDataset(settings: Dataset['settings']): Dataset {
  const now = new Date().toISOString(), zone = 'America/Fortaleza', today = localDay(Date.now(), zone), random = mulberry32(42);
  const fields = [{ id: 'example-study', name: 'Aprendizado', color: '#a99af7', archived: false, createdAt: now }, { id: 'example-work', name: 'Trabalho profundo', color: '#62d8cd', archived: false, createdAt: now }, { id: 'example-create', name: 'Prática criativa', color: '#e4b76a', archived: false, createdAt: now }];
  const data: Dataset = { fields, categories: [], tasks: [], sessions: [], events: [], settings, reviews: [], activity: [] };
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)], between = (low: number, high: number) => low + random() * (high - low);
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random()), few = (p: number) => random() < p ? 1 + Math.floor(random() * 2) : 0;
  const modes: Record<string, readonly ActivityMode[]> = { 'example-study': ['Reading', 'Video/lecture'], 'example-work': ['Writing/coding', 'Mixed'], 'example-create': ['Visual work', 'Reading'] };
  for (let i = 0; i < 60; i++) {
    // Two sessions a day over the last 30 days; the time slot (morning, afternoon, evening) rotates by day.
    const dayIndex = Math.floor(i / 2), slot = (dayIndex + i % 2) % 3, field = fields[i % 3], id = `example-session-${i}`, day = addDays(today, -30 + dayIndex);
    const hour = [8, 13, 19][slot] + Math.floor(random() * 3), started = Date.parse(`${day}T00:00:00.000Z`) + ((hour + 3) * 60 + pick([0, 15, 30, 45])) * 60000; // Fortaleza is UTC−3.
    const stopwatch = random() < 0.15, plannedMs = stopwatch ? null : pick([25, 45, 50, 60, 90]) * 60000;
    const activeMs = Math.round(plannedMs === null ? between(30, 80) * 60000 : random() < 0.7 ? plannedMs : plannedMs * between(0.6, 0.95));
    const mode = pick(modes[field.id]), switchy = random() < 0.35, switchRate = switchy ? between(0.8, 1.6) : between(0.05, 0.3), energy = random() < 0.95 ? 1 + Math.floor(random() * 5) : null;
    const challenge: Challenge | null = random() < 0.85 ? (random() < 0.65 ? 'right' : random() < 0.7 ? 'too-hard' : 'too-easy') : null;
    const rating = 3.5 + [0.9, 0, -0.6][slot] - switchRate + (energy === null ? 0 : (energy - 3) * 0.25) - (challenge === 'too-hard' ? 0.4 : 0) + normal() * 0.4;
    const focus = random() < 0.9 ? Math.max(1, Math.min(5, Math.round(rating))) : null;
    const detractor: Detractor | null = focus === null || random() >= 0.85 ? null : switchy ? (random() < 0.7 ? 'notifications' : pick(['people', 'thoughts'] as const)) : slot === 2 ? pick(['none', 'tiredness', 'thoughts'] as const) : pick(['none', 'none', 'thoughts', 'people', 'task'] as const);
    const startedAt = new Date(started).toISOString(), endedAt = new Date(started + activeMs).toISOString(), at = (offset: number) => new Date(started + offset).toISOString();
    data.sessions.push({ timingMode: stopwatch ? 'stopwatch' : 'countdown', autoOvertime: false, targetReached: plannedMs !== null && activeMs >= plannedMs, id, fieldId: field.id, primaryTaskId: null, checklistIds: [], intention: 'Sessão de foco de exemplo', plannedMs, activeMs, status: 'completed', startedAt, endedAt, timezone: zone,
      energy, focus, note: '', completionReason: plannedMs !== null && activeMs >= plannedMs ? 'timer' : 'early', excluded: false, recovered: false, activityMode: mode, behaviourVersion: 4, detractor, challenge });
    data.events.push({ id: `example-interval-${i}`, sessionId: id, kind: 'active', startedAt, endedAt, durationMs: activeMs, text: '', category: '' });
    // Drift: returns and interruptions; the first comes sooner in the evening and in sessions with more switching.
    const driftMinutes = [30, 20, 11][slot] * (switchy ? 0.7 : 1);
    for (let n = 0, offset = -Math.log(1 - random()) * driftMinutes * 60000; offset < activeMs; n++, offset += -Math.log(1 - random()) * driftMinutes * 72000) {
      const ms = Math.round(offset), interruption = random() < 0.3;
      data.events.push({ id: `example-${interruption ? 'interruption' : 'return'}-${i}-${n}`, sessionId: id, kind: interruption ? 'interruption' : 'attention-return', startedAt: at(ms), endedAt: at(ms), durationMs: 0, text: '', category: interruption ? pick(['Internal', 'External', 'Environment']) : '', activeOffsetMs: ms, source: interruption ? null : pick(['shortcut', 'floating'] as const) });
    }
    if (random() < 0.25) { const ms = Math.round(between(0.1, 0.9) * activeMs); data.events.push({ id: `example-thought-${i}`, sessionId: id, kind: 'thought', startedAt: at(ms), endedAt: at(ms), durationMs: 0, text: 'Responder à mensagem depois desta sessão', category: '', activeOffsetMs: ms, source: null }); }
    // Attention check-ins were on for the last two weeks: the first after 8–20 active minutes, then every 15–35, never in the last 5 minutes of a countdown.
    if (dayIndex >= 16) for (let n = 0, offset = between(8, 20) * 60000; n < 6 && offset < activeMs && (plannedMs === null || offset <= plannedMs - 5 * 60000); n++, offset += between(15, 35) * 60000) {
      const ms = Math.round(offset), missed = random() < 0.1, away = random() < 0.15 + (slot === 2 ? 0.2 : 0) + (switchy ? 0.15 : 0);
      data.events.push({ id: `example-probe-${i}-${n}`, sessionId: id, kind: 'probe', startedAt: at(ms), endedAt: at(ms), durationMs: 0, text: JSON.stringify({ latencyMs: missed ? null : Math.round(between(1200, 9000)) }), category: missed ? 'missed' : away ? pick(['drifting', 'elsewhere']) : 'on-task', activeOffsetMs: ms, source: missed ? null : pick(['floating', 'main'] as const) });
    }
    // A state lasts several minutes (shorter runs in sessions with more switching), then the next one is drawn from the mode's mix.
    const mix = MINUTE_MIX[mode], stay = switchy ? 0.75 : 0.88;
    for (let m = 0, start = 0, state = -1; start < activeMs; m++, start += 60000) {
      if (state < 0 || random() >= stay) { const roll = random(); state = roll < mix[0] ? 0 : roll < mix[0] + mix[1] ? 1 : 2; }
      const end = Math.min(activeMs, start + 60000), observedMs = end - start, scale = observedMs / 60000;
      const counts = [[60 + random() * 120, random() * 10, random() * 6], [random() * 8, random() * 10, 25 + random() * 50], [few(0.1), few(0.1), 0]][state].map(v => Math.floor(v * scale));
      const [movement, input] = [[between(0.03, 0.13), between(0.6, 0.9)], [between(0.15, 0.35), between(0.4, 0.7)], [between(0, 0.03), between(0, 0.08)]][state];
      data.activity!.push({ id: `example-activity-${i}-${m}`, sessionId: id, startMs: start, endMs: end, observedMs, keys: counts[0], clicks: counts[1], scrolls: counts[2], movementMs: Math.round(movement * observedMs), status: 'recorded', inputMs: Math.round(input * observedMs), switches: Math.floor(switchRate * scale + random()) } satisfies ActivitySample);
    }
  }
  return data;
}
