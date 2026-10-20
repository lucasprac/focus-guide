# Focus Guide — source

Source for the Focus Guide desktop app. The packaged app is in [`../Aplicativo`](../Aplicativo) and documentation in [`../Docs`](../Docs).

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run dev
npm.cmd run package   # output: dist/win-unpacked
```

See [development](../Docs/DEVELOPMENT.md) for prerequisites, the browser preview and how to update `Aplicativo/`.
