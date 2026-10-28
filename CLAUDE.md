# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Quick facts

- **Focus Guide** is an offline Windows desktop app (Electron + React 19 + TypeScript + better-sqlite3), version in `Arquivos/package.json`.
- `Arquivos/` is the only source root; run every npm command from there. `Aplicativo/` is a packaged build and must never be edited.
- Use `npm.cmd` (not `npm`) in PowerShell. There is no test suite, linter, or formatter: `npm.cmd run typecheck` is the verification gate.
- `npm.cmd run build` first compiles `native/activity-helper.cpp` via `scripts/build-helper.cjs` (needs MinGW `g++`, default `C:\msys64\ucrt64\bin\g++.exe`, override with `FOCUS_GUIDE_CXX`), then the Rust statistics kernels in `native/stats/` via `scripts/build-stats.cjs` (WebAssembly embedded in the committed `src/shared/stats-wasm.ts`; Rust with the `wasm32-unknown-unknown` target is needed only when the crate changes), then runs `electron-vite build` into `out/`.
- To exercise the UI without touching personal data, use the browser preview: `npm.cmd run preview`, then `http://127.0.0.1:4173/?preview=1` (also the `focus-guide-preview` entry in `.claude/launch.json`). It runs the real `TimerEngine`/`FocusService`/`GoalService` against synthetic localStorage; native features (tray, windows, dialogs, activity helper) only work in `npm.cmd run dev`.
- Real user data lives in `%APPDATA%\Focus Guide` and is never part of the repo. For inspecting a database copy, `FOCUS_GUIDE_TEST_MODE=1` plus `FOCUS_GUIDE_DATA_DIR=<folder>` redirects the data directory (see `Docs/ARCHITECTURE.md`).

## Architecture

Three processes with a strict boundary, plus an optional MCP server process:

1. **Main** (`src/main/`) owns everything authoritative.
   - `index.ts`: windows (main + transparent floating timer), tray, power events, local protocol, IPC sender checks.
   - `coordination.ts`: `CommandQueue` serializes all mutations; `TransitionCoordinator` drains activity collection, checkpoints the timer, commits, then reconciles. File dialogs are prepared *outside* the queue and only the commit runs inside it.
   - `timer.ts`: monotonic-clock session engine (countdown, stopwatch, overtime, breaks, recovery). Recorded `activeMs` always equals the sum of durable active intervals.
   - `service.ts` (`FocusService`) and `goal-service.ts` (`GoalService`): validated commands and business rules.
   - `store.ts`: prepared SQLite statements, schema version (`user_version`) and migrations. Every migration takes a `VACUUM INTO` snapshot first and runs in one transaction.
   - `backup.ts`: versioned JSON backup/restore validation, atomic file publication, CSV export, daily SQLite + JSON backups.
   - `behaviour.ts`: optional keyboard/mouse aggregates from the native helper, tied to authoritative active time.
   - `insights.ts` and `insights-worker.ts`: `insights.read` takes its snapshot inside the queue (`FocusService.insightsJob`) and computes on a worker thread outside it.
   - `probes.ts`: runtime scheduler for the optional attention check-ins (`ProbeScheduler`), driven by authoritative active time.
   - `agent-service.ts` and `agent-bridge.ts`: local AI agent support. The bridge listens on a Windows named pipe only while `settings.agentAccess` is not `off`, checks a per-start token and accepts only the tools in `src/shared/agent-tools.ts`. At `read` and `propose` the agent only reads or saves proposals (the user applies them with `agent.proposal.apply`). At `edit`, `agent-edits.ts` (`AgentEditor`) applies changes through the normal commands and writes an `agentChanges` audit record in the same transaction; `agent.change.undo` reverts one.
2. **Preload** (`src/preload/index.ts`): exposes only `window.focusGuide` with `getState`, `command(name, input)`, `onEvent`. Over IPC that is `focus-guide:state`, `focus-guide:command`, `focus-guide:event`.
3. **Renderer** (`src/renderer/src/`): sandboxed React UI. `App.tsx` routes the pages (Goals, Focus, Tasks, Calendar, Patterns, World, Settings) and the floating timer. Goals opens `GoalWorkspace.tsx` for one goal (overview, roadmap, tasks, behaviour, plan & review); fields are shown as "areas". Shared Radix-based controls are in `ui.tsx`, shared visuals/formatting in `components.tsx`, Three.js scenes in `ThreeScene.tsx`/`NeuralVisual.tsx` with an SVG fallback, and the 2D Neural World canvas in `WorldCanvas.ts`. `preview.ts` is the dev-only browser adapter and is tree-shaken from production.
4. **MCP server** (`src/mcp/server.ts`): stdio server bundled by `scripts/build-mcp.cjs` and run as `FocusGuide.exe` with `ELECTRON_RUN_AS_NODE=1`. It never opens the database; it relays tool calls to the bridge.

`src/shared/` is imported by all three: `types.ts` (dataset, `AppState`, command names, events), `validation.ts` / `goal-validation.ts` (input validation used by main), `analytics.ts` (local-date splits, Spearman correlation), `goal-planning.ts` (occurrence projection), `focus-insights.ts` (personal insight engine and its thresholds), `insight-stats.ts` (statistics for that engine; its matrix kernels are Rust in `native/stats/`, loaded by `loadStats()`, and must keep bit-identical results with the TypeScript they replaced), `demo.ts` (synthetic data), `achievements.ts` (achievements derived from records, and the palette unlock rules).

### Adding or changing a feature

A new user action usually touches, in order: the command name and payload types in `src/shared/types.ts`, validation in `src/shared/*validation.ts`, the handler in `service.ts` or `goal-service.ts`, persistence in `store.ts` (schema bump and migration if the shape changes), backup format in `backup.ts` if the data must survive export/restore, then the renderer page calling `window.focusGuide.command(...)`. The preview adapter reuses the same services, so it usually needs no separate change.

### Invariants to preserve

- Only the main process measures time. Renderer frames, visibility, or animation never decide recorded duration.
- Commands are serialized; there is at most one current session or break.
- A failed checkpoint freezes the timer at the last durable total; recovery after restart stays paused.
- Restore replaces data (never merges), is validated and previewed first, and keeps a rollback snapshot.
- Runtime-only fields such as `AppState.graphicsMode` must not reach persisted settings, datasets, or backups.
- The preview must never read the personal SQLite database.
- AI agent writes: below `edit`, an agent never changes records directly. At `edit`, every change is audited in `agentChanges` in the same transaction and can be undone. An agent never deletes, marks a goal achieved or archived, or ticks a roadmap step. Roadmap writes (agent and editor) carry a revision, and a stale one fails. Agent access is `off` after migration and restore.

## Docs to consult

`Docs/ARCHITECTURE.md` (invariants, per-release design notes), `Docs/DEVELOPMENT.md` (setup, packaging and updating `Aplicativo/`), `Docs/DATA-DICTIONARY.md` (tables and fields), `Docs/GOAL-PLANNING.md` (goal lifecycle semantics), `Docs/VISUAL-DESIGN.md` (rendering budgets). Update the relevant doc and `Docs/RELEASE-NOTES.md` when behaviour, schema, or backup format changes.
