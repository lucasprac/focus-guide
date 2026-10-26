# Development

`Arquivos/` is the only source root. `Aplicativo/` contains the packaged app. Do not edit `Aplicativo/` as source.

| Area | Entry points and responsibility |
|---|---|
| Desktop lifecycle | `src/main/index.ts`, `coordination.ts`: windows, IPC and serialized native operations |
| Domain and persistence | `src/main/service.ts`, `timer.ts`, `store.ts`, `backup.ts`, `behaviour.ts`, `goal-service.ts`, `agent-service.ts`, `agent-edits.ts` |
| Local AI agent | `src/main/agent-bridge.ts` (named pipe), `src/mcp/server.ts` (stdio MCP server), `src/shared/agent-tools.ts`. `scripts/build-mcp.cjs` bundles the server to `out/mcp/`. |
| Process boundary | `src/preload/index.ts`: restricted bridge |
| Shared contracts | `src/shared/types.ts`, `validation.ts`, `analytics.ts`, goal planning, timer and brain display helpers |
| Renderer | `src/renderer/src/App.tsx`, page components, `ui.tsx`, `components.tsx`, `app.css` |
| Neural visuals | `NeuralVisual.tsx`, `ThreeScene.tsx`, `Constellation.tsx`, `styles.css`: bounded local scenes with SVG fallback |
| Browser preview | `preview.vite.config.ts`, `src/renderer/src/preview.ts`: synthetic adapter |
| Windows helper | `native/activity-helper.cpp`. `scripts/build-helper.cjs` compiles it to `native/bin/`. |
| Packaging assets | `build/icon.ico`, `build/THIRD-PARTY-NOTICES.txt`, `scripts/Start-Software-Rendering.cmd` |

## Prerequisites

- Node.js 22 or later. The current build uses 22.14.0.
- npm.
- Windows x64.
- Internet access for the first install. The install downloads the dependencies and Electron.
- MinGW C++ to build the helper. The default compiler is `C:\msys64\ucrt64\bin\g++.exe`. To use a different compiler, set `FOCUS_GUIDE_CXX`.

If Electron reports that it is not installed correctly, run `node node_modules/electron/install.js`.

## Commands

Run these commands from `Arquivos/`:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run dev
npm.cmd run build
npm.cmd run package
```

`npm.cmd run build` also runs `npm.cmd run build:mcp`. That step bundles the MCP server, `@modelcontextprotocol/server` and `zod` into `out/mcp/focus-guide-mcp.cjs`. Packaging copies the file to `resources/mcp/`. These two packages are development dependencies because the bundle contains them.

## Test the MCP server

Use a test data folder, never the personal one.

1. Run `npm.cmd run build`.
2. Start the app with `FOCUS_GUIDE_TEST_MODE=1` and `FOCUS_GUIDE_DATA_DIR=<test folder>`. Set **Settings > AI agent** to the access level that you test.
3. Start the server as a client does: `node_modules\electron\dist\electron.exe out\mcp\focus-guide-mcp.cjs`, with `ELECTRON_RUN_AS_NODE=1` and the same `FOCUS_GUIDE_DATA_DIR`.
4. Send MCP JSON-RPC messages on standard input (`initialize`, `tools/list`, `tools/call`).

The server finds the app through `agent-bridge.json` in the data folder. Without the file, or with the app closed, each tool returns an error that tells the user to open Focus Guide.

## Update the app

`npm.cmd run package` writes the package to `Arquivos/dist/win-unpacked`. It never overwrites the running app. To install the package:

1. On the tray icon, select **Quit (save and pause)**. If you only close the window, the app continues to run hidden.
2. Replace the contents of `Aplicativo/` with the contents of `Arquivos/dist/win-unpacked`.
3. Open **Focus Guide.lnk**.
4. Resume a paused session manually, if one exists.

A schema upgrade saves a snapshot of the database before the migration. The snapshot goes to `%APPDATA%\Focus Guide\backups`. To go back to an older app version, you need the snapshot that matches that version. Keep a separate copy of the records that you made after the upgrade.

## Browser preview

1. Run `npm.cmd run preview`.
2. Open `http://127.0.0.1:4173/?preview=1`.

The preview adapter is for development only. It uses the production `TimerEngine` and `FocusService` with synthetic browser storage. It never connects to the personal SQLite database. The packaged renderer does not contain it. Native windows, the tray, system pauses and file dialogs operate only in the Windows app.

## Notes

- All dependency versions and the lockfile are pinned.
- Vite bundles the runtime React, Anime.js and Three.js code. Three.js loads as a separate local chunk.
- `better-sqlite3` is the only production dependency that Vite does not bundle.
- The MCP server runs inside `FocusGuide.exe` with `ELECTRON_RUN_AS_NODE=1`. Do not disable the `RunAsNode` Electron fuse, or the client configuration stops working.
- The app needs no CDN and no downloaded model.
- `AppState.graphicsMode` and `AppState.agent` are runtime-only fields. They must not go into persisted settings, datasets or backups.

For rendering budgets, see [Visual design](VISUAL-DESIGN.md). For timer and data invariants, see [Architecture](ARCHITECTURE.md).
