import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserWindow, globalShortcut, screen } from 'electron';
import { nextNoteBounds } from './note-layout.js';

interface NoteWindowState {
  pinned: boolean;
  bounds?: Electron.Rectangle;
}

type NotesState = Record<string, NoteWindowState>;

export class DesktopNotes {
  private readonly windows = new Map<string, BrowserWindow>();
  private state: NotesState = {};
  private shortcut = 'CommandOrControl+Shift+N';
  private persistTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly options: {
      userData: string;
      preload: string;
      load: (window: BrowserWindow, noteId: string) => Promise<void>;
      createNote: () => Promise<string>;
      showMain: (hash?: string) => Promise<void>;
      requestAction: (action: 'convert' | 'delete', id: string) => Promise<void>;
      onChange: () => void;
    },
  ) {}

  async initialize(): Promise<void> {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8')) as { windows?: NotesState; shortcut?: string };
      for (const [id, value] of Object.entries(saved.windows ?? {})) {
        if (value.bounds) this.state[id] = { pinned: false, bounds: value.bounds };
      }
      if (saved.shortcut) this.shortcut = saved.shortcut;
    } catch {
      // Missing or corrupt window preferences should not block the workspace.
    }
    if (!this.registerShortcut()) {
      console.warn(`Could not register note shortcut ${this.shortcut}; using CommandOrControl+Shift+N`);
      this.shortcut = 'CommandOrControl+Shift+N';
      this.registerShortcut();
    }
    await this.persist();
  }

  async create(): Promise<string> {
    const id = await this.options.createNote();
    await this.open(id, false);
    return id;
  }

  async open(id: string, pinned = this.state[id]?.pinned ?? false): Promise<void> {
    const existing = this.windows.get(id);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return;
    }
    const saved = this.state[id]?.bounds;
    const open = [...this.windows.values()].filter(window => !window.isDestroyed()).map(window => window.getBounds());
    const bounds =
      saved && screen.getAllDisplays().some(display => intersects(display.workArea, saved))
        ? saved
        : nextNoteBounds(screen.getPrimaryDisplay().workArea, open, 360, 440);
    const window = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      minWidth: 280,
      minHeight: 240,
      show: false,
      title: 'Moss Note',
      backgroundColor: '#f6f4ef',
      frame: false,
      alwaysOnTop: pinned,
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.options.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.windows.set(id, window);
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.once('ready-to-show', () => window.show());
    window.on('close', () => {
      if (this.quitting) return;
      const wasPinned = this.state[id]?.pinned ?? false;
      if (!window.isDestroyed()) this.state[id] = { pinned: false, bounds: window.getBounds() };
      void this.persist();
      if (wasPinned) this.options.onChange();
    });
    const saveBounds = () => {
      if (window.isDestroyed()) return;
      this.state[id] = { pinned: this.state[id]?.pinned ?? false, bounds: window.getBounds() };
      this.schedulePersist();
    };
    window.on('move', saveBounds);
    window.on('moved', saveBounds);
    window.on('closed', () => {
      this.windows.delete(id);
    });
    await this.options.load(window, id);
  }

  async setPinned(id: string, pinned: boolean): Promise<void> {
    const window = this.windows.get(id);
    this.state[id] = {
      pinned,
      ...(window && !window.isDestroyed() ? { bounds: window.getBounds() } : this.state[id]?.bounds ? { bounds: this.state[id].bounds } : {}),
    };
    if (window && !window.isDestroyed()) {
      window.setAlwaysOnTop(pinned);
      if (pinned) {
        window.show();
        window.focus();
      }
    } else if (pinned) await this.open(id, true);
    else delete this.state[id];
    await this.persist();
    this.options.onChange();
  }

  close(id: string): void {
    this.windows.get(id)?.close();
  }

  isNoteWindow(window: BrowserWindow): boolean {
    for (const candidate of this.windows.values()) {
      if (candidate.id === window.id) return true;
    }
    return false;
  }

  async showMain(hash?: string): Promise<void> {
    await this.options.showMain(hash);
  }

  async requestAction(action: 'convert' | 'delete', id: string): Promise<void> {
    await this.options.requestAction(action, id);
  }

  getPinned(): string[] {
    return Object.entries(this.state)
      .filter(([, value]) => value.pinned)
      .map(([id]) => id);
  }

  getShortcut(): string {
    return this.shortcut;
  }

  setShortcut(value: string): boolean {
    if (value === this.shortcut) return true;
    this.unregisterShortcut();
    const previous = this.shortcut;
    this.shortcut = value;
    if (!this.registerShortcut()) {
      this.shortcut = previous;
      this.registerShortcut();
      return false;
    }
    void this.persist();
    return true;
  }

  dispose(): void {
    for (const [id, window] of this.windows) {
      if (!window.isDestroyed()) this.state[id] = { pinned: this.state[id]?.pinned ?? false, bounds: window.getBounds() };
    }
    this.quitting = true;
    this.unregisterShortcut();
    void this.persist();
  }

  private quitting = false;

  private get file(): string {
    return join(this.options.userData, 'notes.json');
  }

  private registerShortcut(): boolean {
    try {
      return globalShortcut.register(this.shortcut, () => {
        void this.create().catch(error => console.warn('Could not create quick note', error));
      });
    } catch {
      return false;
    }
  }

  private unregisterShortcut(): void {
    try {
      globalShortcut.unregister(this.shortcut);
    } catch {
      // An invalid accelerator must not prevent the app from quitting.
    }
  }

  private schedulePersist(): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.persist(), 250);
  }

  private async persist(): Promise<void> {
    await writeFile(this.file, JSON.stringify({ shortcut: this.shortcut, windows: this.state }), 'utf8').catch(error =>
      console.warn('Could not save note windows', error),
    );
  }
}

function intersects(a: Electron.Rectangle, b: Electron.Rectangle): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
