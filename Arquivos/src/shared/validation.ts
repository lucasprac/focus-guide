import type { AgentAccess, FocusVisual, Settings } from './types';
import { ACTIVITY_MODES, CHALLENGES, DETRACTORS, MEDICATION_ANSWERS, PROBE_ANSWERS, WARM_UPS, type ActivityMode, type Challenge, type Detractor, type Medication, type ProbeAnswer, type WarmUp } from './types';

export function activityMode(value: unknown): ActivityMode {
  if (!ACTIVITY_MODES.includes(value as ActivityMode)) throw new Error('Escolha um modo de atividade válido.');
  return value as ActivityMode;
}
/* Reflection answers are optional; an absent answer stays null. */
export function detractor(value: unknown): Detractor | null {
  if (value === null || value === undefined) return null;
  if (!DETRACTORS.includes(value as Detractor)) throw new Error('Escolha uma distração principal válida.');
  return value as Detractor;
}
export function challenge(value: unknown): Challenge | null {
  if (value === null || value === undefined) return null;
  if (!CHALLENGES.includes(value as Challenge)) throw new Error('Escolha um nível de desafio válido.');
  return value as Challenge;
}
export function warmUp(value: unknown): WarmUp | null {
  if (value === null || value === undefined) return null;
  if (!WARM_UPS.includes(value as WarmUp)) throw new Error('Escolha uma resposta de aquecimento válida.');
  return value as WarmUp;
}
export function medication(value: unknown): Medication | null {
  if (value === null || value === undefined) return null;
  if (!MEDICATION_ANSWERS.includes(value as Medication)) throw new Error('Escolha uma resposta de medicação válida.');
  return value as Medication;
}
export function probeAnswer(value: unknown): ProbeAnswer {
  if (!PROBE_ANSWERS.includes(value as ProbeAnswer)) throw new Error('Escolha uma resposta de check-in válida.');
  return value as ProbeAnswer;
}
export function shortcut(value: unknown): string {
  const result = text(value, 'Atalho de retorno', 80);
  if (!result) return ''; // An empty shortcut explicitly disables the global control.
  if (!/^(?:(?:Ctrl|Alt|Shift|Win)\+)+(?:Space|[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(result)) throw new Error('Use modificadores e uma tecla, como Ctrl+Alt+Space.');
  const parts = result.split('+');
  if (new Set(parts).size !== parts.length) throw new Error('Os modificadores do atalho não podem se repetir.');
  return result;
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Era esperado um objeto.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string, max = 500, required = false): string {
  if (typeof value !== 'string' || value.length > max || /\u0000/.test(value)) throw new Error(`${name} deve ser um texto de até ${max} caracteres.`);
  const result = value.trim();
  if (required && !result) throw new Error(`${name} é obrigatório.`);
  return result;
}
export function number(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} deve estar entre ${min} e ${max}.`);
  return value;
}
export function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${name} deve ser verdadeiro ou falso.`);
  return value;
}
export function rating(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const r = number(value, 'Avaliação', 1, 5);
  if (!Number.isInteger(r)) throw new Error('As avaliações usam números inteiros de 1 a 5.');
  return r;
}
export function id(value: unknown): string {
  const result = text(value, 'Identificador', 64, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new Error('Identificador inválido.');
  return result;
}
export function timezone(value: unknown): string {
  const zone = text(value, 'Fuso horário', 80, true);
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); } catch { throw new Error('Escolha um fuso horário IANA válido, como America/Fortaleza.'); }
  return zone;
}
export function color(value: unknown): string {
  const result = text(value, 'Cor', 7, true);
  if (!/^#[0-9a-fA-F]{6}$/.test(result)) throw new Error('Escolha uma cor válida.');
  return result;
}
export function settings(value: unknown): Settings {
  const v = object(value);
  const palettes = ['cyan', 'violet', 'amber', 'rose'];
  if (!palettes.includes(String(v.palette))) throw new Error('Paleta desconhecida.');
  const theme = v.theme === undefined ? 'light' : v.theme;
  if (theme !== 'light' && theme !== 'dark') throw new Error('Escolha o modo claro ou escuro.');
  return {
    weeklyCapacityMinutes: v.weeklyCapacityMinutes === undefined ? 0 : number(v.weeklyCapacityMinutes, 'Capacidade semanal', 0, 10080),
    collectActivity: vBoolean(v.collectActivity), returnShortcut: shortcut(v.returnShortcut ?? 'Ctrl+Alt+Space'),
    activityModes: Object.fromEntries(Object.entries(v.activityModes === undefined ? {} : object(v.activityModes)).map(([key, mode]) => [id(key), activityMode(mode)])),
    timezone: timezone(v.timezone), defaultMinutes: number(v.defaultMinutes, 'Duração padrão', 1, 1440),
    animation: bool(v.animation, 'Animação'), sound: bool(v.sound, 'Som'),
    palette: v.palette as Settings['palette'], weeklyGoalMinutes: number(v.weeklyGoalMinutes, 'Meta semanal', 0, 10080),
    autoOvertime: v.autoOvertime === undefined ? true : bool(v.autoOvertime, 'Tempo extra automático'),
    theme, sidebarCollapsed: v.sidebarCollapsed === undefined ? false : bool(v.sidebarCollapsed, 'Painel lateral recolhido'),
    agentAccess: agentAccess(v.agentAccess ?? 'off'),
    focusVisual: focusVisual(v.focusVisual ?? 'brain'),
    attentionProbes: v.attentionProbes === undefined ? false : bool(v.attentionProbes, 'Check-ins de atenção')
  };
}
function focusVisual(value: unknown): FocusVisual {
  if (value !== 'brain' && value !== 'instrument') throw new Error('Escolha o cérebro ou o medidor de sessão para o Foco.');
  return value;
}
export function agentAccess(value: unknown): AgentAccess {
  if (value !== 'off' && value !== 'read' && value !== 'propose' && value !== 'edit') throw new Error('Escolha Desligado, Somente leitura, Ler e propor ou Ler e editar para o agente de IA.');
  return value;
}
function vBoolean(value: unknown): boolean { return value === undefined ? false : bool(value, 'Coleta de atividade'); }
export function timestamp(value: unknown): string {
  const result = text(value, 'Data e hora', 40, true);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) throw new Error('Data e hora UTC inválida.');
  return result;
}

export function priority(value: unknown): 'low' | 'normal' | 'high' {
  if (value !== 'low' && value !== 'normal' && value !== 'high') throw new Error('Escolha uma prioridade válida.');
  return value;
}
export function date(value: unknown): string | null {
  if (value === null || value === '') return null;
  const result = text(value, 'Prazo', 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new Error('Escolha um prazo válido.');
  return result;
}
