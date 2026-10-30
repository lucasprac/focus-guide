---
name: weekly-review
description: Reviews one week of the user's Focus Guide goals from the records (recorded time, action check-ins, roadmap progress, barriers, reflections) and saves one small adjustment per goal. Use when the user asks for a weekly review, "how was my week", "review my goals", "revisão semanal", "como foi minha semana", or at the end of a week.
---

# Weekly review

Answer in the language of the user.

## Steps

1. Call `get_overview`. Note `today`, `access` and the active goals. The week starts on Monday: use the Monday of `today`, or the Monday that the user names.
2. Select the goals. If the user names a goal, use only that goal. Otherwise use the active goals, at most 5, with the most `recordedMinutesLast28Days` first.
3. For each goal, call:
   - `get_weekly_review` with `goalId` and `week`.
   - `list_sessions` with `goalId`, `from` = the Monday, `to` = the Sunday.
   - `get_goal`, to see the roadmap steps and the open proposals. Do not propose a change that an open proposal already contains.
4. For each goal, describe what the records show:
   - Recorded minutes this week.
   - Action check-ins: done, smaller, skipped and unrecorded. An unrecorded check-in is unknown, not a failure.
   - Roadmap progress: steps done of the total, and which steps got time.
   - `barrierSuggestions` and the barriers in the check-ins.
   - Themes in the reflection notes and parked thoughts. Summarize them. Do not copy long personal notes.
5. Compare with `previousWeekAdjustment`. Tell the user if the records show that the adjustment happened. If the records cannot show it, say so.
6. Write one adjustment for each goal for the next week. It must be small, concrete and possible to check in Focus Guide. Examples: "Do the smaller version on Tuesday", "Link each session to a roadmap step".
7. Show the adjustments to the user. Ask the user to accept or change the text before you save it.
8. Save each accepted adjustment:
   - Access `edit`: `add_review_note` with a `rationale` that names the records you read.
   - Access `propose`: `propose_review_note` with a `summary` and a `rationale`. Tell the user to apply it in Focus Guide.
   - Access `read`: do not save. Give the text, so that the user can type it in **Plan & review**.

## Rules

- The values describe records. They are not scores of attention or productivity.
- An association is not a cause. One week is a small sample: say "this week" and do not generalize.
- A `null` value is unknown, not zero.
- Never delete, mark a goal achieved or archived, or tick a roadmap step. Only the user does these things.

## Output

For each goal: a short heading, 3 to 6 bullets with numbers, then "Adjustment for next week:" and the text. End with what you saved, or what the user must do in Focus Guide.
