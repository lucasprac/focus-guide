# Release notes

## Unreleased (3.2.0) — Neural World in 2D, achievements and new palettes

- **2D overview.** Neural World is now a 2D map on a canvas instead of a 3D scene. You are at the centre, each area is a region around you, and each goal is a cell at the edge of its area with its roadmap as beads. Each finished session is a mote that orbits its goal or area. Pulses carry your time of the last 28 days from you to where you spent it, and a running session streams to its goal. The page no longer loads Three.js.
- **Explore.** Click a region or a goal to see its details and move to it. Drag to move, Ctrl + scroll to zoom. The side panel shows your totals when nothing is selected.
- **Replay your journey.** Plays your history in about 9 seconds. Each session flies to its place and the map grows.
- **Achievements.** 27 achievements in five groups: time, craft, exploration, rhythm and secrets. They come from your records, show their progress, and never expire. Rhythm counts different weeks in any order, not streaks. Earned achievements wait as golden gems on the map until you collect them.
- **Palettes.** Four new palettes are rewards of achievements: Wild mint (Explorer), Open sea (A season), Ember (Summit) and Aurora (A hundred hours). The hour thresholds of the first four palettes do not change.
- New command `achievements.collect`. The new optional setting `collectedAchievements` keeps the collection time and goes into backups inside `settings`. No schema change. The backup format stays version 11; version 3.1.2 and earlier reject a backup with the new setting, and cannot read settings that use a new palette. Choose one of the first four palettes before you go back to an older version.
- **Focus by area** and **Palettes & horizons** are replaced by the map, the side panel and the **Palettes** card.

## Unreleased (3.1.2) — session preparation answers

- **I'm already warm.** In Focus > **Optional details**, you can answer **Yes**, **Kind of** or **No** before a session.
- **Have you taken medications?** In the same place, you can answer **Yes** or **No**.
- Both answers are optional and stay `null` when you do not answer.
- **Planned vs recorded.** Patterns > **Session distributions** has a new chart. It compares the length that you set for a timer session with the recorded active time. The check-in after a timer session also shows the difference.
- The session CSV adds `warm_up`, `medication` and `plan_difference_minutes`.
- Schema 11 and backup version 11. The migration saves a `before-schema-v11` snapshot first. Version 3.1.0 and earlier cannot open the database or restore the backup.

## Unreleased — floating check-in fix

- **Check-in in the floating timer.** The answer buttons of "Attention right now?" in the floating timer now take a click. Before, the brain's drag area covered them, so a click moved the window instead of saving the answer. No schema or backup format change.

## Unreleased — statistics module in Rust

The heavy statistics of Insights now run in Rust compiled to WebAssembly, and the main process computes Insights on a worker thread. The numbers do not change. No schema or backup format change.

- **Same results.** Ridge, lasso, elastic net, the collinearity check, k-means and the silhouette moved to `native/stats`. A check against the previous code found no difference in any bit, also for the full engine on the example dataset.
- **No freeze.** Opening Insights or the Focus hints no longer blocks the timer loop, checkpoints or check-ins while the engine runs.
- **Cache during a session.** The 5 s checkpoint of a running session no longer clears the Insights cache.
- **Speed.** The model part gained about 7 %, k-means and silhouettes about 45 %. The worker is what removes the freeze.
- **Security.** The renderer policy adds `'wasm-unsafe-eval'`, which Chromium needs to compile WebAssembly. It does not allow JavaScript `eval`.
- **Build.** `npm.cmd run build` runs the new `build:stats` step. Rust is needed only to change `native/stats`.

## Unreleased — behaviour cycle analysis (3.1.0)

The analysis of the cycle now uses one set of rules in every place. It also separates a slow start from fatigue. No schema or backup format change.

- **One review of a session.** The **Behaviour** review of a session shows time with input and window switches. It marks interruptions and attention check-ins on the timeline. It shows the warm-up (0–10 min), sustain (10–25 min) and fatigue (25+ min) phases. Calendar cards show the detractor and challenge answers.
- **One analysis for a goal.** The **Behaviour** tab of a goal keeps the effort summary, the time by roadmap step and the planned actions. It shows the same Insights figures as Patterns for that goal. The two tables that repeated this data are removed. **Try next week** adds the suggestion to the goal review of the week.
- **One rule for the duration.** The action editor and Focus now use one rule. The first choice is how long your attention held before a drift (last 90 days). Only without enough markers, the editor uses the median recorded duration. The editor says which one it used.
- **Focus hints.** Focus shows up to three hints, one from each group: a length or a pause, a time of day, and something to do before you start. It also shows the adjustment that you saved for this week.
- **Cycle comparison.** Insights starts with the last 7 days against the 28 days before them: perceived focus, drifts per hour, median time to the first drift and window switches per hour. It shows the saved weekly adjustments of this week and of last week.
- **Attention span.** A new curve shows the time from an I'm back to the next drift. A table shows drifts per hour in the warm-up, sustain and fatigue phases. When drifts cluster in the warm-up, the **length** suggestion stays at 25 minutes or more. A new **warmup** suggestion explains why.
- **Pause.** The **break** suggestion now compares the early and the later rate in the same sessions, those that reached the candidate minute. Short sessions no longer hide fatigue.
- **Shape of a session.** The figure marks minute 10 and minute 25. It draws window switches and off-task check-ins. It compares the 2 minutes before a drift with the other minutes.
- **Interaction states.** Window switches are now a sixth input of the grouping when most minutes have them. A new **Light interaction** name replaces a wrong "Typing" for a state with low counts. Each state shows its drifts per hour.
- **Focus model.** Ridge, lasso and elastic net compete in the rolling origin test. The app shows which one it used and why. Collinear features show their correlation and variance inflation factor. The lasso shows which features it keeps and how often. The two hour terms become one effect. A second view explains the rating with facts from during and after the session.
- **Agent.** `get_focus_insights` returns the new fields. `get_goal_behaviour` returns the input share and the window switches per minute of each activity mode.
- **Speed.** The example dataset (58 sessions) takes about 250 ms. The three estimators and the second model view are the main cost.

## Unreleased — goal deletion

- **Delete a goal.** The goal workspace has a **Delete goal** button (trash icon) next to **Edit goal**. The dialog shows what is removed and what stays, then **Back up & delete goal** saves a recovery backup and deletes the goal permanently.
- The goal's roadmap, weekly actions, action check-ins, outcome observations, weekly reviews, agent proposals and agent change records are removed with it.
- Tasks and focus sessions stay in their area with their recorded time. Only their links to the goal, its roadmap steps and its planned actions are cleared.
- You cannot delete a goal while its session is running or paused. Archive (in **Edit goal**) still keeps everything.
- The new `goal.delete` command is for the user only. The AI agent has no delete tool, and the agent's command path refuses `goal.delete` and `field.delete`.
- No schema or backup format change.

## Unreleased — behaviour tutorial

- **Behaviour tutorial.** A 9-step guide explains how to turn on keyboard and mouse totals, how attention check-ins work, the **I'm back** marker, reflection questions, the Insights tab and its minimum data, the Behaviour section of a goal and the `get_focus_insights` agent tool. Open it with **Open tutorial** in Settings or **Behaviour tutorial** in Patterns. Steps can open the matching page.
- The tutorial changes no settings, schema or backup. It shows only text and keeps its step in memory.

## Unreleased — behaviour insights

Focus Guide now looks for patterns in your own records. It shows them with their uncertainty. It does not score your attention.

- **Insights tab.** Patterns has two tabs: **Overview** and **Insights**. Insights shows the data behind the results. It has five figures: when you focus best, how long you work before the first drift, the shape of a session, interaction states, and what got in the way. It also shows what goes with higher focus. Last, it gives suggestions with their evidence. A figure says what it needs when data is missing. Every interval is a 90% interval. **Try next week** copies a suggestion into your weekly adjustment.
- **Reflection questions.** After a session, you can answer two optional questions: **What got in the way most?** and **How demanding was it?** You can change the answers in Calendar, and you can clear them.
- **Attention check-ins.** Settings > **Attention check-ins** is off by default. When it is on, a one-click question about your attention appears 8 to 20 active minutes into a session. It appears again every 15 to 35 active minutes, up to 6 times. It shows below the top bar, or as three small buttons in the floating timer. It never takes keyboard focus. It disappears after 45 seconds. There are no check-ins in Offline mode or in the last 5 minutes of a countdown.
- **Window switches and input time.** With keyboard and mouse collection on, the helper also counts changes of the foreground window and marks the seconds with input. It stores no window name, title or program name. Focus Guide windows and tab changes in a browser do not count.
- **Focus hints.** Focus can suggest a session length and a time of day from your last 90 days. **Use 25 min** sets the timer.
- **AI agent.** The read tool `get_focus_insights` gives the agent the same values as the Insights tab. The default range is 90 days, and each curve has at most 60 points.
- **Example data.** **Explore an example** now has 60 invented sessions over 30 days, with activity, markers, check-ins and reflection answers.
- **All time.** The Behaviour section of a goal and the Insights tab now accept the **All time** range.
- Interruptions and parked thoughts now save their position in active time. New sessions use `behaviourVersion` 4.
- **Speed.** The app keeps the last four insight results in memory and clears them at any write. A first call takes about 380 ms with 1 000 sessions. That is above the 300 ms target, and the team accepted it.
- SQLite and JSON schema 10 add `detractor` and `challenge` to sessions, `inputMs` and `switches` to activity blocks, the event kind `probe` and the setting `attentionProbes`. The migration saves a `before-schema-v10` snapshot first. The Session CSV adds `detractor` and `challenge`. The Activity CSV adds `input_ms` and `window_switches`.
- JSON backups of versions 1–10 restore. A restore turns attention check-ins off, as it does for activity collection and agent access.
- **A schema 10 backup cannot be restored by 2.0.0 or earlier.** Those versions also cannot open a schema 10 database. To go back, you need the matching snapshot and the older app. Save a full JSON backup with 2.0.0 before you update.
- A backup whose settings have no `focusVisual` key, for example one from a version before the session gauge, restores again.
- The analysis rules and thresholds are in the [data dictionary](DATA-DICTIONARY.md#calculation-rules-for-insights).

## Unreleased — Neural World as a goal network

- **Goal network.** Neural World now shows goals instead of area clusters. Each goal is a neuron: focus time grows its soma, roadmap steps form its axon (finished steps lit, the next step pulsing), done and smaller actions of the last 28 days add sparks, and a measured goal shows a progress arc. Drafts are translucent, paused goals are muted, and achieved goals move to an outer ring.
- **Explore and act.** Click a neuron or a goal button to turn the world and move the camera to the goal. A side panel shows its roadmap, time, actions and progress. **Focus on next step** prepares a session for that goal and step; **Open goal** opens the workspace. **Esc** returns to the overview.
- Area colours identify goals. The earned palette now tints the sky and the light. Palette unlock rules do not change.
- The page reads records only. The schema, backups and commands do not change. The SVG fallback draws the same network.

## Unreleased — session gauge and figure plates

- **Session gauge.** Settings > **Focus visual** can replace the Focus brain with an isometric dial indicator. Its needle turns once for each 10 minutes of session time, its small dial counts up to 12 turns (2 hours), and a marker shows the planned length. Breaks show it in blue. It is SVG only, so software rendering also shows it. The brain stays the default.
- **Figure plates.** The Focus card and the three main Patterns charts use a plate frame: "Fig n" and the title at the top, a hint and a live value at the bottom, in a monospace font with a thin layered shadow.
- The isometric drawing kit comes from the Anatomy skill (MIT licence). Its colours come from the app's tokens: four neutral tones and one accent part.
- Settings add the optional `focusVisual` key. The schema version does not change, and backups without the key restore with the brain. A backup that contains the key cannot be restored by 2.0.0 or earlier, because those versions reject unknown settings keys.

## 2.0.0 — goals as learning workspaces and a local AI agent

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
