import { useRef, useState } from 'react';
import type { PendingProbe, ProbeAnswer } from '../../shared/types';
import type { Action } from './App';
import { Button } from './ui';

const answers: Array<{ value: ProbeAnswer; label: string }> = [
  { value: 'on-task', label: 'On the task' }, { value: 'drifting', label: 'Drifting' }, { value: 'elsewhere', label: 'Somewhere else' }
];
/** The host owns visibility, deadlines and timing; these controls only submit an answer. */
export default function ProbePrompt({ probe, act, mini = false }: { probe: PendingProbe; act: Action; mini?: boolean }) {
  const busy = useRef(false), [saving, setSaving] = useState(false);
  const answer = async (value: ProbeAnswer) => {
    if (busy.current) return;
    busy.current = true; setSaving(true);
    try { await act('probe.answer', { id: probe.id, answer: value, source: mini ? 'floating' : 'main' }); }
    finally { busy.current = false; setSaving(false); }
  };
  return <section className={`probe-prompt${mini ? ' probe-mini' : ''}`} aria-label="Attention check-in">
    <p>Where is your attention right now?</p>
    <div>{answers.map(a => <Button key={a.value} size="sm" variant="secondary" disabled={saving} onClick={() => void answer(a.value)}>{a.label}</Button>)}</div>
  </section>;
}
/** Mounted for the whole focus session, so screen readers announce the text when a check-in appears. Focus never moves. */
export function ProbeAnnouncer({ probe }: { probe?: PendingProbe | null }) {
  return <p className="sr-only" role="status" aria-live="polite">{probe ? 'Attention check-in: where is your attention right now?' : ''}</p>;
}
