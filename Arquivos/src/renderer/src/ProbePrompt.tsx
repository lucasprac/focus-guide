import { useRef, useState } from 'react';
import { ToggleGroup } from 'radix-ui';
import { CHALLENGES, DETRACTORS, PROBE_ANSWERS, type Challenge, type Detractor, type PendingProbe, type ProbeAnswer } from '../../shared/types';
import { CHALLENGE_LABELS, DETRACTOR_LABELS, PROBE_ANSWER_LABELS } from '../../shared/focus-insights';
import type { Action } from './App';
import { Icon, type IconName } from './components';
import { Button } from './ui';

const probeIcons: Record<ProbeAnswer, IconName> = { 'on-task': 'focus', drifting: 'thought', elsewhere: 'world' };
/** The host owns visibility, deadlines and timing; these controls only submit an answer. They never take keyboard focus. */
export default function ProbePrompt({ probe, act, mini = false }: { probe: PendingProbe; act: Action; mini?: boolean }) {
  const busy = useRef(false), [saving, setSaving] = useState(false);
  const answer = async (value: ProbeAnswer) => {
    if (busy.current) return;
    busy.current = true; setSaving(true);
    try { await act('probe.answer', { id: probe.id, answer: value, source: mini ? 'floating' : 'main' }); }
    finally { busy.current = false; setSaving(false); }
  };
  if (mini) return <section className="probe-prompt probe-mini" aria-label="Check-in de atenção">
    <p aria-hidden="true">Atenção agora?</p>
    <div>{PROBE_ANSWERS.map(value => <button key={value} type="button" disabled={saving} aria-label={PROBE_ANSWER_LABELS[value]} title={PROBE_ANSWER_LABELS[value]} onClick={() => void answer(value)}><Icon name={probeIcons[value]} size={15} /></button>)}</div>
  </section>;
  // Rendered inside the sticky top bar and placed just below it: it floats over the page, so nothing under the pointer moves when it appears or goes.
  return <section className="probe-prompt" aria-label="Check-in de atenção">
    <p><Icon name="spark" size={16} className="shrink-0 text-accent" />Onde está a sua atenção agora?</p>
    <div>{PROBE_ANSWERS.map(value => <Button key={value} size="sm" variant="secondary" disabled={saving} onClick={() => void answer(value)}>{PROBE_ANSWER_LABELS[value]}</Button>)}</div>
  </section>;
}
/** Mounted for the whole focus session, so screen readers announce the text when a check-in appears. Focus never moves. */
export function ProbeAnnouncer({ probe }: { probe?: PendingProbe | null }) {
  return <p className="sr-only" role="status" aria-live="polite">{probe ? 'Check-in de atenção: onde está a sua atenção agora?' : ''}</p>;
}

/** Optional single-choice reflection after a session. Choosing the selected answer again, or Clear, leaves it unanswered (null). */
export function ReflectionChoice<T extends string>({ label, value, values, labels, onChange }: { label: string; value: T | null; values: readonly T[]; labels: Record<T, string>; onChange: (value: T | null) => void }) {
  // The question alone names the group. Clear sits on the question's line, so showing it never moves the choices under the pointer.
  return <div className="reflection-choice">
    <div className="reflection-head"><span className="reflection-label">{label}</span><span className="optional">opcional</span>{value !== null && <button type="button" className="reflection-clear" aria-label={`Limpar resposta: ${label}`} onClick={() => onChange(null)}>Limpar</button>}</div>
    <ToggleGroup.Root type="single" aria-label={label} className="reflection-options" value={value ?? ''} onValueChange={next => onChange(next ? next as T : null)}>
      {values.map(v => <ToggleGroup.Item key={v} value={v}>{labels[v]}</ToggleGroup.Item>)}
    </ToggleGroup.Root>
  </div>;
}
export function ReflectionQuestions({ detractor, challenge, onDetractor, onChallenge }: { detractor: Detractor | null; challenge: Challenge | null; onDetractor: (value: Detractor | null) => void; onChallenge: (value: Challenge | null) => void }) {
  return <div className="reflection-questions">
    <ReflectionChoice label="O que mais atrapalhou?" value={detractor} values={DETRACTORS} labels={DETRACTOR_LABELS} onChange={onDetractor} />
    <ReflectionChoice label="Quão exigente foi?" value={challenge} values={CHALLENGES} labels={CHALLENGE_LABELS} onChange={onChallenge} />
  </div>;
}
