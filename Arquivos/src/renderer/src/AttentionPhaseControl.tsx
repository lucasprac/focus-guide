import type { AppState } from '../../shared/types';
import { ATTENTION_PHASES, ATTENTION_PHASE_LABELS, currentAttentionPhase, type AttentionPhase } from '../../shared/attention-phase';
import type { Action } from './App';
import { Segments } from './ui';
import { t } from '../../shared/i18n';

// Short labels for the small brain timer; the full name is in the button's label and title.
const SHORT_LABELS: Record<AttentionPhase, () => string> = { 'warm-up': () => t('Warm'), sustain: () => t('Hold'), fatigue: () => t('Tired') };

/* The attention state during a focus session. An automatic session only shows it; a manual session (one that started
   with manual attention states on) also lets you change it. Nothing shows outside a focus session. */
export function AttentionPhaseControl({ data, act, variant }: { data: AppState; act: Action; variant: 'main' | 'mini' | 'bar' }) {
  const state = currentAttentionPhase(data.timer, data.events);
  if (!state) return null;
  const set = (phase: string) => { if (phase && phase !== state.phase) void act('attention.phase', { phase, source: variant === 'main' ? 'main' : 'floating' }); };
  if (!state.manual) return <p className={`attention-phase attention-phase-${variant} auto`} role="status" title={t('Automatic attention state. Choose Manual in Settings to set it yourself.')}>
    {variant === 'mini' ? ATTENTION_PHASE_LABELS[state.phase] : t('Attention: {phase} · automatic', { phase: ATTENTION_PHASE_LABELS[state.phase] })}
  </p>;
  if (variant === 'main') return <div className="attention-phase attention-phase-main">
    <Segments value={state.phase} onChange={set} label={t('Attention state')} options={ATTENTION_PHASES.map(phase => ({ value: phase, label: ATTENTION_PHASE_LABELS[phase] }))} />
  </div>;
  return <div className={`attention-phase attention-phase-${variant}`} role="group" aria-label={t('Attention state')}>
    {ATTENTION_PHASES.map(phase => <button key={phase} type="button" aria-pressed={state.phase === phase} className={state.phase === phase ? 'selected' : ''} aria-label={ATTENTION_PHASE_LABELS[phase]} title={t('Attention state: {phase}', { phase: ATTENTION_PHASE_LABELS[phase] })} onClick={() => set(phase)}>
      {variant === 'mini' ? SHORT_LABELS[phase]() : ATTENTION_PHASE_LABELS[phase]}
    </button>)}
  </div>;
}
