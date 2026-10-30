# Contributing to Focus Guide

Thank you for your interest in Focus Guide. This page tells you how to set up the project, which rules every change must keep, and how to send a change.

## Set up

1. Install Windows x64, Node.js 22 or later and npm.
2. Clone the repository and open a terminal in `Arquivos/`. It is the only source root.
3. Run `npm.cmd ci`.
4. Run `npm.cmd run preview` and open `http://127.0.0.1:4173/?preview=1`, or run `npm.cmd run dev` to start the full Electron app.

[Development](Docs/DEVELOPMENT.md) gives the full prerequisites, including the optional MinGW compiler for the activity helper and the optional Rust toolchain for the statistics module.

## Before you change code

Read [Architecture](Docs/ARCHITECTURE.md) and the "Invariants to preserve" section of [CLAUDE.md](CLAUDE.md). These rules apply to every change:

- Only the main process measures time. The renderer never decides a recorded duration.
- Commands go through the serialized command queue. There is at most one current session or break.
- A restore replaces data. It never merges. It is validated and previewed first and keeps a rollback snapshot.
- Runtime-only fields, such as `AppState.graphicsMode`, never go into settings, datasets or backups.
- The browser preview never reads the personal SQLite database.
- An AI agent never changes records below the `edit` access level. At `edit`, each change is audited in the same transaction and can be undone.

A new user action usually touches, in this order: the command types in `src/shared/types.ts`, validation in `src/shared/*validation.ts`, the handler in `service.ts` or `goal-service.ts`, persistence in `store.ts`, the backup format in `backup.ts`, and then the renderer page.

## Code style

- Two-space indentation, single quotes and semicolons.
- camelCase for functions and variables. PascalCase for components and types.
- Build scripts are CommonJS (`.cjs`).
- Reuse the shared validation and the controls in `src/renderer/src/ui.tsx`.
- Use the design tokens in `tokens.css` and `app.css` for colours, radii and type sizes. Do not add raw values. [Visual design](Docs/VISUAL-DESIGN.md) lists the tokens.
- Put every new user-facing text in `t(...)` and add its Brazilian Portuguese translation to `src/shared/locales/pt-BR.ts`.

## Check your change

The project has no test suite, linter or formatter. The verification gate is the type check:

```powershell
npm.cmd run typecheck
```

The type check also fails on unused variables, parameters and imports. For a visible change, check it in the browser preview in the light theme and in the dark theme. Never use your personal data folder for tests. To test with a copy of a database, set `FOCUS_GUIDE_TEST_MODE=1` and `FOCUS_GUIDE_DATA_DIR=<folder>`.

## Send a change

1. Create a branch from `main`.
2. Increase the version in `Arquivos/package.json` by Semantic Versioning (MAJOR.MINOR.PATCH).
3. Update the related document in `Docs/` and add an entry to [Release notes](Docs/RELEASE-NOTES.md) when behaviour, schema or the backup format changes.
4. Write commit messages in the imperative mood, for example `Fix timer recovery after suspend`.
5. Open a pull request. Describe what changed, why, and how you checked it.

A change to a migration, to security or to live data needs a short risk review in the pull request: failure modes, assumptions, safer alternatives, validation and rollback.
