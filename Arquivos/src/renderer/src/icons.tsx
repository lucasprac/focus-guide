// Shared stroke icon set. Icons are decorative; controls carry their own accessible names.
export type IconName = 'focus' | 'calendar' | 'patterns' | 'world' | 'settings' | 'play' | 'pause' | 'stop' | 'float' | 'arrow' | 'close' | 'plus' | 'check' | 'download' | 'shield' | 'chevron' | 'chevron-down' | 'chevron-up' | 'thought' | 'spark' | 'sun' | 'moon' | 'edit' | 'archive' | 'restore' | 'filter' | 'trash' | 'chevron-left' | 'minus';
const iconPaths: Record<IconName, string> = {
  focus: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l8-8M16 4h4v4',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2ZM7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M7 18h2',
  patterns: 'M4 20V4M4 20h17M7 15l4-5 4 2 5-7',
  world: 'M12 3l7 4v9l-7 5-7-5V7l7-4ZM5 7l7 5 7-5M12 12v9',
  settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  play: 'm9 5 11 7-11 7V5Z', pause: 'M8 5v14M16 5v14', stop: 'M6 6h12v12H6V6Z',
  float: 'M4 4h16v16H4V4ZM12 12h8v8h-8v-8ZM8 8h3', arrow: 'M5 12h14M14 7l5 5-5 5',
  close: 'm6 6 12 12M6 18 18 6', plus: 'M12 5v14M5 12h14', check: 'm5 12 4 4 10-10',
  download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4', shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  chevron: 'm9 5 7 7-7 7', 'chevron-down': 'm6 9 6 6 6-6', 'chevron-up': 'm6 15 6-6 6 6', thought: 'M20 11a8 8 0 0 1-8 8H7l-4 3 1-6a8 8 0 1 1 16-5ZM8 10h8M8 14h5',
  spark: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1',
  moon: 'M20 14A8 8 0 0 1 10 4a9 9 0 1 0 10 10Z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4',
  archive: 'M4 5h16v4H4V5ZM5 9v10h14V9M10 13h4',
  restore: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  filter: 'M4 6h16M7 12h10M10 18h4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  'chevron-left': 'm15 5-7 7 7 7',
  minus: 'M5 12h14'
};
export function Icon({ name, size = 20, strokeWidth = 1.6, className }: { name: IconName; size?: number; strokeWidth?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name]} /></svg>;
}
