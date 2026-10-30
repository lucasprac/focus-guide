# Repository Guidelines

## Objective
Focus Guide records focus sessions, goals, tasks and behaviour, and turns these records into guidance for the user. The app is not only a local tool. It has three objectives:

1. **Integrate with AI agents.** An agent reads the user's records through the MCP server (`src/mcp/`). The agent helps to plan, review and adjust goals, tasks and focus sessions.
2. **Recognize patterns in the user's development.** The app and the agent analyse four areas together:
   - **Focus:** when, how long and how well the user focuses, and what interrupts the focus.
   - **Goals:** progress against the roadmap, the plan and the review, and which goals advance or stall.
   - **Workflow:** how the user plans, starts, splits and completes tasks and sessions, and how the plan compares to the recorded time.
   - **Behaviour:** activity measures, attention check-ins and reflection answers, and how they relate to focus and goal progress.
3. **Give clear orientation.** Tell the user which behaviours to keep or change to get more focus time and reach more goals. Show the evidence for each pattern.

Rules for this objective:

- The personal records stay in the local SQLite database. The agent gets data only through the bridge tools in `src/shared/agent-tools.ts`.
- The user controls agent access (`off`, `read`, `propose`, `edit`). The rules in "Invariants to preserve" in `CLAUDE.md` apply to every agent feature.
- If the agent uses a cloud model, the data that the agent reads can leave the computer. The documentation and the settings must tell the user about this.

## Project Structure
Focus Guide uses Electron, React, TypeScript, and SQLite.

- `Aplicativo/`: the packaged app the user runs. Generated; never edit it as source.
- `Arquivos/`: the only source root.
  - `src/main/`: desktop lifecycle, authoritative timer, persistence, backups, and optional activity collection.
  - `src/preload/` and `src/shared/`: restricted IPC bridge, types, validation, and analytics.
  - `src/renderer/src/`: React pages, shared controls, styles, and `assets/`.
  - `src/mcp/`: stdio MCP server for a local AI agent; it relays tool calls to the app over a named pipe.
  - `native/`: Windows C++ activity helper (`bin/` holds the compiled helper).
  - `scripts/`: helper build script and the software-rendering launcher.
  - `build/`: app icon and third-party notices copied into packages.
- `Docs/`: user and architecture documentation. Start with `Docs/ARCHITECTURE.md` and `Docs/DEVELOPMENT.md`.

Generated `Arquivos/out/` and `Arquivos/dist/` are build outputs. Do not add legacy snapshots, test suites, or reports to the workspace.

## Build and Development Commands
Run from `Arquivos/` in PowerShell with Node.js 22+, npm, and Windows x64. Helper builds require MinGW C++; configure `FOCUS_GUIDE_CXX`.

| Command | Purpose |
|---|---|
| `npm.cmd ci` | Install pinned dependencies and rebuild native modules. |
| `npm.cmd run dev` | Start Electron development mode. |
| `npm.cmd run preview` | Serve the isolated synthetic browser demo. |
| `npm.cmd run typecheck` | Check strict TypeScript without emitting files. |
| `npm.cmd run build` | Compile the helper and application. |
| `npm.cmd run package` | Package to `Arquivos/dist/win-unpacked`; copy it over `Aplicativo/` after the app is fully quit. |

## Coding Style
Use two-space indentation, single quotes, and semicolons; camelCase for functions/variables and PascalCase for components/types. Keep scripts in CommonJS `.cjs`. Reuse shared validation and `ui.tsx` controls. No formatter or linter is configured; run typechecking.
For every code change, increment the project version following Semantic Versioning (MAJOR.MINOR.PATCH) in the corresponding configuration file.

## Commits
Prefer imperative messages, such as `Fix timer recovery after suspend`.

## Architecture and Safety
Keep timing authoritative in the main process, IPC validated, renderers sandboxed, and personal data separate from previews. Before migrations, security changes, large refactors, or live-data operations, present a Red Team check: failure modes, assumptions, safer alternatives, validation, and rollback.
