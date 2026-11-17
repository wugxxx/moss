import { join, sep } from 'node:path';
import { stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, session, shell, Tray } from 'electron';
import type { WorkspaceCommand, WorkspaceQuery, WorkspaceSnapshot } from '@moss/contracts';
import type { CommandResult } from '@moss/contracts';
import { commandContext, HttpSyncTransport, type SaveAttachmentInput } from '@moss/client';
import { createSqliteWorkspace, openDatabase, type SqliteWorkspace } from '@moss/local-db';
import { seed } from '../../../src/data/seed.js';
import { AttachmentStore } from './attachment-store.js';
import { IPC_CHANNELS } from './channels.js';
import { traySummary } from './tray-summary.js';
import { readWindowState, resolveWindowState, writeWindowState } from './window-state.js';

let workspace: SqliteWorkspace | undefined;
let attachmentStore: AttachmentStore | undefined;
let flushWindowState: (() => void) | undefined;
let mainWindow: BrowserWindow | undefined;
let windowCreation: Promise<BrowserWindow> | undefined;
let tray: Tray | undefined;
let trayPopover: BrowserWindow | undefined;
let trayPopoverCreation: Promise<BrowserWindow> | undefined;
let trayPopoverHeight = 360;
let trayDismissedAt = 0;
let isQuitting = false;
const WINDOW_VERTICAL_OFFSET = 48;
const TRAY_POPOVER_WIDTH = 380;
const TRAY_POPOVER_MIN_HEIGHT = 120;
const TRAY_POPOVER_MAX_HEIGHT = 560;
const DEFAULT_WINDOW = { width: 1440, height: 920, minWidth: 780, minHeight: 600 };
const FALLBACK_TRAY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

app.setName('Moss');

function isTrustedRenderer(url: string): boolean {
  try {
    const target = new URL(url);
    if (process.env.VITE_DEV_SERVER_URL) {
      return target.origin === new URL(process.env.VITE_DEV_SERVER_URL).origin;
    }
    const rendererRoot = pathToFileURL(join(app.getAppPath(), 'dist') + sep).href;
    return target.protocol === 'file:' && target.href.startsWith(rendererRoot);
  } catch {
    return false;
  }
}

function broadcastChange(): void {
  const status = workspace?.syncRunner.status();
  if (!status) return;
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.changed, status);
  }
  notifyTrayPopover();
}

function validateSender(event: Electron.IpcMainInvokeEvent): void {
  if (!event.senderFrame || !isTrustedRenderer(event.senderFrame.url)) throw new Error('Untrusted IPC sender');
}

function localDayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function sendToMainWindow(window: BrowserWindow, channel: string, ...args: unknown[]): void {
  if (window.webContents.isLoadingMainFrame()) window.webContents.once('did-finish-load', () => window.webContents.send(channel, ...args));
  else window.webContents.send(channel, ...args);
}

function runInMainWindow(channel: string, ...args: unknown[]): void {
  hideTrayPopover();
  void showMainWindow()
    .then(window => sendToMainWindow(window, channel, ...args))
    .catch(error => console.warn('Failed to run a tray menu action', error));
}

function toggleLaunchAtLogin(): void {
  try {
    app.setLoginItemSettings({ openAtLogin: !app.getLoginItemSettings().openAtLogin });
  } catch (error) {
    console.warn('Failed to update the login item', error);
  }
}

function buildTrayMenu(): Menu {
  const chinese = app.getLocale().toLowerCase().startsWith('zh');
  const text = (en: string, cn: string) => (chinese ? cn : en);
  const summary = workspace ? traySummary(workspace.client.snapshot(), localDayKey()) : { pending: 0, overdue: 0 };
  const today = summary.pending
    ? text(
        `Today · ${summary.pending} open${summary.overdue ? ` · ${summary.overdue} overdue` : ''}`,
        `今日 · ${summary.pending} 项待办${summary.overdue ? ` · ${summary.overdue} 项逾期` : ''}`,
      )
    : text('Today · Nothing due', '今日 · 没有待办');
  const items: Electron.MenuItemConstructorOptions[] = [
    { label: text('Open Moss', '打开 Moss'), click: () => void showMainWindow().catch(error => console.warn('Failed to show Moss', error)) },
    { type: 'separator' },
    { label: text('New Task…', '新建任务…'), accelerator: 'CommandOrControl+N', click: () => runInMainWindow(IPC_CHANNELS.appNewTask) },
    { label: text('Quick Search…', '快速搜索…'), accelerator: 'CommandOrControl+K', click: () => runInMainWindow(IPC_CHANNELS.appQuickSearch) },
    { type: 'separator' },
    { label: today, click: () => runInMainWindow(IPC_CHANNELS.appNavigate, 'focus') },
    { label: text('Calendar', '日历'), click: () => runInMainWindow(IPC_CHANNELS.appNavigate, 'calendar') },
    { label: text('All Tasks', '所有任务'), click: () => runInMainWindow(IPC_CHANNELS.appNavigate, 'tasks') },
    { type: 'separator' },
    { label: text('Settings…', '设置…'), accelerator: 'CommandOrControl+,', click: () => runInMainWindow(IPC_CHANNELS.appNavigate, 'settings') },
  ];
  if (app.isPackaged && (process.platform === 'darwin' || process.platform === 'win32')) {
    items.push({
      label: text('Launch at Login', '登录时启动'),
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: () => toggleLaunchAtLogin(),
    });
  }
  items.push({ type: 'separator' }, { label: text('Quit Moss', '退出 Moss'), accelerator: 'Command+Q', click: () => app.quit() });
  return Menu.buildFromTemplate(items);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function trayPopoverBounds(height: number): Electron.Rectangle {
  const fallback = screen.getCursorScreenPoint();
  const anchor = tray?.getBounds() ?? { x: fallback.x, y: fallback.y, width: 0, height: 0 };
  const { workArea } = screen.getDisplayMatching(anchor);
  const resolvedHeight = Math.round(clampNumber(height, TRAY_POPOVER_MIN_HEIGHT, Math.min(TRAY_POPOVER_MAX_HEIGHT, workArea.height - 24)));
  const x = Math.round(anchor.x + anchor.width / 2 - TRAY_POPOVER_WIDTH / 2);
  const y = Math.round(anchor.y + anchor.height + 6);
  return {
    x: Math.round(clampNumber(x, workArea.x + 8, workArea.x + workArea.width - TRAY_POPOVER_WIDTH - 8)),
    y: Math.round(clampNumber(y, workArea.y + 8, workArea.y + workArea.height - resolvedHeight - 8)),
    width: TRAY_POPOVER_WIDTH,
    height: resolvedHeight,
  };
}

function hideTrayPopover(): void {
  if (trayPopover?.isVisible()) trayPopover.hide();
  trayDismissedAt = Date.now();
}

function notifyTrayPopover(): void {
  if (!trayPopover || trayPopover.isDestroyed() || !trayPopover.isVisible()) return;
  trayPopover.webContents.send(IPC_CHANNELS.trayRefresh);
}

async function ensureTrayPopover(): Promise<BrowserWindow> {
  if (trayPopover && !trayPopover.isDestroyed()) return trayPopover;
  if (!trayPopoverCreation) {
    trayPopoverCreation = (async () => {
      const popover = new BrowserWindow({
        width: TRAY_POPOVER_WIDTH,
        height: trayPopoverHeight,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: true,
        roundedCorners: true,
        type: 'panel',
        title: 'Moss',
        webPreferences: {
          preload: join(app.getAppPath(), 'dist-electron/preload.mjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      trayPopover = popover;
      popover.setAlwaysOnTop(true, 'pop-up-menu');
      popover.on('blur', () => {
        setTimeout(() => {
          if (!popover.isDestroyed() && popover.isVisible() && !popover.isFocused()) {
            popover.hide();
            trayDismissedAt = Date.now();
          }
        }, 60);
      });
      popover.on('closed', () => {
        if (trayPopover === popover) trayPopover = undefined;
      });
      popover.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) void shell.openExternal(url);
        return { action: 'deny' };
      });
      popover.webContents.on('will-navigate', (event, url) => {
        if (!isTrustedRenderer(url)) event.preventDefault();
      });
      try {
        if (process.env.VITE_DEV_SERVER_URL) {
          await popover.loadURL(new URL('tray.html', process.env.VITE_DEV_SERVER_URL).toString());
        } else {
          await popover.loadFile(join(app.getAppPath(), 'dist/tray.html'));
        }
      } catch (error) {
        popover.destroy();
        throw error;
      }
      return popover;
    })().finally(() => {
      trayPopoverCreation = undefined;
    });
  }
  return trayPopoverCreation;
}

async function showTrayPopover(): Promise<void> {
  const popover = await ensureTrayPopover();
  if (popover.isDestroyed()) return;
  popover.setBounds(trayPopoverBounds(trayPopoverHeight), false);
  popover.show();
  popover.focus();
  popover.webContents.send(IPC_CHANNELS.trayRefresh);
}

function toggleTrayPopover(): void {
  if (trayPopover?.isVisible()) {
    hideTrayPopover();
    return;
  }
  if (Date.now() - trayDismissedAt < 250) return;
  void showTrayPopover().catch(error => console.warn('Failed to show the tray popover', error));
}

function createTray(): void {
  if (process.platform !== 'darwin' || tray) return;
  const iconPath = join(app.getAppPath(), app.isPackaged ? 'dist/trayTemplate.png' : 'public/trayTemplate.png');
  let icon = nativeImage.createFromPath(iconPath);
  const hasIcon = !icon.isEmpty();
  if (hasIcon) icon.setTemplateImage(true);
  else icon = nativeImage.createFromDataURL(FALLBACK_TRAY_ICON);

  tray = new Tray(icon);
  tray.setToolTip('Moss');
  if (!hasIcon) tray.setTitle('Moss');
  tray.on('click', toggleTrayPopover);
  tray.on('right-click', () => {
    hideTrayPopover();
    tray?.popUpContextMenu(buildTrayMenu());
  });
  void ensureTrayPopover().catch(error => console.warn('Failed to prepare the tray popover', error));
}

async function ensureWindow(): Promise<BrowserWindow> {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  if (!windowCreation) {
    windowCreation = createWindow().finally(() => {
      windowCreation = undefined;
    });
  }
  return windowCreation;
}

async function showMainWindow(): Promise<BrowserWindow> {
  const window = await ensureWindow();
  if (process.platform === 'darwin' && app.isHidden()) app.show();
  if (process.platform === 'darwin') app.focus({ steal: true });
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  return window;
}

function registerWorkspaceIpc(activeWorkspace: SqliteWorkspace): void {
  ipcMain.handle(IPC_CHANNELS.snapshot, async event => {
    validateSender(event);
    return activeWorkspace.client.snapshot();
  });
  ipcMain.handle(IPC_CHANNELS.replaceSnapshot, async (event, snapshot: WorkspaceSnapshot) => {
    validateSender(event);
    activeWorkspace.repository.replaceSnapshot(snapshot);
    notifyTrayPopover();
    return activeWorkspace.client.snapshot();
  });
  ipcMain.handle(IPC_CHANNELS.query, async (event, query: WorkspaceQuery) => {
    validateSender(event);
    return activeWorkspace.client.query(query);
  });
  ipcMain.handle(IPC_CHANNELS.execute, async (event, command: WorkspaceCommand): Promise<CommandResult> => {
    validateSender(event);
    const result = await activeWorkspace.client.execute(command);
    if (result.ok) {
      activeWorkspace.syncRunner.schedule(250);
      notifyTrayPopover();
    }
    return result;
  });
  ipcMain.handle(IPC_CHANNELS.executeBatch, async (event, commands: WorkspaceCommand[]) => {
    validateSender(event);
    const results = await activeWorkspace.client.executeBatch(commands);
    if (results.some(result => result.ok)) {
      activeWorkspace.syncRunner.schedule(250);
      notifyTrayPopover();
    }
    return results;
  });
  ipcMain.handle(IPC_CHANNELS.sync, async event => {
    validateSender(event);
    const status = await activeWorkspace.client.sync();
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.retryFailed, async event => {
    validateSender(event);
    const status = await activeWorkspace.syncRunner.retryFailed();
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.syncStatus, async event => {
    validateSender(event);
    return activeWorkspace.client.getSyncStatus();
  });
}

function registerTrayIpc(activeWorkspace: SqliteWorkspace): void {
  ipcMain.handle(IPC_CHANNELS.trayOpenTask, async (event, taskId: string) => {
    validateSender(event);
    if (typeof taskId !== 'string' || !activeWorkspace.client.snapshot().tasks.some(task => task.id === taskId)) return;
    hideTrayPopover();
    const window = await showMainWindow();
    if (window.isDestroyed()) return;
    sendToMainWindow(window, IPC_CHANNELS.appOpenTask, taskId);
  });
  ipcMain.handle(IPC_CHANNELS.trayOpenApp, event => {
    validateSender(event);
    runInMainWindow(IPC_CHANNELS.appNavigate, 'focus');
  });
  ipcMain.handle(IPC_CHANNELS.trayCompleteTask, async (event, taskId: string) => {
    validateSender(event);
    if (typeof taskId !== 'string') return false;
    const snapshot = activeWorkspace.client.snapshot();
    const task = snapshot.tasks.find(item => item.id === taskId);
    if (!task || task.status === 'done') return false;
    const result = await activeWorkspace.client.execute({
      ...commandContext('local', snapshot.me),
      type: 'task.patch',
      entityId: taskId,
      payload: { patch: { status: 'done' } },
    });
    if (result.ok) {
      activeWorkspace.syncRunner.schedule(250);
      broadcastChange();
    }
    return result.ok;
  });
  ipcMain.handle(IPC_CHANNELS.trayUndoCompleteTask, async (event, taskId: string) => {
    validateSender(event);
    if (typeof taskId !== 'string') return false;
    const snapshot = activeWorkspace.client.snapshot();
    const task = snapshot.tasks.find(item => item.id === taskId);
    if (!task || task.status !== 'done') return false;
    const status = task.prevStatus && task.prevStatus !== 'done' ? task.prevStatus : 'todo';
    const result = await activeWorkspace.client.execute({
      ...commandContext('local', snapshot.me),
      type: 'task.patch',
      entityId: taskId,
      payload: { patch: { status } },
    });
    if (result.ok) {
      activeWorkspace.syncRunner.schedule(250);
      broadcastChange();
    }
    return result.ok;
  });
  ipcMain.on(IPC_CHANNELS.trayResize, (event, height: unknown) => {
    if (event.sender !== trayPopover?.webContents) return;
    if (typeof height !== 'number' || !Number.isFinite(height)) return;
    trayPopoverHeight = Math.round(clampNumber(height, TRAY_POPOVER_MIN_HEIGHT, TRAY_POPOVER_MAX_HEIGHT));
    if (trayPopover && !trayPopover.isDestroyed()) trayPopover.setBounds(trayPopoverBounds(trayPopoverHeight), false);
  });
  ipcMain.on(IPC_CHANNELS.trayHide, event => {
    if (event.sender !== trayPopover?.webContents) return;
    hideTrayPopover();
  });
}

function registerAttachmentIpc(store: AttachmentStore): void {
  ipcMain.handle(IPC_CHANNELS.attachmentSave, async (event, input: SaveAttachmentInput) => {
    validateSender(event);
    return store.save(input);
  });
  ipcMain.handle(IPC_CHANNELS.attachmentCopy, async (event, storageKey: string, contentType?: string) => {
    validateSender(event);
    return store.copy(storageKey, contentType);
  });
  ipcMain.handle(IPC_CHANNELS.attachmentRead, async (event, storageKey: string) => {
    validateSender(event);
    return store.read(storageKey);
  });
  ipcMain.handle(IPC_CHANNELS.attachmentOpen, async (event, storageKey: string) => {
    validateSender(event);
    const path = store.resolveStorageKey(storageKey);
    await stat(path);
    const error = await shell.openPath(path);
    if (error) throw new Error(error);
  });
  ipcMain.handle(IPC_CHANNELS.attachmentReveal, async (event, storageKey: string) => {
    validateSender(event);
    const path = store.resolveStorageKey(storageKey);
    await stat(path);
    shell.showItemInFolder(path);
  });
  ipcMain.handle(IPC_CHANNELS.attachmentRemove, async (event, storageKey: string) => {
    validateSender(event);
    await store.remove(storageKey);
  });
  ipcMain.handle(IPC_CHANNELS.attachmentCleanup, async (event, storageKeys: string[]) => {
    validateSender(event);
    return store.cleanup(storageKeys);
  });
}

async function createWindow(): Promise<BrowserWindow> {
  const windowStatePath = join(app.getPath('userData'), 'window-state.json');
  const savedWindowState = readWindowState(windowStatePath);
  const primaryDisplay = screen.getPrimaryDisplay();
  const windowState = resolveWindowState(
    savedWindowState,
    [
      primaryDisplay.workArea,
      ...screen
        .getAllDisplays()
        .filter(display => display.id !== primaryDisplay.id)
        .map(display => display.workArea),
    ],
    DEFAULT_WINDOW,
  );
  const window = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: DEFAULT_WINDOW.minWidth,
    minHeight: DEFAULT_WINDOW.minHeight,
    show: false,
    title: 'Moss',
    backgroundColor: '#f6f4ef',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(app.getAppPath(), 'dist-electron/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;

  const saveWindowState = () => {
    if (window.isDestroyed()) return;
    const bounds = window.isMaximized() || window.isFullScreen() ? window.getNormalBounds() : window.getBounds();
    try {
      writeWindowState(windowStatePath, { ...bounds, maximized: window.isMaximized() });
    } catch (error) {
      console.warn('Failed to save window state', error);
    }
  };
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleWindowStateSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      saveWindowState();
    }, 250);
  };
  flushWindowState = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    saveWindowState();
  };
  window.on('resize', scheduleWindowStateSave);
  window.on('move', scheduleWindowStateSave);
  window.on('maximize', scheduleWindowStateSave);
  window.on('unmaximize', scheduleWindowStateSave);
  window.on('close', event => {
    flushWindowState?.();
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined;
    flushWindowState = undefined;
  });

  window.once('ready-to-show', () => {
    if (savedWindowState === null) {
      window.center();
      const bounds = window.getBounds();
      const { workArea } = screen.getDisplayMatching(bounds);
      const maxY = Math.max(workArea.y, workArea.y + workArea.height - bounds.height);
      window.setPosition(bounds.x, Math.min(bounds.y + WINDOW_VERTICAL_OFFSET, maxY), false);
    }
    if (windowState.maximized) window.maximize();
    window.show();
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRenderer(url)) event.preventDefault();
  });

  if (process.env.VITE_DEV_SERVER_URL) await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else await window.loadFile(join(app.getAppPath(), 'dist/index.html'));
  return window;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (app.isReady()) void showMainWindow();
  });

  app
    .whenReady()
    .then(async () => {
      app.setAppUserModelId('com.moss.workspace');
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

      const database = openDatabase({ path: join(app.getPath('userData'), 'workspace.sqlite3') });
      const syncBaseUrl = process.env.MOSS_SYNC_URL?.trim();
      let syncTransport: { connect: () => Promise<HttpSyncTransport> } | undefined;
      if (syncBaseUrl) {
        const endpoint = syncBaseUrl;
        try {
          // Validate configuration before opening a window so a typo is visible.
          new HttpSyncTransport({ baseUrl: endpoint });
          syncTransport = { connect: async () => new HttpSyncTransport({ baseUrl: endpoint }) };
        } catch (error) {
          console.warn('Ignoring invalid MOSS_SYNC_URL', error);
        }
      }
      workspace = createSqliteWorkspace(database, {
        initialSnapshot: seed(),
        ...(syncTransport
          ? {
              syncRunner: {
                transport: syncTransport,
                autoSyncDelayMs: 1_000,
                onStatusChange: () => broadcastChange(),
              },
            }
          : {}),
      });
      attachmentStore = new AttachmentStore({ rootDirectory: join(app.getPath('userData'), 'attachments') });
      registerWorkspaceIpc(workspace);
      registerTrayIpc(workspace);
      registerAttachmentIpc(attachmentStore);

      await createWindow();
      createTray();
      if (syncBaseUrl) {
        void workspace.client
          .sync()
          .then(() => broadcastChange())
          .catch(error => console.warn('Startup sync failed', error));
      }
      app.on('activate', () => {
        void showMainWindow();
      });
    })
    .catch(error => {
      console.error('Failed to start Moss', error);
      app.quit();
    });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  trayPopover?.destroy();
  trayPopover = undefined;
  tray?.destroy();
  tray = undefined;
  flushWindowState?.();
  workspace?.syncRunner.dispose();
  workspace?.db.close();
});
