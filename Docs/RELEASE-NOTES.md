# Release notes

## Unreleased — session gauge and figure plates

- **Session gauge.** Settings > **Focus visual** can replace the Focus brain with an isometric dial indicator. Its needle turns once for each 10 minutes of session time, its small dial counts up to 12 turns (2 hours), and a marker shows the planned length. Breaks show it in blue. It is SVG only, so software rendering also shows it. The brain stays the default.
- **Figure plates.** The Focus card and the three main Patterns charts use a plate frame: "Fig n" and the title at the top, a hint and a live value at the bottom, in a monospace font with a thin layered shadow.
- The isometric drawing kit comes from the Anatomy skill (MIT licence). Its colours come from the app's tokens: four neutral tones and one accent part.
- Settings add the optional `focusVisual` key. The schema version does not change, and backups without the key restore with the brain. A backup that contains the key cannot be restored by 2.0.0 or earlier, because those versions reject unknown settings keys.

## Unreleased — goals as learning workspaces and a local AI agent

Focus Guide now puts goals at the centre. A goal is the place where you learn: it has a roadmap, focus sessions, tasks and a behaviour profile.

- **Goal workspace.** Goals is the first page. Open a goal to see Overview, Roadmap, Tasks, Behaviour, and Plan & review. **Focus on this goal** prepares a session with the goal, its area and the activity mode of its latest session. After the session, the next one stays in the same goal until you select **Free focus**.
- **Areas.** The interface calls focus fields "areas", for example Mathematics or Languages. An area groups goals. Commands, the database and backups keep the name `field`.
- **Roadmap steps.** Headings are stages and to-dos are steps. Each step can have an estimate, a target date, notes and links. A session can record the step that it served, and the roadmap shows recorded time against the estimate for each step and stage.
- **Behaviour profile.** Each goal shows time by activity mode, time of day, weekday and roadmap step, keyboard and mouse rates with their coverage, returns, interruptions, self-ratings and action check-ins. The profile describes records. It does not score attention.
- **Calendar and Patterns.** Calendar can filter by goal. Patterns shows time by activity mode. A duration suggestion uses the goal's own sessions first.
- **Local AI agent (MCP).** Settings > AI agent turns on a local Model Context Protocol server for clients such as Claude Code and Claude Desktop. Access is **Off** by default. **Read only** lets the agent read goals, sessions and behaviour summaries. **Read and propose** also lets it propose goals, roadmaps, tasks, weekly actions and review notes. A proposal changes nothing until you apply it on the goal page. You can edit or reject it, and applied and rejected proposals stay as a history.
- **Direct edits by the agent.** The new **Read and edit** level lets the agent create and change goals, roadmaps, roadmap step details, tasks, weekly actions and review notes at once. At this level the agent cannot delete anything, mark a goal achieved, archive a goal or tick a roadmap step. It works only on goals and on tasks that belong to a goal, and it has no access to sessions, the timer, areas, settings or backups. Every change appears in **Agent activity** on the Goals page and on the goal's Overview, with the agent's reason. **Undo** puts back the earlier state, and a record that the agent created is archived. The agent can make at most 60 direct changes per hour.
- **Safe roadmap edits.** A roadmap change names the revision that it is based on. If the agent changes a roadmap while you edit it, the app does not save over it: you choose **Show the agent's version** or **Keep my version**. An agent's roadmap change keeps a row only when the title is the same; to rename a step, the agent changes that step.
- SQLite and JSON schema 7 add roadmap step details to milestones and `milestoneId` to sessions. Schema 8 adds the `agentProposals` collection and the `agentAccess` setting. Schema 9 adds the `agentChanges` log. Each migration saves a `before-schema-vN` snapshot first. JSON backups of versions 1–8 still restore. A restore and the schema 8 and 9 migrations set agent access to **Off**.

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
