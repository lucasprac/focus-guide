import type { MilestoneKind } from './goal-types';

/* Milestones read and write light Markdown, one block per line:
   "- [ ] Open" / "- [x] Done" (to-do), "# Heading", "- Bullet", "1. Numbered", and plain text lines.
   A title that would read as a marker is escaped with one leading backslash. */
export interface MilestoneDraft { id?: string; title: string; kind: MilestoneKind; completed: boolean }
export const MILESTONE_LIMITS = { title: 200, count: 100 };
const todoLine = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?\[([ xX]?)\]\s+(.*)$/, headingLine = /^\s*#{1,6}\s+(.*)$/;
const bulletLine = /^\s*[-*+]\s+(.*)$/, numberedLine = /^\s*\d+[.)]\s+(.*)$/, quoteLine = /^\s*>\s?(.*)$/, fenceLine = /^\s*```/;
const checkboxStart = /^\[[ xX]?\]\s/, markerStart = /^(?:#{1,6}\s|[-*+>]\s|\d+[.)]\s|```)/;
function clean(title: string): string { return title.replace(/\s+/g, ' ').trim(); }
const unescape = (text: string) => text.startsWith('\\') ? text.slice(1) : text;

/* Plain lines become `plainKind`, so a plain list pasted into a to-do row stays a list of to-dos. */
export function parseMilestoneMarkdown(markdown: string, plainKind: MilestoneKind = 'text'): MilestoneDraft[] {
  const rows: MilestoneDraft[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim() || fenceLine.test(line)) continue;
    let kind: MilestoneKind = plainKind, completed = false, text = line.trim();
    const todo = todoLine.exec(line), heading = headingLine.exec(line), bullet = bulletLine.exec(line), numbered = numberedLine.exec(line), quote = quoteLine.exec(line);
    if (todo) { kind = 'todo'; completed = todo[1].toLowerCase() === 'x'; text = todo[2]; }
    else if (heading) { kind = 'heading'; text = heading[1]; }
    else if (bullet) { kind = 'bullet'; text = bullet[1]; }
    else if (numbered) { kind = 'numbered'; text = numbered[1]; }
    else if (quote) { kind = 'text'; text = quote[1]; }
    const title = clean(unescape(clean(text)));
    if (title) rows.push({ title: title.slice(0, MILESTONE_LIMITS.title), kind, completed: kind === 'todo' && completed });
  }
  return rows;
}

function escape(kind: MilestoneKind, title: string): string {
  const needs = title.startsWith('\\') || (kind === 'text' ? markerStart.test(title) || checkboxStart.test(title) : (kind === 'bullet' || kind === 'numbered') && checkboxStart.test(title));
  return needs ? `\\${title}` : title;
}
export function formatMilestoneMarkdown(rows: Array<Pick<MilestoneDraft, 'title' | 'kind' | 'completed'>>): string {
  return rows.map((row, i) => {
    const title = escape(row.kind, clean(row.title));
    if (row.kind === 'todo') return `- [${row.completed ? 'x' : ' '}] ${title}`;
    if (row.kind === 'heading') return `# ${title}`;
    if (row.kind === 'bullet') return `- ${title}`;
    if (row.kind === 'numbered') return `${listNumber(rows, i)}. ${title}`;
    return title;
  }).join('\n');
}

/* A numbered row counts from 1 within its run of consecutive numbered rows. */
export function listNumber(rows: Array<Pick<MilestoneDraft, 'kind'>>, index: number): number {
  let number = 1;
  for (let i = index - 1; i >= 0 && rows[i].kind === 'numbered'; i--) number++;
  return number;
}

/* A Markdown marker typed at the start of a row changes the row's kind. `length` is the marker
   length, so the editor applies it only when the caret is right after the marker. */
export function blockShortcut(text: string): { kind: MilestoneKind; completed: boolean; length: number } | null {
  const todo = /^(?:[-*+]\s)?\[([ xX]?)\]\s/.exec(text);
  if (todo) return { kind: 'todo', completed: todo[1].toLowerCase() === 'x', length: todo[0].length };
  const other = /^(?:(#{1,6})|([-*+])|(\d+[.)]))\s/.exec(text);
  if (!other) return null;
  return { kind: other[1] ? 'heading' : other[2] ? 'bullet' : 'numbered', completed: false, length: other[0].length };
}

/* Markdown loses identifiers, so reconnect parsed lines to earlier rows: an exact title match first,
   then a leftover row of the same kind on the same line (treated as a rename), otherwise a new row.
   Without `rename`, only exact titles match, so a changed title is a new row and the old row is left out. */
export function reconnectMilestones<T extends { id: string; title: string; kind: MilestoneKind }>(parsed: MilestoneDraft[], previous: T[], newId: () => string, rename = true): Array<MilestoneDraft & { id: string }> {
  const used = new Set<string>();
  const matched = parsed.map(row => { const hit = previous.find(p => !used.has(p.id) && p.title === row.title); if (hit) used.add(hit.id); return hit; });
  return parsed.map((row, i) => {
    const same = rename && previous[i] && !used.has(previous[i].id) && previous[i].kind === row.kind ? previous[i] : undefined;
    if (!matched[i] && same) used.add(same.id);
    return { id: (matched[i] ?? same)?.id ?? newId(), title: row.title, kind: row.kind, completed: row.completed };
  });
}
