import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import type { ViewProps } from './App';
import { sortMilestones, type Goal, type GoalMilestone, type MilestoneKind } from '../../shared/types';
import { MILESTONE_LIMITS, blockShortcut, formatMilestoneMarkdown, listNumber, parseMilestoneMarkdown } from '../../shared/milestone-markdown';
import { Button, CheckControl, IconButton, Segments, cn } from './ui';

/* A light block editor for a goal's milestones. Each row is a to-do, heading, bullet, numbered item or
   text line; only to-dos can be ticked and count as progress. The rows can also be edited as Markdown.
   The editor makes each row's identifier, so saving the same rows again never creates duplicates. */
export interface ChecklistItem { id: string; title: string; kind: MilestoneKind; completed: boolean }
type Change = { type: 'toggle'; item: ChecklistItem } | { type: 'structure' };
const newId = () => crypto.randomUUID();
const KIND_LABELS: Record<MilestoneKind, string> = { todo: 'To-do', heading: 'Heading', bullet: 'Bullet', numbered: 'Numbered', text: 'Text' };
const LIST_KINDS: MilestoneKind[] = ['todo', 'bullet', 'numbered'];
export function checklistItems(rows: Array<{ id?: string; title: string; kind: MilestoneKind; completed: boolean }>): ChecklistItem[] { return rows.map(r => ({ id: r.id ?? newId(), title: r.title, kind: r.kind, completed: r.kind === 'todo' && r.completed })); }
const tidy = (title: string) => title.replace(/\s+/g, ' ').trim();
export function filledItems(items: ChecklistItem[]): ChecklistItem[] { return items.filter(i => tidy(i.title)).map(i => ({ ...i, title: tidy(i.title) })); }

/* Markdown loses identifiers, so reconnect parsed lines to earlier rows: an exact title match first,
   then a leftover row of the same kind on the same line (treated as a rename), otherwise a new row. */
function reconnect(markdown: string, previous: ChecklistItem[]): ChecklistItem[] {
  const parsed = parseMilestoneMarkdown(markdown).slice(0, MILESTONE_LIMITS.count), used = new Set<string>();
  const matched = parsed.map(row => { const hit = previous.find(p => !used.has(p.id) && p.title === row.title); if (hit) used.add(hit.id); return hit; });
  return parsed.map((row, i) => {
    const same = previous[i] && !used.has(previous[i].id) && previous[i].kind === row.kind ? previous[i] : undefined;
    if (!matched[i] && same) used.add(same.id);
    return { id: (matched[i] ?? same)?.id ?? newId(), title: row.title, kind: row.kind, completed: row.completed };
  });
}

export function MilestoneChecklist({ items, onChange, onCommit, disabled, removeLabel = 'Remove' }: {
  items: ChecklistItem[]; onChange: (items: ChecklistItem[]) => void; onCommit?: (items: ChecklistItem[], change: Change) => void; disabled?: boolean; removeLabel?: string;
}) {
  const [draft, setDraft] = useState(''), [markdown, setMarkdown] = useState<string | null>(null), [message, setMessage] = useState(''), [activeId, setActiveId] = useState<string | null>(null);
  const moveFocus = useRef<string | null>(null), caretFocus = useRef<{ id: string; caret: number } | null>(null), titlesChanged = useRef(false), list = useRef<HTMLOListElement>(null);
  const hintId = useId(), active = items.find(i => i.id === activeId);
  useEffect(() => {
    // After Enter, Backspace, a paste or a kind change, put the caret where the edit left it.
    if (caretFocus.current) {
      const { id, caret } = caretFocus.current, input = list.current?.querySelector<HTMLInputElement>(`[data-row="${id}"] .milestone-title`);
      caretFocus.current = null;
      if (input) { input.focus(); const at = Math.min(caret, input.value.length); input.setSelectionRange(at, at); }
    }
    // After a move, keep focus on the moved row: the same arrow if it is still enabled, otherwise the other one.
    if (moveFocus.current) {
      const [id, direction] = moveFocus.current.split('|'), row = list.current?.querySelector<HTMLElement>(`[data-row="${id}"]`);
      (row?.querySelector<HTMLButtonElement>(`[data-move="${direction}"]:not([disabled])`) ?? row?.querySelector<HTMLButtonElement>('[data-move]:not([disabled])'))?.focus();
      moveFocus.current = null;
    }
  });
  const commit = (next: ChecklistItem[], change: Change = { type: 'structure' }) => { titlesChanged.current = false; onChange(next); onCommit?.(next, change); };
  const full = (count: number) => { if (items.length + count <= MILESTONE_LIMITS.count) return false; setMessage(`A checklist holds up to ${MILESTONE_LIMITS.count} rows.`); return true; };
  const update = (id: string, change: Partial<ChecklistItem>) => items.map(i => i.id === id ? { ...i, ...change } : i);
  const setKind = (item: ChecklistItem, kind: MilestoneKind, caret = 0) => { caretFocus.current = { id: item.id, caret }; commit(update(item.id, { kind, completed: kind === 'todo' && item.completed })); };
  const add = (text: string) => {
    const rows = parseMilestoneMarkdown(text, 'todo'), room = MILESTONE_LIMITS.count - items.length;
    if (!rows.length) return;
    if (room <= 0) { full(rows.length); return; }
    commit([...items, ...checklistItems(rows.slice(0, room))]); setDraft('');
    setMessage(rows.length > room ? `Added ${room}; a checklist holds up to ${MILESTONE_LIMITS.count} rows.` : rows.length > 1 ? `Added ${rows.length} rows.` : '');
  };
  const move = (index: number, by: number, keepCaret?: number) => {
    const next = [...items], [row] = next.splice(index, 1); next.splice(index + by, 0, row);
    if (keepCaret === undefined) moveFocus.current = `${row.id}|${by < 0 ? 'up' : 'down'}`; else caretFocus.current = { id: row.id, caret: keepCaret };
    commit(next);
  };
  const remove = (id: string) => commit(items.filter(i => i.id !== id));
  // Leaving the editor drops empty rows and saves typed titles.
  const leave = () => { const next = filledItems(items); if (titlesChanged.current || next.length !== items.length || next.some((row, i) => row.title !== items[i].title)) commit(next); };
  const leaveMarkdown = () => { if (markdown !== null) commit(reconnect(markdown, items)); setMarkdown(null); setMessage(''); };
  const focusRow = (index: number, caret: number) => {
    const input = items[index] && list.current?.querySelector<HTMLInputElement>(`[data-row="${items[index].id}"] .milestone-title`);
    if (input) { input.focus(); const at = Math.min(caret, input.value.length); input.setSelectionRange(at, at); }
  };

  const keyDown = (e: KeyboardEvent<HTMLInputElement>, item: ChecklistItem, index: number) => {
    const input = e.currentTarget, start = input.selectionStart ?? 0, end = input.selectionEnd ?? 0;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (item.kind === 'todo') { const changed = { ...item, completed: !item.completed }; commit(update(item.id, changed), { type: 'toggle', item: changed }); } return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Enter on an empty list row ends the list, as in most block editors.
      if (!item.title.trim() && item.kind !== 'text') { setKind(item, 'text'); return; }
      if (full(1)) return;
      const row: ChecklistItem = { id: newId(), title: item.title.slice(end).trimStart(), kind: item.kind === 'heading' ? 'text' : item.kind, completed: false };
      const next = update(item.id, { title: item.title.slice(0, start).trimEnd() }); next.splice(index + 1, 0, row);
      caretFocus.current = { id: row.id, caret: 0 }; commit(next); return;
    }
    if (e.key === 'Backspace' && start === 0 && end === 0) {
      if (item.kind !== 'text') { e.preventDefault(); setKind(item, 'text'); return; }
      const previous = items[index - 1];
      if (previous && previous.title.length + item.title.length <= MILESTONE_LIMITS.title) {
        e.preventDefault(); caretFocus.current = { id: previous.id, caret: previous.title.length };
        commit(update(previous.id, { title: previous.title + item.title }).filter(i => i.id !== item.id));
      } else if (!previous && !item.title && items.length > 1) { e.preventDefault(); caretFocus.current = { id: items[1].id, caret: 0 }; remove(item.id); }
      return;
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
      e.preventDefault(); const by = e.key === 'ArrowUp' ? -1 : 1;
      if (items[index + by]) move(index, by, start); return;
    }
    if (e.key === 'ArrowUp' && index > 0) { e.preventDefault(); focusRow(index - 1, start); }
    if (e.key === 'ArrowDown' && index < items.length - 1) { e.preventDefault(); focusRow(index + 1, start); }
  };
  const typed = (item: ChecklistItem, value: string, caret: number | null) => {
    // A marker converts the row when it was just typed (caret right after it) or arrived with the whole line in an empty row.
    const shortcut = blockShortcut(value);
    if (shortcut && (caret === shortcut.length || !item.title)) { caretFocus.current = { id: item.id, caret: Math.max(0, (caret ?? 0) - shortcut.length) }; commit(update(item.id, { kind: shortcut.kind, completed: shortcut.completed, title: value.slice(shortcut.length) })); return; }
    titlesChanged.current = true; onChange(update(item.id, { title: value }));
  };
  // Pasting several lines adds one row per line. Plain lines keep the row's list kind.
  const paste = (e: ClipboardEvent<HTMLInputElement>, item: ChecklistItem, index: number) => {
    const text = e.clipboardData.getData('text');
    if (!/\r?\n/.test(text.trim())) return;
    e.preventDefault();
    const rows = checklistItems(parseMilestoneMarkdown(text, LIST_KINDS.includes(item.kind) ? item.kind : 'text'));
    const replace = !item.title.trim(), room = MILESTONE_LIMITS.count - items.length + (replace ? 1 : 0), added = rows.slice(0, Math.max(0, room));
    if (!added.length) { full(rows.length); return; }
    const next = [...items]; next.splice(replace ? index : index + 1, replace ? 1 : 0, ...added);
    caretFocus.current = { id: added.at(-1)!.id, caret: MILESTONE_LIMITS.title };
    commit(next); setMessage(added.length < rows.length ? `Added ${added.length}; a checklist holds up to ${MILESTONE_LIMITS.count} rows.` : `Added ${added.length} rows.`);
  };

  const todos = items.filter(i => i.kind === 'todo');
  return <div className="milestone-checklist" onBlur={e => { if (markdown === null && !e.currentTarget.contains(e.relatedTarget as Node | null)) leave(); else if (titlesChanged.current) commit(items); }}>
    <div className="milestone-toolbar"><span className="hint">{todos.length ? `${todos.filter(i => i.completed).length} of ${todos.length} done` : 'No to-dos yet'}</span>
      <Button size="sm" variant="ghost" disabled={disabled} aria-pressed={markdown !== null} onClick={() => markdown === null ? setMarkdown(formatMilestoneMarkdown(filledItems(items))) : leaveMarkdown()}>{markdown === null ? 'Edit as Markdown' : onCommit ? 'Apply and show list' : 'Show as list'}</Button>
    </div>
    {markdown !== null ? <label className="form-label milestone-markdown">Milestones as Markdown<textarea aria-label="Milestones as Markdown" rows={Math.min(12, Math.max(4, items.length + 2))} maxLength={MILESTONE_LIMITS.count * (MILESTONE_LIMITS.title + 8)} value={markdown} disabled={disabled} onChange={e => setMarkdown(e.target.value)} placeholder={'# A section\n- [ ] A first meaningful result\n- [x] Something already done\n- A bullet point\n1. A numbered step\nA plain note'} /><span className="hint">One row per line: “- [ ]” open to-do, “- [x]” done, “#” heading, “-” bullet, “1.” numbered, and plain lines are text. Only to-dos count as progress.{onCommit ? ' Rows you delete here are archived, not erased.' : ''}</span></label>
      : <>
        {!!items.length && <div className="milestone-kinds-row"><span className="hint">{active ? `Row ${items.indexOf(active) + 1} type` : 'Row type'}</span>
          <Segments className="segmented milestone-kinds" label={active ? `Type of row ${items.indexOf(active) + 1}` : 'Row type: focus a row first'} value={active?.kind ?? ''} onChange={kind => { if (active && kind && !disabled) setKind(active, kind as MilestoneKind, active.title.length); }}
            options={(Object.keys(KIND_LABELS) as MilestoneKind[]).map(kind => ({ value: kind, label: KIND_LABELS[kind], ariaLabel: `Turn into ${KIND_LABELS[kind].toLowerCase()}` }))} /></div>}
        {!!items.length && <ol className="milestone-list" ref={list}>{items.map((item, index) => <li key={item.id} data-row={item.id} className={cn('milestone-row', `milestone-${item.kind}`, item.completed && 'completed', item.id === activeId && 'active')}>
          <span className="milestone-marker" aria-hidden={item.kind !== 'todo'}>{item.kind === 'todo'
            ? <CheckControl aria-label={`Done: ${item.title || `row ${index + 1}`}`} disabled={disabled} checked={item.completed} onChange={e => { const changed = { ...item, completed: e.target.checked }; commit(update(item.id, changed), { type: 'toggle', item: changed }); }} />
            : item.kind === 'bullet' ? '•' : item.kind === 'numbered' ? `${listNumber(items, index)}.` : null}</span>
          <input className="milestone-title" aria-label={`Row ${index + 1}, ${KIND_LABELS[item.kind].toLowerCase()}`} aria-describedby={hintId} maxLength={MILESTONE_LIMITS.title} disabled={disabled} value={item.title} placeholder={item.kind === 'heading' ? 'Heading' : item.kind === 'text' ? 'Text' : 'List item'}
            onFocus={() => setActiveId(item.id)} onChange={e => typed(item, e.target.value, e.target.selectionStart)} onKeyDown={e => keyDown(e, item, index)} onPaste={e => paste(e, item, index)} />
          <span className="milestone-row-actions">
            <IconButton icon="chevron-up" label={`Move up: ${item.title || `row ${index + 1}`}`} tooltip={false} data-move="up" disabled={disabled || index === 0} onClick={() => move(index, -1)} />
            <IconButton icon="chevron-down" label={`Move down: ${item.title || `row ${index + 1}`}`} tooltip={false} data-move="down" disabled={disabled || index === items.length - 1} onClick={() => move(index, 1)} />
            <IconButton icon={onCommit ? 'archive' : 'trash'} label={`${removeLabel}: ${item.title || `row ${index + 1}`}`} tooltip={false} disabled={disabled} onClick={() => remove(item.id)} />
          </span>
        </li>)}</ol>}
        <div className="milestone-add"><input aria-label="Add a milestone" aria-describedby={hintId} placeholder={items.length ? 'Add another to-do…' : 'Add a first to-do…'} maxLength={MILESTONE_LIMITS.title * 20} disabled={disabled || items.length >= MILESTONE_LIMITS.count} value={draft} onChange={e => { setDraft(e.target.value); setMessage(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
          onPaste={e => { const text = e.clipboardData.getData('text'); if (/\r?\n/.test(text.trim())) { e.preventDefault(); add(text); } }} />
          <Button size="sm" disabled={disabled || !draft.trim()} onClick={() => add(draft)}>Add</Button></div>
        <span className="hint" role="status">{message}</span>
        <span className="hint" id={hintId}>Start a row with # for a heading, - for a bullet, 1. for a numbered item or [ ] for a to-do. Enter adds a row, Backspace at the start turns a row into text, Ctrl+Enter ticks a to-do, Alt+Up or Alt+Down moves a row.</span>
      </>}
  </div>;
}

/* The checklist on the goal page. Ticking a saved to-do saves that milestone; every other edit saves the
   whole checklist at once, archiving any row that was removed. Saves run one at a time, and while focus
   is in the editor the rows on screen stay the source of truth. */
export function GoalMilestones({ goal, milestones, act, busy }: { goal: Goal; milestones: GoalMilestone[]; act: ViewProps['act']; busy?: boolean }) {
  const active = sortMilestones(milestones.filter(m => !m.archived)), latest = useRef(active); latest.current = active;
  const signature = JSON.stringify(active.map(m => [m.id, m.title, m.kind, m.completed]));
  const [items, setItems] = useState(() => checklistItems(active)), [editing, setEditing] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const pending = useRef<{ rows: ChecklistItem[]; change: Change } | null>(null), running = useRef(false);
  useEffect(() => { if (!editing && !saving && !pending.current) setItems(checklistItems(latest.current)); }, [signature, editing, saving]);
  const run = async () => {
    if (running.current) return;
    running.current = true; setSaving(true);
    try {
      while (pending.current) {
        const { rows, change } = pending.current; pending.current = null;
        const result = change.type === 'toggle' && latest.current.some(m => m.id === change.item.id)
          ? await act('goal.milestone.save', { id: change.item.id, goalId: goal.id, completed: change.item.completed })
          : await act('goal.milestones.sync', { goalId: goal.id, rows: filledItems(rows).map(i => ({ id: i.id, title: i.title, kind: i.kind, completed: i.completed })) });
        if (!result.ok) { pending.current = null; setError(result.error); setItems(checklistItems(latest.current)); }
      }
    } finally { running.current = false; setSaving(false); }
  };
  // A later save carries the whole checklist, so it replaces any save still waiting.
  const save = (rows: ChecklistItem[], change: Change) => { setError(''); pending.current = { rows, change: pending.current ? { type: 'structure' } : change }; void run(); };
  return <div onFocus={() => setEditing(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEditing(false); }}>
    <MilestoneChecklist items={items} onChange={setItems} onCommit={save} disabled={busy} removeLabel="Archive milestone" />
    {error && <p className="goal-form-error" role="alert">{error}</p>}
  </div>;
}
