import { getLanguage } from './i18n';

/* Display labels for values that are stored in English. The stored values never change and English shows them
   as they are; only another language maps them to its own words. */
type Labels = Record<string, string>;
const PT_BR = {
  activityMode: { Unspecified: 'Não especificado', Reading: 'Leitura', 'Writing/coding': 'Escrita/programação', 'Visual work': 'Trabalho visual', 'Video/lecture': 'Vídeo/aula', Offline: 'Offline', Mixed: 'Misto' } as Labels,
  /* Interruption categories are recorded as these English words (or as free text by older versions). */
  interruption: { Internal: 'Interna', External: 'Externa', Environment: 'Ambiente', Unspecified: 'Não especificada', Other: 'Outra' } as Labels,
  /* Weekday keys come from an en-US Intl formatter in analytics.ts and must stay as they are. */
  weekday: { Mon: 'Seg', Tue: 'Ter', Wed: 'Qua', Thu: 'Qui', Fri: 'Sex', Sat: 'Sáb', Sun: 'Dom' } as Labels,
  barrier: { capability: 'Habilidades ou estratégia', opportunity: 'Tempo, espaço ou acesso', motivation: 'Valor ou motivação', other: 'Outro / a ação pareceu grande demais' } as Labels,
  eventSource: { shortcut: 'atalho', floating: 'timer flutuante', main: 'janela principal' } as Labels,
  occurrenceStatus: { unrecorded: 'sem registro', done: 'feita', smaller: 'versão menor', skipped: 'pulada' } as Labels,
  goalStatus: { draft: 'rascunho', active: 'ativa', paused: 'pausada', archived: 'arquivada', achieved: 'alcançada' } as Labels
};
const label = (map: Labels, value: string): string => getLanguage() === 'pt-BR' ? map[value] ?? value : value;

export function activityModeLabel(mode: string | null | undefined): string { return label(PT_BR.activityMode, mode ?? 'Unspecified'); }
export function interruptionLabel(category: string | null | undefined): string { return label(PT_BR.interruption, category || 'Unspecified'); }
export function weekdayLabel(day: string): string { return label(PT_BR.weekday, day); }
export function barrierLabel(barrier: string): string { return label(PT_BR.barrier, barrier); }
export function eventSourceLabel(source: string | null | undefined): string { return source ? label(PT_BR.eventSource, source) : ''; }
export function occurrenceStatusLabel(status: string): string { return label(PT_BR.occurrenceStatus, status); }
/* Lower case, as the stored status; badges capitalise it with CSS. */
export function goalStatusLabel(status: string): string { return label(PT_BR.goalStatus, status); }
export function upperFirst(text: string): string { return text ? text[0].toUpperCase() + text.slice(1) : text; }
