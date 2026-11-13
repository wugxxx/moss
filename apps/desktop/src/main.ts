import { join, sep } from 'node:path';
import { stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, screen, session, shell } from 'electron';
import type { WorkspaceCommand, WorkspaceQuery, WorkspaceSnapshot } from '@moss/contracts';
import type { CommandResult } from '@moss/contracts';
import { HttpSyncTransport, type SaveAttachmentInput } from '@moss/client';
import { createSqliteWorkspace, openDatabase, type SqliteWorkspace } from '@moss/local-db';
import { seed } from '../../../src/data/seed.js';
import { AttachmentStore } from './attachment-store.js';
import { IPC_CHANNELS } from './channels.js';
import { readWindowState, resolveWindowState, writeWindowState } from './window-state.js';

let workspace: SqliteWorkspace | undefined;
let attachmentStore: AttachmentStore | undefined;
let flushWindowState: (() => void) | undefined;
const WINDOW_VERTICAL_OFFSET = 48;
const DEFAULT_WINDOW = { width: 1440, height: 920, minWidth: 780, minHeight: 600 };

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
}

function validateSender(event: Electron.IpcMainInvokeEvent): void {
  if (!event.senderFrame || !isTrustedRenderer(event.senderFrame.url)) throw new Error('Untrusted IPC sender');
}

function registerWorkspaceIpc(activeWorkspace: SqliteWorkspace): void {
  ipcMain.handle(IPC_CHANNELS.snapshot, async event => {
    validateSender(event);
    return activeWorkspace.client.snapshot();
  });
  ipcMain.handle(IPC_CHANNELS.replaceSnapshot, async (event, snapshot: WorkspaceSnapshot) => {
    validateSender(event);
    activeWorkspace.repository.replaceSnapshot(snapshot);
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
    }
    return result;
  });
  ipcMain.handle(IPC_CHANNELS.executeBatch, async (event, commands: WorkspaceCommand[]) => {
    validateSender(event);
    const results = await activeWorkspace.client.executeBatch(commands);
    if (results.some(result => result.ok)) {
      activeWorkspace.syncRunner.schedule(250);
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

async function createWindow(): Promise<void> {
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
  window.on('close', () => {
    flushWindowState?.();
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
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
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
      registerAttachmentIpc(attachmentStore);

      await createWindow();
      if (syncBaseUrl) {
        void workspace.client
          .sync()
          .then(() => broadcastChange())
          .catch(error => console.warn('Startup sync failed', error));
      }
      app.on('activate', () => {
        if (!BrowserWindow.getAllWindows().length) void createWindow();
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
  flushWindowState?.();
  workspace?.syncRunner.dispose();
  workspace?.db.close();
});
