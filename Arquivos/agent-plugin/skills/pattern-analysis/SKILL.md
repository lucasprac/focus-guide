---
name: pattern-analysis
description: Finds patterns in the user's Focus Guide records in four areas (focus, goals, workflow, behaviour) and tells the user which behaviours to keep or change, with the evidence for each pattern. Use when the user asks about patterns, habits, "when do I focus best", "why do my goals stall", "analyse my data", "padrões", "análise do meu foco", or "o que devo mudar".
---

# Pattern analysis

Answer in the language of the user.

## Inputs

- Range: the last 90 days, or the range that the user names.
- Scope: all records, one area (`fieldId`) or one goal (`goalId`). Find the identifiers with `get_overview`.

## Steps

1. Call `get_overview`. Note `access`, the areas and the goals.
2. Call `get_focus_insights` with the range and the scope. Read the data quality first. If the data is not sufficient, tell the user how many more sessions or check-ins Focus Guide needs, and give only a description of the records.
3. Call `list_sessions` for the same range, with `limit` 200 (and `goalId` if the scope is one goal).
4. For each goal in the scope (at most 5 active goals), call `get_goal` and `get_goal_behaviour` for the same range.
5. Look for patterns in the four areas:
   - **Focus:** the hours and weekdays with the most recorded time, the attention span curves (time to the first drift, after a return), the session length that ends in a drift, and the detractors.
   - **Goals:** goals with no recorded time in 28 days, roadmap steps with `recordedMinutes` much larger than `estimatedMinutes`, steps without an estimate, and the progress against the deadline.
   - **Workflow:** planned minutes against recorded minutes, sessions without a goal or a roadmap step, sessions without an intention, and the timing modes.
   - **Behaviour:** action check-ins (done, smaller, skipped), interruptions and returns, self-ratings of focus and energy, and keyboard and mouse context.
6. Keep at most 5 patterns. Put the pattern with the strongest evidence first.
7. For each pattern, suggest one behaviour to keep or to change, and one experiment for the next 1 or 2 weeks. Tell the user how to check the result in Focus Guide (for example, the Insights tab of Patterns, or the weekly review).
8. Offer to save an experiment. With access `edit`, use `create_action` or `add_review_note`. With access `propose`, use `propose_action` or `propose_review_note`. With access `read`, give the text only. Save only after the user agrees.

## Rules

- The values describe records. They are not scores of attention or productivity. Do not give a diagnosis.
- An association is not a cause. Say "sessions after 20:00 had shorter spans", not "the evening makes you lose focus".
- Give the sample size for each comparison: the number of sessions and the days. Call evidence weak when a group has fewer than 10 sessions.
- When `model.useful` is false, do not use the focus model.
- A curve with `medianOpen` true has no upper limit for its median: say "more than".
- Use keyboard and mouse values only where the coverage is high. They are context, not attention.
- A `null` value is unknown, not zero.

## Output

For each pattern:

- **Pattern:** one sentence.
- **Evidence:** the numbers, the sample size and the range.
- **Strength:** weak, moderate or clear.
- **Keep or change:** one behaviour.
- **Experiment:** what to do, for how long, and how to check it.
