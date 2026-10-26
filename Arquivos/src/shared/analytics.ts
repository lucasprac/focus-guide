import type { Dataset, FocusSession } from './types';

const formatters = new Map<string, Intl.DateTimeFormat>();
export function parts(time: number | string, zone: string): { day: string; hour: number; weekday: string } {
  let fmt = formatters.get(zone);
  if (!fmt) { fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }); formatters.set(zone, fmt); }
  const p = Object.fromEntries(fmt.formatToParts(new Date(time)).map(v => [v.type, v.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday };
}
export function localDay(time: number | string, zone: string): string { return parts(time, zone).day; }
export function addDays(day: string, n: number): string { return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10); }
export function monday(day: string): string { const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); return addDays(day, -(weekday === 0 ? 6 : weekday - 1)); }
export function splitInterval(startedAt: string, durationMs: number, zone: string): Array<{ day: string; ms: number }> {
  const result: Array<{ day: string; ms: number }> = [];
  let cursor = Date.parse(startedAt); const end = cursor + durationMs;
  while (cursor < end) {
    const day = localDay(cursor, zone);
    let high = Math.min(cursor + 3600000, end);
    while (high < end && localDay(high, zone) === day) high = Math.min(high + 3600000, end);
    let boundary = high;
    if (localDay(high, zone) !== day) {
      let low = cursor;
      while (high - low > 1) { const mid = Math.floor((high + low) / 2); if (localDay(mid, zone) === day) low = mid; else high = mid; }
      boundary = high;
    }
    if (boundary <= cursor) break;
    const last = result[result.length - 1];
    if (last?.day === day) last.ms += boundary - cursor; else result.push({ day, ms: boundary - cursor });
    cursor = boundary;
  }
  return result;
}
export interface DaySummary { day: string; minutes: number; count: number; ratings: number[]; fields: Record<string, number> }
export function calendarSessionIndex(data: Dataset): Map<string, FocusSession[]> {
  const completed = data.sessions.filter(s => s.status === 'completed').sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const sessions = new Map(completed.map(s => [s.id, s]));
  const dates = new Map(completed.map(s => [s.id, new Set([localDay(s.startedAt, s.timezone)])]));
  for (const event of data.events) {
    const session = sessions.get(event.sessionId);
    if (!session || event.kind !== 'active') continue;
    for (const segment of splitInterval(event.startedAt, event.durationMs, session.timezone)) dates.get(session.id)!.add(segment.day);
  }
  const result = new Map<string, FocusSession[]>();
  for (const session of completed) for (const day of dates.get(session.id)!) {
    const rows = result.get(day);
    if (rows) rows.push(session); else result.set(day, [session]);
  }
  return result;
}
export function summarizeDays(data: Dataset, fieldId = '', goalId = ''): DaySummary[] {
  const map = new Map<string, DaySummary>();
  const get = (day: string) => { let row = map.get(day); if (!row) { row = { day, minutes: 0, count: 0, ratings: [], fields: {} }; map.set(day, row); } return row; };
  const sessions = data.sessions.filter(s => s.status === 'completed' && !s.excluded && (!fieldId || s.fieldId === fieldId) && (!goalId || s.goalId === goalId));
  const byId = new Map(sessions.map(s => [s.id, s]));
  for (const s of sessions) { const row = get(localDay(s.startedAt, s.timezone)); row.count++; if (s.focus !== null) row.ratings.push(s.focus); }
  for (const e of data.events) {
    const s = byId.get(e.sessionId); if (!s || e.kind !== 'active' || e.durationMs <= 0) continue;
    for (const segment of splitInterval(e.startedAt, e.durationMs, s.timezone)) {
      const row = get(segment.day); const minutes = segment.ms / 60000; row.minutes += minutes; row.fields[s.fieldId] = (row.fields[s.fieldId] ?? 0) + minutes;
    }
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}
export function mean(values: number[]): number | null { return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null; }
export function median(values: number[]): number | null {
  if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}
function ranks(values: number[]): number[] {
  const order = values.map((v, index) => ({ v, index })).sort((a, b) => a.v - b.v); const result = Array<number>(values.length);
  for (let i = 0; i < order.length;) { let j = i + 1; while (j < order.length && order[j].v === order[i].v) j++; const rank = (i + 1 + j) / 2; for (let k = i; k < j; k++) result[order[k].index] = rank; i = j; }
  return result;
}
export function spearman(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 2 || [...x, ...y].some(v => !Number.isFinite(v))) return null;
  const rx = ranks(x), ry = ranks(y), mx = mean(rx)!, my = mean(ry)!;
  let covariance = 0, sx = 0, sy = 0;
  for (let i = 0; i < x.length; i++) { const a = rx[i] - mx, b = ry[i] - my; covariance += a * b; sx += a * a; sy += b * b; }
  return sx && sy ? Math.max(-1, Math.min(1, covariance / Math.sqrt(sx * sy))) : null;
}
export interface Correlation { n: number; missing: number; spanDays: number; rho: number | null; eligible: boolean; reason: string; points: Array<{ x: number; y: number; id: string }> }
export function correlation(sessions: FocusSession[], key: 'energy' | 'duration'): Correlation {
  const complete = sessions.filter(s => s.focus !== null && (key !== 'energy' || s.energy !== null));
  const days = complete.map(s => localDay(s.startedAt, s.timezone)).sort();
  const spanDays = days.length ? Math.round((Date.parse(days[days.length - 1]) - Date.parse(days[0])) / 86400000) + 1 : 0;
  const points = complete.map(s => ({ x: key === 'energy' ? s.energy! : s.activeMs / 60000, y: s.focus!, id: s.id }));
  const eligible = complete.length >= 20 && spanDays >= 7;
  const rho = eligible ? spearman(points.map(p => p.x), points.map(p => p.y)) : null;
  return { n: complete.length, missing: sessions.length - complete.length, spanDays, rho, eligible, points,
    reason: !eligible ? 'Collect 20 complete pairs spanning at least 7 days.' : rho === null ? 'No variation in one of these measures yet.' : 'Exploratory association in your recorded sessions.' };
}
export function selectedSessions(data: Dataset, from: string, to: string, fieldId = '',goalId = ''): FocusSession[] {
  return data.sessions.filter(s => { const day = localDay(s.startedAt, s.timezone); return s.status === 'completed' && !s.excluded && (!fieldId || s.fieldId === fieldId) && (!goalId || s.goalId === goalId) && day >= from && day <= to; });
}
export function totalMinutes(data: Dataset): number { return data.sessions.filter(s => s.status === 'completed' && !s.excluded).reduce((sum, s) => sum + s.activeMs / 60000, 0); }
