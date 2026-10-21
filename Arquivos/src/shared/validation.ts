import type { AgentAccess, Settings } from './types';
import { ACTIVITY_MODES, type ActivityMode } from './types';

export function activityMode(value: unknown): ActivityMode {
  if (!ACTIVITY_MODES.includes(value as ActivityMode)) throw new Error('Choose a valid activity mode.');
  return value as ActivityMode;
}
export function shortcut(value: unknown): string {
  const result = text(value, 'Return shortcut', 80);
  if (!result) return ''; // An empty shortcut explicitly disables the global control.
  if (!/^(?:(?:Ctrl|Alt|Shift|Win)\+)+(?:Space|[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(result)) throw new Error('Use modifiers and one key, such as Ctrl+Alt+Space.');
  const parts = result.split('+');
  if (new Set(parts).size !== parts.length) throw new Error('Shortcut modifiers cannot repeat.');
  return result;
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string, max = 500, required = false): string {
  if (typeof value !== 'string' || value.length > max || /\u0000/.test(value)) throw new Error(`${name} must be text up to ${max} characters.`);
  const result = value.trim();
  if (required && !result) throw new Error(`${name} is required.`);
  return result;
}
export function number(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return value;
}
export function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${name} must be true or false.`);
  return value;
}
export function rating(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const r = number(value, 'Rating', 1, 5);
  if (!Number.isInteger(r)) throw new Error('Ratings use whole numbers from 1 to 5.');
  return r;
}
export function id(value: unknown): string {
  const result = text(value, 'Identifier', 64, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new Error('Invalid identifier.');
  return result;
}
export function timezone(value: unknown): string {
  const zone = text(value, 'Timezone', 80, true);
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); } catch { throw new Error('Choose a valid IANA timezone, such as America/Fortaleza.'); }
  return zone;
}
export function color(value: unknown): string {
  const result = text(value, 'Color', 7, true);
  if (!/^#[0-9a-fA-F]{6}$/.test(result)) throw new Error('Choose a valid color.');
  return result;
}
export function settings(value: unknown): Settings {
  const v = object(value);
  const palettes = ['cyan', 'violet', 'amber', 'rose'];
  if (!palettes.includes(String(v.palette))) throw new Error('Unknown palette.');
  const theme = v.theme === undefined ? 'light' : v.theme;
  if (theme !== 'light' && theme !== 'dark') throw new Error('Choose light or dark mode.');
  return {
    weeklyCapacityMinutes: v.weeklyCapacityMinutes === undefined ? 0 : number(v.weeklyCapacityMinutes, 'Weekly capacity', 0, 10080),
    collectActivity: vBoolean(v.collectActivity), returnShortcut: shortcut(v.returnShortcut ?? 'Ctrl+Alt+Space'),
    activityModes: Object.fromEntries(Object.entries(v.activityModes === undefined ? {} : object(v.activityModes)).map(([key, mode]) => [id(key), activityMode(mode)])),
    timezone: timezone(v.timezone), defaultMinutes: number(v.defaultMinutes, 'Default duration', 1, 1440),
    animation: bool(v.animation, 'Animation'), sound: bool(v.sound, 'Sound'),
    palette: v.palette as Settings['palette'], weeklyGoalMinutes: number(v.weeklyGoalMinutes, 'Weekly goal', 0, 10080),
    autoOvertime: v.autoOvertime === undefined ? true : bool(v.autoOvertime, 'Automatic overtime'),
    theme, sidebarCollapsed: v.sidebarCollapsed === undefined ? false : bool(v.sidebarCollapsed, 'Collapsed side panel'),
    agentAccess: agentAccess(v.agentAccess ?? 'off')
  };
}
export function agentAccess(value: unknown): AgentAccess {
  if (value !== 'off' && value !== 'read' && value !== 'propose' && value !== 'edit') throw new Error('Choose Off, Read only, Read and propose, or Read and edit for the AI agent.');
  return value;
}
function vBoolean(value: unknown): boolean { return value === undefined ? false : bool(value, 'Activity collection'); }
export function timestamp(value: unknown): string {
  const result = text(value, 'Timestamp', 40, true);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) throw new Error('Invalid UTC timestamp.');
  return result;
}

export function priority(value: unknown): 'low' | 'normal' | 'high' {
  if (value !== 'low' && value !== 'normal' && value !== 'high') throw new Error('Choose a valid priority.');
  return value;
}
export function date(value: unknown): string | null {
  if (value === null || value === '') return null;
  const result = text(value, 'Due date', 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new Error('Choose a valid due date.');
  return result;
}
