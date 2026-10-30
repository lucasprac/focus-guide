# Security policy

## Supported versions

Only the latest release of Focus Guide gets security fixes.

## Report a vulnerability

Do not open a public issue for a security problem. Use [GitHub private vulnerability reporting](https://github.com/lucasprac/focus-guide/security/advisories/new) for this repository.

Include these items in your report:

- The affected version.
- The steps to reproduce the problem.
- The effect, for example access to records or a change to data without permission.

## Security model

Focus Guide is a local desktop app. These are the main protections:

- **Records.** All records stay in a local SQLite database in `%APPDATA%\Focus Guide`. The app has no network service and sends no telemetry.
- **Renderer.** The renderer runs sandboxed with context isolation and a strict Content Security Policy. It has no Node.js access. The preload script exposes only `getState`, `command` and `onEvent`, and the main process validates every command and checks its sender.
- **AI agent bridge.** The bridge listens on a Windows named pipe only while agent access is not `off`. It checks a token that changes at each start and accepts only the tools in `src/shared/agent-tools.ts`. Agent access is `off` after a migration and after a restore.
- **Agent edits.** Below the `edit` level, an agent only reads or saves proposals. At `edit`, every change is audited in the same transaction and can be undone. An agent can never delete records, mark a goal achieved or archived, or tick a roadmap step.

If you connect an agent that uses a cloud model, the data that the agent reads goes to that model provider. This is expected behaviour, not a vulnerability.
