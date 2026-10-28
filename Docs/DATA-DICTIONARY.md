# Focus Guide — data dictionary

This dictionary describes schema version 3. Later sections describe the additions of schemas 4 to 10.

- [Goal planning](#goal-planning-records-schema-4)
- [Goal reasons and milestone order](#goal-reasons-and-milestone-order-schema-5)
- [Milestone block kinds](#milestone-block-kinds-schema-6)
- [Roadmap steps](#roadmap-steps-schema-7)
- [Agent proposals](#agent-proposals-schema-8)
- [Agent change log](#agent-change-log-schema-9)
- [Behaviour insights](#behaviour-insights-schema-10)

The interface calls a field an "area".

General conventions:

- A date with `_utc` or `At` in its name is an ISO 8601 UTC string, for example `2026-10-06T12:00:00.000Z`.
- Timezones are IANA names.
- Identifiers are opaque, stable strings. Usually they are UUIDs.
- JSON booleans are `true` and `false`. CSV booleans use the same words.
- Durations can be fractional. Rounding on the display does not change the exports.

## Session CSV

The file has one row for each recorded session. Unfinished and excluded sessions are included. No task gets a separate copy of the full session duration.

| Column | Meaning |
|---|---|
| `id` | Session identifier. Join it to `session_id` in the event file. |
| `field_id` | Field identifier. |
| `field_name` | Field name at the time of export. Archived fields are included. |
| `primary_task_id` | Optional primary task identifier. Blank if there is no primary task. |
| `primary_task_title` | Title of that task at the time of export. Blank if there is no primary task. |
| `checklist_task_ids` | JSON array of linked task identifiers, in one CSV cell. |
| `intention` | Optional preparation text. |
| `planned_minutes` | Countdown duration, without breaks. Blank for stopwatch sessions. |
| `timing_mode` | `countdown` or `stopwatch`. |
| `overtime_minutes` | Recorded countdown time after the end of the plan. Zero for stopwatch sessions. |
| `recorded_minutes` | Durable active focus milliseconds divided by 60,000. Paused time is not included. |
| `status` | `running`, `paused` or `completed`. |
| `started_at_utc` | Time at which the session was created and started. |
| `ended_at_utc` | Completion time. Blank while the session is unfinished. |
| `recording_timezone` | Timezone that the app recorded when the session started. It stays the same when the default timezone changes. |
| `energy_1_5` | Optional starting energy that you rate, integer 1–5. Blank when missing. |
| `focus_1_5` | Optional focus that you rate, integer 1–5. Blank when missing. |
| `note` | Optional reflection at completion, or a note that you edited later. |
| `completion_reason` | `timer` when the session ended at the timer limit. `early` when you finished it manually. Blank while unfinished. |
| `excluded` | Tells whether analysis and neural progression ignore the session. The app sets it at completion when active time is less than 120,000 ms, or when you exclude the session. You can change it later. You can still export the row. |
| `recovered` | Tells whether the app recovered a running session after an unexpected interruption. |
| `activity_mode` | Selected activity mode (version 3). Use it to join exported counts to the selected context. |

## Event CSV

The file has one row for each interval or marker. The app updates an active interval that is in progress at each checkpoint. It does not create one row for each checkpoint.

| Column | Meaning |
|---|---|
| `id` | Event identifier. |
| `session_id` | Identifier of the session that owns the event. |
| `kind` | `active`, `pause`, `interruption`, `thought`, `recovery`, `edit`, `attention-return` or `probe`. |
| `started_at_utc` | Start of the interval, or time of the marker. |
| `ended_at_utc` | Last durable active boundary, closed pause boundary or marker boundary. It can be blank for open intervals and for recovery markers. |
| `duration_ms` | For an active interval: its recorded milliseconds. For a pause: its elapsed milliseconds. For other markers: zero. Only active durations count as focus. |
| `text` | A parked thought, optional interruption text, the reason for a pause or recovery, or the description of an edit audit. |
| `category` | Interruption category. `history` for descriptive edit audit events. `exclusion` for exclusion audit events at completion. Otherwise, usually empty. |

### How to read events

- An interruption is a marker that you add. It is not a distraction that the app detects, and it is not an automatic pause.
- When you park a thought, the app creates only a `thought` event.
- Pause duration is a descriptive wall-clock interval. It can include time when the app was closed. It never adds to focus.
- Active duration uses a monotonic clock. The app calculates its end boundary as the start plus the measured duration. Thus a change to the system clock does not change the focus time.
- Wall-clock changes can make timestamps from different intervals look out of order.

### CSV format

- CSV files use UTF-8 with a byte-order mark.
- Rows end with CRLF.
- All cells have quotes. A quote inside a cell is doubled.
- Some text could become a spreadsheet formula. This is text that starts with `=`, `+`, `-` or `@`, after optional leading whitespace. The app adds an apostrophe at the start of such text to make it safe.
- JSON backup text stays exactly as it is.
- Exports contain personal data, also while the app shows the example charts.

## Full JSON backup

| Top-level property | Meaning |
|---|---|
| `format` | Constant `focus-guide`. |
| `schemaVersion` | Integer `3` for exports. Imports of versions `1` and `2` normalize explicitly to version `3`. The app rejects other versions. |
| `categories` | Custom task categories: IDs, names, hex colors, archive flags and creation times. |
| `exportedAt` | UTC time at which the app assembled the snapshot. |
| `fields` | All fields. Archived fields are included. |
| `tasks` | All tasks. Completed and soft-archived tasks are included. |
| `sessions` | All sessions: included, excluded and unfinished. |
| `events` | All events of those sessions. |
| `settings` | User preferences. |
| `reviews` | Saved weekly adjustments. |

### Fields

| Property | Meaning |
|---|---|
| `id` | Stable identifier. |
| `name` | Label that you can edit, 1–60 characters. |
| `color` | Display color as six hexadecimal digits, with `#`. |
| `archived` | You cannot select the field for new sessions. Its history stays. |
| `createdAt` | Creation time. |

### Tasks

| Property | Meaning |
|---|---|
| `id` | Stable identifier. |
| `fieldId` | Identifier of the field that owns the task. |
| `title` | Task text that you can edit, 1–200 characters. |
| `completed` | Current completion state in the checklist. It is not a historical outcome for each session. |
| `archived` | Soft removal from future preparation lists. History links stay valid. |
| `createdAt` | Creation time. |
| `updatedAt` | Time of the latest change to the task. |

### Sessions

| Property | Meaning |
|---|---|
| `id`, `fieldId`, `primaryTaskId` | IDs of the session, the field and the optional primary task. `primaryTaskId` is `null` when there is no primary task. |
| `checklistIds` | Array of the task IDs that you selected or added during the session. |
| `intention` | Optional text, 500 characters maximum. |
| `plannedMs` | Countdown duration in milliseconds, 60,000–86,400,000. `null` for a stopwatch. |
| `timingMode` | `countdown` or `stopwatch`. |
| `autoOvertime` | Preference that the app recorded when the countdown started. `false` for stopwatch sessions and migrated sessions. |
| `targetReached` | Saved marker for the countdown target. It prevents duplicate overtime notifications after recovery. |
| `activeMs` | Durable active focus duration in milliseconds. It can be more than `plannedMs` when overtime is enabled. A stopwatch has no plan. It must equal the sum of the active intervals. |
| `status` | `running`, `paused` or `completed`. |
| `startedAt`, `endedAt` | Start time and optional completion time. `endedAt` is `null` while the session is unfinished. |
| `timezone` | Recording timezone. |
| `energy`, `focus` | Optional integer ratings, 1–5. `null` when missing. |
| `note` | Optional reflection, 2000 characters maximum. |
| `completionReason` | `timer`, `early`, or `null` while unfinished. |
| `excluded` | When `true`, analysis and neural progression ignore the session. |
| `recovered` | Tells whether an unexpected recovery occurred. |

### Events

The JSON properties `id`, `sessionId`, `kind`, `startedAt`, `endedAt`, `durationMs`, `text` and `category` have the same meaning as in the event CSV.

- `endedAt` can be `null`.
- The duration of a marker that is not an interval must be zero.
- An edit audit description records the action and the previous descriptive values as text, 2000 characters maximum. It starts as serialized JSON, but the app can truncate long entries. Thus, treat it as text. It is not always a JSON object that you can parse.
- In the backup, the current intention and reflection of the session keep their full allowed values.
- Audit text does not change raw timing.
- When you delete a session, the app also deletes its audit events and other events.

### Settings

| Property | Meaning |
|---|---|
| `settings.timezone` | Default timezone for new sessions and for the current day in the interface. Initial value `America/Fortaleza`. |
| `settings.defaultMinutes` | Default requested session duration, 1–1440. Initial value 90. |
| `settings.animation` | Enables optional animated drawing and pulses. The system reduced-motion setting has priority. |
| `settings.language` | Interface language, `en` or `pt-BR`. Optional: absent means `en`. Changing it does not change stored data. `makeBackup` omits it when it is `en`, so English backups are identical to earlier versions; restore treats a missing value as `en`. |
| `settings.focusVisual` | `brain` or `instrument`. Selects the 3D brain or the session gauge on the Focus page. Optional; the default is `brain`. It changes only the appearance. |
| `settings.sound` | When `true`, the app requests the Windows completion notification sound. Windows can suppress it. |
| `settings.palette` | `cyan`, `violet`, `amber`, `rose`, `mint`, `ocean`, `ember` or `aurora`. `violet`, `amber` and `rose` need 5, 20 or 50 finished, included hours. `mint`, `ocean`, `ember` and `aurora` need the achievements `explorer`, `weeks-12`, `summit` and `hours-100`. `PALETTES` in `shared/achievements.ts` holds the rules. |
| `settings.collectedAchievements` | Optional map from an achievement id to the UTC time at which you collected it. Only `achievements.collect` changes it; `settings.update` keeps the saved value. Ids that the app does not know are dropped on validation. `makeBackup` omits it when it is empty. Achievements themselves are derived from records and are not stored; their titles and the palette names go through `t()`. |
| `settings.weeklyGoalMinutes` | Optional weekly time intention, 0–10,080. Zero disables it. |
| `settings.theme` | `light` or `dark`. When older settings or backups do not have it, the default is `light`. |
| `settings.sidebarCollapsed` | Tells whether the left navigation is an icon rail. When older settings or backups do not have it, the default is `false`. |

### Weekly reviews

| Property | Meaning |
|---|---|
| `reviews[].week` | Calendar date of the Monday (`YYYY-MM-DD`) that identifies the review week. |
| `reviews[].adjustment` | Your adjustment for the next week, 2000 characters maximum. |
| `reviews[].updatedAt` | Time of the latest save. |

### Import of older versions

- A version-1 import keeps the optional appearance defaults. It normalizes through version 2 to the current version 3.
- A version-2 import also normalizes to version 3. Activity collection is disabled.
- Existing version-1 sessions become countdowns with overtime disabled.
- Existing version-1 tasks get no category, empty notes, normal priority and no due date.
- Export writes version 3.

### Exclusion audit

- An exclusion at completion records an `edit` event. The event has the category `exclusion`, zero duration, and JSON text. The text describes `session.exclude` with the reason `manual` or `below-two-minutes`.
- Inclusion changes in Calendar or in the check-in keep the existing `history` audit format.
- Exclusion never changes active intervals or totals.
- The automatic rule applies only at completion. It does not reclassify historical or imported finished records.

### What the dataset does not contain

- The dataset contains no password, account, app monitoring, diagnostic profile, brain measurement or AI score.
- The app does not store breaks or cosmetic network geometry as sessions.
- Window bounds and backup housekeeping metadata are local SQLite metadata on the computer. They are not part of the JSON backup.

## Calculation rules

- **Which sessions count.** Analyses and earned hours use only `completed` sessions with `excluded=false`. Exports keep all rows.
- **Total recorded time.** Add `activeMs` one time for each session. The active durations of the events add up to the same durable total. Pauses do not count. When you join task labels, do not multiply this measure across task rows.
- **Calendar time.** Calendar splits active intervals at local midnight. It uses the saved timezone of each session, including daylight-saving boundaries. Counts and focus ratings belong to the start date. A day with no rating has no focus average.
- **Patterns filters.** Filters use the local start date of each session. The weekday bars and time-of-day bars group full session durations by the weekday and hour of the start. Weekly reviews use start dates from Monday to Sunday.
- **Interruption frequency.** This is the count of markers that you recorded manually, divided by recorded hours. It is not an estimate of duration. Categories show your choices.
- **Focus ratings.** Averages and distributions use only ratings that exist. Duration-versus-focus pairs need a focus rating. Energy-versus-focus pairs need both ratings. The app counts missing pairs separately.
- **Spearman.** Spearman is the Pearson correlation of the ranks. Tied values get average ranks. The coefficient is not available in these cases: fewer than 20 pairs, a calendar span of less than seven days, or a constant variable. The app gives no p-value, no causal inference and no guarantee of reliability.
- **Mixed timezones.** If you changed the default timezone, dates can mix recording timezones. Later settings changes do not change their grouping. This is intentional: it keeps the local date that the app recorded first.

### Restore validation limits

| Item | Maximum |
|---|---|
| JSON file | 64 MiB |
| Fields | 1000 |
| Categories | 1000 |
| Tasks | 100,000 |
| Sessions | 50,000 |
| Events | 500,000 |
| Reviews | 5000 |
| Checklist IDs per session | 100 |

The app rejects these problems before it replaces the data:

- Duplicate IDs.
- Missing or unknown properties.
- Invalid references.
- Invalid ratings.
- A status that does not agree with the completion data.
- An active total that does not agree with the active intervals.

## Task organizer additions (version 2)

| Property | Meaning |
|---|---|
| Task `categoryId` | Can be null. It refers to a category, also an archived one. |
| Task `notes` | 2000 characters maximum. |
| Task `priority` | `low`, `normal` or `high`. |
| Task `dueDate` | Can be null. A validated `YYYY-MM-DD` date. It is not a UTC instant. |
| Category name | 60 characters maximum. |
| Category color | `#RRGGBB`. |

- The existing meanings of title, field, ID and timestamps do not change.
- A task edit cannot change the field of the task. This keeps the session links correct.
- `settings.autoOvertime` is `true` by default for new sessions. Old session records keep `false`.
- When you remove a category, the app archives it (soft archive).
- The search, filter and sort preferences of the Tasks view are in local renderer storage. Dataset backups do not include them.
- Stopwatch sessions have a null planned time. The app excludes them only from comparisons with planned duration. Recorded-time totals include them.

## Version 3 behaviour records

### Sessions and events

- Sessions add `activityMode` and `behaviourVersion`. `behaviourVersion` was 3 for new sessions until schema 10. It is 4 for new sessions now. 0 means history from before this collection existed.
- The event kind `attention-return` has zero duration. It has `activeOffsetMs`, in recorded active time, and `source` (`shortcut`, `floating` or `main`).
- For other events, the offset and the source can be null.
- The active total of a session stays the sum of its active intervals.

### Activity records

The full JSON adds the `activity` collection. The frequent application state does not include this collection.

The Activity CSV has these columns: `id`, `session_id`, `start_active_ms`, `end_active_ms`, `observed_ms`, `key_presses`, `mouse_clicks`, `scroll_events`, `mouse_movement_ms`, `collection_status`.

- Records are inside durable session time. The app splits them at active-minute boundaries. They never overlap.
- The status is `recorded`, `disabled` or `unavailable`.
- Only `recorded` rows have observations and counts.
- A recorded zero is an observation. When there is no data, the app does not assume a zero.
- Movement is the duration of the observation intervals that contain movement. It is not the exact duration of the movement.
- One minute with partial coverage can contain several statuses.

### Activity settings

| Property | Meaning |
|---|---|
| `collectActivity` | Default `false`. |
| `returnShortcut` | Default `Ctrl+Alt+Space`. An empty value disables the shortcut. |
| `activityModes` | The last selected mode for each field. |

- Restore and migration set collection to `false`.
- Backups keep these settings so that they can move to another computer. A restore never turns on monitoring without your action.
- Sessions and returns describe behaviour and your own reports. They give no calibrated attention score and no distraction duration.

## Permanent focus-field deletion (1.3.1)

Archive keeps the data. Field deletion is different: it removes these items permanently:

- The field.
- Its tasks.
- Its sessions, including excluded history.
- The events of these sessions.
- Their activity aggregates.
- The saved activity-mode preferences for that field.

Included completed time leaves the totals and charts. Shared categories, weekly reviews and unrelated records stay.

- An unfinished session prevents deletion.
- The app must first save a validated JSON recovery backup.
- Existing exports and backups keep their copies.
- The operation is transactional. It does not change schema version 3 or JSON format version 3.

## Permanent goal deletion

Archive keeps the data. Goal deletion (`goal.delete`) removes these items permanently:

- The goal.
- Its milestones (roadmap rows), actions, occurrences (action check-ins), numeric progress and goal reviews.
- Its agent proposals and agent change records. A `goal.create` proposal has no goal, so it stays.

These items stay. Their links are set to `null`:

| Record | Cleared links | Why |
|---|---|---|
| Task | `goalId`, `milestoneId` | A task belongs to its field. It stays open, done or archived as before. |
| Session | `goalId`, `occurrenceId`, `milestoneId` | A session is a time record. `activeMs`, events and activity do not change, so totals per field stay the same. |

- An unfinished session of the goal prevents deletion.
- The app must first save a validated JSON recovery backup (`backups/before-goal-delete-<timestamp>-<uuid>.json`).
- Existing exports and backups keep their copies.
- The operation is one transaction. It does not change schema version 10 or the JSON backup format.

## Goal planning records (schema 4)

| Record | What it stores |
|---|---|
| Goal | Field, outcome, motivation, optional deadline, optional baseline, target and unit, explicit status, and status history with timestamps. |
| Milestone | Completion, which you confirm independently, and archive state. |
| Action | An ordered series of plans. Each plan takes effect on a future date. Each plan has a planning timezone, weekdays, cue, normal action, smaller action, obstacle, response, optional estimated minutes, activity mode and an enabled flag. |
| Occurrence | One identity (action plus original date), current date, move history, a snapshot of the planned context, an optional reported barrier and note, and a status: unrecorded, done, smaller or skipped. |
| Numeric progress | Absolute observations with dates. They are not increments. |
| Goal review | Week keys (the Monday), adjustments, a review of the previous adjustment and durable suggestion decisions. |

- The links from a task to a goal or milestone can be null. The links from a session to a goal or occurrence can also be null. Old data stays unassigned.
- The Goal CSV contains the record type and identity. When applicable, it also contains the goal, field, date, status and value. It contains the complete JSON details.
- The Session CSV adds the goal and occurrence identifiers at the end.
- JSON schema 4 contains all six goal collections. For more information, see [Goal planning](GOAL-PLANNING.md).

## Goal reasons and milestone order (schema 5)

| Field | Record | Meaning |
|---|---|---|
| `whyTags` | Goal | Up to 12 reason tags, each up to 40 characters, unique without regard to capitalisation. The free-text `why` remains for earlier goals. |
| `position` | Milestone | Integer order in the goal's checklist, starting at 0. Archived milestones keep a position after the active ones. |

- The migration and the JSON import of version 4 give every goal `whyTags: []` and number each goal's milestones in creation order. Existing positions are kept.
- `goal.milestones.sync` saves a whole checklist: rows are stored in the given order, and active milestones that are missing from the list are archived, never deleted, so task links stay valid.

## Milestone block kinds (schema 6)

| Field | Record | Meaning |
|---|---|---|
| `kind` | Milestone | The row type in the goal's checklist: `todo`, `heading`, `bullet`, `numbered` or `text`. |

- Only a `todo` row can have `completed: true`. Validation rejects a done row of another kind.
- Only `todo` rows count for progress (the goal summary, the **N of M done** text and the **milestones remain unchecked** count).
- A task's `milestoneId` can refer only to a `todo` row. The service refuses to change a linked to-do to another kind. The error names the row and tells you to unlink its tasks on the Tasks page first. JSON import rejects a task that links to a row of another kind.
- `numbered` rows have no stored number. The app counts from 1 in each run of consecutive numbered rows.
- The migration and the JSON import of versions 1–5 give every milestone `kind: 'todo'`, because every earlier milestone was a to-do. JSON exports are version 6. The app rejects JSON versions above 6.
- `goal.milestones.sync` accepts a new row with an identifier that the editor made. If no milestone has that identifier, the service creates the milestone with it. If a milestone of another goal has it, the service refuses the save. So a repeated save does not create duplicates.

## Roadmap steps (schema 7)

| Field | Record | Meaning |
|---|---|---|
| `estimatedMinutes` | Milestone | Your estimate for a step, in whole minutes from 1 to 60,000, or `null`. |
| `targetDate` | Milestone | A `YYYY-MM-DD` date, or `null`. It is guidance. A passed date does not change the step. |
| `notes` | Milestone | Text, up to 2000 characters. |
| `resources` | Milestone | Up to 20 links. Each link has a `title` (up to 200 characters) and a `url` that starts with `http:`, `https:` or `file:`. |
| `milestoneId` | Session | The roadmap step that the session served, or `null`. The app records it when the session starts. |

- Only a `todo` row can have an estimate or a target date. Every kind can have notes and links.
- `goal.milestones.sync` keeps the details of each row that it keeps. A row that stops being a to-do loses its estimate and its target date.
- A session step must be a to-do of the session's goal. A to-do with linked sessions stays a to-do.
- A step's recorded time is the sum of `activeMs` of the finished, included sessions with that `milestoneId`.
- The Session CSV adds `milestone_id` at the end.
- The migration and the JSON import of versions 1–6 give every milestone empty details and every session `milestoneId: null`.

## Agent proposals (schema 8)

| Field | Meaning |
|---|---|
| `id` | Proposal identifier. |
| `goalId` | The goal that the proposal changes. `null` only for `goal.create`. |
| `kind` | `goal.create`, `roadmap.replace`, `tasks.add`, `action.add` or `review.note`. |
| `summary`, `rationale` | Text from the agent, up to 500 and 4000 characters. |
| `source` | The client label, up to 100 characters. |
| `payload` | The proposed change, as validated JSON (up to 30,000 characters). After an apply, it holds the version that you applied, with your edits. |
| `basis` | For `roadmap.replace`, a fingerprint of the roadmap when the agent wrote the proposal. Otherwise `null`. |
| `status` | `pending`, `stale`, `applied` or `rejected`. |
| `createdAt`, `decidedAt` | UTC times. `decidedAt` is set only for `applied` and `rejected`. |

- A proposal changes no other record. When you apply it, the app runs the normal validated commands and marks the proposal `applied` in the same transaction.
- `stale` means that the roadmap changed after the proposal. The app asks you to confirm before it applies a stale roadmap.
- At most 50 proposals can be open (`pending` or `stale`). The dataset keeps up to 5000 proposals.
- Deleting a goal or its area deletes the goal's proposals. A restore replaces all proposals.
- `settings.agentAccess` is `off`, `read`, `propose` or `edit` (edit from schema 9). The default is `off`. The schema 8 and 9 migrations and every restore set it to `off`.
- The JSON backup adds the `agentProposals` collection. Version 8 is the export format. The app rejects JSON versions above 8.

## Agent change log (schema 9)

One record for each change that an agent made directly, at the `edit` access level.

| Field | Meaning |
|---|---|
| `id` | Change identifier. |
| `goalId` | The goal that the change belongs to. A change always belongs to a goal. |
| `at` | UTC time of the change. |
| `source`, `tool` | The client label and the tool, for example `update_roadmap`. |
| `target` | `goal`, `roadmap`, `step`, `task`, `action` or `review`. |
| `summary` | Text that the app writes, up to 500 characters. It does not come from the agent. |
| `rationale` | The agent's reason, up to 4000 characters. |
| `before`, `after` | For each changed record, its changed fields before and after the change. `null` in `before` means that the change created the record. Each side holds up to 60,000 characters. |
| `undoneAt` | UTC time of the user's undo, or `null`. |

- The app saves the record in the same transaction as the change.
- A roadmap record holds the rows (identifier, title, kind, state, archive flag, position). A goal record holds title, outcome, reasons, deadline and status. A task record holds title, notes, priority, due date, step, completion and archive flag. A weekly action record holds title, archive flag and latest plan. A review record holds the adjustment text.
- Undo puts back `before` through the normal commands. A created goal, task or action is archived. If the record changed after the agent's change, the app asks for confirmation first.
- The log keeps the newest 20,000 records. Deleting a goal or its area deletes its records. A restore replaces them.
- `goal.milestones.sync` accepts an optional `revision`. If the active roadmap no longer matches it, the command fails and changes nothing.
- The JSON backup adds the `agentChanges` collection. Version 9 is the export format. The app rejects JSON versions above 9.

## Behaviour insights (schema 10)

Schema 10 adds two reflection answers to each session, two measures to each activity block, the event kind `probe` and the setting `attentionProbes`. Old rows keep null values. Null means unknown. It never means zero.

### Session properties

| Property | Meaning |
|---|---|
| `detractor` | What got in the way most. One of `none`, `notifications`, `people`, `thoughts`, `tiredness`, `task` or `other`. `null` when you gave no answer. |
| `challenge` | How demanding the session felt. One of `too-easy`, `right` or `too-hard`. `null` when you gave no answer. |
| `behaviourVersion` | Values 0 to 4. Sessions that start with schema 10 have 4. Version 3 added **I'm back**. Version 4 added input time, window switches and check-ins. |

- Both answers are optional. `session.review` and `session.edit` save them. A value of `null` clears an answer. A key that is not in the command keeps the saved answer.
- The edit audit text records the previous `detractor` and `challenge` with the other previous values.

### Activity properties

| Property | Meaning |
|---|---|
| `inputMs` | Observed milliseconds in which a key, a click, a scroll or a pointer movement occurred. The collector counts it in samples of about one second. A sample with any input counts for its whole length. Range: 0 to `observedMs`. |
| `switches` | Number of changes of the foreground window in the block. A whole number from 0 to 1000. |

- A row that is not `recorded` has `null` for both values. The same is true for rows from before schema 10.
- `switches` is also `null` when the native helper does not send a count.
- When two blocks of the same minute merge, the values add up. If one side is `null`, the result is `null`.
- The collector stores no window name, no window title and no process name.

### Check-in events

A check-in is an event with `kind` `probe`. It has these properties.

| Property | Meaning |
|---|---|
| `category` | `on-task`, `drifting` or `elsewhere` for an answer. `missed` when the check-in appeared and nobody answered within 45 seconds. |
| `activeOffsetMs` | Active time of the session when the check-in appeared. Required. It cannot be more than the saved active time. |
| `source` | `floating` or `main` for an answer. `null` for `missed`. It is never `shortcut`. |
| `text` | JSON `{"latencyMs": n}` with the milliseconds from display to answer. `{"latencyMs":null}` for `missed`. |
| `durationMs` | Always 0. |
| `startedAt`, `endedAt` | Both hold the time when the app saved the record: the time of the answer, or the time of expiry. |

- A `probe` event is not a drift. See [the calculation rules](#calculation-rules-for-insights).
- Interruption and thought events now save `activeOffsetMs`. Older events have `null`. For them, the engine counts the active time before the marker from the active intervals of the session.
- A check-in that the app cancels leaves no event.

### Setting

| Property | Meaning |
|---|---|
| `settings.attentionProbes` | `true` shows attention check-ins during focus. The default is `false`. The schema 10 migration and every restore set it to `false`. |

### CSV columns

- Session CSV: `detractor` and `challenge` at the end, after `milestone_id`. Blank when `null`.
- Event CSV: the columns are `id`, `session_id`, `kind`, `started_at_utc`, `ended_at_utc`, `duration_ms`, `text`, `category`, `active_offset_ms` and `activation_source`. `kind` can now be `attention-return` or `probe`. For a check-in, `category` holds the answer.
- Activity CSV: `input_ms` and `window_switches` at the end, after `collection_status`. Blank when `null`.

### Backup version 10

- Export writes `schemaVersion` 10. Import accepts versions 1 to 10 and rejects other versions.
- A version 9 backup becomes version 10 with `null` for `detractor`, `challenge`, `inputMs` and `switches`.
- `behaviourVersion` can be 0 to 4.
- `inputMs` is `null` or a number from 0 to `observedMs` (1 ms tolerance). `switches` is `null` or a whole number from 0 to 1000. A row that is not `recorded` cannot hold a measure.
- A `probe` event needs a valid category. `missed` must have `source` `null`. An answer must have `source` `floating` or `main`. The event needs an `activeOffsetMs` that is not more than the active time of its session (1 ms tolerance). A marker that is not an interval has zero duration.
- Restore replaces the data and turns `attentionProbes` off. It also turns off `collectActivity` and `agentAccess`.
- A backup whose settings have no `focusVisual` key restores again, for example a backup from a version before the session gauge. The missing key gets `brain`. A missing `attentionProbes` gets `false`.
- Focus Guide 2.0.0 and earlier cannot restore a version 10 backup. They reject the version number and the new settings key `attentionProbes`.

## Session preparation answers (schema 11)

Schema 11 adds two optional answers that you give before a session starts. Old rows keep `null`. `null` means that you gave no answer.

| Field | Meaning |
|---|---|
| `warmUp` | The answer to **I'm already warm**. One of `yes`, `kind-of` or `no`. `null` when you gave no answer. |
| `medication` | The answer to **Have you taken medications?**. One of `yes` or `no`. `null` when you gave no answer. |

- `session.start` accepts `warmUp` and `medication`. `session.edit` does not change them.
- The migration saves a `before-schema-v11-<timestamp>.sqlite` snapshot with `VACUUM INTO`, except for an empty new database. Then one transaction adds the two columns.
- The planned-versus-recorded difference is not stored. `planDifferenceMinutes()` in `src/shared/analytics.ts` calculates `(activeMs - plannedMs) / 60000` for a finished timer session. It is `null` for a stopwatch session or a session that is not finished. A positive value means that the session was longer than planned.
- The AI agent tools do not return `warmUp` or `medication`.

### CSV columns

- Session CSV: `warm_up`, `medication` and `plan_difference_minutes` at the end, after `challenge`. Blank when `null`.

### Backup version 11

- Export writes `schemaVersion` 11. Import accepts versions 1 to 11 and rejects other versions.
- A version 10 backup becomes version 11 with `null` for `warmUp` and `medication`.
- Focus Guide 3.1.0 and earlier cannot restore a version 11 backup.

## Calculation rules for insights

The Insights tab and the agent tool `get_focus_insights` use the engine in `src/shared/focus-insights.ts`. The constants are in `INSIGHT_THRESHOLDS` in the same file. Every interval is a 90% interval. The engine is deterministic. A fixed seed (42) drives the random choices.

The values describe your records. They are not a measure of attention, and they do not show causes. You choose when you focus, so a pattern in time of day is an association.

### Processing rules

- **Sessions that count.** Finished sessions with `excluded` false, which start in the range and match the area and goal filters. Sessions with more than 8 active hours (`longSessionMs`) leave the analysis. The data quality note shows how many.
- **Drift.** A drift is an **I'm back** marker (`attention-return`) or an interruption. A check-in answer and a parked thought are not drifts. Check-ins follow a schedule that starts at minute 8, so counting them would raise the drift rate by design.
- **Off-task share.** (`drifting` + `elsewhere`) divided by the answered check-ins. `missed` check-ins are not in this share. The data quality section counts them.
- **Recovered sessions** (`recovered` true) leave the attention span and the session shape. Their time can be cut.
- **Old sessions.** A session with `behaviourVersion` below 3 leaves the drift rates, the attention span and the session shape. Its interruptions still count by category.
- **Markers.** The position of a marker is its `activeOffsetMs`. If it is `null`, the engine computes it from the active intervals. A marker after the end of its session leaves the analysis, and the data quality note counts it.
- **Activity minutes.** Only `recorded` rows count. A row with less than 30 seconds observed (`minObservedMs`) does not count for interaction states. Interaction states need `behaviourVersion` 4 and a known `inputMs`. Rates use observed time. A missing value never becomes zero.
- **Local time.** The start hour and the weekday come from the recording timezone of the session. The hour is circular, so 23:00 is near 00:00. The four time bands are Night 00–06, Morning 06–12, Afternoon 12–18 and Evening 18–24.
- **Rates.** Drifts per hour = drift markers divided by active hours of the sessions with `behaviourVersion` 3 or more. Window switches per hour = switches divided by observed hours of the rows with a known switch count. A rate for a group needs the minimum number of sessions in the table below. If not, it stays blank.

### Thresholds

| Section | Rule | Value |
|---|---|---|
| Day rhythm | Rated sessions needed | 10 |
| Day rhythm | Smoothing width (Gaussian, circular) | 1.5 hours |
| Day rhythm | Nearby session weight needed for one start hour | 3 |
| Day rhythm | Sessions needed for one weekday and time-band cell | 3 |
| Attention span | Sessions and first drifts needed | 15 and 8 |
| Attention span | Sessions and first drifts needed for a group curve | 8 and 4 |
| Attention span | Warm-up ends, fatigue begins | Minute 10, minute 25 |
| Attention span | Returns needed for the recovery curve. Tail that counts as censored | 8 and 1 minute |
| Attention span | Sessions for a phase rate. Warm-up friction: drifts and rate ratio | 5. At least 5 drifts and 1.5 times the sustain rate |
| Session shape | Drifts needed for the minutes before drifts. Window | 8 drifts. 2 minutes |
| Session shape | Sessions with activity needed | 10 |
| Session shape | Block length and last minute | 5 minutes, 120 minutes |
| Session shape | Sessions still running for a block to show | 5 |
| Interaction states | Activity minutes and sessions needed | 300 and 5 |
| Interaction states | Number of states (k) | 2 to 5, chosen by silhouette |
| Interaction states | k-means starts for each k | 4 |
| Interaction states | Most minutes in training, most points in the silhouette | 5 000 and 1 500 |
| Interaction states | Input share below which a state is Quiet | 0.15 |
| Interaction states | Adjacent minute pairs needed for a state-change rate | 10 for each session |
| Interaction states | Share of minutes with a switch count for the sixth input. Observed time for a drift rate | 80%. 30 minutes |
| Detractors | Sessions needed | 10 |
| Detractors | Rated sessions needed for a mean focus. Sessions with the needed data for a time-band rate | 3 |
| Association (Spearman) | Rated pairs and calendar days needed | 20 and 7 |
| Focus model | Rated sessions and calendar days needed | 30 and 14 |
| Focus model | Test sessions | The last 10 to 40 rated sessions, with at least 20 sessions before the first test |
| Focus model | Gain over the average rating for the model to count as useful | Error at least 5% lower |
| Focus model | Bootstrap resamples | 200 |
| Focus model | Sessions needed for an activity-mode column | 5 |
| Focus model | Largest gap since the previous session | 24 hours |
| Focus model | Ridge penalty grid (multiplied by the number of training rows) | 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10 |
| Focus model | Lasso and elastic net: folds, penalty values, elastic net mix | 5, 12, 0.5 |
| Focus model | Collinear features. Unstable selection | Variance inflation above 5 or correlation 0.70 or more. Mean overlap below 0.6 |
| Focus model | Known values needed for a session factor | 10 |
| Cycle comparison | Window, baseline and sessions needed | 7 days, 28 days before it, 3 and 5 sessions |
| Duration | Window for the attention rule. Recorded rule | 90 days. 10 sessions over 14 days within 28 days |
| Suggestions | Most suggestions shown | 5 |
| Suggestions | Smallest difference in mean focus (`focusGap`) | 0.3 points |
| Suggestions | Rated sessions for a time band, or for a detractor or challenge group | 5 for a band, 3 for a group |
| Suggestions | Length: rounding step and smallest length | 5 minutes, 15 minutes (25 with warm-up friction) |
| Suggestions | Break: first point, early window, rate ratio, drifts after the point | Minute 25, 20 minutes, 1.5, 8 |
| Suggestions | Break: sessions still running 15 minutes after the point | 5 |
| Suggestions | Switching: Spearman limit | −0.3 or lower |
| Suggestions | Data: rated share, activity coverage, marker share | Below 60%, below 50%, below 20% |

### Day rhythm

The engine smooths perceived focus over the start hour with a circular Gaussian kernel of 1.5 hours. The interval uses a t-based standard error with an effective sample size. The focus value of an hour shows only if the nearby rated sessions weigh at least 3. Each rate has its own weight, from its own eligible sessions: sessions with `behaviourVersion` 3 or more for the drift rate, sessions with a switch count for the switch rate, and sessions with answered check-ins for the off-task share. A rate shows only if its own weight is at least 3. The grid shows the mean focus for each weekday and time band that has 3 rated sessions.

### Attention span

The curve is a Kaplan–Meier estimate of the active time until the first drift. A session without a drift is censored when it ends. The band uses Greenwood variance with a log-log transform. The median is the first time at which the curve falls to one half or lower. Its limits are the times at which the lower and upper bands cross one half.

- If the upper band never falls to one half, `medianOpen` is true. `median.high` is then only the last observed time, and the interface writes "or longer".
- If the curve never falls to one half, the median is `null`.
- The curve has one point for each minute. Groups by time band and by activity mode need 8 sessions and 4 drifts.
- **Recovery curve.** A second curve shows the active time from a return to the next drift. A session without a later drift counts until it ends, if at least 1 minute remains. It needs 8 returns that were followed by a drift.
- **Phases.** The engine counts drifts per active hour and the off-task share in the warm-up (0–10 minutes), the sustain phase (10–25) and the fatigue phase (25 and later). A phase rate needs 5 sessions that reached the phase.
- **Warm-up friction.** It is true when the warm-up has 5 drifts or more and its rate is at least 1.5 times the sustain rate. The engine then also builds the curve of the first drift after minute 10, among sessions that lasted past it.

### Session shape

For each block of 5 active minutes, the engine shows four values:

- The share of observed time with input.
- Window switches per minute.
- Drifts per active hour. This is the drifts divided by the session minutes that reached the block.
- The off-task share.

A measure with no data in a block stays blank.

The figure marks minute 10 and minute 25.

**Minutes before a drift.** For each drift that has at least 30 seconds of observed activity in the 2 minutes before it, the engine compares those minutes with the other observed minutes of the same sessions. It compares window switches per minute and the input share. An activity minute counts in proportion to its overlap with the window. It needs 8 drifts. The marker is the moment you pressed **I'm back**, so the window includes the time you were away.

### Interaction states

Each activity minute becomes five numbers:

- The input share.
- The logarithm of 1 plus key presses per minute.
- The same for clicks.
- The same for scrolls.
- The movement share.

The engine standardizes them. It runs k-means++ for k from 2 to 5 and keeps the k with the best mean silhouette. A tie keeps the smaller k. Then every minute gets the state of the nearest centre.

- A state is **Quiet** when its input share is below 0.15. A state with more input, but with every standardized count at or below the mean, is **Light interaction**. Other states take the name of their largest standardized count above the mean: **Typing**, **Pointing and clicking**, **Scrolling**, **Moving the pointer** or **Window switching**. Two states with the same name get the suffixes light and heavy. Three get light, medium and heavy. Four or more get light, medium 1, medium 2 and so on, then heavy.
- If at least 80% of the minutes have a switch count, the logarithm of 1 plus window switches per minute is a sixth input. A minute without a count takes the mean.
- Each state shows its drifts per observed hour. A drift counts in the minute that contains its position. A state needs 30 observed minutes for this rate.
- The fragmentation rate is the share of adjacent minute pairs (at most 1 second apart) in which the state changes, scaled to one hour. It needs 10 pairs for each session. The engine reports the median and its Spearman correlation with focus.

### Detractors and challenge

The engine counts the reported detractors and shows the mean focus when 3 rated sessions share an answer. It shows interruptions by category with a rate per active hour. It shows the drift rate by time band. It reports the Spearman correlation between window switches per observed hour and focus, with the common rule of 20 pairs and 7 days. It shows the mean focus for each challenge answer.

### Focus model

The model predicts perceived focus from information that exists before a session starts. Ridge, lasso and elastic net compete in the same test. The app uses the estimator described in [the architecture notes](ARCHITECTURE.md#insight-engine) and shows its name and the reason.

| Feature | Meaning of the effect |
|---|---|
| `hourSin`, `hourCos` | One effect, `peakHour`: the gap in focus between the best start hour and the opposite hour. The hour comes from the angle of the two coefficients. The size is the square root of the sum of the squared effects of the two terms. |
| `weekend` | Weekend compared with weekday. |
| `plannedMinutes` | One standard deviation more planned length. A stopwatch session has no value, which takes the training mean. |
| `stopwatch` | Stopwatch compared with a planned countdown. |
| `energy`, `energyMissing` | One standard deviation more starting energy. A flag for energy that was not recorded. |
| `earlierSessions`, `earlierMinutes` | One standard deviation more sessions or focus minutes earlier on the same day. The count includes every finished, included session of that day, also those outside the filters. |
| `hoursSincePrevious` | Longer gap since the previous session, on a log scale and capped at 24 hours. |
| `goal` | Linked to a goal compared with not linked. |
| `mode:<name>` | An activity mode compared with the most frequent mode. Rarer modes join that reference. |

- The engine picks the penalty with the lowest PRESS (mean squared leave-one-out error in closed form). A tie keeps the stronger penalty.
- The test is a rolling origin. A model that saw only earlier sessions predicts each test session. The baseline is the mean rating before the session. Predictions stay between 1 and 5.
- The model is useful only if its mean absolute error is at least 5% below the baseline error. If not, the interface shows the two errors and no effects.
- Each effect has a plain percentile interval from 200 bootstrap resamples (5th and 95th percentile). With shrinkage, the estimate can lie outside its interval.
- **Diagnostics.** The engine reports the correlation of feature pairs (0.70 or more) and the variance inflation factor of each feature (the diagonal of the inverse correlation matrix).
- **Lasso selection.** For each feature, the app shows if the lasso keeps it, the share of test windows that keep it (`selectionShare`) and the share of bootstrap resamples that keep it (`bootstrapShare`). The interface draws only the features that the lasso keeps and lists the others as "No clear association found (zeroed by Lasso)".
- **Session factors.** A second view explains the rating with facts that exist only after the session: drifts per hour, window switches per hour, input share, state changes per hour, challenge and detractor. A missing value takes the training mean. The view does not predict. It shows its effects whenever it is eligible.

### Suggestions

The engine shows at most 5 suggestions. It sorts them by strength (`moderate` first), then by kind: window, length, warmup, break, detractor, switching, challenge and data. Every suggestion has a title, a detail, its evidence and a strength.

| Kind | It appears when | `moderate` when |
|---|---|---|
| `window` | The day rhythm is eligible. A time band with 5 rated sessions has a mean focus at least `focusGap` (0.3) above the overall mean. The band with the highest mean wins. | The lower limit of the t interval of that mean is above the overall mean. |
| `length` | The attention span is eligible and has a median. The length is the median rounded to 5 minutes, and not less than 15 minutes. With warm-up friction and a median under 25 minutes, the length is not less than 25 minutes, and follows the median after minute 10 when that is known. | The upper limit is not open, and the interval is not wider than the median. |
| `warmup` | The attention span is eligible and has warm-up friction. | The one-sided 95% lower bound of the rate ratio (warm-up to sustain) is above 1. |
| `break` | The attention span is eligible. A change point exists from minute 25 onward. Both rates come from the sessions that reached that minute. After it, at least 8 drifts occurred and the drift rate is at least 1.5 times the rate of the first 20 minutes. At least 5 of these sessions must still run 15 minutes after the point. Among the points that qualify, the one with the largest likelihood-ratio statistic wins. | A Bonferroni-corrected one-sided 95% lower bound of the rate ratio is above 1. The correction counts the points that the engine tried. |
| `detractor` | The detractors section is eligible. The most reported detractor (not `none`) and `none` each have 3 rated sessions. The mean focus with that detractor is at least `focusGap` below the mean with `none`. | The upper limit of a Welch interval for the difference is below 0. |
| `switching` | The detractors section is eligible. The Spearman correlation between switches and focus is eligible and −0.3 or lower. | The upper limit of a Fisher interval is below 0. |
| `challenge` | The detractors section is eligible. `right` has 3 rated sessions. `too-hard` or `too-easy` has 3 and a mean at least `focusGap` below `right`. The lower mean wins. | The upper limit of a Welch interval for the difference is below 0. |
| `data` | Fewer than 60% of the sessions are rated. If not, activity covers less than 50% of active time. If not, fewer than 20% of the sessions have a drift marker. Only the first true case shows. | Never. It is always `tentative`. |

### Cycle comparison

The comparison puts the last 7 days up to the end of the range against the 28 days before them. It uses the same area or goal filter and ignores the start of the range. It needs 3 sessions in the recent window and 5 in the baseline.

| Measure | Rule |
|---|---|
| Perceived focus | Mean rating. It needs 3 and 5 rated sessions. A change below 0.05 counts as no change. |
| Drifts per active hour | The common drift rate. A change below 0.05 counts as no change. |
| Median time to the first drift | Kaplan–Meier median. It needs 3 first drifts in each window. A change below 0.5 minutes counts as no change. |
| Window switches per observed hour | The common switch rate. A change below 0.5 counts as no change. |

A measure that one window cannot give stays blank. The result also holds the saved weekly adjustment of the week of the end date and of the week before. For a goal, it reads the goal review. If not, it reads the general review. The comparison shows a change. It does not show that an adjustment caused it.

### Duration suggestion

The action editor uses `suggestedDuration()`. It looks at finished, included sessions with the same activity mode in the last 90 days. It tries the goal first, then the area. If the attention span of those sessions is eligible, the suggestion is the **length** plan (median time to the first drift, with the warm-up rule). If not, it uses the median recorded duration of 10 sessions over 14 days within 28 days. The result says which rule it used.

### Data quality

| Value | Meaning |
|---|---|
| `sessions`, `activeMinutes`, `spanDays` | Sessions that count, their active minutes, and the calendar days from the first to the last start. |
| `ratedShare` | Sessions with a focus rating divided by all sessions. |
| `reflectionShare` | Sessions with a detractor or a challenge answer, divided by all sessions. |
| `activityCoverage` | Observed time divided by active time, for sessions with `behaviourVersion` 3 or more. At most 1. |
| `markerSessions` | Sessions with at least one drift marker. |
| `probeSessions`, `probeAnswered`, `probeMissed` | Sessions that had a check-in, answered check-ins, and `missed` check-ins. |
| `droppedLong`, `droppedRecovered` | Sessions that the engine left out for length or for recovery. |
| `notes` | One sentence for each rule that removed data, with the count. |
