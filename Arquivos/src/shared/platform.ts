/* The operating system that runs the app. It is a runtime fact, never a stored setting. Each process has its own
   copy of this module: the main process sets the platform at start, and the renderer sets it from AppState. */
export type Platform = 'windows' | 'mac';
let current: Platform = 'windows';
export function setPlatform(platform: unknown): void { current = platform === 'mac' ? 'mac' : 'windows'; }
export function getPlatform(): Platform { return current; }

/* The stored return shortcut keeps the tokens Ctrl, Alt, Shift and Win on every platform, so that settings and
   backups move between computers. Only the labels that the user reads change. */
const MAC_LABELS: Record<string, string> = { Ctrl: 'Control', Alt: 'Option', Win: 'Cmd' };
export function keyLabel(token: string): string { return current === 'mac' ? MAC_LABELS[token] ?? token : token; }
export function shortcutLabel(shortcut: string): string { return shortcut.split('+').map(keyLabel).join('+'); }

/* The modifiers of the shortcuts inside the app window: Cmd and Option on a Mac, Ctrl and Alt on Windows. */
export function primaryModifier(): string { return current === 'mac' ? 'Cmd' : 'Ctrl'; }
export function alternateModifier(): string { return current === 'mac' ? 'Option' : 'Alt'; }
/* True when the event holds the primary modifier of this platform and not the one of the other platform. */
export function primaryModifierPressed(event: { ctrlKey: boolean; metaKey: boolean }): boolean { return current === 'mac' ? event.metaKey && !event.ctrlKey : event.ctrlKey; }

/* The stored return shortcut as an Electron accelerator. The Win token is the Command key on a Mac. */
const ACCELERATOR: Record<string, string> = { Ctrl: 'Control', Win: 'Command' };
export function shortcutAccelerator(shortcut: string): string { return shortcut.split('+').map(token => ACCELERATOR[token] ?? token).join('+'); }
