# Repository Guidelines

## Objective
Create a local app that helps to focus and create data behaviour. The goal is to provide better orientation for the user about which behaviours they should follow to accomplish more focus time and goals.

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

## Commits
Prefer imperative messages, such as `Fix timer recovery after suspend`.

## Architecture and Safety
Keep timing authoritative in the main process, IPC validated, renderers sandboxed, and personal data separate from previews. Before migrations, security changes, large refactors, or live-data operations, present a Red Team check: failure modes, assumptions, safer alternatives, validation, and rollback.
