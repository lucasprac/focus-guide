import type { AgentAccess, FocusVisual, Settings } from './types';
import { ACTIVITY_MODES, CHALLENGES, DETRACTORS, MEDICATION_ANSWERS, PROBE_ANSWERS, WARM_UPS, type ActivityMode, type Challenge, type Detractor, type Medication, type ProbeAnswer, type WarmUp } from './types';
import { t, isLanguage, type Language } from './i18n';

export function activityMode(value: unknown): ActivityMode {
  if (!ACTIVITY_MODES.includes(value as ActivityMode)) throw new Error(t('Choose a valid activity mode.'));
  return value as ActivityMode;
}
/* Reflection answers are optional; an absent answer stays null. */
export function detractor(value: unknown): Detractor | null {
  if (value === null || value === undefined) return null;
  if (!DETRACTORS.includes(value as Detractor)) throw new Error(t('Choose a valid main distraction.'));
  return value as Detractor;
}
export function challenge(value: unknown): Challenge | null {
  if (value === null || value === undefined) return null;
  if (!CHALLENGES.includes(value as Challenge)) throw new Error(t('Choose a valid challenge level.'));
  return value as Challenge;
}
export function warmUp(value: unknown): WarmUp | null {
  if (value === null || value === undefined) return null;
  if (!WARM_UPS.includes(value as WarmUp)) throw new Error(t('Choose a valid warm-up answer.'));
  return value as WarmUp;
}
export function medication(value: unknown): Medication | null {
  if (value === null || value === undefined) return null;
  if (!MEDICATION_ANSWERS.includes(value as Medication)) throw new Error(t('Choose a valid medication answer.'));
  return value as Medication;
}
export function probeAnswer(value: unknown): ProbeAnswer {
  if (!PROBE_ANSWERS.includes(value as ProbeAnswer)) throw new Error(t('Choose a valid check-in answer.'));
  return value as ProbeAnswer;
}
export function shortcut(value: unknown): string {
  const result = text(value, t('Return shortcut'), 80);
  if (!result) return ''; // An empty shortcut explicitly disables the global control.
  if (!/^(?:(?:Ctrl|Alt|Shift|Win)\+)+(?:Space|[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(result)) throw new Error(t('Use modifiers and one key, such as Ctrl+Alt+Space.'));
  const parts = result.split('+');
  if (new Set(parts).size !== parts.length) throw new Error(t('Shortcut modifiers cannot repeat.'));
  return result;
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(t('Expected an object.'));
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string, max = 500, required = false): string {
  if (typeof value !== 'string' || value.length > max || /\u0000/.test(value)) throw new Error(t('{name} must be text up to {max} characters.', { name, max }));
  const result = value.trim();
  if (required && !result) throw new Error(t('{name} is required.', { name }));
  return result;
}
export function number(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(t('{name} must be between {min} and {max}.', { name, min, max }));
  return value;
}
export function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(t('{name} must be true or false.', { name }));
  return value;
}
export function rating(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const r = number(value, t('Rating'), 1, 5);
  if (!Number.isInteger(r)) throw new Error(t('Ratings use whole numbers from 1 to 5.'));
  return r;
}
export function id(value: unknown): string {
  const result = text(value, t('Identifier'), 64, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new Error(t('Invalid identifier.'));
  return result;
}
export function timezone(value: unknown): string {
  const zone = text(value, t('Timezone'), 80, true);
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); } catch { throw new Error(t('Choose a valid IANA timezone, such as America/Fortaleza.')); }
  return zone;
}
export function color(value: unknown): string {
  const result = text(value, t('Color'), 7, true);
  if (!/^#[0-9a-fA-F]{6}$/.test(result)) throw new Error(t('Choose a valid color.'));
  return result;
}
export function settings(value: unknown): Settings {
  const v = object(value);
  const palettes = ['cyan', 'violet', 'amber', 'rose'];
  if (!palettes.includes(String(v.palette))) throw new Error(t('Unknown palette.'));
  const theme = v.theme === undefined ? 'light' : v.theme;
  if (theme !== 'light' && theme !== 'dark') throw new Error(t('Choose light or dark mode.'));
  return {
    weeklyCapacityMinutes: v.weeklyCapacityMinutes === undefined ? 0 : number(v.weeklyCapacityMinutes, t('Weekly capacity'), 0, 10080),
    collectActivity: vBoolean(v.collectActivity), returnShortcut: shortcut(v.returnShortcut ?? 'Ctrl+Alt+Space'),
    activityModes: Object.fromEntries(Object.entries(v.activityModes === undefined ? {} : object(v.activityModes)).map(([key, mode]) => [id(key), activityMode(mode)])),
    timezone: timezone(v.timezone), defaultMinutes: number(v.defaultMinutes, t('Default duration'), 1, 1440),
    animation: bool(v.animation, t('Animation')), sound: bool(v.sound, t('Sound')),
    palette: v.palette as Settings['palette'], weeklyGoalMinutes: number(v.weeklyGoalMinutes, t('Weekly goal'), 0, 10080),
    autoOvertime: v.autoOvertime === undefined ? true : bool(v.autoOvertime, t('Automatic overtime')),
    theme, sidebarCollapsed: v.sidebarCollapsed === undefined ? false : bool(v.sidebarCollapsed, t('Collapsed side panel')),
    agentAccess: agentAccess(v.agentAccess ?? 'off'),
    focusVisual: focusVisual(v.focusVisual ?? 'brain'),
    attentionProbes: v.attentionProbes === undefined ? false : bool(v.attentionProbes, t('Attention check-ins')),
    language: language(v.language)
  };
}
function language(value: unknown): Language {
  if (value === undefined) return 'en';
  if (!isLanguage(value)) throw new Error(t('Choose a supported language.'));
  return value;
}
/* A settings.update that does not send a language keeps the saved one instead of resetting it to English. */
export function withLanguage(input: unknown, current: Settings): unknown {
  const row = object(input);
  return 'language' in row ? row : { ...row, language: current.language ?? 'en' };
}
function focusVisual(value: unknown): FocusVisual {
  if (value !== 'brain' && value !== 'instrument') throw new Error(t('Choose the brain or the session gauge for Focus.'));
  return value;
}
export function agentAccess(value: unknown): AgentAccess {
  if (value !== 'off' && value !== 'read' && value !== 'propose' && value !== 'edit') throw new Error(t('Choose Off, Read only, Read and propose, or Read and edit for the AI agent.'));
  return value;
}
function vBoolean(value: unknown): boolean { return value === undefined ? false : bool(value, t('Activity collection')); }
export function timestamp(value: unknown): string {
  const result = text(value, t('Timestamp'), 40, true);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) throw new Error(t('Invalid UTC timestamp.'));
  return result;
}

export function priority(value: unknown): 'low' | 'normal' | 'high' {
  if (value !== 'low' && value !== 'normal' && value !== 'high') throw new Error(t('Choose a valid priority.'));
  return value;
}
export function date(value: unknown): string | null {
  if (value === null || value === '') return null;
  const result = text(value, t('Due date'), 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new Error(t('Choose a valid due date.'));
  return result;
}
