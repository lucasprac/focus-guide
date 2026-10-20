# Release notes

## Unreleased — block milestones, same-day defaults and a new brain

- Milestones are now a light block editor. Each row can be a to-do, heading, bullet, numbered item or text line. Type `# `, `- `, `1. ` or `[] ` at the start of a row, or use the **Row type** buttons. Enter, Backspace, Ctrl+Enter and Alt+Up/Down work as in other block editors. Only to-dos can be ticked, count as progress and take task links. A to-do with linked tasks keeps its kind until you unlink them.
- Markdown mode reads and writes all row kinds (`- [ ]`, `- [x]`, `#`, `-`, `1.`, plain text).
- New goals have today as their default deadline. Choose another date or select **No deadline**. Existing goals keep their saved deadline.
- New tasks have today as their default due date. Change it in **Task details** or select **No due date**. Existing tasks keep their due date.
- The floating timer shows a 3D constellation of neurons in the shape of a brain, in its existing space. At each 10 minutes of elapsed timer time, lines slowly connect the neurons and draw the brain: first the outline, then the folds. Each milestone adds one twelfth, so the brain is complete after 2 hours. Software rendering keeps the brain sprite.
- Focus shows a new procedural 3D brain with folds, both hemispheres and a cerebellum. It lights from left to right as the session goes on: purple for focus, blue for breaks. The SVG fallback is unchanged.
- SQLite and JSON schema 6 add `kind` to milestones. The migration saves a `before-schema-v6` snapshot first, and every existing milestone becomes a to-do. JSON backups of versions 1–5 still restore. Version 1.5.0 cannot open a schema 6 database; going back needs the snapshot.

## 1.5.0 — easier goal creation

- New goal is one screen. The required fields (title, outcome and, when you have more than one, field) are marked **Required**. Why it matters, milestones, deadline and the numeric outcome are optional folds that show what you filled in.
- If a goal or action form has unsaved edits, an outside click, Escape, the close button or Cancel asks **Keep editing** or **Discard**. An unchanged form closes immediately.
- "Why it matters" is chosen as tags: suggested reasons plus your own (up to 12). An earlier free-text reason stays and can be removed.
- Milestones are an ordered checklist: add, tick, rename, reorder and remove items. **Edit as Markdown** shows the list as a task list (`- [ ]` / `- [x]`), and you can paste a list to add several items at once. On the goal page, removed milestones are archived, not erased.
- SQLite and JSON schema 5 add `whyTags` to goals and `position` to milestones. The migration saves a `before-schema-v5` snapshot first. JSON backups of versions 1–4 still restore.

## 1.4.0 — visual design and Tailwind

- Focus shows a local Three.js neural sculpture. Neural World shows an interactive perspective constellation. Both have SVG fallbacks.
- Focus keeps its essential controls together. Goal, activity and energy are optional details.
- Tasks gives priority to creation, search and the list.
- Calendar shows the calendar before the planned actions.
- Settings groups the preferences and has a sticky save area.
- The scenes support pointer selection and drag. They have visible rotate, zoom and reset controls, and keyboard alternatives.
- Rendering is bounded. The app supports reduced motion, stops rendering when the window is hidden or minimized, and recovers from a lost graphics context.
- `Start-Software-Rendering.cmd` starts the app with software rendering.
- Renderer styles now use Tailwind v4 semantic tokens on top of the existing stylesheet. The database schema and the backup schema did not change.

## 1.4.0 — goal planning

- New Goals workspace. It has study, work and personal examples, milestones, optional numeric outcomes and an explicit confirmation step for achievement.
- Flexible weekly actions. Each action can have a cue, a smaller alternative and a response to an obstacle. Actions share one time budget. Check-ins are voluntary. The app keeps a history of each reschedule.
- Tasks can link to goals and milestones.
- The app records the goal of a session when the session starts.
- Calendar shows planned actions. Patterns can filter by goal.
- Local guidance shows the records that support it. You can select Apply, Edit or Dismiss.
- Weekly reviews show effort, actions and outcomes separately.
- SQLite and JSON schema 4. The migration saves a snapshot first. Older backups stay compatible.

## 1.3.x — behaviour collection and fields

- Optional local collection of keyboard and mouse totals during active focus (schema 3). This release also added activity modes, the **I'm back** shortcut and return markers.
- You can delete a field and all its history. The app makes a recovery backup first.
- Palette colors cover the full constellation.
- Page layouts are responsive.
- A late activity packet no longer disables the helper or the global shortcut. If the helper becomes ready late, collection starts one time.

## 1.1.0 — stopwatch, overtime and Tasks

- You can select Timer or Stopwatch. A countdown continues into overtime in the same session.
- New Tasks page with categories, notes, priority, due dates, search, filters and an archive (schema 2).
- New browser preview for development only. It is isolated and uses synthetic storage.

## 1.0.x — session inclusion and appearance

- New **Exclude session** command. The app also excludes a session automatically when its active time is less than two minutes.
- The icon rail can collapse.
- Light and dark themes. The theme is saved in settings and in backups.
- Compact, transparent floating timer. Its sprite brain gets color after the first ten active minutes.
- All backups share a 64 MiB limit. Daily backups are safer. Restore shows recovery messages.
