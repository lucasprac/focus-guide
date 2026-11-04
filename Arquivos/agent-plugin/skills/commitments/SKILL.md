---
name: commitments
description: The playbook for planning, moving and cancelling commitments (blocks of focus time) in the Focus Guide calendar. It sets the length and order of blocks from the user's warm-up, sustain and fatigue phases, places short and long rests from the user's rest preferences, and ranks areas and activities by deadline, invested effort and the user's preferences. Use it before every call to create_commitments, propose_commitments or update_commitment, and when the user asks to "plan my week", "organize my calendar", "schedule focus time", "organizar a agenda", "planejar a semana" or "marcar blocos de foco". The plan-day skill uses it.
---

# Commitments playbook

Answer in the language of the user. This playbook tells you how to plan commitments. Apply all three parts (phases, rests, priorities) to every plan. When a part has no data, use the default that it gives and tell the user that the plan uses a default.

## 1. Read before you plan

1. Call `get_overview`. Note `today`, `access`, the active goals, `todaysActions`, `todaysCommitments` and the tasks without a goal.
2. Call `get_calendar` for the days to plan. Busy time is the commitments that are planned, active or done, and the recorded sessions. Never plan over busy time. Note `now`: you can plan only from `now` on.
3. Call `get_focus_insights` for the last 90 days. Read `attentionSpan` (phases, `warmUpFriction`, `overall`, `afterWarmUp`), `rhythm`, and the `recommendations` of kind `length`, `break` and `warmup`.
4. Call `get_calendar` for the last 28 days (`from` 27 days before today). Read `lastFourWeeks`, and the `notes` of past commitments: they can hold the rest preference of the user (see part 3).
5. For each goal that you can plan (at most 5), call `get_goal`.

## 2. Plan with warm-up, sustain and fatigue

`attentionSpan.phases` has three phases. Each phase has `fromMinute`, `toMinute` (null for the last phase), `driftPerHour` and `sessions`. A phase with fewer sessions than the threshold has `driftPerHour` null: it is unknown, not zero.

- **Warm-up** (minute 0 to the end of the first phase, 10 minutes by default). The first minutes of a block cost the most. Rules:
  - Do not make a block shorter than the end of the warm-up plus 15 minutes. Two short blocks pay the warm-up two times.
  - Put two blocks for the same target next to each other only with a short rest between them, so the user does not warm up again from zero. Group blocks of one area or goal in the same part of the day.
  - When `warmUpFriction` is true, write the first concrete step in the block `notes` ("First step: open the exercise list, do problem 1"). The `warmup` recommendation gives the evidence.
- **Sustain** (from the end of the warm-up to the start of fatigue). This is the best time of a block. Put the most difficult work of a block here: the block must reach the sustain phase. Use the `length` recommendation (`minutes`) as the block length. When `afterWarmUp` exists, the length is counted after the warm-up.
- **Fatigue** (from the `fromMinute` of the third phase, 25 minutes by default). Drifts increase here. Rules:
  - When the fatigue phase has a `driftPerHour` that is clearly higher than the sustain phase, end the block near the start of fatigue, or put a short rest there.
  - When a `break` recommendation exists, put the short rest at its `minutes`.
  - When fatigue is not higher than sustain, a longer block is acceptable. Do not go above the `length` recommendation plus 15 minutes.
- **Across the day.** Fatigue also adds up over the day. Put the most difficult blocks in the hours with the most recorded focus (`rhythm`). Put easier work (reading, review, small tasks) late in the day or after two or more blocks.
- **No data.** When `attentionSpan.eligible` is false, use a 10-minute warm-up, blocks of 45 to 50 minutes, and a short rest after 25 minutes. Tell the user that Focus Guide needs more sessions with "I'm back" to measure the phases.

These values describe the records of the user. They do not measure attention. Do not tell the user that a phase is a fact about their brain.

## 3. Plan the rests

A rest has two kinds:

- **Short rest:** a pause inside a block (the user pauses the timer), for example 5 minutes.
- **Long rest:** a free gap between two blocks, for example 15 to 30 minutes.

Find the preference of the user in this order:

1. The words of the user in this conversation.
2. A line that starts with `Rest:` in the `notes` of past commitments.
3. If you find no preference, ask one question before you save the plan: "Which rests do you prefer? A short pause inside a block (how many minutes, after how many minutes of focus), and a longer rest between blocks (how many minutes)?" If the user does not answer, use the defaults: a 5-minute short rest at the start of fatigue, and a 15-minute long rest after each block (30 minutes after the third block in a row).

Apply the preference:

- Leave the long rest as free time between blocks. Never plan two blocks without a gap, except a gap of a short rest between two blocks with the same target.
- A short rest is inside the block: add its minutes to `durationMinutes`, and write it in the block `notes`.
- Write the preference in the `notes` of each block that you save, in one line, so the next plan can read it: `Rest: short 5 min at minute 25; long 15 min between blocks.`
- Focus Guide does not save rest preferences anywhere else. Do not tell the user that it does.

## 4. Rank areas and activities

Give each candidate (a goal step, a task, a weekly action of the day, or an area) a rank from three factors. Show the factors to the user in one line per block.

1. **Deadline.** Use `deadline` of the goal, `targetDate` of the step and `dueDate` of the task. A weekly action of today is due today. For a goal with a deadline, compare the work left (the `estimatedMinutes` of the open steps, minus their `recordedMinutes`) with the days left. A goal that needs more minutes each day than it got in the last 28 days is at risk: rank it high.
2. **Invested effort.** Use `recordedMinutesLast28Days` of the goal and `recordedMinutes` of each step.
   - A goal with time in the last 28 days and a near result (few steps left) keeps its momentum: rank it high.
   - A step with `recordedMinutes` much larger than `estimatedMinutes` is stuck. Do not plan more of the same: plan one block to split the step (with the roadmap skill) or a smaller first step.
   - An active goal with no time in 28 days is neglected. Ask the user if it is still important before you plan it.
3. **Preferences of the user.** Ask, when you do not know it, which areas or goals matter most this week. Use the `why` and `whyTags` of the goal, a task with `priority` high, and what the user said. A clear preference of the user is stronger than the other two factors.

Order the blocks: rank first, then the phase rules (the most difficult work of a high rank in the best hours). Do not plan more than the free time, and leave one free hour for each four planned hours. When `lastFourWeeks` has more missed than done blocks, plan fewer and shorter blocks than the user asks for, and say why.

## 5. Save the plan

- Show the plan first: a table with day, time, target, minutes, the phase rule, the rest and the rank factors.
- Access `edit`: after the user agrees, call `create_commitments` with all blocks and a short `rationale` that names the phase, rest and priority evidence. All blocks are saved, or none. If a block overlaps or ends before `now`, the tool tells you which one: change it and call again.
- Access `propose`: call `propose_commitments` with the same `rationale`. Tell the user to apply it on the **Calendar** page.
- Access `read`: give the table only.
- To change a plan, use `update_commitment` on blocks with state planned or missed and no sessions. Do not change blocks that the user marked done or skipped, or blocks with sessions. To remove a block, cancel it (`status` cancelled); never ask the user to delete it for you.

## Rules

- You cannot start, pause or finish a session, or mark a block done or skipped. Only the user does this.
- A missed block is a gap in the plan, not a failure. Plan it again at a better time, or make it smaller.
- An association is not a cause. Give the sample size of each phase you use (`sessions`).
- A `null` value is unknown, not zero.
