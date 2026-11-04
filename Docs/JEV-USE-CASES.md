# TypeSafe Jev in Focus Guide

This document describes where TypeSafe Jev helps Focus Guide collect, process and check data. Phase 1 is in the app (3.9.0). UC-S1 is in the app as a data collection for review (3.11.0). The other use cases are designs. Each use case gives the decision table, the state, the questions, the data that leaves the computer, and the phase.

Jev answers typed questions about text that the app sends. A Noul is the probability that a statement is true. A Choice picks one option from a list and gives a probability for each option. A Score places an answer on levels. See the [TypeSafe documentation](https://docs.typesafe.ai/llms.txt).

## Why

- The insight engine reads no free text. It uses only fixed answers, times and counts (`focusInsights()` in `src/shared/focus-insights.ts`). The intention, the note, parked thoughts and interruption notes are collected but not analysed.
- Many structured answers are optional and stay empty: the main distraction, the challenge level, the barrier of a planned action, and the task or goal of a session.
- Some data has known quality problems: old interruption categories in free text, area and category names that differ only in case, and agent tasks that lose their roadmap step when the step title is not an exact match.

## Model

Data goes through three stages. Jev has a different role in each stage.

| Stage | Problem | Jev role | Result |
|---|---|---|---|
| Capture | An optional answer is empty, or the text and the answer disagree | **Classifier**: text → a fixed answer. **Linker**: text → an existing record | A suggestion that the user accepts |
| Processing | Statistics ignore free text | **Featurizer**: text → an ordered level | A derived column, kept apart from the user's records |
| Quality | Duplicates, old values, vague plans, lost links | **Auditor**: one record against another, or against a definition | A warning or a fix suggestion |

## Rules for every use case

1. **Two keys.** Jev suggests. The user decides. A Jev answer becomes a record only through a user action. The action runs the normal command, so validation and the edit history do not change. This is the same contract as agent proposals.
2. **Judge at capture, never at compute.** `insights.read` stays offline and deterministic. Jev runs only when the user starts a check, or, for UC-S1, while a focus session runs after the user turns the window check on. From Phase 4, statistics read stored judgments; they never call the network.
3. **Judgments in Jev, decisions in code.** Each use case has a truth table in a pure function. A Noul above 0.7 is yes. A Noul below 0.3 is no. Between them, the answer is "unclear" and the app makes no suggestion. A failed call is an error. It is never a "no".
4. **Select, never generate.** Code makes the list of candidates (fixed answers, open tasks of the area, roadmap steps). Jev picks one. A second question (a Noul) says whether any candidate fits.
5. **Visible requests.** The app keeps the last 20 requests and answers in memory. **Settings > TypeSafe judgments > What was sent** shows them.
6. **Gaps teach form design.** If the app must often infer the same answer, improve the form that asks for it.

## Privacy

- TypeSafe is a cloud service. The text in a request leaves this computer. TypeSafe states that it does not train models on requests.
- The setting `jevAssist` is off by default. Restore turns it off.
- The API key is encrypted with Windows (Electron `safeStorage`) in `typesafe-key.bin` in the data folder. It is not in settings, datasets, backups, the request log or the renderer.
- The request goes from the main process. The renderer CSP keeps `connect-src 'self'`.
- The state holds only the text that a person needs to answer. It holds no ids, dates, ratings or names of other records.
- UC-S1 sends the window title and program name and, with **Title and capture**, a picture of the window. A picture can show private content. The setting `jevWindowCheck` is off by default, after the schema 12 migration and after restore. TypeSafe marks images as not yet ready for production (header `TypeSafe-Danger-Zone-Images`).

## Use cases

### UC-C1 Reflection gap-fill: main distraction (Phase 1, in the app)

**Candidates.** Finished, included sessions of the last 90 days with 2 minutes or more of active time, no main-distraction answer, and a note, a parked thought or an interruption note. The newest 50 sessions.

**State.** One request for each session. Empty parts are left out.

```json
{ "session": { "intention_before_session": "…", "note_after_session": "…", "ideas_parked_during_session": ["…"], "interruption_notes": ["…"] } }
```

**Questions** (wording in `src/main/jev-questions.ts`, question set `reflection-detractor@2`, model `jev-1.14.0`):

- `cause_notifications`, `cause_people`, `cause_thoughts`, `cause_tiredness`, `cause_task` (Nouls): one for each cause, because more than one can be true.
- `any_problem` (Noul): does the text say that something hurt focus during the session? It only separates "nothing notable" from "something else" when no cause fits.
- `main_cause` (Choice): which cause hurt focus most?

**Decision** (`decideDetractor()` in `src/shared/jev-decisions.ts`):

The cause questions decide. A text can name a cause without calling it a focus problem. For example, "stuck on the second step" got 0.98 for the task cause and only 0.08 for `any_problem`.

| Causes | `any_problem` | Suggestion |
|---|---|---|
| one above 0.7 | — | That cause |
| more than one above 0.7 | — | The `main_cause` answer if its own Noul is above 0.7, else the strongest cause. The others show as alternatives. |
| all below 0.3 | below 0.3 | Nothing notable (`none`) |
| all below 0.3 | above 0.7 | Something else (`other`) |
| any other combination | — | No suggestion |

**Interface.** **Patterns > Overview > Fill missing reflections**. For each session: **Use suggestion**, **Choose another answer**, or **Skip**. An answer saves through `session.review`, which keeps an edit record with the old values. **Skip** saves nothing, so the session shows again in the next check.

**Limits.** English is Jev's primary language. Portuguese notes can be less accurate. The "unclear" band and the user's decision absorb this. Text in a note can try to change the answer (prompt injection). The effect is limited because the user accepts each answer.

**Probe results** (2026-10-30, `jev-1.14.0`, 30 synthetic sessions, half English and half Portuguese):

- Version 1 had `any_problem` decide first. On the tuning half it matched 12 of 15. It missed two "stuck on the task" notes and turned a half-fitting cause into `other`.
- Version 2 (the table above, plus one line in the `people` criteria saying that a device message counts as a notification) matched 14 of 15 on the tuning half. The one miss became "no suggestion", not a wrong answer. It matched 15 of 15 on the held-out half, which was not used for tuning.
- Portuguese notes scored like the English notes in these cases. Messages still sometimes score high for `people` (0.72 for "celular tocando"). This only adds an alternative; it does not change the suggestion.
- Each request used about 950 input tokens. A full scan of 50 sessions costs about $0.002.

### UC-C2 Barrier of a planned action (Phase 2)

A `GoalOccurrence` with a note and no barrier. Choice over capability, opportunity and motivation, with a description of each. A Noul: "Does `note` give a reason the action was not done as planned?" Below 0.3: no suggestion.

### UC-C3 Old interruption categories (Phase 2)

Older versions stored free text as the interruption category. The check sends each distinct text one time, not each event. Choice over Internal, External, Environment and Other. A Noul: "Does `label` describe a cause of interruption?" The user approves one mapping table. Then one batch of edits applies it.

### UC-C4 Parked thoughts (Phase 2)

Nouls: "Is `thought` something to do later?" and "Is `thought` a worry or a feeling?" A thought that is a task can become a task with the existing conversion. A Linker can suggest its goal.

### UC-L1 Session to task or roadmap step (Phase 2)

Code lists the open tasks and active steps of the session's area (at most 20). Choice over them, and a Noul: "Does `intention` refer to any of these tasks?" This reduces unassigned sessions. It works for new sessions and for older ones.

### UC-L2 Agent task to roadmap step (Phase 2)

Today an agent task gets its step only when the titles match exactly in lower case (`agent-service.ts`, `agent-edits.ts`). A near miss leaves the task without a step and does not say so. The replacement: Choice over the goal's steps, and a Noul that says whether any step fits. A true miss stays without a step and the proposal shows it.

### UC-A1 Duplicate names (Phase 3)

Code makes pairs of area names and pairs of category names. The lists are small. A Noul: "Do `a` and `b` name the same area of work?" The result is a warning until a merge command exists.

### UC-A2 Plan quality (Phase 3)

A checklist in the goal workspace:

- "Does `goal.outcome` state a result that a person could observe?"
- "Does `action.cue` name a specific time, place or earlier event?"
- "Does `step.title` name an action that a person could start today?"
- "Does `adjustment` name a specific change to try next week?"

Code compares the checklist with the completion of planned actions. This feeds pattern recognition for goals and workflow.

### UC-F1 and UC-F2 Text features (Phase 4)

- Intention specificity (Score): no task named, a topic, a concrete result, a concrete result with a stopping point. It becomes a column of the focus model.
- Note signals (Nouls): "Does `note` say the planned work was finished?" and "Does `note` mention fatigue?"

These need a `judgments` table (schema bump and migration). Each row keeps the model and the question set. The rows can be computed again. They are not in backups.

### UC-S1 Window alignment (in the app as data collection, 3.11.0)

**Purpose.** Measure attention on the planned work without asking the user. For now the answers are only collected, in their own table `windowJudgments` (see the [data dictionary](DATA-DICTIONARY.md#typesafe-window-checks-schema-12)), so their quality can be judged. No decision and no insight uses them yet.

**When.** Every 5 minutes of active focus time while the setting **Window check during focus** is `title` or `title-image`, TypeSafe judgments are on and a key is saved. Offline sessions, pauses and breaks are not checked. Focus Guide's own windows and private browsing windows are skipped without a request.

**State.** Empty parts are left out. `screenshot` is the reference of the image asset.

```json
{ "focus": { "area": "…", "goal": "title: outcome", "task": "…", "intention": "…" },
  "window": { "program": "Code", "title": "…", "screenshot": "<uuid>" } }
```

**Questions** (wording in `src/main/jev-questions.ts`, question set `window-alignment@1`, model `jev-1.14.0`):

- `area_alignment` (Score, 4 levels): unrelated subject or entertainment → a general tool with no visible subject → a near subject → work that belongs to the area.
- `plan_alignment` (Score, the same levels against the goal, task and intention). Asked only when the session has one of them.
- `window_readable` (Noul, the null case): does the window show what the person is working on or looking at?

**Stored.** For each Score: `score`, `confidence` and the probability of each level, because the mean can hide two peaks. For the Noul: its value. Also the title, the program name, whether a picture was sent, and the billed input tokens. The picture is never stored.

**Review.** **Patterns > Window checks (review)** lists the newest 200 rows and exports all rows as CSV. `session_id` and `active_offset_ms` join a row to the attention check-ins (`probe` events), which are the first reference for quality. Before the answers join the analysis, a truth table goes into `jev-decisions.ts`.

**Limits.** Text in the window can try to change the answer (prompt injection). The effect is limited while no decision reads the answers. A generic area name (for example "Deep work") gives the area question little to work with; the plan question covers it. The cost of an image is not published; `inputTokens` measures it.

## Phases

1. Framework and UC-C1 (3.9.0).
2. UC-L1, UC-L2, UC-C2, UC-C3, UC-C4.
3. Auditors.
4. Featurizers.
5. Sensor (UC-S1 collection in 3.11.0; its use in the analysis is still to do).

## Test a question change

1. Send each new wording over synthetic sessions in English and Portuguese, with no-problem, unclear and several-cause cases. Never use personal records for tests.
2. Read each answer, not only totals.
3. Change the wording only to make the definition clearer. Do not add a clause for one failed case.
4. Check the change on cases that you did not use to tune it.
5. Change `REFLECTION_QUESTION_SET` or `WINDOW_QUESTION_SET` when the wording changes.
