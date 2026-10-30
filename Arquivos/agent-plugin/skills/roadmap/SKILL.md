---
name: roadmap
description: Creates a Focus Guide goal with a roadmap, or adjusts the roadmap of an existing goal (splits large steps, adds estimates, reorders stages) without losing the links to tasks and sessions. Use when the user wants to learn something new, plan a goal, "make a roadmap", "this step is too big", "adjust my plan", "criar roadmap", "planejar uma meta", or "dividir uma etapa".
---

# Create or adjust a roadmap

Answer in the language of the user.

## Roadmap Markdown

One row per line:

- `# Stage` is a stage heading.
- `- [ ] Step` is a step to check off. Only these rows count as steps.
- `- note` is a bullet.
- A plain line is text.

Each step must have a result that the user can confirm, for example "Solve the 20 exercises of chapter 3". Do not write "Study chapter 3".

## A new goal

1. Call `get_overview`. Find the area that fits. Check if a similar goal exists. If it exists, ask the user if you must adjust that goal instead.
2. Ask the questions that you need, in one message: the outcome, the reason, the current level, the hours for each week, the deadline and the materials.
3. Write the roadmap in 2 to 6 stages, with concrete steps. Make the first step small, so that the user can start today.
4. Write 1 or 2 weekly actions, each with a cue, a normal version and a smaller version.
5. Show the goal, the roadmap and the actions to the user. Change them until the user agrees.
6. Save:
   - Access `edit`: `create_goal` with a `rationale`. Use the status `draft` unless the user asks for `active`. An active goal needs an outcome.
   - Access `propose`: `propose_goal` with a `summary` and a `rationale`. Tell the user to apply it on the Goals page.
   - Access `read`: give the Markdown so that the user can paste it in the roadmap editor.

## Adjust an existing roadmap

1. Call `get_goal`. Keep `roadmapMarkdown`, `roadmapRevision` and, for each step, `recordedMinutes` and `estimatedMinutes`.
2. Find the problems:
   - A step that is not complete and has `recordedMinutes` more than 1.5 times `estimatedMinutes`: it is too large. Split it.
   - A step without an estimate.
   - A step without recorded time in the last 4 weeks, while later steps got time: the order is wrong or the step is blocked.
3. Write the new Markdown from `roadmapMarkdown`:
   - Keep the exact title of each row that you do not change. A row with the same title keeps its links to tasks and sessions.
   - Keep each completed step as it is.
   - A row that you leave out is archived.
   - To rename one step and keep its links, do not change its title in the Markdown. Use `update_step` (access `edit`) after the roadmap change.
4. Show the user the rows that you add, change and remove. Get agreement first.
5. Save:
   - Access `edit`: `update_roadmap` with `revision` = the `roadmapRevision` from step 1, and a `rationale`. If the tool refuses a stale revision, call `get_goal` again and repeat from step 3. Then use `update_step` for estimates, target dates, notes and resources.
   - Access `propose`: `propose_roadmap` with a `summary` and a `rationale`. Put the estimates that you suggest in the rationale.
   - Access `read`: give the Markdown only.
6. To add tasks for a step, use `create_tasks` (access `edit`) or `propose_tasks` (access `propose`), with `step` set to the exact title of the step.

## Rules

- Never tick a step, mark a goal achieved or archived, or delete anything. Only the user does these things.
- Do not guess a `roadmapRevision`. Use the value from the last `get_goal` call.
