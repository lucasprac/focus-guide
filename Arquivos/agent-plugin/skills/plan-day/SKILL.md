---
name: plan-day
description: Plans the focus sessions of a day (today by default) from the user's Focus Guide records (calendar, planned weekly actions, open tasks, next roadmap steps and the hours with the best recorded focus) and saves the plan as commitments in the Focus Guide calendar. Use when the user asks to plan the day or the week, "what should I work on today", "plan my sessions", "organize my calendar", "planejar o dia", "organizar a agenda", "o que fazer hoje", or at the start of a work day.
---

# Plan the day

Answer in the language of the user. Follow the `focus-guide:commitments` playbook for the length of each block (warm-up, sustain and fatigue), the rests, and the rank of areas and activities. This skill gives the steps for one day.

## Steps

1. Call `get_overview`. Note `today`, `access`, `todaysActions` (with `status`, `normal` and `smaller`), `todaysCommitments`, the active goals, and `tasks` (the tasks that belong to no goal). From `tasks`, note the open tasks that are due today or earlier.
2. Call `get_calendar` for the day (or the days) to plan. Note `now`, the commitments that are already planned (do not plan over them), the recorded sessions, the planned weekly actions and the tasks due. From `lastFourWeeks`, note how many blocks were done or missed and `medianStartDelayMinutes`: if many blocks are missed, plan fewer and shorter blocks.
3. Select at most 5 active goals: goals with a planned action today first, then goals with a near deadline, then goals with the most `recordedMinutesLast28Days`.
4. For each selected goal, call `get_goal`. Note:
   - Open tasks that are due today or earlier, and tasks with high priority.
   - The first roadmap step that is not complete.
5. Call `get_focus_insights` for the last 28 days. Note the hours with the most recorded focus and the median time to the first drift. If the data is not sufficient, use sessions of 25 to 50 minutes and tell the user that the plan uses a default.
6. If you do not know the free time of the user, ask one question: which time windows are free, and what is the energy level. Commitments and sessions in `get_calendar` are busy time.
7. Make the plan:
   - Put the most difficult work in the hours with the best recorded focus.
   - Make each session a little shorter than the median time to the first drift. Put a break after each session.
   - Give each planned action its normal version. Give the smaller version as the plan for a difficult day.
   - Do not plan more time than the user has free. Blocks never overlap, and a block ends on the day it starts.
   - Give each block one target: a task (`taskId` alone), a goal with an optional roadmap step (`goalId` and the exact `step` title), an area (`areaId`), or nothing for a free focus block.
8. Show the plan. Then save it as commitments in the calendar:
   - With access `edit`, call `create_commitments` with all blocks and a short `rationale`. All blocks are saved, or none. If a block overlaps or ends before `now`, the tool tells you which one: change it and call again.
   - With access `propose`, call `propose_commitments`. Tell the user to apply the proposal in Focus Guide on the **Calendar** page.
   - With access `read`, give the table only.
   To move or cancel a block that you planned before, use `update_commitment` (access `edit`). Do not change blocks that the user marked done or skipped, or blocks with recorded sessions.
9. Tell the user how to start each block: on the **Calendar** page, select the block and **Start focus**. Focus Guide then prepares the session with the block's goal, step, task and minutes, and links the session to the block.
10. If the plan needs new one-off tasks and the user agrees, save them. With access `edit`, use `create_tasks`. With access `propose`, use `propose_tasks`. Set `step` to the exact title of the roadmap step. For a task that belongs to no goal, use `propose_tasks` without `goalId` and without `step` (with `areaId`, or without it for no area), also with access `edit`. Do not make other changes.

## Rules

- You cannot start, pause or finish sessions, or mark a block done or skipped. Only the user does this, in Focus Guide.
- A missed block is a gap in the plan, not a failure. Plan it again at a better time, or make it smaller.
- A planned action that is skipped is not a failure. Offer the smaller version.
- The values describe records. An association is not a cause.

## Output

A table with these columns: time, goal, roadmap step or task, activity, minutes, smaller version. After the table, give the total planned minutes, one sentence about the reason for the order, and what you saved in the calendar (commitments created, or a proposal to apply).
