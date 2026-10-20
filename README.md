# Focus Guide

Offline Windows app (Electron, React, TypeScript, SQLite) for planning focus sessions, recording focus time and exploring a private personal dataset. Version **1.5.0**.

| Folder | Contents |
|---|---|
| [`Aplicativo/`](Aplicativo/) | The packaged app. Open **Focus Guide.lnk** or `Aplicativo/FocusGuide.exe`. Keep the whole folder together. |
| [`Arquivos/`](Arquivos/) | Source code, build configuration, icon and the native Windows activity helper. |
| [`Docs/`](Docs/) | User guide, architecture, data dictionary, goal planning, visual design, development and release notes. |

A clone of the repository does not include the packaged app. `Docs/DEVELOPMENT.md` explains how to build it from `Arquivos/`.

Personal data lives separately in `%APPDATA%\Focus Guide` (database, daily backups and pre-migration snapshots). Replacing or moving `Aplicativo/` never touches it.

For graphics trouble, fully quit through the tray icon and run `Aplicativo/Start-Software-Rendering.cmd`.

Start with the [user guide](Docs/USER-GUIDE.md). To build or change the app, see [development](Docs/DEVELOPMENT.md).
