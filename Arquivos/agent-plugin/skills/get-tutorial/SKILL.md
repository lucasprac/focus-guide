---
name: get-tutorial
description: A tutorial on Focus Guide for the agent and for the user. It explains the pages of the app (Goals, Focus, Calendar, Patterns, World, Settings, the task panel), the access levels, what each MCP tool reads or changes, and which focus-guide skill to use for each task. It then gives the user a short tutorial from their own records, with the next features to try. Use it at the start of the first conversation with Focus Guide, before you use a tool that you do not know, and when the user asks "how does Focus Guide work", "teach me the app", "tutorial", "what can you do with my focus data", "como usar o Focus Guide", "me ensina o app", "tutorial do app" or "o que você consegue fazer".
---

# Focus Guide tutorial

Answer in the language of the user. This skill has two parts. Part 1 is for you: read it before you use the tools. Part 2 is the tutorial that you give to the user.

## Part 1: what you must know

### The app

Focus Guide is a local Windows app. It records focus sessions, goals, tasks and behaviour in a database on the user's computer. You get data only through the Focus Guide MCP tools, and only while the app is open.

| Place in the app | What the user does there |
|---|---|
| **Goals** | Creates goals in areas. Each goal has a workspace: **Overview**, **Roadmap** (stages and to-do steps), **Tasks**, **Behaviour** and **Plan & review** (weekly actions and the weekly review). Agent proposals and **Agent activity** show here. |
| **Focus** | Starts a session: area, intention, duration (timer or stopwatch), optional goal, step, activity mode and energy. During focus: **Pause**, **Finish session**, **Session tools** (mark interruption, park a thought, exclude), **I'm back**, the attention state (warm-up, sustain, fatigue). After focus: a short reflection. |
| **Task panel** | **Tasks** at the top of the window or **Ctrl+Shift+T**. Holds the tasks without a goal, grouped by due date. The tasks of a goal are in the goal's **Tasks** tab. |
| **Calendar** | Day, week and month views of recorded sessions, planned weekly actions, due tasks and commitments (blocks of focus time). **Start focus** on a block prepares the Focus page and links the session to the block. |
| **Patterns** | **Overview** (recorded time, durations, interruptions, planned vs recorded, weekly review) and **Insights** (best hours, attention span, session shape, what got in the way, suggestions). **Behaviour tutorial** explains the behaviour figures. **Explore an example** shows invented data. |
| **World** | Neural World: a map of areas, goals and sessions that grows with recorded time, and achievements. |
| **Settings** | Defaults, appearance, activity collection, attention check-ins, the attention state mode, backups, and **AI agent (MCP)** with the access level. |
| **Floating timer** | A small window that stays on top, with the same timer (brain or bar). |

### Access levels

Call `get_overview` first. Its `access` value tells you what you can do. Each level includes the levels before it.

- `read`: you read records only.
- `propose`: you also save proposals. Nothing changes until the user applies a proposal in the app. Goal proposals show on the goal list and the goal Overview, task proposals without a goal in the task panel, commitment proposals on the **Calendar** page.
- `edit`: you also change goals, roadmaps, steps, goal tasks, weekly actions, review notes and commitments directly. Each change shows in **Agent activity**, where the user can undo it. Give a short reason with each change.

If a tool fails with an access error, tell the user which level it needs. Only the user changes the level, in **Settings > AI agent (MCP)**. Do not ask the user to give you more access than the task needs.

### The tools

| Need | Tool (access) |
|---|---|
| Today, the access level, active goals, today's actions and commitments, tasks without a goal, open proposals | `get_overview` (read) |
| One goal: roadmap with revision, tasks, weekly actions, reviews, recorded minutes | `get_goal` (read) |
| How the user works on one goal | `get_goal_behaviour` (read) |
| The Insights values: best hours, attention span and phases, rhythm, recommendations | `get_focus_insights` (read) |
| Recorded sessions with their details | `list_sessions` (read) |
| One week of one goal | `get_weekly_review` (read) |
| Commitments, busy time and the last four weeks of plans | `get_calendar` (read) |
| Your earlier proposals and changes | `list_proposals`, `list_changes` (read) |
| Propose a goal, a roadmap, tasks, a weekly action, a review note, commitments | `propose_goal`, `propose_roadmap`, `propose_tasks`, `propose_action`, `propose_review_note`, `propose_commitments` (propose) |
| Change records directly | `create_goal`, `update_goal`, `update_roadmap`, `update_step`, `create_tasks`, `update_task`, `create_action`, `update_action`, `add_review_note`, `create_commitments`, `update_commitment` (edit) |

Read the description of a tool before you call it for the first time. Before `update_roadmap`, call `get_goal` and send its roadmap revision: a stale revision fails.

### The skills

| The user wants to | Skill |
|---|---|
| Review the week of the goals | `focus-guide:weekly-review` |
| Find patterns in focus, goals, workflow and behaviour | `focus-guide:pattern-analysis` |
| Plan today's sessions | `focus-guide:plan-day` |
| Plan, move or cancel calendar blocks | `focus-guide:commitments` (always, before a commitment tool) |
| Create a goal with a roadmap, or split a roadmap | `focus-guide:roadmap` |
| Learn the app | `focus-guide:get-tutorial` (this skill) |

### What you can never do

- Start, pause or finish a session, or measure time. Only the app measures time.
- Delete a record, mark a goal achieved or archived, tick a roadmap step, or mark a commitment done or skipped.
- Change areas, settings, backups or activity collection.
- Read the database or the data folder directly.

If the user asks for one of these, tell them where to do it in the app.

### Privacy

What you read goes to your AI provider. If the user asks, say so: goals, sessions, notes and activity summaries can leave the computer. **Read only** or **Off** in **Settings > AI agent (MCP)** limits this.

## Part 2: the tutorial for the user

### Steps

1. Call `get_overview`. Note `access`, the active goals, `todaysActions`, `todaysCommitments`, the tasks without a goal and the open proposals.
2. Call `get_focus_insights` for the last 90 days. Note how many sessions it uses, how many are rated, and which figures do not have enough data (each one says what is missing).
3. Call `get_calendar` for the last 28 days. Note if the user plans commitments and how many were done or missed.
4. Find the stage of the user:
   - **New:** no goals and few or no sessions.
   - **Started:** sessions, but few goals, no roadmap, no ratings, or no commitments.
   - **Regular:** goals with roadmaps, rated sessions and enough data for most Insights figures.
5. If the user asked about one feature, explain only that feature (use the table in Part 1 and the steps below). Otherwise, give the tutorial for the stage.

### Tutorial for each stage

Give at most three next steps. Each step has the place in the app, what to select, and why it helps. Use the bold names of the app.

- **New:**
  1. **Goals > New goal**: an area, a title and an outcome. Then a few to-do steps in **Roadmap**. Offer `focus-guide:roadmap` to make the roadmap together.
  2. **Focus**: choose the goal or a task, a 25 or 50 minute timer, **Begin focus**. **Finish session** at the end, then rate the focus in the reflection.
  3. **Patterns > Explore an example**: see what the Insights figures show after some weeks of records.
- **Started:** select the gaps that the records show, for example:
  - No ratings: rate the focus in the reflection after each session. Many Insights figures need 10 rated sessions.
  - No "I'm back" markers: press **I'm back** after a drift. The attention span figure needs 15 sessions with markers.
  - No roadmap: add steps to the goal, then **Focus on this step**.
  - No commitments: plan blocks on the **Calendar**, or offer `focus-guide:plan-day`.
  - Activity collection or check-ins off: point to **Settings > Activity & shortcuts** and the **Behaviour tutorial** in Patterns. These are optional. Do not push the user to turn them on.
- **Regular:** offer the methods that use the records: `focus-guide:pattern-analysis` for patterns with evidence, `focus-guide:weekly-review` for one adjustment for each goal, `focus-guide:plan-day` for the day. Tell the user about the manual attention state (**Settings > Activity & shortcuts > Attention state**) if they want to set warm-up, sustain and fatigue themselves.

Then tell the user what you can do at the current access level, in two or three lines, and where they apply or undo your work.

## Rules

- Describe only features that this skill or the tool results name. If you are not sure that a feature exists, say so. Do not invent buttons or settings.
- The values describe records. They do not measure attention, and an association is not a cause.
- A missing value is unknown, not zero. A figure without enough data is not a failure: give the count that is missing.
- Make no change in this skill. A tutorial only reads and explains.

## Output

1. One sentence: what Focus Guide does for the user.
2. The stage of the user, with the evidence (counts from the tools).
3. At most three next steps, as a numbered list.
4. What you can do at the current access level, and the skill names that the user can type.
