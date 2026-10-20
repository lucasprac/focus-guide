# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Quick facts

- **Focus Guide** is an offline Windows desktop app (Electron + React 19 + TypeScript + better-sqlite3), version in `Arquivos/package.json`.
- `Arquivos/` is the only source root; run every npm command from there. `Aplicativo/` is a packaged build and must never be edited.
- Use `npm.cmd` (not `npm`) in PowerShell. There is no test suite, linter, or formatter: `npm.cmd run typecheck` is the verification gate.
- `npm.cmd run build` first compiles `native/activity-helper.cpp` via `scripts/build-helper.cjs` (needs MinGW `g++`, default `C:\msys64\ucrt64\bin\g++.exe`, override with `FOCUS_GUIDE_CXX`), then runs `electron-vite build` into `out/`.
- To exercise the UI without touching personal data, use the browser preview: `npm.cmd run preview`, then `http://127.0.0.1:4173/?preview=1` (also the `focus-guide-preview` entry in `.claude/launch.json`). It runs the real `TimerEngine`/`FocusService`/`GoalService` against synthetic localStorage; native features (tray, windows, dialogs, activity helper) only work in `npm.cmd run dev`.
- Real user data lives in `%APPDATA%\Focus Guide` and is never part of the repo. For inspecting a database copy, `FOCUS_GUIDE_TEST_MODE=1` plus `FOCUS_GUIDE_DATA_DIR=<folder>` redirects the data directory (see `Docs/ARCHITECTURE.md`).

## Architecture

Three processes with a strict boundary:

1. **Main** (`src/main/`) owns everything authoritative.
   - `index.ts`: windows (main + transparent floating timer), tray, power events, local protocol, IPC sender checks.
   - `coordination.ts`: `CommandQueue` serializes all mutations; `TransitionCoordinator` drains activity collection, checkpoints the timer, commits, then reconciles. File dialogs are prepared *outside* the queue and only the commit runs inside it.
   - `timer.ts`: monotonic-clock session engine (countdown, stopwatch, overtime, breaks, recovery). Recorded `activeMs` always equals the sum of durable active intervals.
   - `service.ts` (`FocusService`) and `goal-service.ts` (`GoalService`): validated commands and business rules.
   - `store.ts`: prepared SQLite statements, schema version (`user_version`) and migrations. Every migration takes a `VACUUM INTO` snapshot first and runs in one transaction.
   - `backup.ts`: versioned JSON backup/restore validation, atomic file publication, CSV export, daily SQLite + JSON backups.
   - `behaviour.ts`: optional keyboard/mouse aggregates from the native helper, tied to authoritative active time.
2. **Preload** (`src/preload/index.ts`): exposes only `window.focusGuide` with `getState`, `command(name, input)`, `onEvent`. Over IPC that is `focus-guide:state`, `focus-guide:command`, `focus-guide:event`.
3. **Renderer** (`src/renderer/src/`): sandboxed React UI. `App.tsx` routes the pages (Focus, Goals, Tasks, Calendar, Patterns, World, Settings) and the floating timer. Shared Radix-based controls are in `ui.tsx`, shared visuals/formatting in `components.tsx`, Three.js scenes in `ThreeScene.tsx`/`NeuralVisual.tsx` with an SVG fallback. `preview.ts` is the dev-only browser adapter and is tree-shaken from production.

`src/shared/` is imported by all three: `types.ts` (dataset, `AppState`, command names, events), `validation.ts` / `goal-validation.ts` (input validation used by main), `analytics.ts` (local-date splits, Spearman correlation), `goal-planning.ts` (occurrence projection), `demo.ts` (synthetic data).

### Adding or changing a feature

A new user action usually touches, in order: the command name and payload types in `src/shared/types.ts`, validation in `src/shared/*validation.ts`, the handler in `service.ts` or `goal-service.ts`, persistence in `store.ts` (schema bump and migration if the shape changes), backup format in `backup.ts` if the data must survive export/restore, then the renderer page calling `window.focusGuide.command(...)`. The preview adapter reuses the same services, so it usually needs no separate change.

### Invariants to preserve

- Only the main process measures time. Renderer frames, visibility, or animation never decide recorded duration.
- Commands are serialized; there is at most one current session or break.
- A failed checkpoint freezes the timer at the last durable total; recovery after restart stays paused.
- Restore replaces data (never merges), is validated and previewed first, and keeps a rollback snapshot.
- Runtime-only fields such as `AppState.graphicsMode` must not reach persisted settings, datasets, or backups.
- The preview must never read the personal SQLite database.

## Docs to consult

`Docs/ARCHITECTURE.md` (invariants, per-release design notes), `Docs/DEVELOPMENT.md` (setup, packaging and updating `Aplicativo/`), `Docs/DATA-DICTIONARY.md` (tables and fields), `Docs/GOAL-PLANNING.md` (goal lifecycle semantics), `Docs/VISUAL-DESIGN.md` (rendering budgets). Update the relevant doc and `Docs/RELEASE-NOTES.md` when behaviour, schema, or backup format changes.
