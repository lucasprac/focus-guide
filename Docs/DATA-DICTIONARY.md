# Focus Guide — data dictionary

This dictionary describes schema version 3. Later sections describe the additions of schemas 4 to 8: [goal planning](#goal-planning-records-schema-4), [goal reasons and milestone order](#goal-reasons-and-milestone-order-schema-5), [milestone block kinds](#milestone-block-kinds-schema-6), [roadmap steps](#roadmap-steps-schema-7) and [agent proposals](#agent-proposals-schema-8) and the [agent change log](#agent-change-log-schema-9). The interface calls a field an "area".

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
| `kind` | `active`, `pause`, `interruption`, `thought`, `recovery` or `edit`. |
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
| `settings.sound` | When `true`, the app requests the Windows completion notification sound. Windows can suppress it. |
| `settings.palette` | `cyan`, `violet`, `amber` or `rose`. Each extra palette needs 5, 20 or 50 finished, included hours, in that order. |
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

- Sessions add `activityMode` and `behaviourVersion`. `behaviourVersion` is 3 for new sessions. 0 means history from before this collection existed.
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
