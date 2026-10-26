# Goal planning — Focus Guide 2.0

Focus Guide helps with study, work and personal goals. You define an outcome, plan repeatable actions, check in when you want to, and adjust the plan each week. All data stays in the existing local profile. Personal guidance uses transparent rules, not a remote model.

## Learn inside a goal

A goal is a learning workspace. Open it from **Goals**. It has five sections:

| Section | What you do there |
|---|---|
| Overview | See recorded effort, roadmap progress, the next step, today's actions, recent sessions and agent proposals. Select **Focus on this goal** or **Focus on this step**. |
| Roadmap | Write the roadmap: headings are stages, to-dos are steps. Open **Details** on a step to add an estimate, a target date, notes and links. Each stage and step shows recorded time against its estimate. |
| Tasks | Add one-off tasks for the goal and link them to a step. **Focus** on a task prepares a session with that task and its step. |
| Behaviour | Read the goal's behaviour profile for 7, 30 or 90 days, or all time. |
| Plan & review | Edit weekly actions, record outcome observations and write the weekly review. |

- A session that you start from a goal records the goal, and the step when you choose one. The next session stays in the same goal until you select **Free focus**.
- The Focus page shows the goal and step that you study. Under **Optional details**, you can choose another roadmap step.
- A step's recorded time is effort. It does not show mastery. Tick a step only when you confirm its result.

### Behaviour profile

The profile uses finished, included sessions linked to the goal. It shows time by activity mode, time of day, weekday and roadmap step. It shows keyboard, click and scroll rates per observed minute and the share of minutes with mouse movement, only for minutes with recorded collection, next to their coverage. It also shows returns and interruptions per recorded hour, self-ratings, action check-ins, reported barriers and the same Spearman gates as Patterns. The profile describes your records. It does not measure attention and does not show causes.

### Direct changes by an AI agent

When you allow **Read and edit** in **Settings > AI agent**, a local AI agent can create goals and change goals, roadmaps, roadmap step details, tasks, weekly actions and review notes at once. At this level the agent cannot delete anything, mark a goal achieved, archive a goal or tick a roadmap step. It works only on goals and on tasks that belong to a goal, and it has no access to sessions, the timer, areas, settings or backups.

- **Agent activity** on the Goals page and on each goal's Overview lists every change with the app's summary and the agent's reason. **Undo** puts back the earlier state. A goal, task or action that the agent created is archived, not deleted. If you changed the record after the agent did, the app asks before it overwrites your later edit.
- The agent replaces a roadmap only with the revision that it read. A row keeps its links only when its title stays the same. Rows that the agent leaves out are archived. New steps start open, and steps that you ticked stay ticked.
- If the agent changes a roadmap while you edit it, your save stops and the app shows the conflict. **Show the agent's version** discards your unsaved edits. **Keep my version** saves yours and archives the rows that only the agent added. Undo in Agent activity is still available.
- A schedule change to a weekly action starts the next day. Earlier days keep their plan.

### Proposals from an AI agent

When you allow **Read and propose** in **Settings > AI agent**, a local AI agent can propose a new goal, a revised roadmap, tasks, a weekly action or a review note. Proposals appear on the goal list (new goals) and on the goal's Overview.

- **Apply** runs the change. **Edit then apply** lets you change the title, outcome, roadmap Markdown or note first. **Reject** keeps the proposal in the history without a change.
- A roadmap proposal keeps the identity of each row whose title matches, so task and session links stay. Rows that the proposal leaves out are archived, not deleted. A step that you checked stays checked.
- If you changed the roadmap after the agent wrote its proposal, the proposal shows **stale**. The comparison then uses your current roadmap, and **Apply anyway** asks for your confirmation.

## Use the planner

1. Open **Goals → New goal**.
   - Enter the required title and outcome. The field is chosen for you when you have only one.
   - Optionally, open the folds to choose reason tags, build a milestone checklist, change the deadline, or add a numeric baseline, target and unit.
   - The deadline of a new goal is today (your local date). To use a different day, choose a date. To have no deadline, select **No deadline**. When you edit a goal, its saved deadline does not change. A goal that has no deadline keeps no deadline.
   - The study, work and personal examples give you a starting point. You can edit them.
   - To save an unfinished goal without an outcome, select **Save as draft**.
   - If you close the form with unsaved edits, the app asks before discarding them.
2. Add a weekly action.
   - Select the weekdays, a cue, a normal action and a smaller version of the action.
   - Optionally, add a duration. The duration lets you compare your commitments with your shared weekly time budget.
   - Optionally, add an obstacle and an if-then response.
3. Use **Today's actions**. It has these commands: Start focus, Done, Did the smaller version, Skip and Reschedule.
   - **Start focus** prepares the existing timer. **Begin focus** starts the timer.
   - For an activity away from the computer, check in manually. A manual check-in does not create focus minutes.
4. To link one-off work, use **Manage goal tasks**.
   - Create and edit tasks, and their goal and milestone links, on the Tasks page.
   - When you finish a task, the app does not complete its milestone or goal automatically.
5. Record each numeric outcome as an absolute observation with a date.
   - A new observation does not add to the earlier values.
   - You can correct or remove an observation.
   - "Latest" means the observation with the most recent date. If two observations have the same date, the app uses the update time, then the identifier.
6. Review one week, from Monday to Sunday.
   - Look at the full actions, smaller versions, explicit skips, missing check-ins, outcomes and effort.
   - Select one adjustment. Look again at the adjustment from the previous week.
   - Mark the goal as achieved only after you explicitly confirm the outcome.

When you pause or archive a goal, the app stops future prompts and keeps the records. A deadline is guidance only. When a deadline passes, the goal does not fail automatically. When you archive an action, the app also keeps its history. To restore a goal, edit its status. To restore an action, use **Restore and edit**.

## Measurement and planning rules

### Effort

- Recorded effort uses only finished, included sessions. The start date of each session uses the timezone in which the app recorded that session.
- The goal details show the last 28 days. A weekly review shows the week that you select.
- The app links a session to one goal at most, when the session starts. If you link a task again later, that link does not change the goal of the session.
- You can change the field of a finished session. Then the app clears the task and goal links that do not agree with the new field.

### Check-ins

- An action check-in is a report from you. It does not depend on sessions.
- When a timer ends, the action stays unrecorded until you confirm it.
- The app can exclude a session of less than two minutes from time analytics. You can still confirm its action separately.
- When you delete a session, the app does not delete its action check-in.

### Occurrences and schedules

- An action has one occurrence for each weekday that you select.
- The identity of an occurrence is the action plus the original date.
- A reschedule changes the current date of the occurrence. The app keeps the original date and the history of each move.
- You cannot move a completed or skipped occurrence. You cannot move an occurrence to a date that already has one.
- A correction can set a check-in back to unrecorded.
- An action keeps its planning timezone when the general settings change.
- When you edit an existing schedule, the change starts on a future date. The app keeps the older revisions.
- Each stored occurrence keeps a snapshot of its planned context.
- Weeks start on Monday.
- The planner sends no notifications at exact times and uses no external calendar.

### What the app does not combine

- A missing check-in stays "unknown". It is different from an explicit skip.
- The app reports a smaller action separately from a full action.
- The interface does not combine effort, actions, milestones and outcome measurements into a productivity score.

### Weekly capacity

- Weekly capacity is the sum of the known duration estimates across all active goals.
- The app counts actions with no estimate separately.
- A blank budget means "not set".
- Capacity is a planning aid. It does not measure the energy that you have available. It does not guarantee that a schedule is possible.

## Explainable guidance

### Duration suggestions

The app has one rule for the duration. The first choice is how long your attention held before a drift:

- There are enough finished, included sessions with the same activity mode in the last 90 days, first for the goal, then for the field. They need 15 sessions recorded with **I'm back** and 8 first drifts.
- The suggestion is the median time to the first drift. If drifts cluster in the first 10 minutes, it is not less than 25 minutes.

If that is not possible, the app uses the recorded duration. It needs all of these conditions:

- There are at least 10 finished, included sessions with the same field and activity mode as the action.
- These sessions cover at least 14 calendar days within the last 28 days.

Then the suggestion is the median duration of these sessions. The app says which of the two rules it used.

The app rounds the suggestion to a minute and keeps it in the range that the timer supports. You can see the date range, the sample count and the supporting sessions. When there is not sufficient data, the app shows the editable examples.

### Barrier suggestions

The app suggests a change to an action only after you explicitly report the same barrier on three different dates within 14 days. The suggestion depends on the barrier:

| Barrier | Suggestion |
|---|---|
| Skills or strategy | Add a learning milestone. |
| Time, space or access | Change the cue or the weekday. |
| Motivation | Review or pause the goal. |
| Other, or action size | Use the smaller version. |

When you select Apply, Edit or Dismiss, the app records your decision. The plan changes and their decisions save together, in one operation.

These thresholds are product defaults. They are not thresholds for reliability or statistical significance. These observations do not identify causes and do not predict success.

## Research basis and limits

Sources reviewed with Exa on 13 October 2026, America/Fortaleza:

- [Sheeran, Listrom & Gollwitzer: implementation intentions, 642 tests](https://www.tandfonline.com/doi/full/10.1080/10463283.2024.2334563). The study supports concrete plans of the form "if this cue, then this response". Effect sizes changed with the outcome and the conditions (d = .27–.66).
- [Wang et al.: mental contrasting and implementation intentions](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.565202/full). The pooled effect was small to moderate (g = .336). Publication bias and differences between interventions limit how far the result applies.
- [Michie et al.: COM-B and the behaviour change wheel](https://link.springer.com/article/10.1186/1748-5908-6-42). This is a framework for capability, opportunity and motivation. It is not a diagnostic instrument. It does not validate this app.
- [Harkin et al.: experimental progress-monitoring meta-analysis](https://pubmed.ncbi.nlm.nih.gov/26479070/). On average, monitoring interventions helped people attain goals (d = .40). The effect changed with the context of the intervention.
- [Lally et al.: real-world habit formation](https://onlinelibrary.wiley.com/doi/10.1002/ejsp.674). The time to form a habit changed very much between people. One missed opportunity did not have a material effect on the measured process. The app sets no fixed deadline for habit formation.
- [Keller et al.: routine versus time cues](https://europepmc.org/article/med/33405284). A trial on nutrition behaviour found no difference between the conditions. Do not assume that cue findings apply equally to every work or learning goal.
- [Abdulla & Woods: comparison with other planning approaches](https://journals.sagepub.com/doi/10.1177/01430343211000399). In that small sample of students, no compared planning approach was clearly better than the others.

These studies inform the planning methods. No study has shown that this specific interface and these local rules improve goal attainment for users. A voluntary local pilot can measure the setup effort and the check-in burden. It can also find out whether users think the weekly adjustments are useful. Missing reports stay visible. An observed improvement is not evidence of a cause.

## Persistence, export and rollback

### Schema 4

SQLite and JSON backup schema 4 add these records: goals, milestones, action plans and revisions, occurrences with dates, numeric observations and goal reviews.

- Older JSON versions 1–3 normalize to empty goal collections and null task and session links.
- New exports contain all planning records.
- The Goal dataset CSV export contains typed records. Each record keeps its full JSON details in one cell with safe quotes.
- The Session CSV adds the goal and occurrence identifiers.

### Schema 5

Schema 5 adds reason tags (`whyTags`) to goals and an order (`position`) to milestones. The migration saves a `before-schema-v5-*.sqlite` snapshot, then rewrites the goal and milestone records in one transaction. JSON backups of version 4 are upgraded the same way on import.

### Schema 6

Schema 6 adds a block kind (`kind`) to milestones: to-do, heading, bullet, numbered item or text. The migration saves a `before-schema-v6-*.sqlite` snapshot, then gives every existing milestone the kind `todo` in one transaction. JSON backups of versions 1–5 are upgraded the same way on import.

### Schema 7

Schema 7 adds step details to milestones (`estimatedMinutes`, `targetDate`, `notes`, `resources`) and `milestoneId` to sessions. The migration saves a `before-schema-v7-*.sqlite` snapshot, then adds the session column and empty details in one transaction.

### Schema 8

Schema 8 adds agent proposals and the `agentAccess` setting. The migration saves a `before-schema-v8-*.sqlite` snapshot, then creates the `agentProposals` table and sets agent access to off. JSON backups of versions 1–7 are upgraded on import.

### Schema 9

Schema 9 adds the agent change log (`agentChanges`) and the `edit` access level. The migration saves a `before-schema-v9-*.sqlite` snapshot, then creates the table and sets agent access to off. JSON backups of versions 1–8 are upgraded on import.

### Milestone checklist

The checklist is a light block editor. Each row has a kind:

| Kind | Shows | Markdown | Typed shortcut at the start of a row |
|---|---|---|---|
| To-do | A checkbox | `- [ ] Open`, `- [x] Done` | `[] `, `[ ] `, `[x] ` or `- [ ] ` |
| Heading | Bold section title | `# Heading` | `# ` (also `##` to `######`) |
| Bullet | A bullet | `- Bullet` | `- `, `* ` or `+ ` |
| Numbered | A number | `1. Step` | `1. ` or `1) ` |
| Text | A plain note | A plain line | Backspace at the start of a row of another kind |

- Only to-dos can be ticked, count for progress and take task links. Headings, bullets, numbered items and text help you organise the checklist.
- **Enter** adds a row of the same kind below and splits the text at the caret. After a heading, the new row is text. **Enter** on an empty to-do, bullet or numbered row turns it into text, which ends the list.
- **Backspace** at the start of a row turns it into text. On a text row, it joins the row to the row above.
- **Ctrl+Enter** ticks or clears a to-do. **Up** and **Down** move between rows. **Alt+Up** and **Alt+Down** move a row.
- The **Row type** buttons above the list change the kind of the row you last focused.
- When you paste several lines into a row, each line becomes a row. Plain lines keep the kind of a to-do, bullet or numbered row; in a heading or text row they become text. In the **Add** field, plain lines become to-dos.
- On the goal page, ticking a saved to-do saves only that milestone. Other edits save the whole checklist with `goal.milestones.sync` when you press Enter or Backspace, change a kind, move or remove a row, or move focus to another row or out of the checklist. Saves run one at a time. Empty rows are not saved. A removed row is archived and can be restored from **Archived milestones**.
- You cannot change a to-do that has linked tasks into another kind. Unlink its tasks on the Tasks page first. The Tasks page lists only to-dos as milestones.
- In Markdown mode, each line is one row, with the syntax in the table above. A title that would read as a marker starts with a backslash (for example, `\- not a bullet`). Because Markdown has no identifiers, the app keeps a row's identity when its title is unchanged, or when a changed title stays on the same line with the same kind.

### Migration and restore

- The migration saves a consistent `before-schema-v4-*.sqlite` snapshot. Then it applies the schema changes in one transaction.
- A full restore validates all records and shows a preview of the counts. Then it saves a rollback database and replaces the dataset in one transaction.
- When you delete a field, the impact description includes its goals and all their planning records. The validated recovery backup also includes them.
- For normal goal management, use archive, not delete.

### Browser preview

- The browser preview upgrades its isolated envelope from version 2 to version 3. It keeps its existing storage key.
- A command that changes more than one record saves all of them atomically. If the storage quota fails, the earlier records stay the same in memory and in storage.
- The preview does not connect to the personal SQLite database. It has no native file dialogs.

### Rollback

A rollback needs the older executable **and** its matching database snapshot from before the migration. Before a rollback, make one more export with the current schema. The earlier snapshot cannot contain progress that you recorded after the migration.

Tests and packaging use synthetic profiles. Installation is a separate step with a separate execution boundary.
