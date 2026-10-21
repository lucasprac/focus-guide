import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, Notification, powerMonitor, dialog, protocol, net } from 'electron';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Store } from './store';
import { TimerEngine } from './timer';
import { FocusService } from './service';
import { BehaviourCollector } from './behaviour';
import { CommandQueue, TransitionCoordinator } from './coordination';
import { AgentBridge } from './agent-bridge';
import { AGENT_TOOLS, isAgentTool } from '../shared/agent-tools';
import { atomicWrite, activityCSV, goalCSV, eventCSV, serializeBackup, saveDailyBackup, readBackup, sessionCSV } from './backup';
import { localDay, totalMinutes } from '../shared/analytics';
import type { AppEvent, AppState, BackupFile, Command } from '../shared/types';
import * as v from '../shared/validation';

app.setName('Focus Guide');
// Explicit compatibility mode is evaluated before Electron starts its GPU process.
const graphicsMode = process.argv.includes('--software-rendering') ? 'software' as const : 'auto' as const;
if (graphicsMode === 'software') app.disableHardwareAcceleration();
if (process.platform === 'win32') app.setAppUserModelId('local.focusguide.desktop');
protocol.registerSchemesAsPrivileged([{ scheme: 'focus', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const testing = process.env.FOCUS_GUIDE_TEST_MODE === '1';
if (testing && process.env.FOCUS_GUIDE_DATA_DIR) app.setPath('userData', resolve(process.env.FOCUS_GUIDE_DATA_DIR));
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();

let mainWindow: BrowserWindow | null = null;
let floatingWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: Store;
let timer: TimerEngine;
let service: FocusService;
let collector: BehaviourCollector;
let bridge: AgentBridge | null = null;
let quitting = false;
let quitPending = false;
let backupStatus = 'Your data stays on this computer.';
let backupPromise: Promise<void> | null = null;
const commandQueue = new CommandQueue();
let transitions: TransitionCoordinator;
let shortcutCaptureUntil = 0;
let pendingRestore: { token: string; data: BackupFile; expires: number } | null = null;
let updateInterval: NodeJS.Timeout;
let checkpointInterval: NodeJS.Timeout;
let backupInterval: NodeJS.Timeout;
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'";
const applicationIcon = join(__dirname, '../renderer/icon.png');

function notify(mode: 'focus' | 'break'): void {
  if (Notification.isSupported()) new Notification({ title: mode === 'focus' ? timer?.current?.autoOvertime ? 'Your timer ended — overtime is recording' : 'Focus session complete' : 'Your break is complete', body: mode === 'focus' ? timer?.current?.autoOvertime ? 'Extra time stays in this session. Finish when you are ready.' : 'Take a breath. Your session has been saved.' : 'Choose your next intention when you are ready.', silent: !store.getSettings().sound }).show();
}
function state(): AppState { return { ...store.all(), timer: timer.snapshot(), collector: collector?.status, agent: bridge?.status, dataPath: store.directory, backupStatus, graphicsMode }; }
function publish(event: AppEvent): void { for (const w of [mainWindow, floatingWindow]) if (w && !w.isDestroyed()) w.webContents.send('focus-guide:event', event); }
function changed(): void { if (!transitions?.busy && !transitions?.needsRecovery) collector?.reconcile(); publish({ type: 'state', state: state() }); updateTray(); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'An unexpected error occurred.'; }
function report(error: unknown): void { publish({ type: 'error', message: errorMessage(error) }); }
function safeBounds(key: string, defaults: Electron.Rectangle): Electron.Rectangle {
  const saved = store.getMeta<Electron.Rectangle>(key);
  if (!saved || ['x', 'y', 'width', 'height'].some(k => !Number.isFinite(saved[k as keyof Electron.Rectangle]))) return defaults;
  const displays = screen.getAllDisplays();
  const display = displays.find(d => saved.x < d.workArea.x + d.workArea.width && saved.x + saved.width > d.workArea.x && saved.y < d.workArea.y + d.workArea.height && saved.y + saved.height > d.workArea.y) ?? screen.getPrimaryDisplay();
  const a = display.workArea;
  const width = Math.min(key === 'mainBounds' ? Math.max(saved.width, 1050) : 132, a.width);
  const height = Math.min(key === 'mainBounds' ? Math.max(saved.height, 650) : 156, a.height);
  // Leave room for the native frame rounding on scaled Windows displays.
  const edge = key === 'mainBounds' ? 0 : 8;
  return { width, height, x: Math.max(a.x, Math.min(saved.x, a.x + a.width - width - edge)), y: Math.max(a.y, Math.min(saved.y, a.y + a.height - height - edge)) };
}
function saveBounds(w: BrowserWindow, key: string): void { if (!w.isDestroyed()) { try { store.setMeta(key, w.getNormalBounds()); } catch (e) { report(e); } } }
function loadWindow(w: BrowserWindow, mini = false): void {
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && dev) void w.loadURL(dev + (mini ? '?mini=1' : ''));
  else void w.loadURL('focus://app/index.html' + (mini ? '?mini=1' : ''));
}
function showWhenLoaded(w: BrowserWindow): void {
  const show = () => {
    if (w.isDestroyed()) return;
    w.removeListener('ready-to-show', show);
    w.webContents.removeListener('did-finish-load', show);
    w.show();
  };
  w.once('ready-to-show', show);
  // Some graphics drivers do not emit a first-paint event for hidden windows.
  w.webContents.once('did-finish-load', show);
}
function observeVisibility(w: BrowserWindow): void {
  const send = () => {
    if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
      w.webContents.send('focus-guide:event', { type: 'visibility', visible: w.isVisible() && !w.isMinimized() } satisfies AppEvent);
    }
  };
  w.on('show', send);
  w.on('hide', send);
  w.on('minimize', send);
  w.on('restore', send);
  w.webContents.on('did-finish-load', send);
}
function createMain(): void {
  const a = screen.getPrimaryDisplay().workArea;
  const defaults = { x: a.x + Math.max(0, (a.width - 1366) / 2), y: a.y + Math.max(0, (a.height - 840) / 2), width: Math.min(1366, a.width), height: Math.min(840, a.height) };
  mainWindow = new BrowserWindow({ ...safeBounds('mainBounds', defaults), minWidth: 1050, minHeight: 650, title: 'Focus Guide', icon: applicationIcon, backgroundColor: '#F8F9FD', show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
  mainWindow.setMenuBarVisibility(false);
  observeVisibility(mainWindow);
  mainWindow.on('blur', () => { shortcutCaptureUntil = 0; });
  mainWindow.on('hide', () => { shortcutCaptureUntil = 0; });
  mainWindow.webContents.on('did-start-loading', () => { shortcutCaptureUntil = 0; });
  showWhenLoaded(mainWindow);
  mainWindow.on('close', e => { saveBounds(mainWindow!, 'mainBounds'); if (!quitting) { e.preventDefault(); mainWindow!.hide(); } });
  loadWindow(mainWindow);
}
function showMain(): void { if (!mainWindow || mainWindow.isDestroyed()) createMain(); else { mainWindow.show(); if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } }
function showFloating(): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) { floatingWindow.show(); return; }
  const a = screen.getPrimaryDisplay().workArea;
  const defaults = { x: a.x + a.width - 152, y: a.y + Math.min(55, Math.max(0, a.height - 156)), width: 132, height: 156 };
  floatingWindow = new BrowserWindow({ ...safeBounds('floatBounds', defaults), minWidth: 132, minHeight: 156, maxWidth: 132, maxHeight: 156, frame: false, transparent: true, hasShadow: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, show: false, backgroundColor: '#00000000', icon: applicationIcon,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
  showWhenLoaded(floatingWindow);
  observeVisibility(floatingWindow);
  floatingWindow.on('close', e => { saveBounds(floatingWindow!, 'floatBounds'); if (!quitting) { e.preventDefault(); floatingWindow!.hide(); } });
  loadWindow(floatingWindow, true);
}
function updateTray(): void {
  if (!tray) return;
  const snapshot = timer.snapshot();
  tray.setToolTip(snapshot.mode === 'idle' ? 'Focus Guide — choose an intention' : snapshot.phase === 'stopwatch' ? `Focus Guide — ${Math.floor(snapshot.elapsedMs / 60000)} min recorded` : snapshot.phase === 'overtime' ? `Focus Guide — overtime +${Math.floor(snapshot.overtimeMs / 60000)} min` : `Focus Guide — ${Math.ceil(snapshot.remainingMs / 60000)} min remaining`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Focus Guide', click: showMain }, { label: 'Show floating timer', click: showFloating },
    { label: snapshot.running ? 'Pause timer' : 'Resume timer', enabled: snapshot.mode !== 'idle', click: () => { try { void enqueue(async () => { await transitions.run(() => { timer.snapshot().running ? timer.pause() : timer.resume(); }); changed(); }); } catch (e) { report(e); } } },
    { type: 'separator' }, { label: 'Quit (save and pause)', click: () => app.quit() }
  ]));
}
async function dailyBackup(force = false): Promise<void> {
  if (backupPromise) return backupPromise;
  const day = localDay(Date.now(), store.getSettings().timezone);
  if (!force && store.getMeta('lastBackupDay') === day) {
    const warning = store.getMeta<string>('lastBackupJsonError');
    backupStatus = warning ? `SQLite backup saved · ${day}. JSON needs attention: ${warning}` : `Daily backup saved · ${day}`;
    return;
  }
  backupPromise = (async () => {
    const directory = join(store.directory, 'backups');
    const outcome = await saveDailyBackup(store, directory, day);
    store.setMeta('lastBackupDay', day);
    store.setMeta('lastBackupJsonError', outcome.jsonError ?? null);
    if (!outcome.jsonError) store.setMeta('lastJsonBackupDay', day);
    const daily = [...new Set(readdirSync(directory).filter(name => /^daily-\d{4}-\d{2}-\d{2}\.(sqlite|json)$/.test(name)).map(name => name.slice(0, 16)))].sort().reverse();
    for (const date of daily.slice(7)) for (const extension of ['sqlite', 'json']) {
      const target = resolve(directory, `${date}.${extension}`);
      if (target.startsWith(resolve(directory) + sep) && readdirSync(directory).includes(`${date}.${extension}`)) unlinkSync(target);
    }
    backupStatus = outcome.jsonError ? `SQLite backup saved · ${day}. JSON needs attention: ${outcome.jsonError}` : `Daily backup saved · ${day}`;
  })().catch(e => { backupStatus = `Backup needs attention: ${errorMessage(e)}`; report(e); }).finally(() => { backupPromise = null; });
  await backupPromise;
}
function trustedSender(event: Electron.IpcMainInvokeEvent): void {
  if (![mainWindow, floatingWindow].some(w => w && !w.isDestroyed() && w.webContents.id === event.sender.id)) throw new Error('Unrecognized application window.');
  const url = event.senderFrame?.url ?? '';
  const dev = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : '';
  if (!(url.startsWith('focus://app/') || (dev && new URL(url).origin === new URL(dev).origin)) || event.senderFrame !== event.sender.mainFrame) throw new Error('Unrecognized application content.');
}
function enqueue(action: () => Promise<unknown>): Promise<unknown> {
  return commandQueue.run(action).catch(error => { report(error); changed(); });
}
function acknowledgeReturn(value: unknown): void {
  if (!value) return;
  const event = value as import('../shared/types').SessionEvent;
  publish({ type: 'attention-return', sessionId: event.sessionId, eventId: event.id, savedAt: event.startedAt });
}
async function prepare(command: Command): Promise<string | undefined> {
  if (quitPending) throw new Error('Focus Guide is saving and closing.');
  if (['export.sessions', 'export.events', 'export.backup', 'export.activity', 'export.goals'].includes(command)) {
    const kind = command.split('.')[1], extension = kind === 'backup' ? 'json' : 'csv';
    const name = `focus-guide-${kind}-${new Date().toISOString().slice(0, 10)}.${extension}`;
    return (await dialog.showSaveDialog(mainWindow!, { title: 'Export your focus data', defaultPath: join(app.getPath('documents'), name), filters: [{ name: extension === 'json' ? 'Focus Guide backup' : 'CSV dataset', extensions: [extension] }] })).filePath;
  }
  if (command === 'backup.preview') {
    if (timer.snapshot().mode !== 'idle') throw new Error('Finish your current session or break before restoring data.');
    return (await dialog.showOpenDialog(mainWindow!, { title: 'Choose a Focus Guide JSON backup', properties: ['openFile'], filters: [{ name: 'Focus Guide backup', extensions: ['json'] }] })).filePaths[0];
  }
}
async function handle(command: Command, input: Record<string, unknown>, selectedFile?: string): Promise<unknown> {
  if (quitPending) throw new Error('Focus Guide is saving and closing.');
  if (command === 'settings.update') {
    const next = v.settings(input), previous = store.getSettings();
    const hours = totalMinutes(store.all()) / 60;
    if (next.palette !== previous.palette && hours < ({ cyan: 0, violet: 5, amber: 20, rose: 50 }[next.palette])) throw new Error('This palette is not yet available.');
    // Registration rejection leaves collection untouched; unrelated preferences remain editable.
    if (next.returnShortcut !== previous.returnShortcut) await collector.configureShortcut(next.returnShortcut ?? 'Ctrl+Alt+Space');
    try { const value = await transitions.run(() => service.run(command, input)); bridge?.sync(); return value; }
    catch (error) { await collector.configureShortcut(previous.returnShortcut ?? 'Ctrl+Alt+Space').catch(() => {}); throw error; }
  }
  if (['session.pause', 'session.resume', 'session.finish', 'activity.delete', 'field.delete'].includes(command)) {
    return transitions.run(() => service.run(command, input));
  }
  switch (command) {
    case 'shortcut.retry': await collector.configureShortcut(store.getSettings().returnShortcut ?? 'Ctrl+Alt+Space'); return;
    case 'window.float': showFloating(); return;
    case 'window.main': showMain(); return;
    case 'window.hide': floatingWindow?.hide(); return;
    case 'backup.create': await dailyBackup(true); return backupStatus;
    case 'export.sessions': case 'export.events': case 'export.backup': case 'export.activity': case 'export.goals': {
      const filePath = selectedFile;
      if (!filePath) return;
      timer.checkpoint(); collector.flush(); const data = store.all(true);
      const kind = command.split('.')[1];
      atomicWrite(filePath, kind === 'backup' ? serializeBackup(data) : kind === 'sessions' ? sessionCSV(data) : kind === 'activity' ? activityCSV(data) : kind === 'goals' ? goalCSV(data) : eventCSV(data));
      return filePath;
    }
    case 'backup.preview': {
      if (timer.snapshot().mode !== 'idle') throw new Error('Finish your current session or break before restoring data.');
      const file = selectedFile;
      if (!file) return;
      const data = readBackup(file); const token = randomUUID(); pendingRestore = { token, data, expires: Date.now() + 300000 };
      return { token, exportedAt: data.exportedAt, sessions: data.sessions.length, fields: data.fields.length, tasks: data.tasks.length, events: data.events.length, goals: data.goals.length, goalOccurrences: data.goalOccurrences.length, goalProgress: data.goalProgress.length };
    }
    case 'backup.restore': {
      if (timer.snapshot().mode !== 'idle') throw new Error('Finish your current session or break before restoring data.');
      if (!pendingRestore || input.token !== pendingRestore.token || Date.now() > pendingRestore.expires) throw new Error('The restore preview expired. Choose the backup again.');
      const directory = join(store.directory, 'backups'); mkdirSync(directory, { recursive: true });
      await store.backup(join(directory, `before-restore-${Date.now()}.sqlite`));
      const data = pendingRestore.data; store.restore(data); pendingRestore = null; timer.recover();
      try { await collector.configureShortcut(store.getSettings().returnShortcut ?? 'Ctrl+Alt+Space'); } catch { /* Conflict stays visible in status. */ }
      bridge?.sync();
      backupStatus = 'Restored successfully. A copy of the previous database is in backups.'; return;
    }
    default: {
      const value = service.run(command, input);
      if (command === 'attention.return') { collector.flush(); acknowledgeReturn(value); }
      return value;
    }
  }
}
app.on('second-instance', showMain);
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    const dev = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : '';
    if (!(url.startsWith('focus://app/') || (dev && new URL(url).origin === new URL(dev).origin))) event.preventDefault();
  });
});
app.on('before-quit', e => {
  if (quitting) return;
  if (!timer) { quitting = true; return; }
  e.preventDefault(); if (quitPending) return; quitPending = true;
  void (async () => {
    try {
      await commandQueue.idle();
      const stopped = collector?.stop();
      timer.pause('App closed — resume when ready'); timer.endBreak();
      await stopped; collector?.flush(true); collector?.close();
      quitting = true; app.quit();
    } catch (error) { quitPending = false; showMain(); report(error); changed(); }
  })();
});
app.on('will-quit', () => { clearInterval(updateInterval); clearInterval(checkpointInterval); clearInterval(backupInterval); bridge?.stop(); tray?.destroy(); store?.close(); });
app.on('window-all-closed', () => { /* The tray owns the application lifetime. */ });

if (locked) void app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'));
  timer = new TimerEngine(store, undefined, notify);
  service = new FocusService(store, timer, () => {
    const directory = join(store.directory, 'backups');
    mkdirSync(directory, { recursive: true });
    const file = join(directory, `before-field-delete-${Date.now()}-${randomUUID()}.json`);
    atomicWrite(file, serializeBackup(store.all(true)));
    backupStatus = 'A recovery backup was saved before area deletion.';
  });
  collector = new BehaviourCollector(store, timer, app.isPackaged ? join(process.resourcesPath, 'activity-helper.exe') : resolve(__dirname, '../../native/bin/activity-helper.exe'),
    () => {
      if (shortcutCaptureUntil > Date.now() && mainWindow?.isFocused()) {
        shortcutCaptureUntil = 0;
        mainWindow.webContents.send('focus-guide:event', { type: 'shortcut-captured', shortcut: collector.status.effectiveShortcut ?? '' } satisfies AppEvent);
        return;
      }
      if (timer.snapshot().mode === 'focus' && timer.snapshot().running) void enqueue(async () => { const value = service.run('attention.return', { source: 'shortcut' }); collector.flush(); acknowledgeReturn(value); changed(); });
    },
    () => { if (mainWindow) publish({ type: 'state', state: state() }); });
  try { await collector.configureShortcut(store.getSettings().returnShortcut ?? 'Ctrl+Alt+Space'); } catch { /* Status exposes a conflict; the floating button still works. */ }
  transitions = new TransitionCoordinator(timer, collector);
  // The MCP server runs as plain Node.js inside this executable, so no separate Node.js installation is needed.
  const mcpScript = app.isPackaged ? join(process.resourcesPath, 'mcp', 'focus-guide-mcp.cjs') : resolve(__dirname, '../mcp/focus-guide-mcp.cjs');
  bridge = new AgentBridge({ directory: store.directory, access: () => store.getSettings().agentAccess ?? 'off',
    launch: { command: process.execPath, args: [mcpScript], env: { ELECTRON_RUN_AS_NODE: '1', FOCUS_GUIDE_DATA_DIR: store.directory } }, onStatus: () => { if (mainWindow) publish({ type: 'state', state: state() }); },
    call: (tool, input, source) => commandQueue.run(async () => {
      if (quitPending) throw new Error('Focus Guide is saving and closing.');
      const value = service.agentTool(tool, input, source);
      if (isAgentTool(tool) && AGENT_TOOLS[tool] !== 'read') changed();
      if (isAgentTool(tool) && AGENT_TOOLS[tool] === 'edit') publish({ type: 'notice', message: `Your AI agent: ${(value as { summary?: string }).summary ?? 'changed your goals'}. You can undo it in Goals.` });
      return value;
    }) });
  bridge.sync();
  collector.reconcile();
  const rendererRoot = resolve(__dirname, '../renderer');
  protocol.handle('focus', async request => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response('Not found', { status: 404 });
    let asset: string;
    try { asset = resolve(rendererRoot, '.' + decodeURIComponent(url.pathname)); } catch { return new Response('Invalid path', { status: 400 }); }
    const rel = relative(rendererRoot, asset);
    if (rel.startsWith('..') || isAbsolute(rel)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(asset).toString());
  });
  app.on('activate', showMain);
  createMain();
  mainWindow!.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  if (app.isPackaged || !process.env.ELECTRON_RENDERER_URL) mainWindow!.webContents.session.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } }));
  tray = new Tray(nativeImage.createFromPath(applicationIcon).resize({ width: 32, height: 32 })); tray.on('double-click', showMain); updateTray();
  const systemPause = (reason: string) => {
    try {
      // Freeze time synchronously: the OS may suspend before a queued drain runs.
      timer.pause(reason); transitions.needsRecovery = true;
      publish({ type: 'state', state: state() }); updateTray();
      void enqueue(async () => { await transitions.run(() => {}); changed(); });
    } catch (error) { report(error); }
  };
  powerMonitor.on('suspend', () => systemPause('Computer went to sleep'));
  powerMonitor.on('lock-screen', () => systemPause('Screen locked'));
  const recoverWindows = () => { for (const [w, key] of [[mainWindow, 'mainBounds'], [floatingWindow, 'floatBounds']] as const) if (w && !w.isDestroyed()) { saveBounds(w, key); w.setBounds(safeBounds(key, screen.getPrimaryDisplay().workArea)); } };
  screen.on('display-removed', recoverWindows);
  screen.on('display-metrics-changed', (_event, _display, metrics) => { if (metrics.some(metric => ['bounds', 'workArea', 'scaleFactor'].includes(metric))) recoverWindows(); });
  ipcMain.handle('focus-guide:state', event => { trustedSender(event); return state(); });
  ipcMain.handle('focus-guide:command', async (event, command, input) => {
    try {
      trustedSender(event); const args = v.object(input);
      if (JSON.stringify(args).length > 30000 || typeof command !== 'string') throw new Error('Invalid command input.');
      return await commandQueue.prepared(() => prepare(command as Command), async selectedFile => {
        trustedSender(event);
        if (command === 'shortcut.capture') {
          if (event.sender !== mainWindow?.webContents || typeof args.enabled !== 'boolean') throw new Error('Invalid shortcut capture request.');
          if (args.enabled && !mainWindow.isFocused()) throw new Error('Focus this window before configuring a shortcut.');
          shortcutCaptureUntil = args.enabled ? Date.now() + 35000 : 0;
          return { ok: true };
        }
        try { const value = await handle(command as Command, args, selectedFile); changed(); return { ok: true, value }; }
        catch (error) { changed(); throw error; }
      });
    } catch (e) { report(e); return { ok: false, error: errorMessage(e) }; }
  });
  updateInterval = setInterval(() => {
    if (transitions.busy || transitions.needsRecovery) return;
    try {
      if (timer.current?.status === 'running' && timer.current.timingMode === 'countdown' && !timer.current.autoOvertime && timer.snapshot().remainingMs <= 0) {
        void enqueue(async () => { await transitions.run(() => timer.tick()); changed(); });
      } else if (timer.tick()) changed();
      collector.reconcile(); publish({ type: 'timer', timer: timer.snapshot() });
    } catch (e) { report(e); changed(); }
  }, 250);
  checkpointInterval = setInterval(() => { void enqueue(async () => { timer.checkpoint(); collector.flush(); }); }, 5000);
  backupInterval = setInterval(() => { void dailyBackup().then(() => { if (mainWindow?.isVisible()) changed(); }); }, 60000);
  await dailyBackup();
}).catch(error => {
  const message = `Focus Guide could not open its local dataset.\n\n${errorMessage(error)}\n\nYour existing database has not been replaced.`;
  if (testing) { console.error(message); app.exit(1); } else { dialog.showErrorBox('Focus Guide needs attention', message); app.exit(1); }
});
