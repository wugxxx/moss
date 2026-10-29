import { contextBridge, ipcRenderer } from 'electron';
import type { CommandResult, WorkspaceCommand, WorkspaceQuery, WorkspaceQueryResult, WorkspaceSnapshot } from '@moss/contracts';
import type { DesktopAppBridge, SyncStatus } from '@moss/client';
import { IPC_CHANNELS } from './channels.js';

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
};

contextBridge.exposeInMainWorld('mossDesktop', bridge);
