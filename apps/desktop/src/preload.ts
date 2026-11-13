import { contextBridge, ipcRenderer } from 'electron';
import type { CommandResult, WorkspaceCommand, WorkspaceQuery, WorkspaceQueryResult, WorkspaceSnapshot } from '@moss/contracts';
import type { DesktopAppBridge, DesktopNoteAction, SyncStatus } from '@moss/client';
import { IPC_CHANNELS } from './channels.js';

const actionListeners = new Set<(action: DesktopNoteAction, id: string) => void>();
let pendingAction: { action: DesktopNoteAction; id: string } | null = null;

ipcRenderer.on(IPC_CHANNELS.noteOpenAction, (_event, action: DesktopNoteAction, id: string) => {
  if (!actionListeners.size) pendingAction = { action, id };
  else for (const listener of actionListeners) listener(action, id);
});

export interface DesktopWorkspaceBridge {
  snapshot(): Promise<WorkspaceSnapshot>;
  replaceSnapshot(snapshot: WorkspaceSnapshot): Promise<WorkspaceSnapshot>;
  query(query: WorkspaceQuery): Promise<WorkspaceQueryResult>;
  execute(command: WorkspaceCommand): Promise<CommandResult>;
  executeBatch(commands: WorkspaceCommand[]): Promise<CommandResult[]>;
  sync(): Promise<SyncStatus>;
  retryFailed(): Promise<SyncStatus>;
  getSyncStatus(): Promise<SyncStatus>;
  onChanged(callback: (status: SyncStatus) => void): () => void;
}

const notes = {
  create: () => ipcRenderer.invoke(IPC_CHANNELS.noteCreate) as Promise<string>,
  setPinned: (id: string, pinned: boolean) => ipcRenderer.invoke(IPC_CHANNELS.notePin, id, pinned) as Promise<void>,
  close: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.noteClose, id) as Promise<void>,
  getPinned: () => ipcRenderer.invoke(IPC_CHANNELS.notePinned) as Promise<string[]>,
  getShortcut: () => ipcRenderer.invoke(IPC_CHANNELS.noteGetShortcut) as Promise<string>,
  setShortcut: (shortcut: string) => ipcRenderer.invoke(IPC_CHANNELS.noteSetShortcut, shortcut) as Promise<boolean>,
  showMain: (hash?: string) => ipcRenderer.invoke(IPC_CHANNELS.noteShowMain, hash) as Promise<void>,
  requestAction: (action: DesktopNoteAction, id: string) => ipcRenderer.invoke(IPC_CHANNELS.noteRequestAction, action, id) as Promise<void>,
  onActionRequested(callback: (action: DesktopNoteAction, id: string) => void) {
    actionListeners.add(callback);
    if (pendingAction) {
      const pending = pendingAction;
      pendingAction = null;
      callback(pending.action, pending.id);
    }
    return () => actionListeners.delete(callback);
  },
  onChanged(callback: (ids: string[]) => void) {
    const listener = (_event: Electron.IpcRendererEvent, ids: string[]) => callback(ids);
    ipcRenderer.on(IPC_CHANNELS.notesChanged, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.notesChanged, listener);
  },
};

const bridge: DesktopAppBridge = {
  platform: process.platform,
  snapshot: () => ipcRenderer.invoke(IPC_CHANNELS.snapshot),
  replaceSnapshot: snapshot => ipcRenderer.invoke(IPC_CHANNELS.replaceSnapshot, snapshot),
  query: query => ipcRenderer.invoke(IPC_CHANNELS.query, query),
  execute: command => ipcRenderer.invoke(IPC_CHANNELS.execute, command),
  executeBatch: commands => ipcRenderer.invoke(IPC_CHANNELS.executeBatch, commands),
  sync: () => ipcRenderer.invoke(IPC_CHANNELS.sync),
  retryFailed: () => ipcRenderer.invoke(IPC_CHANNELS.retryFailed),
  getSyncStatus: () => ipcRenderer.invoke(IPC_CHANNELS.syncStatus),
  onChanged(callback) {
    const listener = (_event: Electron.IpcRendererEvent, status: SyncStatus) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.changed, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.changed, listener);
  },
  attachments: {
    save: input => ipcRenderer.invoke(IPC_CHANNELS.attachmentSave, input),
    copy: (storageKey, contentType) => ipcRenderer.invoke(IPC_CHANNELS.attachmentCopy, storageKey, contentType),
    read: storageKey => ipcRenderer.invoke(IPC_CHANNELS.attachmentRead, storageKey),
    open: storageKey => ipcRenderer.invoke(IPC_CHANNELS.attachmentOpen, storageKey),
    reveal: storageKey => ipcRenderer.invoke(IPC_CHANNELS.attachmentReveal, storageKey),
    remove: storageKey => ipcRenderer.invoke(IPC_CHANNELS.attachmentRemove, storageKey),
    cleanup: storageKeys => ipcRenderer.invoke(IPC_CHANNELS.attachmentCleanup, [...storageKeys]),
  },
  notes,
};

contextBridge.exposeInMainWorld('mossDesktop', bridge);
