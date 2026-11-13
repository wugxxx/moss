import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readWindowState, resolveWindowState, writeWindowState, type DisplayArea } from '../../apps/desktop/src/window-state.js';

const defaults = { width: 1440, height: 920, minWidth: 780, minHeight: 600 };
const primary: DisplayArea = { x: 0, y: 0, width: 1920, height: 1080 };
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('window state', () => {
  it('keeps a saved state that is visible on a display', () => {
    expect(resolveWindowState({ x: 100, y: 80, width: 1200, height: 800, maximized: false }, [primary], defaults)).toEqual({
      x: 100,
      y: 80,
      width: 1200,
      height: 800,
      maximized: false,
    });
  });

  it('centers the default window when the saved state is off screen', () => {
    expect(resolveWindowState({ x: 5000, y: 3000, width: 1200, height: 800, maximized: true }, [primary], defaults)).toEqual({
      x: 240,
      y: 80,
      width: 1440,
      height: 920,
      maximized: true,
    });
  });

  it('clamps a saved state to the visible work area', () => {
    expect(resolveWindowState({ x: -100, y: -50, width: 3000, height: 2000, maximized: false }, [primary], defaults)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      maximized: false,
    });
  });

  it('uses the matching display when the saved state is on a secondary display', () => {
    const secondary: DisplayArea = { x: 1920, y: 0, width: 2560, height: 1440 };
    expect(resolveWindowState({ x: 2200, y: 120, width: 1200, height: 800, maximized: false }, [primary, secondary], defaults)).toEqual({
      x: 2200,
      y: 120,
      width: 1200,
      height: 800,
      maximized: false,
    });
  });

  it('ignores malformed saved values and uses the default size', () => {
    expect(resolveWindowState({ x: 'bad', width: null }, [primary], defaults)).toEqual({
      x: 240,
      y: 80,
      width: 1440,
      height: 920,
      maximized: false,
    });
  });

  it('round-trips the state and tolerates corrupt persisted JSON', () => {
    const directory = mkdtempSync(join(tmpdir(), 'moss-window-state-'));
    directories.push(directory);
    const path = join(directory, 'window-state.json');
    const state = { x: 10, y: 20, width: 1200, height: 800, maximized: true };

    writeWindowState(path, state);
    expect(readWindowState(path)).toEqual(state);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(state);

    writeFileSync(path, '{not-json', 'utf8');
    expect(readWindowState(path)).toBeNull();
  });
});
