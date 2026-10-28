# Focus Guide — user guide

Version 2.0.0 · Windows x64 · English · offline

This guide describes the app in the `Aplicativo` folder. For the current interface, see [Visual design](VISUAL-DESIGN.md).

## Open the app

1. Keep the supplied **Focus App** folder. Or, extract a Windows release ZIP to a folder that you want to keep.
2. Open **Focus Guide.lnk** in the **Focus App** folder. Or, open **Aplicativo/FocusGuide.exe** directly.
3. Keep all the files of that folder together. The executable needs its bundled resources, DLLs and locale files.

The app contains its own runtime. You do not need Node.js or an account. After extraction, the app does not need an internet connection.

This is an unsigned personal build. Thus Windows can show a warning about an unknown publisher. The checksums supplied with this release identify the files of the release.

You can make a Windows shortcut to the executable in **Aplicativo**. The app keeps your records in a different folder. If you move the executable folder, your records do not move and are not erased.

### Replace the app with a new build

1. On the tray menu, select **Quit (save and pause)**. If you only close the main window, the app continues to run hidden and keeps its files open.
2. Replace the **Aplicativo** folder with the new build.
3. Open **Focus Guide.lnk**.
4. Resume a paused session manually, if one exists.

Version 2.0.0 upgrades older databases to schema 5. Before the upgrade, it saves a snapshot of the database. To go back to an older app, you need the database snapshot that matches it.

The milestone block editor upgrades the database to schema 6 in the same way. It saves a `before-schema-v6` snapshot first, and every existing milestone becomes a to-do.

The goal workspace upgrades the database to schemas 7, 8 and 9. Each step saves a `before-schema-vN` snapshot first. After the upgrade, agent access is **Off**.

Behaviour insights upgrade the database to schema 10. The app saves a `before-schema-v10` snapshot first. After the upgrade, attention check-ins are **off**. Version 2.0.0 and earlier cannot open a schema 10 database, and they cannot restore a version 10 backup. Before you update, save a full JSON backup with your current version. To go back, you need the snapshot and the older app.

The session preparation answers upgrade the database to schema 11. The app saves a `before-schema-v11` snapshot first. Version 3.1.0 and earlier cannot open a schema 11 database, and they cannot restore a version 11 backup.

## Learn with goals

The app opens on **Goals**. A goal is the place where you learn something, for example "Learn linear algebra".

1. Select **New goal**. Choose its area (for example Mathematics), a title and an outcome.
2. Open the goal. In **Roadmap**, write stages as headings and steps as to-dos. Open **Details** on a step to add an estimate, a target date, notes and links.
3. Select **Focus on this goal** or **Focus on this step**. Focus opens with the goal, its area and the step. Select **Begin focus**.
4. In **Tasks**, add one-off steps. In **Plan & review**, add weekly actions and write your weekly review.
5. In **Behaviour**, see how you study this goal: time by activity mode and roadmap step, planned actions, and the same Insights figures as in Patterns for this goal.

Areas are the former focus fields. They group goals. You manage them in **Settings > Your areas**. You can still start a session without a goal: select **Free focus** on the Focus page.

### Delete a goal

To hide a goal but keep all of it, set its status to **Archived** in **Edit goal**. To remove a goal permanently:

1. Finish any running or paused session of the goal.
2. Open the goal. Select **Delete goal** (the trash icon next to **Edit goal**).
3. Look at the number of planning records that will be removed, and the tasks and sessions that will stay.
4. Select one of these:
   - **Keep goal** to cancel.
   - **Back up & delete goal** to remove the goal. The app goes back to the goal list.

The app removes the goal's roadmap, weekly actions, action check-ins, outcome observations, weekly reviews, and agent proposals and changes. Tasks and focus sessions stay in their area with all their recorded time; only their link to the goal is removed.

Before it removes records, the app saves a JSON recovery backup in the `backups` directory of the data folder. If the backup fails, the goal does not change. To get the goal back, restore that backup (a restore replaces the full dataset). An AI agent cannot delete a goal.

For the full rules, see [Goal planning](GOAL-PLANNING.md).

## Connect an AI agent (MCP)

Focus Guide can serve a local AI agent, such as Claude Code or Claude Desktop, through the Model Context Protocol (MCP). The agent can read your goals and focus records, and it can propose changes that you review.

1. Open **Settings > AI agent (MCP)**.
2. Choose the access level:
   - **Off** (default): no agent can connect.
   - **Read only**: the agent can read areas, goals, roadmaps, tasks, sessions, weekly reviews, behaviour summaries and focus insights.
   - **Read and propose**: the agent can also propose goals, roadmaps, tasks, weekly actions and review notes. Nothing changes until you apply a proposal.
   - **Read and edit**: the agent can also change goals, roadmaps, step details, tasks, weekly actions and review notes at once. At this level the agent cannot delete anything, mark a goal achieved, archive a goal or tick a roadmap step. It works only on goals and on tasks that belong to a goal, and it has no access to sessions, the timer, areas, settings or backups. Every change appears in **Agent activity** on the Goals page, where you can undo it.
3. Select **Copy configuration**.
4. Add the configuration to your client:
   - Claude Desktop: add the `focus-guide` entry to `mcpServers` in `claude_desktop_config.json`, then restart Claude Desktop.
   - Claude Code: save the text as `.mcp.json` in a project folder, or add the entry with `claude mcp add-json`.
5. Keep Focus Guide open while the agent works.

The configuration starts `FocusGuide.exe` as a small MCP server. You do not need Node.js. The server connects only to the running app on this computer, through a Windows named pipe with a new random key each time the app starts.

**Privacy.** The agent sends what it reads to its AI provider. With access on, your goals, sessions, notes and activity summaries can leave this computer. Use **Read only** or **Off** if you do not want that. A restore always sets access to **Off**.

**Proposals change nothing until you apply them.** Review them on the goal list and on each goal's Overview. Select **Apply**, **Edit then apply** or **Reject**. If you move or replace the `Aplicativo` folder, copy the configuration again, because it contains the path of the executable.

The tool `get_focus_insights` gives the agent the same values as the Insights tab of Patterns. They describe your records and are not scores of attention. The default range is the last 90 days. Each curve has at most 60 points.

The client prompts `build_learning_roadmap`, `weekly_learning_review` and `analyse_goal_behaviour` give the agent a ready plan for these tasks.

## Begin a focus session

### Prepare the session

1. Open **Focus**.
2. Select a field. The first fields are Deep work, Learning and Creative practice. You can rename or replace them in Settings.
3. Optionally, write an intention.
4. Select a duration: 25, 50, 90, or a custom value from 1 to 1440 minutes. Ninety minutes is a default that you can change. It is not a claim about the best duration.
5. Select **Timer** for a countdown. Or, select **Stopwatch** to count up without a planned duration.
6. Optionally, open **Optional details** to add a goal, an activity mode and your starting energy.
   - Energy uses a scale from 1 to 5. To clear the value, click the selected value again.
   - **I'm already warm** records if you are already warmed up: **Yes**, **Kind of** or **No**.
   - **Have you taken medications?** records **Yes** or **No**.
   - Both answers are optional. To clear an answer, click it again or select **Clear**. You cannot change them after the session starts.
   - If you collapse this section, the app keeps your draft.

The field, timing and intention stay visible together. Preparation from Goals or Tasks shows as a compact linked summary.

Below the duration, Focus can show up to three hints from the last 90 days. They come from the prepared goal, or from the area if you chose no goal. Each hint comes from a different group. One hint suggests a session length or a pause. Select the button on it, for example **Use 25 min**, to set the timer. One hint suggests a time of day. One hint tells you what to do before you start, for example to write the first small step. If you saved an adjustment for this week, Focus shows it above the hints. Hints use the same rules as the Insights tab, so they appear only when you have enough records. If the app cannot read them, it shows none.

### Use tasks

To create and edit next steps, open **Tasks** in the sidebar.

- Each task has a focus field for time tracking. A task can also have a separate category, notes, a priority and a due date.
- The due date of a new task is today (your local date). The **Task details** label shows it. To use a different day, open **Task details** and choose a date. To have no due date, select **No due date**. To edit the due date of an existing task, use **Edit task**.
- You can change the names and colors of categories.
- You can search titles and notes. You can filter by field, category, status and priority. You can sort by date, due date, priority or title.
- The app saves your views locally.

To prepare a session from Tasks:

1. Select a session field.
2. Select up to 100 tasks.
3. Optionally, select a primary task.
4. Click **Go to Focus**.

The selection and the Focus draft stay when you change pages. During focus, you can go back to Tasks. There you can link existing open tasks from the current field, or mark tasks as complete.

- **Archive** and **Restore** keep the task IDs and the historical links.
- When you archive a category, its assignments stay.
- Due dates do not schedule notifications.
- Each session records its time one time only. The number of tasks in the session does not change this.

The Tasks page starts with creation, search and the task list. Expand the optional task details, the advanced filters or the category management when you need them. In wide windows, session preparation is next to the list. In narrow windows, it is below the list.

### Run the session

1. Click **Begin focus**. The remaining time and the new brain connections show your progress.
2. To stop recording, click **Pause**. To continue, click **Resume**.
3. To end, click **Finish session**. The app saves the recorded time and opens a short reflection. You can skip the reflection.

When a countdown reaches zero, Windows shows one notification about overtime. **Overtime +MM:SS** shows the extra time. The total recorded time shows below it. Recording continues in the same session until you click Finish.

To make sessions complete automatically at zero again:

1. In Settings, disable **Continue with stopwatch when the timer ends**.
2. Save.

This applies to the sessions that you start after you save. The app records this preference when each session starts.

A stopwatch counts up until you click Finish. It has no target.

Windows settings control whether you see and hear notifications. If Windows suppresses a notification, time recording does not change.

### Session tools

During focus, open **Session tools**. It has these commands:

- **Mark interruption.** An interruption marker does not pause the clock. When you stop working, use Pause.
- **Park this thought.** This saves something to look at later. It does not count as an interruption. Parked thoughts show in the final check-in and in the session history.
- **Exclude session.** This finishes the session and removes it from insights, daily totals and neural progress. Its time, tasks, notes and events stay in history and in exports.

### After the session

After completion, you can rate your focus from 1 to 5 and write a note. You can also skip both.

The reflection also has two questions that you can leave empty:

- **What got in the way most?** The answers are Nothing notable, Phone or notifications, People or noise, Wandering thoughts, Tiredness or hunger, Unclear or too hard task, and Something else.
- **How demanding was it?** The answers are Too easy, About right and Too hard.

To remove an answer, select it again or select **Clear**. You can change both answers later with **Edit** in Calendar. The Insights tab uses them.

**Save & take a 10-minute break** starts a separate break. A break never adds focus minutes. A break does not continue after an app restart.

### Automatic exclusion

When a session has **less than 2 minutes of recorded active time**, the app excludes it automatically at finish. This applies when you finish manually and when the countdown reaches zero.

- Paused time does not count toward this limit.
- A session of exactly 2 minutes stays included.
- The app does not change earlier completed records.

To include a record again, clear **Exclude this session from insights** in the completion check-in. You can also change this later with **Include again** or **Exclude** in Calendar. Recent sessions show an **Excluded** badge, so you can still find them. Exclusion does not delete data.

### Settings layout

Settings has three groups: defaults, appearance and feedback, and activity and shortcuts. Its sticky save area shows when you have unsaved edits.

## Appearance and side panel

To make the left panel a 72-pixel icon rail, click **Collapse panel** above the navigation. To expand it again, click the chevron. The icons keep their hover labels and keyboard navigation. The app remembers your choice after a restart.

The moon and sun button in the top bar changes between dark mode and light mode immediately. You can also set **Appearance** in Settings and click **Save preferences**.

- All main pages and dialogs follow the theme.
- The transparent floating timer keeps its black brain and its readable hover controls.
- The app saves the theme and panel preferences locally. Full JSON backups include them.
- Older backups use light mode and an expanded panel by default.

### Session gauge

The Focus page can show a session gauge instead of the brain. In Settings, set **Focus visual** to **Session gauge** and click **Save preferences**.

- The gauge is a dial indicator on a stand. The large needle turns once for each 10 minutes of session time.
- The small dial counts the turns up to 12, that is, 2 hours. Its short marker shows the planned length of the session. Before you start, the marker follows the duration that you select.
- The screw jack under the plunger lifts a little at each turn, so the plunger and the needle always agree.
- During a break, the needle and the plunger are blue.
- The gauge shows the timer of the app. It does not measure attention, and it does not change recorded time.
- The bottom-right corner of the Focus card shows the turn and the minutes, for example "turn 3 of 12 · 34 of 50 min".
- The gauge does not use WebGL, so it also works in software rendering.

## Floating timer and tray

### Floating timer

Click **Floating timer** in the top bar.

- The compact window has a transparent background and stays on top of other windows.
- It requests a fixed size of 132 × 156 pixels. Windows display scaling can round its native bounds a little.
- To move it, drag the brain. You can put it on top of another application.
- The brain is a constellation of neurons. At the start, the neurons are faint stars. At each 10 minutes of session time, lines slowly connect the neurons and draw the brain: first its outline, then its folds. Each step takes about 2 minutes and adds one twelfth of the brain. The brain is complete after 2 hours of session time. The brain stops forming when you pause.
- At rest, only the brain is visible.
- A light edge helps the brain, the time and the icons stay visible on dark backgrounds.
- In software rendering mode, the floating timer shows the earlier brain image.

Sometimes an [attention check-in](#attention-check-ins) is due while the main window has no focus. The floating timer then shows three small icon buttons: **On the task**, **Drifting** and **Somewhere else**. They do not take keyboard focus. If you hid the floating timer, it appears without taking focus and hides again after the check-in. If you close or hide the window while a check-in shows, the app cancels the check-in and saves nothing. The buttons cover only the lower part of the window. You can still drag the brain, press **I'm back** and use the timer controls.

To show the time and the controls, move the pointer onto the window. When the pointer moves away, they hide again. This also occurs after you click a control. Tab or keyboard focus also shows them.

The time display depends on the mode:

| Mode | Display |
|---|---|
| Countdown or break | Remaining time |
| Stopwatch | Recorded time |
| Overtime | Extra time, with a plus sign |
| Idle | Your configured countdown duration |

| Control | Action |
|---|---|
| Pause / Resume | Pauses or resumes the shared timer. Available during a session or a break. |
| Finish | Saves a focus session and opens its reflection. Or, ends a break. |
| Arrow | Opens the main focus space. |
| X | Hides the floating timer. The session continues. |

The floating window uses the same timer as the main window. When you open it, it does not start another session. **Gentle animations** in Settings and the system reduced-motion preference disable the curve transitions. Progress continues to update. If a saved window size is from an older version, the app makes it smaller automatically. The window stays in the same position, inside the work area of the monitor.

### Tray and closing

- When you close the floating window, it hides.
- When you close the main window, it also hides. The tray icon keeps the app available.
- When you minimize the app or change to another application, the timer continues.
- To open the main window again, double-click the tray icon.
- The tray menu also has the floating timer, Pause / Resume and **Quit (save and pause)**.

### Pauses and recovery

Screen lock, sleep and an explicit quit pause focus. Resume manually when you are ready. Normal keyboard and mouse inactivity does not pause a session, for example while you read. The app remembers window positions. When the display arrangement changes, the app moves the windows onto a connected monitor.

The app saves focus time at each transition and does a checkpoint every five seconds.

- After an unexpected stop, the app recovers only the last time that it saved correctly. It marks the session as recovered.
- You can lose the time after that checkpoint. The app never invents time for the period when it was closed.
- If a save fails, the app shows an error. Recording freezes at the last durable total. Fix the storage problem before you resume.

## Calendar

The monthly calendar shows before the planned actions of the selected day. The calendar and the annual heatmap can show **Recorded time**, **Sessions** or **Self-rated focus**. The field filter includes archived fields. To see the session timeline and parked thoughts of a day, select the day.

- When an active interval continues past midnight, the app divides it between the two days. It uses the saved timezone of the session.
- Session counts and ratings belong to the start day.
- Existing sessions keep their recording timezone, also if you change the default timezone later.
- The days with the most time and the days with the highest ratings show separately. Rating averages show their rating counts.

Session commands:

- **Edit** changes the field, intention, energy, focus rating and reflection. It also changes the two optional answers about what got in the way and how demanding the session was. It does not change the raw duration. When you change the field, the app clears the task links to the previous field.
- **Exclude** keeps a wrong record but removes it from analysis and neural progress.
- **Delete** asks you to confirm. Then it removes the session and its events.

To stop using a field for new sessions but keep its history, archive the field in Settings.

## Patterns and weekly review

Select dates and a field. Patterns then compares these items:

- Recorded time.
- Weekday groups and start-time groups.
- Durations.
- Interruptions.
- Planned time versus recorded time, for countdown sessions.

Stopwatch time stays in the recorded totals. Patterns does not include it in comparisons with planned duration. These comparisons use finished, included sessions that start in the selected range. They describe what you chose to record.

### Scatterplots

**Planned vs recorded** (in **Session distributions**) compares the length that you set for a timer session with the active time that the app recorded. It counts the sessions that were shorter than planned, within a minute of the plan, or longer than planned, and shows the median difference. Stopwatch sessions have no plan, so they are not in this chart. The check-in after a timer session also shows the planned and recorded time.

Two scatterplots show starting energy versus your focus rating, and recorded duration versus your focus rating.

- They show the count of complete pairs and the count of missing pairs.
- Spearman's coefficient shows after 20 complete pairs that cover seven calendar days.
- This limit does not prove that the coefficient is reliable.
- If the values are constant, the coefficient is not available.
- An association does not show cause and effect.
- Missing ratings stay missing.

### Weekly review

The weekly review shows totals, the rating distribution and the most frequent interruption categories. You can save one adjustment for the next week. In Settings, you can set an optional weekly time intention. It does not change cosmetic unlocks and gives no penalties.

### Insights tab

Patterns has two tabs: **Overview** and **Insights**. Overview is the page that the sections above describe. The date range, area and goal filters apply to both tabs. Insights reads your finished, included sessions on this computer. It sends nothing to any service.

The first card compares the last 7 days with the 28 days before them: perceived focus, drifts per hour, the median time to the first drift and window switches per hour. It also shows the adjustment that you saved for this week and for last week. A change is a hint. It does not prove that the adjustment worked.

The card **The data behind these insights** shows five values:

- How many sessions the analysis uses.
- How many of them you rated.
- How much active time the keyboard and mouse collection covered.
- How many sessions have drift markers.
- How many check-ins you answered.

Notes tell you which records the analysis left out and why.

| Figure | What it shows | What it needs |
|---|---|---|
| **When you focus best** | Your focus rating by start hour, with a band for the uncertainty. Drifts per active hour. A grid of weekday and time of day. | 10 rated sessions |
| **How long your attention lasts** | The share of sessions that are still without a drift as active minutes pass, and the median time. You can group the curve by time of day or by activity mode. A table shows drifts per hour in the warm-up (0–10 min), sustain (10–25 min) and fatigue (25+ min) phases. A second curve shows the time after **I'm back** until the next drift. | 15 sessions with **I'm back** available and 8 first drifts |
| **The shape of a session** | Blocks of 5 active minutes, up to 120 minutes: time with input, window switches, drifts and off-task check-ins. Dashed lines mark minute 10 and minute 25. A note compares the 2 minutes before a drift with the other minutes. | 10 sessions with activity collection on |
| **Interaction states** | Groups of minutes by how you used the keyboard and mouse, for example Typing, Scrolling or Quiet, and how often the state changes. | 300 minutes with input time from 5 sessions |
| **What got in the way** | Your answers with the mean focus, the interruptions that you marked, window switching and the challenge answers. | 10 sessions |
| **What tends to go with higher focus** | Which facts about a session go with a higher or lower rating. One view uses facts that you know before you start, for example time of day or starting energy. A second view uses facts from during and after the session. The lasso marks the features it keeps. Features that it sets to zero show as "No clear association found". | 30 rated sessions over 14 days |
| **Suggestions to try** | Up to five suggestions with their numbers. | The rules in the [data dictionary](DATA-DICTIONARY.md#suggestions) |

If a figure does not have enough data, it says what is missing. The count of sessions or minutes shows how far you are.

How to read the figures:

- Every interval is a 90% interval. A wide interval means that the result is uncertain.
- Your ratings and markers are what you reported. They are not a measure of attention.
- You choose when you focus. A pattern is an association. It does not show a cause.
- A missing value stays a gap. It never counts as zero.
- The open end of a median shows as "or longer". It means that the curve did not reach a clear end.
- The model card shows effects only when the model predicts your next rating at least 5% better than your average rating. If not, it shows the two errors.
- Under the three chart figures, **Show values** opens a table with the same numbers. A screen reader can read it. The other figures already show their numbers as text.
- Each suggestion has a label, **Tentative** or **Moderate evidence**, and shows the numbers behind it. **Try next week** adds the suggestion to your weekly adjustment on the Overview tab. Then you can edit and save it.

### Behaviour tutorial

The **Behaviour tutorial** is a short guide with 9 steps. It explains keyboard and mouse totals, attention check-ins, the **I'm back** marker, reflection questions, the Insights tab, how to read the numbers, the Behaviour section of a goal and the agent tool `get_focus_insights`. Some steps have a button, for example **Open Settings**, that closes the tutorial and opens the right page.

To open it, select **Open tutorial** in Settings, in the Activity & shortcuts group. Or select **Behaviour tutorial** at the top of Patterns. Use **Back** and **Next** to move between steps. The tutorial does not change your settings or your data.

### Example data

**Explore an example** shows 60 invented sessions from the last 30 days, with activity, markers, check-ins and reflection answers. They fill the Insights tab too. In the example, **Try next week** is off. A label identifies them clearly. They add nothing to your personal dataset. To save a weekly adjustment, go back to your dataset. Exports always contain your personal records, also while you look at the example.

## Neural World

Neural World shows your goals as a network of neurons. It reads your records only; it changes nothing.

- **Soma.** Each goal is a neuron. Its body grows with the recorded focus time of the goal (finished, included sessions), on a scale that slows down for large totals.
- **Axon.** The to-do steps of the roadmap sit along the axon in roadmap order. Finished steps are lit. The next step is larger and pulses slowly when animations are on. Later steps are faint. A long roadmap shows 12 steps around the next step; the side panel lists every step.
- **Sparks.** Each action that you recorded as done in the last 28 days adds a spark around the soma. A smaller version adds a smaller spark. Skipped or unrecorded actions add nothing.
- **Progress arc.** A goal with a baseline and a target shows an arc for its latest progress value.
- **Status.** Active goals have full colour. Drafts are translucent with a dashed axon. Paused goals are muted and do not pulse. Achieved goals move to an outer ring. Archived goals do not appear.
- **Areas.** Goals of the same area stay together and use the area colour. The layout comes from identities, so it does not move when totals change.
- Open **Palettes & horizons** to select a palette. The palette tints the sky and the light of the world. Palettes unlock at 5, 20 and 50 recorded hours. Your light or dark interface choice is separate.
- **Focus by area** shows the totals of all areas.
- Days off do not erase progress. There are no penalties for a broken streak.

### Explore the network

- To select a goal, click its neuron or its button below the scene. The world turns and the camera moves to that goal. **Overview**, **Esc** or **Home** go back.
- Click a synapse, or a step in the side panel, to select that step.
- The side panel shows the goal's status, area, focus time, the last 28 days, recorded actions, progress and roadmap. **Focus on next step** (or **Focus on this step** for a selected open step) prepares a session for the goal and the step and opens Focus. Only active goals can start a session. **Open goal** opens the goal workspace.
- To turn the scene, drag it, use the rotate and tilt buttons, or give the scene focus and use the arrow keys. **+** and **−** zoom.
- **Pause orbit** stops the automatic rotation. Rotation also pauses while the pointer is on the scene, the scene has focus, or a goal is in view. Rotation obeys Gentle animations, system reduced motion and window visibility.
- **Show achieved goals** hides or shows the outer ring. The scene shows 24 goals at most; the list below it shows every goal.
- View controls do not change recorded time.

The **Year overview** in Calendar contains the annual heatmap and the day comparisons. Patterns keeps the field charts and weekday charts visible. **Session distributions** and **Possible associations** show more charts and their limits.

Brain connections and constellations are visual metaphors. They do not measure brain activity, cognition, personality or health. To stop animations, turn off **Gentle animations** in Settings, or use the reduced-motion setting of your system. The app suspends animation scopes that are hidden.

## Your data and backups

### Data folder

Settings shows the exact **Data folder**. Usually it is `%APPDATA%\Focus Guide`. It contains `focus-guide.sqlite` and a `backups` folder. Installation files contain no personal sessions. All copies of the same app on your Windows account use the same application-data folder.

### Exports

- **Session dataset** and **Event dataset** save CSV files. A CSV file is for analysis. It cannot restore the app.
- **Full backup** saves a versioned JSON file. It contains fields, categories, tasks, sessions, events, ratings, settings and weekly reviews.
- The [data dictionary](DATA-DICTIONARY.md) explains every field and unit.
- A blank rating in a CSV file and `null` in JSON mean "missing". They never mean zero.

### Daily restore points

While the app runs, it keeps seven daily restore points and replaces the oldest automatically.

- Each date has a complete SQLite snapshot and a JSON copy.
- The app makes the first backup of a new day when it opens, or when its periodic check finds a new day.
- **Back up now** updates the copy of today. It does not make an eighth daily copy.
- After seven saved dates, the app removes the oldest days.
- The app keeps snapshots from before a restore separately. They are not part of this rotation.

### Protect your data

Local backups protect you from accidental edits. To protect your data if you lose this computer, save a full JSON export on a different drive at regular intervals.

Records, SQLite snapshots and exports are plain files. The app does not encrypt them. They can contain intentions, reflections and parked thoughts. Select a storage location that is safe for this content. The app does not send these files to any service.

## Restore through Settings

1. Finish the current session or break.
2. Click **Restore a JSON backup**.
3. Select a full export, or a `daily-YYYY-MM-DD.json` file in the `backups` directory of the data folder.
4. Look at the date and the record counts. The validation checks the version, required fields, ratings, IDs, references and active-interval totals. If the file is not supported or not consistent, the existing data does not change.
5. Select **Back up & restore**. The app saves a `before-restore-<timestamp>.sqlite` snapshot before the replacement. The replacement occurs in one database transaction. If a write fails, the changes roll back.

A restore replaces the dataset. It does not merge it.

- Imported unfinished sessions stay paused after recovery.
- The preview expires after five minutes. If necessary, select the file again.
- The JSON restore has a limit of 64 MiB and limits on the record counts.
- Window positions and backup housekeeping metadata belong to this computer. The JSON backup does not include them.

### If the app cannot open

If a file-storage failure stops the app from opening, do these steps:

1. Before you do anything else, keep a copy of the full data folder.
2. Make a **new** recovery folder.
3. Copy a daily SQLite snapshot that the app made into the recovery folder. Name the copy `focus-guide.sqlite`. Do not change the original folder.
4. A technical maintainer can open the recovery folder with the documented isolated-data launch mode. The maintainer can inspect the recovered records and export JSON before anything is replaced.

Do not copy a live SQLite database without its journal. The supplied daily snapshots are consistent, standalone copies. For the test launch mode, see [Architecture](ARCHITECTURE.md). For recovery limits, see the Verification section.

## Keyboard and display

| Key | Action |
|---|---|
| Tab / Shift+Tab | Move through the controls. |
| Enter / Space | Activate buttons and checkboxes. |
| Escape | Close a dialog. |

When a dialog is open, focus stays inside the dialog. When the dialog closes, focus goes back to the previous control.

Desktop layouts were checked with a content viewport of 1366 × 768. Smaller windows can scroll vertically. There is no layout for smartphones.

### Graphics problems

The app permits hardware acceleration by default. If WebGL is not available, or a scene loses its context, an SVG fallback keeps the progress and the controls.

If the window is blank, or you have compositor problems:

1. On the tray menu, select **Quit (save and pause)**. It is not sufficient to close the window. A running instance keeps its launch mode.
2. Do one of these steps:
   - Run **Start-Software-Rendering.cmd** in the **Aplicativo** folder.
   - Start `FocusGuide.exe --software-rendering`.

Software mode does not use WebGL. Drawing settings never change recorded time.

### Recovery and keyboard navigation in 1.0.1

- If a restore preview expires, use **Choose backup again** in the dialog.
- If a restore fails, the dialog stays open and shows an explanation.
- A successful restore updates the Settings form.
- When you change the theme or collapse the sidebar, the app keeps your other unsaved Settings edits.

In the annual Calendar heatmap:

| Key | Action |
|---|---|
| Tab | Enters the heatmap one time. A second Tab leaves it. |
| Up / Down | Moves one day. |
| Left / Right | Moves one week. |
| Home / End | Moves to the first or last day of the year. |
| Enter | Selects the day that has focus. |

JSON export and JSON restore have the same limits: 64 MiB and the same record counts. If an export is too large, the app reports an error before it replaces an existing backup. When the data is too large for JSON, keep your existing backup files and use CSV for the separate tables.

## The 1.2.0 focus space

The main screens share a light or dark neural atmosphere and Radix controls.

- While a session or break is active, the brain, the timer, Pause / Resume and Finish stay prominent.
- Open Session tools to park a thought, mark an interruption or finish with exclusion.
- You can expand or collapse Recent sessions.
- Settings drafts stay when you go to another page. **Save preferences** saves them.
- The floating timer keeps its compact, transparent design.
- Reduced motion and the animation preference also disable interface transitions.

## Behaviour collection — version 1.3.0

### Activity mode

Select an activity mode before you start. Focus Guide remembers your last choice for each focus field. The modes are: reading, writing or coding, visual work, video or lecture, offline, mixed and unspecified. They give context. They do not set attention thresholds.

### Keyboard and mouse totals

To turn on collection:

1. In Settings, enable **Collect keyboard and mouse totals**.
2. Click **Save preferences**.

Collection is local, and it is off until you turn it on.

- It runs only during active focus. This includes stopwatch and overtime.
- Pause, break, lock, sleep and quit stop it.
- It counts these items:
  - Key presses. Repeats from a held key do not count.
  - Mouse button presses.
  - Scroll events.
  - Observed intervals that contain mouse movement.
- Movement time shows the intervals with activity. It is not an exact measure of how long the mouse moved.
- The app never sends typed text, key identities, mouse coordinates or application names to Electron. It never stores them.
- After the first installation, a migration or a backup restore, collection is disabled. Attention check-ins are off too.

### Window switches

With keyboard and mouse collection on, the helper also counts how many times the window in front changes. It also marks each second in which any key press, click, scroll or pointer movement occurred. This is the input time. The Insights tab uses both.

The app records one number for each minute. It does not record:

- A window name or a window title.
- A program name.
- What the window shows.

Rules:

- The app ignores its own windows. If you press **I'm back** in the floating timer, the app does not count a switch.
- The first window after a start is not a switch.
- A return to the same window after a visit to Focus Guide is not a switch.
- A change of tab inside a browser is not a switch, because the window does not change. A change between two browser windows is a switch.
- The helper looks at the window once for each second. A change that lasts less than about one second can be missed.
- Older records have no switch count and no input time. The analysis leaves them out.

### I'm back marker

To mark **I'm back**, press **Ctrl+Alt+Space**. Or, show the floating timer controls and click its small check button. The shortcut operates also while another app has focus.

To change the shortcut:

1. In Settings, click **Change shortcut**.
2. Press a modifier and a key. The combination shows as keycaps.
3. Click **Save preferences**.

To turn the shortcut off, click **Disable shortcut**, then save.

- Escape, Tab, leaving the control or changing pages cancels the recording.
- If you record the combination that is already registered, the app does not record a return.
- If a combination is not available, your previous configuration stays.
- The floating control operates independently of the native shortcut and of passive collection.

Feedback for a marker:

- Each marker that the app saves gives a silent brain pulse of 700 ms. With reduced motion or disabled animation, the app shows a still check instead.
- The floating brain stays grayscale for the first ten active minutes.
- Hidden windows do not open or replay feedback.
- A marker needs a running focus session. A shared guard of one second prevents duplicate presses.

### Attention check-ins

A check-in asks where your attention is right now. It is off until you turn it on.

1. In Settings, enable **Attention check-ins**.
2. Click **Save preferences**.

During a focus session, the question "Where is your attention right now?" appears with three answers: **On the task**, **Drifting** and **Somewhere else**. One click answers it.

- The first check-in comes after 8 to 20 active minutes. The next ones come 15 to 35 active minutes after the one before. A session has 6 check-ins at most.
- A check-in appears below the top bar, on every page. If Focus Guide is not the window with focus, the floating timer shows small buttons instead. This also happens when you switch away from Focus Guide, hide it or minimize it while a check-in shows. The check-in never takes keyboard focus.
- If you do not answer in 45 seconds, the check-in disappears. The app saves it as missed.
- There are no check-ins in Offline mode, while the timer is paused, during a break, or in the last 5 minutes of a countdown.
- Some events cancel a check-in on screen. They are a pause, a finished session, a break, a lock or sleep, a change of the setting and closing the floating timer. The app saves nothing for it.
- If you turn check-ins on during a session, the first one comes 8 to 20 active minutes later.
- A check-in is a small interruption. The Insights tab tells you how many sessions had check-ins.
- A check-in answer is not a drift marker. The Insights tab counts the answers separately.
- Screen readers announce a check-in when it appears.

### Review behaviour

Expand **Behaviour** in the completion reflection or in a Calendar session. It shows interaction totals (also the share of time with input and the window switches), collection coverage, and a timeline in recorded active time. The timeline marks returns, interruptions, check-in answers and pauses. A bar shows the warm-up, sustain and fatigue phases. Calendar cards also show the detractor and the challenge answers.

- A recorded zero, partial coverage, disabled collection and unavailable data are different states.
- A return marks the time when you reported that you came back. It does not show when the distraction started or how long it was. It does not change recorded time.
- To remove an accidental marker, use Session tools or the review.

### Export and delete activity data

- **Activity dataset** exports the aggregate records as CSV.
- Full JSON backups include the summaries and the return metadata.
- **Delete collected activity** removes the summaries from the current dataset. If collection is enabled, it can create new records later. Existing exported backups keep their copies.
- When you delete a session, the app also deletes its summaries.
- The browser preview uses invented counters and local synthetic storage. Windows collection and global shortcuts operate only in the desktop app.

## Delete a focus field (1.3.1)

Before you start, finish any running or paused session in the field.

1. Open Settings.
2. Select **Delete** next to the field.
3. Look at the task count, the session count, all recorded time and the included time that will leave your totals.
4. Select one of these:
   - **Keep field** to cancel.
   - **Back up & delete field** to remove the field and its history.

To hide a field but keep its history, use **Archive**.

Before it removes records, the app saves a JSON recovery backup in the `backups` directory of the data folder. If the backup fails, the field does not change. Existing backups and exports keep their copies.

**Restore a JSON backup** replaces the full dataset. Thus, export your current data before you recover old history. If no field remains, create one in Settings before you start another session.

### Related changes in 1.3.1

- **Palettes & horizons** now colors the full focus constellation and its glow.
- The palette unlock thresholds did not change. If you remove sufficient included time, the palette goes back to First light.
- Field colors in editors and charts are independent of the palette.
- The sidebar chevron is next to the app name. It shows its action on hover or keyboard focus.
- Page columns adapt to the available space. To see long cards, scroll normally.
