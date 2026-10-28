import type { ActivityMode } from './types';

/* Display labels (pt-BR) for values that are stored in English. The stored values never change; only what the user reads does. */
export const ACTIVITY_MODE_LABELS: Record<ActivityMode, string> = {
  Unspecified: 'Não especificado', Reading: 'Leitura', 'Writing/coding': 'Escrita/programação', 'Visual work': 'Trabalho visual',
  'Video/lecture': 'Vídeo/aula', Offline: 'Offline', Mixed: 'Misto'
};
export function activityModeLabel(mode: string | null | undefined): string { return ACTIVITY_MODE_LABELS[(mode ?? 'Unspecified') as ActivityMode] ?? String(mode); }

/* Interruption categories are recorded as these English words (or as free text by older versions). */
const INTERRUPTION_LABELS: Record<string, string> = { Internal: 'Interna', External: 'Externa', Environment: 'Ambiente', Unspecified: 'Não especificada', Other: 'Outra' };
export function interruptionLabel(category: string | null | undefined): string { return INTERRUPTION_LABELS[category || 'Unspecified'] ?? String(category); }

/* Weekday keys come from an en-US Intl formatter in analytics.ts and must stay as they are. */
export const WEEKDAY_LABELS: Record<string, string> = { Mon: 'Seg', Tue: 'Ter', Wed: 'Qua', Thu: 'Qui', Fri: 'Sex', Sat: 'Sáb', Sun: 'Dom' };
export function weekdayLabel(day: string): string { return WEEKDAY_LABELS[day] ?? day; }

export const BARRIER_LABELS: Record<string, string> = { capability: 'Habilidades ou estratégia', opportunity: 'Tempo, espaço ou acesso', motivation: 'Valor ou motivação', other: 'Outro / a ação pareceu grande demais' };
export const EVENT_SOURCE_LABELS: Record<string, string> = { shortcut: 'atalho', floating: 'timer flutuante', main: 'janela principal' };
export function eventSourceLabel(source: string | null | undefined): string { return source ? EVENT_SOURCE_LABELS[source] ?? source : ''; }
export const OCCURRENCE_STATUS_LABELS: Record<string, string> = { unrecorded: 'sem registro', done: 'feita', smaller: 'versão menor', skipped: 'pulada' };
export const GOAL_STATUS_LABELS: Record<string, string> = { draft: 'Rascunho', active: 'Ativa', paused: 'Pausada', archived: 'Arquivada', achieved: 'Alcançada' };
