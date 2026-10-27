# Architecture — Focus Guide 2.0

## Behaviour insights (schema 10, unreleased)

Schema 10 adds optional reflection answers, two activity measures and attention check-ins. A local engine turns these records into the Insights tab of Patterns. All data stays on this computer. For the columns, see the [data dictionary](DATA-DICTIONARY.md#behaviour-insights-schema-10). The design and its Red Team check are in [Behaviour data science](BEHAVIOUR-DATA-SCIENCE-PROPOSAL.md), in Brazilian Portuguese.

```mermaid
flowchart LR
    Helper[activity-helper.exe<br/>input counts, window switches]
    Collector[behaviour.ts<br/>minute blocks with inputMs and switches]
    Probes[probes.ts<br/>ProbeScheduler]
    Timer[TimerEngine<br/>probe, interruption and thought markers]
    Store[(SQLite schema 10)]
    Service[FocusService<br/>insights.read and cache]
    Engine[focus-insights.ts<br/>pure engine]
    UI[Patterns Insights tab<br/>Focus hints]
    Agent[AgentService<br/>get_focus_insights]
    Helper --> Collector --> Store
    Probes --> Timer --> Store
    Store --> Service --> Engine
    Service --> UI
    Service --> Agent
```

### Records and migration

- A session has `detractor` and `challenge`. New sessions get `behaviourVersion` 4.
- An activity block has `inputMs` and `switches`. A null value means unknown. It never means zero.
- The event kind `probe` stores one check-in. Interruption and thought markers now save `activeOffsetMs` too.
- The setting `attentionProbes` is `false` by default.
- The migration saves a `before-schema-v10-<timestamp>.sqlite` snapshot with `VACUUM INTO`, except for an empty new database. Then one transaction adds four columns, sets `attentionProbes` to `false` and sets `user_version` to 10.
- `putSession` and `putActivity` name their columns. A column order that differs from the expected order cannot write a value into the wrong column.
- When two activity blocks of the same minute merge, `inputMs` and `switches` add up. If one side is null, the result is null.
- The previous app rejects a schema 10 database. A rollback needs the matching snapshot. Version 2.0.0 and earlier also cannot restore a version 10 backup.

### Window switches

`activity-helper.cpp` counts changes of the foreground window. It reads the foreground window once for each second, and only while it collects.

1. It takes the root owner window with `GetAncestor(…, GA_ROOTOWNER)`. A dialog counts as the window that opened it.
2. It ignores windows of the Focus Guide process. The helper compares the process identifier of the window with the identifier that it got on its command line. A click on **I'm back** in the floating window is not a switch.
3. It counts a switch when the root window differs from the last counted window. The first window after a start is not a switch. A return to the same window after a visit to Focus Guide is not a switch.
4. It keeps only the handle of the last window, in memory. It never reads a process name or a window title.
5. A change of tab inside a browser is not a switch, because the window does not change. A change between two browser windows is a switch.
6. A window change that lasts less than about one second can be missed.

Each sample carries `switches`. If a helper does not send it, the collector saves null and keeps working. If the value is malformed (not a whole number from 0 to 1000), the collector calls `fail()`. That stops the collection and also turns off the global **I'm back** shortcut. The collector sets `inputMs` for each one-second sample that has a key, a click, a scroll or a movement. It counts the whole observed time of that sample.

### Markers

The timer saves a probe, an interruption or a thought marker in one transaction with the session total and the closed active interval. The marker offset never goes beyond the saved total, so a recovery cannot leave a marker after durable time. The collector flushes after `attention.return`, `interruption.record`, `thought.record` and `probe.answer`.

### Attention check-ins

`ProbeScheduler` (`src/main/probes.ts`) is runtime only. The desktop app and the browser preview share it. It reads authoritative active time from the timer snapshot and a monotonic clock for expiry.

| Rule | Value |
|---|---|
| First check-in | A random point between 8 and 20 active minutes |
| Gap to the next check-in | A random time between 15 and 35 active minutes |
| Maximum for each session | 6 |
| Expiry | 45 seconds after display. The app saves the check-in as `missed`. |
| Countdown end guard | None in the last 5 minutes. A check-in appears only if at least 5 minutes 46 seconds remain: the 45 seconds of expiry plus a margin of 1 second (`PROBE_EXPIRY_MARGIN_MS`), so the 250 ms poll records it as `missed` before the guard. If not, the next try waits until the planned time plus 15 minutes. |
| Stopwatch and overtime | No end guard |
| Activity mode | None in Offline |
| Turned on during a session | The first check-in waits 8 to 20 active minutes from that moment |

The scheduler cancels a check-in and saves no record in these cases:

- Pause, finish or a break.
- Check-ins turned off, or Offline mode.
- The end guard of a countdown.
- A system lock or sleep.
- A failed transition that waits for recovery.
- The closing or hiding of the floating window.

- The main process calls the scheduler every 250 ms. Both windows draw the pending check-in. If the main window is not visible, is minimized or has no focus, the main process also shows the floating window without taking focus (`showInactive`). The same happens when the main window loses focus, hides or minimizes while a check-in is pending. A floating window that was hidden hides again afterwards.
- `AppState.probe` is runtime only. It never reaches settings, datasets or backups.
- `probe.answer` accepts only the identifier of the pending check-in while the session runs. A late or repeated answer fails with "This check-in has expired." The main process sets the source (`floating` or `main`) from the sender window. The renderer value is not trusted.
- A probe answer is not a drift. See the engine rules below.

### Insight engine

`src/shared/focus-insights.ts` and `src/shared/insight-stats.ts` form a pure engine without dependencies. The same input gives the same output. A seeded generator (`mulberry32(42)`) drives the minute sample, the k-means starts and the bootstrap. A worker thread of the main process runs it for `insights.read`. The renderer runs it for the example dataset, and the browser preview runs it for every read.

#### Statistics module (Rust and WebAssembly)

The matrix kernels of `insight-stats.ts` are written in Rust (`native/stats/src/lib.rs`) and compiled to WebAssembly: ridge (`ridgeFit`, `ridgeSelect`), lasso and elastic net (`penalizedFit`, `penalizedSelect`), `collinearity`, `kMeans` and `silhouettes`. The other helpers (intervals, quantiles, Kaplan–Meier, `mulberry32`) stay in TypeScript. They are cheap, and Kaplan–Meier uses `log` and `exp`, which can differ by one unit in the last place between math libraries.

- **Same numbers.** Each kernel repeats the TypeScript it replaced operation by operation, with the same order of additions and the same guards. WebAssembly uses IEEE 754 doubles, Rust never fuses a multiply and an add, and the kernels use only +, −, ×, ÷ and √. A check against the previous TypeScript (5 778 comparisons of random, constant, collinear and empty inputs, and the full engine on the example dataset) found no difference in any bit. The grid of the lasso penalty uses `floor ** x`, so `penalizedSelect` computes those factors in TypeScript and passes them in.
- **Random numbers.** `kMeans` keeps its `random` argument. The module imports `env.stats_random`, which calls that function, so k-means++ draws the same seeded stream.
- **Loading.** `loadStats()` compiles the module once and must finish before the first insight. The main process awaits it before it opens the store, the insights worker awaits it before its first job, and the renderer awaits it before React mounts (the preview too). Browsers refuse to compile a large module synchronously, so loading is asynchronous. A call before loading ends fails with "The statistics engine is still loading."
- **Build.** `scripts/build-stats.cjs` (`npm.cmd run build:stats`, part of `build`) compiles the crate with `cargo build --release --target wasm32-unknown-unknown` and embeds the module as base64 in `src/shared/stats-wasm.ts`. That generated file is committed, so `dev`, `preview` and `typecheck` work without Rust. It records a hash of the crate sources. Without Rust, the build accepts the committed file only when the hash matches; after a change to `native/stats`, it stops and asks for Rust.
- **Content Security Policy.** The renderer policy has `script-src 'self' 'wasm-unsafe-eval'`. Chromium needs `wasm-unsafe-eval` to compile WebAssembly. It allows no `eval` of JavaScript, and the module comes from the app bundle.

- **Input.** Finished, included sessions that start in the range, with the optional area and goal filters. A session with more than 8 active hours leaves the analysis.
- **Drift.** A drift is an **I'm back** marker or an interruption. A probe answer and a parked thought are not drifts. Check-ins follow a schedule, so counting them would raise the drift rate after minute 8 for no real reason. A probe answer has its own measure: the share of answered check-ins that are off the task.
- **Sections.** Day rhythm, attention span (Kaplan–Meier, with a recovery curve and the warm-up, sustain and fatigue phases), session shape (with the minutes before drifts), interaction states (k-means++), detractors, a model of perceived focus (ridge, lasso and elastic net, with a second view of the facts during and after a session), the cycle comparison, and suggestions. Each section has an eligibility rule and gives a reason when it is not eligible. [Data dictionary](DATA-DICTIONARY.md#calculation-rules-for-insights) has all thresholds. They are in `INSIGHT_THRESHOLDS`.
- **Intervals.** Every interval is a 90% interval.

Builder decisions that the design left open:

- `SurvivalCurve.medianOpen` is true when the upper band never falls to one half. The upper limit of the median is then open, and `median.high` holds only the last observed time. The interface writes "or longer".
- The ridge penalty λ comes from a grid of eight values (0.003 to 10) that the engine multiplies by the number of training rows. The engine picks the λ with the lowest PRESS, that is, the mean squared leave-one-out error in closed form. A tie keeps the stronger penalty.
- The **break** suggestion tests change points from minute 25 on (`fatigueMinutes`). Each point uses only the sessions that reached it, so the early rate and the later rate come from the same sessions. At least 5 of them must still run 15 minutes after the point. Among the points that qualify, it keeps the point with the largest likelihood-ratio statistic of two Poisson rates against one rate. It gets `moderate` strength only if a Bonferroni-corrected one-sided 95% bound of the rate ratio stays above 1. The correction counts the points that were tried.
- **Warm-up friction.** When the drift rate in minutes 0–10 is at least 1.5 times the rate in minutes 10–25, with 5 drifts or more, the **length** suggestion does not fall below 25 minutes. It uses the median of the first drift after minute 10 when that is known. The **warmup** suggestion explains the cause.
- **One duration rule.** `suggestedDuration()` in `focus-insights.ts` serves the action editor. It uses the **length** plan of the goal, then of the area, over the last 90 days. Only without it, the median recorded duration of `durationSuggestion()` in `goal-planning.ts` answers. The result names its source.
- **Cycle comparison.** The window of the last 7 days and the window of the 28 days before it do not depend on the range of the other figures. `insights.read` therefore loads the activity rows from the earlier of the range start and 34 days before the end.
- `focusGap` is 0.3 focus points. The **window**, **detractor** and **challenge** suggestions need at least this difference in mean focus.
- The model chooses its activity-mode columns again for each training window, from the training rows only. A mode needs 5 sessions in those rows. Rarer modes join the reference mode, and the label says so. A later session cannot add a column to an earlier test.
- Three estimators compete in the rolling origin test: ridge, lasso and elastic net (mix 0.5). The lasso and the elastic net use coordinate descent with soft-thresholding. A 5-fold cross-validation picks their penalty. If features are collinear (variance inflation factor above 5 or correlation of 0.70 or more) and the lasso changes its features between windows (mean overlap below 0.6), the elastic net decides when its selection is more stable and its error is not higher. Otherwise the lower error of ridge and lasso decides. The lasso always marks the features it keeps, with the share of test windows and bootstrap resamples that keep them.
- The sine and cosine of the start hour become one effect: the focus gap between the best hour and the opposite hour. Its amplitude is the square root of the sum of the squared effects.
- The bootstrap intervals of the model are plain percentile intervals (5th to 95th percentile of 200 resamples). With shrinkage, an estimate can lie outside its interval. The interface shows both.

### `insights.read`

The command takes `from`, `to`, and the optional `fieldId` and `goalId`. Any valid range with `from` not after `to` is accepted, also All time. `goal.behaviour` accepts the same ranges. The cost depends on the number of sessions, not on the number of days.

The main process answers it outside the command queue, in two steps:

1. Inside the queue, `FocusService.insightsJob()` returns a cached result, or reads the dataset and the activity rows in one synchronous step. No mutation can interleave with that read.
2. Outside the queue, `InsightsWorker` (`src/main/insights.ts`, a `worker_threads` worker in `insights-worker.ts`) runs the engine on that snapshot. Checkpoints, check-ins and other commands do not wait for it, and the 250 ms loop keeps running. Two reads with the same key share one computation. A crashed worker fails its pending reads and a new one starts on the next read.

`FocusService` keeps a cache of the last 4 results.

- The key is the validated input plus `Store.revision()`. The revision is the SQLite `total_changes()` value of the connection, less the rows written inside `Store.untracked()`.
- Only the periodic 5 s checkpoint runs inside `untracked()`. It writes the running session and its activity rows, and the engine reads finished sessions only, so the cache stays valid during a session. Every other `INSERT`, `UPDATE` or `DELETE` changes the revision and clears the cache. If the revision is not available, nothing is cached.
- A result is cached only if the revision of its snapshot is still the current one, so a slow result never replaces results of newer data.
- The cache lives in memory only. A restart empties it. Callers get a copy of the result.
- The preview and the agent call `FocusService.run('insights.read')`, which does both steps in place.

### Agent tool

`get_focus_insights` (level `read`) returns the object that the Insights tab shows. The input is `{ from?, to?, goalId?, fieldId? }`. The default range is the last 90 days in the timezone of the settings. With no input, `from` is today minus 89 days and `to` is today. With only `to`, `from` is `to` minus 89 days. With only `from`, `to` is today. Each survival curve has at most 60 points: the first, the last and evenly spaced points between them. The tool uses `insights.read`, so it uses the same cache. It still computes in the main process, inside the agent's queued command, when the cache has no result. The description tells the agent that the values describe records and are not scores.

### Invariants

- Only the main process measures time. The scheduler uses active time from the timer. The renderer only submits an answer.
- A probe is saved with the durable session total.
- Missing values stay missing. The engine never turns an unknown value into zero.
- `AppState.probe` and the insight cache never reach settings, datasets or backups.
- The preview never reads the personal database. Its check-ins use the same scheduler. With `&probes=fast` in the preview URL, they use short times.
- A restore turns `attentionProbes` off, like `collectActivity` and `agentAccess`.
- At the `read` level, an agent can read insights. It cannot change records.

### Budget

The design target for `insights.read` is less than 300 ms for 1 000 sessions and 60 000 activity minutes. The engine limits its work:

- K-means trains on at most 5 000 minutes. The silhouette uses at most 1 500 points.
- The model tests at most 40 later sessions. The bootstrap uses 200 resamples.

A call without cache takes about 380 ms at 1 000 sessions. This is above the target. The team accepted it. Since the worker, the call no longer blocks the main process, and checkpoints no longer clear the cache. The WebAssembly kernels gave less speed than expected: a synthetic run of the model took 0.66 s instead of 0.71 s at 1 000 rated sessions, and k-means with silhouettes took 62 ms instead of 111 ms at 3 000 points (Node 22, Linux). V8 already runs the old loops close to native speed.

## Learning workspace and local agent bridge (unreleased)

### Goal workspace

Goals is the first page. `App.tsx` keeps the open goal (`activeGoalId`), so the goal stays open when you go to Focus and back. `GoalWorkspace.tsx` has five sections: Overview, Roadmap, Tasks, Behaviour, and Plan & review. `focusGoal()` in `App.tsx` prepares a session with the goal, its area, an optional roadmap step and task, and the activity mode of the goal's latest session. The main process still owns all timing.

A field is still the parent of goals, tasks and sessions. The interface calls it an "area". Command names, tables and backup keys keep `field`.

### Behaviour profile

`goal.behaviour { goalId, from, to }` is a read command in `GoalService`. Activity samples are not part of `AppState`, so the main process computes the profile with `goalBehaviourProfile()` in `src/shared/behaviour-analytics.ts`. The Behaviour section and the agent bridge use the same function.

### Roadmap steps (schema 7)

Milestone bodies hold step details (estimate, target date, notes, links). `sessions.milestoneId` records the step when the session starts, with the same rule as the goal link: a to-do of the session's goal, fixed at the start. `roadmapEffort()` in `goal-planning.ts` sums recorded time for each step.

### Agent bridge and proposals (schema 8)

```mermaid
flowchart LR
    Client[AI client<br/>Claude Code / Claude Desktop]
    MCP[focus-guide-mcp.cjs<br/>stdio MCP server<br/>FocusGuide.exe with ELECTRON_RUN_AS_NODE=1]
    File[(agent-bridge.json<br/>pipe name + token<br/>in the data folder)]
    Bridge[agent-bridge.ts<br/>named pipe, token check,<br/>agent tool allowlist]
    Queue[Command queue]
    Agent[AgentService<br/>read tools, proposals]
    Store[(SQLite)]
    UI[Goal pages<br/>Apply / Edit / Reject]
    Client <--> MCP
    MCP --> File
    MCP <--> Bridge
    Bridge --> Queue --> Agent --> Store
    UI -->|agent.proposal.apply / reject over IPC| Queue
```

- The MCP server (`src/mcp/server.ts`) holds no data and never opens the database. It reads `agent-bridge.json`, sends one JSON line for each tool call to the named pipe, and returns the reply.
- `AgentBridge` (`src/main/agent-bridge.ts`) listens only while `settings.agentAccess` is not `off`. Each start makes a new random pipe name and a 256-bit token, and writes them to `agent-bridge.json` in the data folder. A request must carry the token, compared in constant time. Requests are limited to 64 KiB. The bridge accepts only the tools in `src/shared/agent-tools.ts`, never renderer commands. Each call runs in the command queue.
- `AgentService` (`src/main/agent-service.ts`) checks the access level again (`off` < `read` < `propose` < `edit`). Read tools return copies of records. Propose tools validate a payload against the current records and save an `agentProposals` row. They change nothing else.
- The user applies a proposal with `agent.proposal.apply`. The service validates the payload again, with the user's edits, then runs the normal commands (`goal.create`, `goal.milestones.sync`, `task.create`, `goal.action.save`, `goal.review.save`) and marks the proposal `applied` in one transaction. A roadmap proposal whose basis fingerprint no longer matches becomes `stale` and needs `confirmStale`.
- `AppState.agent` is a runtime-only status with the launch command for client configuration. It never reaches settings, datasets or backups.

- At the `edit` level (schema 9), `AgentEditor` (`src/main/agent-edits.ts`) runs the same validated commands at once. In one transaction it reads the changed fields, applies the change and saves an `agentChanges` record with the state before and after. The app writes the summary. The editor refuses deletion, `achieved` and `archived` goal status, step completion, and tasks without a goal, and allows 60 direct changes per hour. `agent.change.undo` puts back the earlier state through the normal commands and asks for confirmation when the record changed after the agent's change.
- Roadmap writes carry a revision (`roadmapRevision()` and `rowsRevision()` in `goal-planning.ts`). `update_roadmap` requires the revision from `get_goal`, and the editor in `MilestoneChecklist.tsx` sends the revision of the rows that it last saved. A stale `goal.milestones.sync` fails without a change, so an edit never archives rows that the agent added. Agent roadmap writes match rows by exact title only.

Invariants:

- Below the `edit` level, an agent never changes records directly. At the `edit` level, every agent change has an `agentChanges` record from the same transaction, and the user can undo it.
- An agent never deletes records, marks a goal achieved or archived, or ticks a roadmap step.
- Agent access is `off` after the schema 8 migration and after every restore.
- The pipe never accepts timer, deletion, restore, export or settings commands.

## Goal planning boundary (1.4.0)

`GoalService` adds validated commands for goals, milestones, actions, occurrences, progress, reviews and suggestion decisions. These commands use the existing bridge, which checks the sender and serializes commands. Store schema 4 keeps goal relationships in indexed columns. Flexible plans and revisions go in validated JSON bodies.

The app records the goal of a session when the session starts. It saves this goal and any pending occurrence in the same transaction. Later task edits do not change this goal. The main process continues to own timer accounting and optional activity collection.

Shared goal-planning functions:

- Project occurrences with dates from earlier schedule revisions. These revisions are immutable.
- Summarize effort separately from action records and outcome records.
- Apply the documented gates for duration and barrier suggestions.

The renderer uses the existing Radix controls and semantic tokens. Goals owns repeatable plans and their reviews. Tasks continues to be the editor for one-off tasks. Calendar shows planned actions as outlines, separately from the heat of recorded time. Patterns can filter sessions by goal. The isolated preview runs the same `GoalService` with atomic synthetic storage.

The migration takes a snapshot of the old SQLite database before its transaction starts. Backup format 4:

- Validates all goal collections and their relationships.
- Accepts versions 1–3 and gives them empty planning collections.
- Includes planning records in exports, restore previews and the recovery backup for field deletion.

For lifecycle, schedule and measurement semantics, see [Goal planning](GOAL-PLANNING.md).

### Activity timing (1.3.2)

Version 1.3.2 separates two cases:

- A malformed message from the input helper.
- A valid measurement that the app cannot place in authoritative active time.

When a timing anomaly occurs, the app drops the counters and leaves an "unavailable" gap. A timing anomaly does not disable the global shortcut, which operates independently. Each collection span records whether the app requested a start. If the helper becomes ready late, the app anchors one request to the current active time. It keeps the waiting period as "unavailable" coverage.

### Browser demo activity cursors

The browser demo saves an activity cursor for each session. The cursors are optional metadata next to the existing version-2 storage envelope. They are separate from the dataset fields and backup fields. If storage fails, deletion, simulation and cursor changes roll back together. Old demo profiles get default values for missing cursors. The demo discards activity rows that have no parent session.

```mermaid
flowchart LR
    MainUI[React main window<br/>Focus / Goals / Tasks / Calendar / Patterns / World / Settings]
    FloatUI[Compact React floating window<br/>Black brain / purple progress curves<br/>Countdown and controls on hover or keyboard focus]
    Bridge[Sandboxed preload<br/>Typed state and named commands]
    Queue[Electron main process<br/>Sender validation and command queue]
    Clock[Authoritative timer<br/>Monotonic elapsed time]
    Store[(Local SQLite<br/>Fields / categories / tasks / sessions / events / reviews)]
    System[Windows lock / sleep / tray / displays]
    Files[CSV exports / JSON restore<br/>Daily SQLite backups]
    MainUI <--> Bridge
    FloatUI <--> Bridge
    Bridge <--> Queue
    Queue <--> Clock
    Clock --> Store
    Queue <--> Store
    System --> Clock
    Queue <--> Files
    Store --> Files
```

## Invariants

- **One current item.** There is one current session or break at most. The main process serializes all commands. Two start requests at the same time cannot create two timers.
- **Monotonic time.** Elapsed focus time uses a monotonic clock. Renderer animation frames and window visibility never decide the recorded duration.
- **Durable intervals.** The recorded milliseconds of a session equal the sum of its durable active intervals. A checkpoint updates the current interval. It does not insert a duplicate interval every five seconds.
- **No extra time.** Paused intervals, breaks and interruption markers do not add focus time. Task checklist links do not multiply time.
- **Immediate transitions.** Each transition saves immediately. If a checkpoint fails, the timer freezes at the last durable total and shows an error. After a restart, recovery loads that durable total. When necessary, it creates a recovery flag and event. The timer stays paused.
- **Excluded sessions.** An excluded session stays in history and you can export it. It does not count toward analysis or neural progress. Archived fields keep their records.
- **Finish.** When a session finishes, one transaction saves the active interval, the completed record and the optional exclusion audit event.
  - If `activeMs < 120000`, the app sets exclusion automatically. A session of exactly two minutes is included.
  - `session.finish` accepts an optional validated `excluded` boolean for manual exclusion.
  - A later `session.exclude` command can reverse either choice. It does not change the intervals.
  - The app does not reclassify existing completed history.
- **Appearance settings.** Old metadata and version-1 backups can have no `theme` or `sidebarCollapsed` field. The app sets these to "light" and "expanded". Appearance toggles use the existing validated settings command and state broadcasts. Themes use shared CSS tokens. The floating timer keeps its transparent appearance with black lines in all themes.
- **Restore replaces.** Restore replaces the data. It never merges. Validation and a preview come first. Then the app saves a SQLite rollback snapshot and does the replacement in one transaction. If a write fails, the transaction rolls back.

## Source map

| Location | Responsibility |
|---|---|
| `src/main/index.ts` | Native windows, tray and power events, local protocol, sender checks, command queue, backup and export dialogs |
| `src/main/coordination.ts` | Serialized mutations, dialog preparation outside the queue, ownership of collector transitions |
| `src/main/timer.ts` | Clock, checkpoints, pause, resume and finish, recovery, break clock |
| `src/main/store.ts` | Prepared SQL statements, schema version 10, migration, persistence, the `revision()` value for the insight cache, and restore transactions |
| `src/main/service.ts` | Validated application commands and business rules |
| `src/main/backup.ts` | Versioned JSON validation, atomic exports, safe CSV cells |
| `src/main/probes.ts` | Runtime scheduler for attention check-ins. It uses authoritative active time and a monotonic clock for expiry |
| `src/main/agent-bridge.ts`, `agent-service.ts`, `agent-edits.ts` | Local named-pipe endpoint for the MCP server, agent read tools, proposals with apply/reject, direct edits with their audit log and undo |
| `src/mcp/server.ts` | Stdio MCP server, bundled by `scripts/build-mcp.cjs` into `resources/mcp/focus-guide-mcp.cjs` |
| `src/shared/behaviour-analytics.ts`, `agent-tools.ts` | Goal behaviour profile; agent tool list and bridge file contract |
| `src/shared/focus-insights.ts`, `insight-stats.ts` | Pure insight engine with its thresholds (`INSIGHT_THRESHOLDS`), and its numerical methods (Kaplan–Meier, ridge, lasso and elastic net, correlation and variance inflation, k-means++) |
| `native/stats/`, `src/shared/stats-wasm.ts` | Rust kernels of `insight-stats.ts`, and the generated WebAssembly module that embeds them |
| `src/main/insights.ts`, `insights-worker.ts` | Worker thread that computes `insights.read` outside the command queue |
| `src/preload/index.ts` | Narrow `focusGuide` bridge |
| `src/shared/types.ts` | Dataset, state, command names and event interfaces |
| `src/shared/analytics.ts` | Local-date splits, filters, averages, Spearman calculation with tied ranks |
| `src/shared/demo.ts` | Invented example observations. It writes nothing to storage. |
| `src/renderer/src` | Seven main views (Goals opens a goal workspace), mini-window, progressive Three.js and SVG visuals, styles |
| `src/renderer/src/components.tsx` | Main-window `Brain`, compact `FloatingBrain`, icons, formatting and shared controls |
| `src/renderer/src/NeuralVisual.tsx`, `ThreeScene.tsx` | Local lazy loading of Three.js, bounded geometry, scene lifecycle and SVG fallback |
| `src/renderer/src/BrainScene.ts` | Procedural Focus brain: seeded fold geometry, progress shaders, lighting and per-frame update |
| `src/renderer/src/styles.css` | Responsive page hierarchy and visual overrides |

## Windows and rendering

The app saves the window bounds in local metadata. It clamps them to the connected displays at these times: on launch, when a display is removed, and when display metrics change.

Animation complexity is bounded. The app stops animation scopes when a renderer is hidden or when the user requests reduced motion. The default launch now permits hardware acceleration for the bounded Three.js scenes. If a scene fails, the app shows the SVG version. `--software-rendering` keeps the earlier compatibility path with software drawing. For lifecycle and graphics test requirements, see [Visual design](VISUAL-DESIGN.md). If the first-paint event of the hidden window does not arrive, startup shows the loaded page anyway.

### Themes and visibility

The main interface uses semantic CSS tokens for light mode and dark mode. Actions are purple and accents are blue. The root theme attribute follows the saved settings. The app sends it to both windows. The floating timer keeps its own readable ink tokens, black and light. Earned palette colors apply only to the world visual and its SVG fallback.

Chromium can report a hidden native window as visible. For this reason, the native show, hide, minimize and restore events publish a typed visibility event through the existing event subscription. This event controls only renderer motion. It never pauses or records focus time.

The main sculpture uses a bounded Three.js frame loop. Its SVG fallback keeps separate Anime.js scopes for drawing and ambient motion. Cleanup releases scene resources and animation scopes. All paths obey the live motion preferences. `AppState.graphicsMode` is a runtime-only field that reports the launch mode. The app does not put it in settings, datasets or backups.

### Floating brain

The floating window uses `FloatingBrain` to show the supplied local PNG through cropped SVG viewports.

Unreleased: `FloatingNetwork` replaces the sprite with the brain constellation of `NeuronScene.ts`, rendered through the same `ThreeScene` lifecycle as Focus (`kind: 'floating'`). Its formation value comes from `brainFormation` in `shared/timer-display.ts`. `FloatingBrain` stays as its fallback for software rendering and scene failure. [VISUAL-DESIGN.md](VISUAL-DESIGN.md) describes the formation rules.

- Eight aligned cells, in a sequence from pale to purple, blend by a bounded progress value: (elapsed − ten minutes) / (planned − ten minutes).
- Color stays at zero until minute ten. Color also stays at zero for plans of ten minutes or less.
- SVG saturation follows the same progress value. Thus the first sprite is grayscale.
- A four-second CSS breathing loop runs only while the timer runs and motion is enabled. Pause, reduced motion, disabled animation and hidden windows stop the loop.
- The app keeps the original 1028 × 1530 PNG. It does not edit its pixels.
- Hover and visible keyboard focus show the time and the controls. Focus from a mouse click alone does not keep them visible.
- The brain is the native drag region. The buttons use `no-drag`.
- The native bounds request a fixed size of 132 × 156. The app keeps saved positions, with a small margin at the display edge for Windows scaling.

The earlier update that added only the sprite added no commands, dependencies or migrations. Version 1.1.0 adds timing and Tasks interfaces and schema version 2. The section [Stopwatch, overtime and Tasks](#stopwatch-overtime-and-tasks-110) describes them.

### Floating window transparency

Only the floating `BrowserWindow` uses native transparency. It has a fully transparent background color and no window shadow. The renderer marks the floating document before it mounts React. Scoped CSS clears the backgrounds of the HTML, body, root and timer. It also resets the color scheme of the floating document. This also applies to the compact loading state. Light SVG and text shadows keep the black outlines and the controls visible on dark content. The main window keeps opaque surfaces in the selected light or dark theme.

## Inspect a database copy

You can use an isolated maintenance launch to inspect a **copy** of a SQLite snapshot that the app made. This launch does not touch the normal profile.

1. Make a new folder.
2. Copy the snapshot into the folder. Name the copy `focus-guide.sqlite`.
3. Open a new PowerShell session in the executable directory.
4. Run these commands. In the second line, use the path of your new folder.

   ```powershell
   $env:FOCUS_GUIDE_TEST_MODE = '1'
   $env:FOCUS_GUIDE_DATA_DIR = 'C:\FocusGuide-Recovery'
   Start-Process -FilePath '.\FocusGuide.exe'
   ```

5. Inspect the copied records.
6. Export a versioned JSON backup. Use this backup for the normal restore preview.

The folder must be writable. This mode replaces the normal application-data location before the app gets the instance lock. It does not bypass validation or renderer isolation.

## Official references

- The window controls use [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window/).
- Automatic pauses for lock and sleep use [powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor).
- Renderer restrictions follow the [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).
- The fallback SVG progress drawing in the main window uses [Anime.js createDrawable](https://animejs.com/documentation/svg/createdrawable/).
- The current floating sprite uses SVG cropping and blending, plus CSS breathing.

The exploratory coefficient is Spearman's rank correlation. Ties get average ranks. Its interpretation and its behaviour with constant input follow the [SciPy reference](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.spearmanr.html). The app calculates the coefficient in TypeScript. It does not use SciPy. It shows no p-values and makes no claims of significance. References checked 2026-10-06 in America/Fortaleza.

## Review fixes: 1.0.1

Backup serialization and restore use the same `BACKUP_LIMITS` and the same validation.

Daily backup:

1. Catches errors when it sets up the directory.
2. Writes the SQLite snapshot to a temporary path, then publishes it.
3. Validates the JSON before its own atomic publication.

If validation or the snapshot fails, the previous usable backup stays. There is no schema migration.

Calendar makes an index from dates to sessions. It uses the sessions and their active intervals, each in the time zone in which the app recorded it. The renderer memoizes this index and the thought count of each session. Excluded sessions stay visible in history. Number summaries keep their existing rules.

Settings merges each broadcast with the last saved baseline. Thus, an appearance change does not discard unsaved changes in other fields. A successful restore resets that baseline explicitly.

```mermaid
flowchart LR
    Dataset[Sessions and events] --> Index[Memoized calendar date index]
    Index --> History[Selected-day history]
    Store[(SQLite)] --> Validate[Shared backup validation and limits]
    Validate --> JSON[Atomic JSON publication]
    Store --> Temp[Temporary SQLite snapshot]
    Temp --> Snapshot[Published SQLite snapshot]
```

## Stopwatch, overtime and Tasks (1.1.0)

Countdown, stopwatch and overtime are phases of the same authoritative session engine. A stopwatch has no planned duration.

- The engine records the `autoOvertime` value of a countdown when the countdown starts.
- At the threshold, the engine saves the active intervals and `targetReached` atomically. Then it requests one notification. It never creates a second session.
- Recovery after lock, sleep, quit or crash keeps the existing policy: you resume manually.
- The intervals still add up to `activeMs`. If a transition fails, the timer freezes at the durable checkpoint.

### Schema 2

SQLite version 2 adds task categories, task personalization and session timing fields.

1. Before it migrates version 1, `VACUUM INTO` saves a consistent snapshot. The snapshot includes committed WAL data.
2. One transaction does these steps:
   - Rebuilds the `sessions` table so that `plannedMs` can be null.
   - Adds the task columns and categories.
   - Checks the foreign keys.
   - Increments `user_version`.
3. If the migration fails, it rolls back.

Existing sessions keep their IDs, times and links. Their overtime is disabled. JSON version 2 normalizes version-1 inputs explicitly. Restore stays transactional.

### Tasks and Focus

The Tasks page owns creation, editing, categories, links and completion. `App` keeps the shared pending session selection. Focus stays mounted, so its preparation drafts stay. Its animation stops when the view is hidden. When you archive or complete a task, the app removes it from the pending choices. Active and historical links stay.

### Preview

The preview has its own Vite configuration. It binds only to 127.0.0.1. Its adapter is for development only. It uses the same engine and service with synthetic `localStorage` and a browser clock. It has no SQLite endpoint and no endpoint for personal data. Native commands tell you that they operate only in the desktop app. Production builds remove the preview adapter and its banner by tree-shaking.

### Rollback from schema 2

After the migration, a rollback needs the previous app AND its `before-schema-v2` SQLite snapshot. The previous binary alone rejects the newer database. Before you recover the old pair, keep a current version-2 export. The snapshot from before the migration does not contain the records that you made after it.

## Radix renderer design (1.2.0)

The renderer shares controlled Radix primitives through `src/renderer/src/ui.tsx`.

- Main-window portals use the document theme tokens.
- Dialogs stay mounted until their exit animations end.
- `AlertDialog` protects the confirmation of destructive operations.
- While a restore is pending, you cannot close its dialog.
- The wrapper encodes empty `Select` values internally. Stored domain values do not change.
- Settings stays mounted after your first visit, so unsaved drafts stay.
- Active Focus uses a quiet layout. Its existing preparation state and thought state stay in React.

This release does not change IPC, the schema, the backup format, the timer engine or the floating window.

## Behaviour collection boundary

### Native helper

`native/activity-helper.cpp` is a Windows x64 helper with static links. `scripts/build-helper.cjs` compiles it with MinGW. It does not need administrator rights or network access.

- Electron starts the helper hidden, from an absolute path in the packaged resources. It sends bounded commands through a pipe.
- A message-only window uses [Raw Input](https://learn.microsoft.com/en-us/windows/win32/inputdev/using-raw-input) for optional background totals of keyboard and mouse activity.
- The helper uses [RegisterHotKey](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey) with `MOD_NOREPEAT` for the return controls.
- The helper never decodes text. It keeps key state for a short time only, to ignore repeated keys.
- When collection stops, the helper removes its device registration.
- If the parent process stops or the pipe closes, the helper exits.

### Main-process collector

`src/main/behaviour.ts` validates bounded aggregate messages. It ties each generation to authoritative active offsets. It stores only complete observations that are inside durable timer time.

- Clipped tails that the collector cannot place, and missing heartbeat periods, stay "unavailable". Disabled periods are explicit.
- Minute buckets merge adjacent records that have the same status.
- Aggregates flush together with checkpoints and transitions.
- Lock and sleep pause the timer immediately. Then the native flush drains the data. The drain adds no paused time.
- On quit, the app waits for queued commands. Then it pauses, drains and closes.
- A collector failure cannot stop a timer that operates correctly.

### Schema 3

Schema 3 adds:

- The activity mode and its version on each session.
- The active offset and the source on each marker.
- An indexed activity table with cascading deletes.

The app reads session samples only when it needs them. It does not send them in frequent state broadcasts. Full backups include them. The app exports them separately. The migration saves a consistent SQLite snapshot. Restore disables collection. When the JSON reaches its 64 MiB capacity, daily SQLite snapshots can still occur.

The previous app cannot read schema 3. A rollback must also use the matching database from before the migration. Keep newer records separately.

### Renderer feedback

`src/renderer/src/Behaviour.tsx` owns short-lived feedback and the review that you open on demand. An acknowledgement appears only after the marker and the timer boundary commit atomically. Hidden views discard acknowledgements. Feedback has no authority over timing.

## Shortcut configuration and centred brain

`ShortcutControl.tsx` records a supported key combination only through the recording button, while that button has focus. It edits the Settings draft. It keeps the existing checks for save conflicts and registration conflicts.

These events cancel the recording: Escape, blur, a hidden window, page navigation and a 30-second timeout.

The `shortcut.capture` command operates only from the main window. It temporarily sends the native shortcut, which is already registered, to a `shortcut-captured` acknowledgement. It does not record an attention return. It does not change the native registration. Blur, hide or reload of the main window also clears this mode. A 35-second native deadline ends abandoned requests. This feature records only a shortcut that you configure explicitly. It does not record other input content.

The feedback wrapper and its transform layer use the same centred grid and bounded height as the orbit. Thus the main brain stays aligned with the timer during idle, focus, pause and feedback. The dimensions and grayscale progression of the floating sprite have a separate scope.

## Architecture fixes: 11 October 2026

### File selection

The app prepares interactive file selection outside `CommandQueue`. The queue only commits the selected operation.

- Exports do a checkpoint and get the current data after you select the file.
- Restore preview and restore commit each check again that the app is idle.
- Input from the renderer never supplies a trusted file path.
- Sender checks run before preparation and again before commit.

### Transitions

`TransitionCoordinator` does these steps in sequence:

1. Drains collection.
2. Does a checkpoint of the timer.
3. Finalizes the span.
4. Commits a mutation.
5. Reconciles one time.

Settings and palette eligibility are validated before native registration or draining. If registration is rejected, collection does not change. If persistence fails, the coordinator keeps the buffered span. Periodic reconciliation cannot discard it. A later boundary operation can try again.

A system lock or suspend freezes the timer synchronously. Then the app puts the drain in the queue after the current transition. This keeps the durable clock boundary if Windows suspends before the asynchronous cleanup.

### Daily backup outcomes

The SQLite result and the JSON result of each daily backup are independent.

- If SQLite succeeds, the app advances `lastBackupDay` and the seven-date retention. This occurs even if JSON serialization fails.
- `lastJsonBackupDay` records a JSON success.
- `lastBackupJsonError` keeps the warning after a restart.
- After a SQLite success, automatic retries wait until the next day. **Back up now** tries both formats again.
- A failure to create the SQLite file is an operation failure.

No schema migration is necessary.

### Shortcut conflicts

The collector status shows the requested shortcut and the effective shortcut. It shows a registration error separately.

- If a restore causes a hotkey conflict, the app keeps the valid restored data.
- Settings shows the active key that the app kept. It also tells you to change the key or select **Retry shortcut**.
- During a conflict, you can still edit the other preferences.
- When you record an existing native shortcut, the app uses the effective key.

## Version 1.3.1: field deletion and page geometry

### Field deletion

The typed `field.delete` command takes a field id.

1. `FocusService` rejects a field that does not exist. It also rejects the deletion if any session is unfinished.
2. `FocusService` calls its required host backup callback.
3. The native host sends the deletion through the serialized transition coordinator.
4. The host creates a validated, atomic JSON backup at `backups/before-field-delete-<timestamp>-<uuid>.json`. If the backup fails, the deletion stops.
5. In one SQLite transaction, the store removes these items in this order:
   1. Sessions. Their events and activity rows are deleted by cascade.
   2. Tasks.
   3. The field.
   4. The saved activity-mode preference of the field.

Categories and unrelated history stay. No schema migration is necessary. The browser preview saves its recovery copy in synthetic `localStorage`. Then it does the same removal in one transaction.

### Settings dialog

Settings uses the shared dialog for destructive operations.

- It shows the impact on tasks, sessions and time.
- A ref prevents a second submission.
- While the deletion is pending, you cannot close the dialog.
- If an error occurs, the dialog keeps it so that you can try again.

A dataset with no fields is valid. Selection and filter cleanup follow the state broadcasts.

### Page geometry

- Main-window content has a shared maximum width of 1600px, with gutters of 18–32px.
- Workspace container queries stack the columns when the width is less than 900px.
- Field lists and Calendar history grow with the page scroll.
- Palette color passes down through the constellation groups. Field colors stay available in other places.

## Goal deletion (unreleased)

The typed `goal.delete` command takes a goal id. It follows the field deletion design, with one difference: tasks and sessions stay.

1. `FocusService` sends the command to `GoalService.remove` with the goal of the timer's current session and the host backup callback. `GoalService` rejects a goal that does not exist. It also rejects the deletion if the current session, or any unfinished session, has this goal. The reason: the timer writes the full in-memory session at each checkpoint, so a detached link would come back and break the foreign key.
2. The native host runs the command through the serialized transition coordinator, as for `field.delete`. The host saves a validated, atomic JSON backup at `backups/before-goal-delete-<timestamp>-<uuid>.json`. If the backup fails, the deletion stops.
3. In one SQLite transaction, `Store.removeGoal`:
   1. Sets `goalId`, `occurrenceId` and `milestoneId` to `NULL` on sessions that point to the goal, its occurrences or its milestones. `activeMs`, events and activity do not change, so recorded time still equals the sum of durable intervals.
   2. Sets `goalId` and `milestoneId` to `NULL` on tasks that point to the goal or its milestones.
   3. Deletes the goal. `ON DELETE CASCADE` removes its milestones, actions, occurrences, progress, goal reviews, agent proposals and agent changes. This matches field deletion, where the same cascade removes agent records. A `goal.create` proposal has a null `goalId`, so it stays as an audit record.

No schema migration or backup format change is necessary. The browser preview saves its recovery copy in synthetic `localStorage` and does the same changes in one transaction (`PreviewStore.removeGoal`).

The agent can never reach this command. No agent tool maps to it, and the command callback that `FocusService` gives to `AgentService` and `AgentEditor` refuses `goal.delete` and `field.delete`.

The goal workspace opens a shared destructive dialog. It counts the planning records that leave and the tasks, sessions and time that stay. It blocks the button while a session of the goal is unfinished and cannot close while the deletion is pending. After a success, it goes back to the goal list. Filters and session preparation that pointed to the goal clear themselves at the next state broadcast.

## Version 1.5.0: goal creation usability

### Schema 5

Goal and milestone records are JSON bodies, so schema 5 has no column changes. The migration saves a `before-schema-v5` snapshot with `VACUUM INTO`, then runs `upgradeGoalRecords` (`src/shared/goal-types.ts`) over goals and milestones and rewrites them in one transaction. The same function upgrades version 4 JSON backups and the browser preview's stored data. The previous app rejects a schema 5 database; a rollback needs the matching snapshot.

### Commands

- `goal.create` accepts `whyTags` and `milestones` (`{ title, completed }[]`, at most 100) and stores milestone positions in order.
- `goal.update` accepts `whyTags`.
- `goal.milestones.sync` replaces a goal's active checklist in one transaction and archives omitted milestones.

### Renderer

- `useDiscardGuard` (`ui.tsx`) routes every close path of an editor overlay (outside click, Escape, close button, Cancel) through one confirmation when the form differs from its initial snapshot.
- `TagPicker` (`ui.tsx`) and `MilestoneChecklist` / `GoalMilestones` (`MilestoneChecklist.tsx`) are the shared controls. Markdown parsing and formatting live in `src/shared/milestone-markdown.ts`.

## Milestone block editor (schema 6)

### Schema 6

Milestone records are JSON bodies, so schema 6 has no column changes. The migration saves a `before-schema-v6` snapshot with `VACUUM INTO`, then runs `upgradeGoalRecords` (`src/shared/goal-types.ts`) over the milestones and rewrites them in one transaction. The upgrade adds `kind: 'todo'` where it is missing. It is idempotent, so the same function serves JSON backups of versions 1–5 and the browser preview's stored data. The previous app rejects a schema 6 database; a rollback needs the matching snapshot.

### Invariants

- Only a `todo` milestone can be done, count for progress (`goalSummary`) or take a task link (`GoalService.taskLinks`, `validateGoalData`).
- `GoalService` refuses to change a to-do with linked tasks into another kind, in `goal.milestones.sync` and `goal.milestone.save`. It does not unlink tasks silently.

### Commands

- `goal.create`, `goal.milestones.sync` and `goal.milestone.save` accept `kind`. A row without `kind` is a to-do. A non-to-do row is saved with `completed: false`.
- `goal.milestones.sync` creates a milestone with the identifier that the renderer gives when no milestone has it yet, and refuses an identifier of another goal's milestone. The renderer makes identifiers with `crypto.randomUUID()`, so a repeated sync is idempotent.

### Renderer

- `MilestoneChecklist` (`MilestoneChecklist.tsx`) is a controlled block editor. Typed shortcuts come from `blockShortcut`; Markdown parsing, formatting, escaping and list numbering live in `src/shared/milestone-markdown.ts`.
- `GoalMilestones` runs one save at a time. A newer full-checklist save replaces a save that waits. While focus is inside the editor, the rows on screen stay the source of truth; the editor reloads from the dataset only after focus leaves and the saves finish. Inputs are not disabled during a save, so the caret stays in place.
