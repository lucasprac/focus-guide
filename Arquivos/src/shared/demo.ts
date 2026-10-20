import type { Dataset } from './types';
import { addDays, localDay } from './analytics';

// This dataset exists only in the renderer's example view; it is never inserted or exported.
export function exampleDataset(settings: Dataset['settings']): Dataset {
  const now = new Date().toISOString(), today = localDay(Date.now(), 'America/Fortaleza');
  const fields = [{ id: 'example-study', name: 'Learning', color: '#a99af7', archived: false, createdAt: now }, { id: 'example-work', name: 'Deep work', color: '#62d8cd', archived: false, createdAt: now }, { id: 'example-create', name: 'Creative practice', color: '#e4b76a', archived: false, createdAt: now }];
  const data: Dataset = { fields, categories: [], tasks: [], sessions: [], events: [], settings, reviews: [] };
  for (let i = 0; i < 36; i++) {
    const id = `example-session-${i}`, day = addDays(today, -12 + Math.floor(i / 3));
    const hour = [11, 16, 22][i % 3], started = Date.parse(`${day}T${hour}:00:00.000Z`);
    const duration = [25, 50, 72, 35, 90, 45][i % 6] * 60000;
    const energy = i % 5 + 1, focus = i % 7 === 0 ? null : Math.max(1, Math.min(5, energy + (i % 4 === 0 ? -1 : 1)));
    data.sessions.push({ timingMode: 'countdown', autoOvertime: false, targetReached: duration >= 90 * 60000, id, fieldId: fields[i % 3].id, primaryTaskId: null, checklistIds: [], intention: 'Example focus session', plannedMs: 90 * 60000, activeMs: duration, status: 'completed', startedAt: new Date(started).toISOString(), endedAt: new Date(started + duration).toISOString(), timezone: 'America/Fortaleza', energy, focus, note: '', completionReason: duration === 90 * 60000 ? 'timer' : 'early', excluded: false, recovered: false });
    data.events.push({ id: `example-interval-${i}`, sessionId: id, kind: 'active', startedAt: new Date(started).toISOString(), endedAt: new Date(started + duration).toISOString(), durationMs: duration, text: '', category: '' });
    if (i % 3 === 0) data.events.push({ id: `example-interruption-${i}`, sessionId: id, kind: 'interruption', startedAt: new Date(started + 600000).toISOString(), endedAt: new Date(started + 600000).toISOString(), durationMs: 0, text: '', category: i % 2 ? 'Internal' : 'External' });
  }
  return data;
}
