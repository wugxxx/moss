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
import { DesktopNotes } from './notes.js';
import { commandContext } from '@moss/client';

let workspace: SqliteWorkspace | undefined;
let attachmentStore: AttachmentStore | undefined;
let desktopNotes: DesktopNotes | undefined;
const WINDOW_VERTICAL_OFFSET = 48;

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
  if (!workspace) throw new Error('Workspace is unavailable');
}

function registerWorkspaceIpc(activeWorkspace: SqliteWorkspace): void {
  ipcMain.handle(IPC_CHANNELS.snapshot, async event => {
    validateSender(event);
    return activeWorkspace.client.snapshot();
  });
  ipcMain.handle(IPC_CHANNELS.replaceSnapshot, async (event, snapshot: WorkspaceSnapshot) => {
    validateSender(event);
    activeWorkspace.repository.replaceSnapshot(snapshot);
    broadcastChange();
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
      broadcastChange();
    }
    return result;
  });
  ipcMain.handle(IPC_CHANNELS.executeBatch, async (event, commands: WorkspaceCommand[]) => {
    validateSender(event);
    const results = await activeWorkspace.client.executeBatch(commands);
    if (results.some(result => result.ok)) {
      activeWorkspace.syncRunner.schedule(250);
      broadcastChange();
    }
    return results;
  });
  ipcMain.handle(IPC_CHANNELS.sync, async event => {
    validateSender(event);
    const status = await activeWorkspace.client.sync();
    broadcastChange();
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.retryFailed, async event => {
    validateSender(event);
    const status = await activeWorkspace.syncRunner.retryFailed();
    broadcastChange();
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
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 780,
    minHeight: 600,
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

  window.once('ready-to-show', () => {
    window.center();
    const bounds = window.getBounds();
    const { workArea } = screen.getDisplayMatching(bounds);
    const maxY = Math.max(workArea.y, workArea.y + workArea.height - bounds.height);
    window.setPosition(bounds.x, Math.min(bounds.y + WINDOW_VERTICAL_OFFSET, maxY), false);
    window.show();
  });
  secureRenderer(window);

  await loadRenderer(window);
}

async function loadRenderer(window: BrowserWindow, hash = ''): Promise<void> {
  secureRenderer(window);
  if (process.env.VITE_DEV_SERVER_URL) await window.loadURL(`${process.env.VITE_DEV_SERVER_URL}${hash}`);
  else await window.loadFile(join(app.getAppPath(), 'dist/index.html'), hash ? { hash } : undefined);
}

function secureRenderer(window: BrowserWindow): void {
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRenderer(url)) event.preventDefault();
  });
}

function broadcastPinnedNotes(): void {
  const pinned = desktopNotes?.getPinned() ?? [];
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC_CHANNELS.notesChanged, pinned);
}

function registerNoteIpc(notes: DesktopNotes): void {
  ipcMain.handle(IPC_CHANNELS.noteCreate, event => {
    validateSender(event);
    return notes.create();
  });
  ipcMain.handle(IPC_CHANNELS.notePin, async (event, id: string, pinned: boolean) => {
    validateSender(event);
    if (!workspace?.client.snapshot().notes.some(note => note.id === id)) throw new Error('Note not found');
    await notes.setPinned(id, pinned);
  });
  ipcMain.handle(IPC_CHANNELS.noteClose, (event, id: string) => {
    validateSender(event);
    notes.close(id);
  });
  ipcMain.handle(IPC_CHANNELS.notePinned, event => {
    validateSender(event);
    return notes.getPinned();
  });
  ipcMain.handle(IPC_CHANNELS.noteGetShortcut, event => {
    validateSender(event);
    return notes.getShortcut();
  });
  ipcMain.handle(IPC_CHANNELS.noteSetShortcut, (event, shortcut: string) => {
    validateSender(event);
    return notes.setShortcut(shortcut);
  });
  ipcMain.handle(IPC_CHANNELS.noteShowMain, async (event, hash?: string) => {
    validateSender(event);
    await desktopNotes?.showMain(hash);
  });
  ipcMain.handle(IPC_CHANNELS.noteRequestAction, async (event, action: 'convert' | 'delete', id: string) => {
    validateSender(event);
    if (action !== 'convert' && action !== 'delete') throw new Error('Invalid note action');
    if (!workspace?.client.snapshot().notes.some(note => note.id === id)) throw new Error('Note not found');
    await notes.requestAction(action, id);
  });
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

      desktopNotes = new DesktopNotes({
        userData: app.getPath('userData'),
        preload: join(app.getAppPath(), 'dist-electron/preload.mjs'),
        load: (window, id) => loadRenderer(window, `#note/${id}`),
        createNote: async () => {
          const result = await workspace!.client.execute({
            ...commandContext('local', workspace!.client.snapshot().me),
            type: 'note.create',
            payload: {},
          });
          if (!result.ok) throw new Error(result.error.message);
          broadcastChange();
          return result.affected.ids[0]!;
        },
        showMain: async hash => {
          let window = BrowserWindow.getAllWindows().find(item => !desktopNotes?.isNoteWindow(item));
          if (!window) {
            await createWindow();
            window = BrowserWindow.getAllWindows().find(item => !desktopNotes?.isNoteWindow(item));
          }
          if (!window) return;
          if (hash) await loadRenderer(window, hash);
          if (window.isMinimized()) window.restore();
          window.show();
          window.focus();
        },
        requestAction: async (action, id) => {
          let window = BrowserWindow.getAllWindows().find(item => !desktopNotes?.isNoteWindow(item));
          if (!window) {
            await createWindow();
            window = BrowserWindow.getAllWindows().find(item => !desktopNotes?.isNoteWindow(item));
          }
          if (!window) return;
          const send = () => {
            if (!window?.isDestroyed()) window.webContents.send(IPC_CHANNELS.noteOpenAction, action, id);
          };
          if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send);
          else send();
          if (window.isMinimized()) window.restore();
          window.show();
          window.focus();
        },
        onChange: broadcastPinnedNotes,
      });
      registerNoteIpc(desktopNotes);

      await createWindow();
      await desktopNotes.initialize();
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
  desktopNotes?.dispose();
  workspace?.syncRunner.dispose();
});

app.on('will-quit', () => {
  workspace?.db.close();
  workspace = undefined;
});
