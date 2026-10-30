---
name: plan-day
description: Plans the focus sessions of today from the user's Focus Guide records (planned weekly actions, open tasks, next roadmap steps and the hours with the best recorded focus). Use when the user asks to plan the day, "what should I work on today", "plan my sessions", "planejar o dia", "o que fazer hoje", or at the start of a work day.
---

# Plan the day

Answer in the language of the user.

## Steps

1. Call `get_overview`. Note `today`, `access`, `todaysActions` (with `status`, `normal` and `smaller`) and the active goals.
2. Select at most 5 active goals: goals with a planned action today first, then goals with a near deadline, then goals with the most `recordedMinutesLast28Days`.
3. For each selected goal, call `get_goal`. Note:
   - Open tasks that are due today or earlier, and tasks with high priority.
   - The first roadmap step that is not complete.
4. Call `get_focus_insights` for the last 28 days. Note the hours with the most recorded focus and the median time to the first drift. If the data is not sufficient, use sessions of 25 to 50 minutes and tell the user that the plan uses a default.
5. If you do not know the free time of the user today, ask one question: which time windows are free, and what is the energy level.
6. Make the plan:
   - Put the most difficult work in the hours with the best recorded focus.
   - Make each session a little shorter than the median time to the first drift. Put a break after each session.
   - Give each planned action its normal version. Give the smaller version as the plan for a difficult day.
   - Do not plan more time than the user has free.
7. Show the plan. Tell the user how to start each session in Focus Guide: on the Focus page, choose the goal and the roadmap step, and write the intention.
8. If the plan needs new one-off tasks and the user agrees, save them. With access `edit`, use `create_tasks`. With access `propose`, use `propose_tasks`. Set `step` to the exact title of the roadmap step. Do not make other changes.

## Rules

- You cannot start, pause or finish sessions. Only the user does this, in Focus Guide.
- A planned action that is skipped is not a failure. Offer the smaller version.
- The values describe records. An association is not a cause.

## Output

A table with these columns: time, goal, roadmap step or task, activity, minutes, smaller version. After the table, give the total planned minutes and one sentence about the reason for the order.
