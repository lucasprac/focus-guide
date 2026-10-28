import { PT_BR } from './locales/pt-BR';

/* Minimal i18n. The key of every message is its English text, so English needs no catalog and a missing
   translation falls back to the key. Each process (main, renderer, insights worker) has its own copy of
   this module and must call setLanguage with the saved setting. */
export type Language = 'en' | 'pt-BR';
export const LANGUAGES: readonly Language[] = ['en', 'pt-BR'];
/* Each language is named in its own language. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', 'pt-BR': 'Português (Brasil)' };
export type Params = Record<string, unknown>;

const CATALOGS: Record<Language, Record<string, string> | null> = { en: null, 'pt-BR': PT_BR };
let current: Language = 'en';

export function isLanguage(value: unknown): value is Language { return value === 'en' || value === 'pt-BR'; }
export function setLanguage(language: unknown): void { current = isLanguage(language) ? language : 'en'; }
export function getLanguage(): Language { return current; }
/* Locale for dates and numbers. English keeps the en-US formats of the original app. */
export function dateLocale(): string { return current === 'pt-BR' ? 'pt-BR' : 'en-US'; }

/* A message may hold plural forms separated by "|" (singular|plural). They are used when params.count is a number. */
function pick(text: string, params?: Params): string {
  if (!params || typeof params.count !== 'number' || !text.includes('|')) return text;
  const forms = text.split('|');
  return forms[params.count === 1 ? 0 : 1] ?? forms[0];
}
function format(text: string, params?: Params): string {
  const chosen = pick(text, params);
  return params ? chosen.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name] ?? '') : match) : chosen;
}

/* t('Save goal'), t('{count} session|{count} sessions', { count }), t('Due {date}', { date }). */
export function t(key: string, params?: Params): string {
  return format(CATALOGS[current]?.[key] ?? key, params);
}

/* Same English text with a different meaning in another place: the catalog entry is "context\u0004text". */
export const CONTEXT_SEPARATOR = '\u0004';
export function tc(context: string, key: string, params?: Params): string {
  const catalog = CATALOGS[current];
  return format(catalog?.[context + CONTEXT_SEPARATOR + key] ?? catalog?.[key] ?? key, params);
}
