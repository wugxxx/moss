import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState extends WindowBounds {
  maximized: boolean;
}

export type DisplayArea = WindowBounds;

export interface WindowDefaults {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

const MIN_VISIBLE_PIXELS = 80;

function finiteInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function parseWindowState(value: unknown, defaults: WindowDefaults): WindowState | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const x = finiteInteger(record.x);
  const y = finiteInteger(record.y);
  const width = finiteInteger(record.width);
  const height = finiteInteger(record.height);
  if (x === null || y === null || width === null || height === null) return null;
  return {
    x,
    y,
    width: Math.max(width, defaults.minWidth),
    height: Math.max(height, defaults.minHeight),
    maximized: record.maximized === true,
  };
}

function overlapsDisplay(state: WindowBounds, display: DisplayArea): boolean {
  const width = Math.min(state.x + state.width, display.x + display.width) - Math.max(state.x, display.x);
  const height = Math.min(state.y + state.height, display.y + display.height) - Math.max(state.y, display.y);
  return width >= MIN_VISIBLE_PIXELS && height >= MIN_VISIBLE_PIXELS;
}

function centerOnDisplay(defaults: WindowDefaults, display: DisplayArea): WindowBounds {
  const width = Math.min(defaults.width, display.width);
  const height = Math.min(defaults.height, display.height);
  return {
    x: Math.round(display.x + (display.width - width) / 2),
    y: Math.round(display.y + (display.height - height) / 2),
    width,
    height,
  };
}

function fitToDisplay(state: WindowBounds, display: DisplayArea): WindowBounds {
  const width = Math.min(state.width, display.width);
  const height = Math.min(state.height, display.height);
  return {
    x: Math.min(Math.max(state.x, display.x), display.x + display.width - width),
    y: Math.min(Math.max(state.y, display.y), display.y + display.height - height),
    width,
    height,
  };
}

export function resolveWindowState(saved: unknown, displays: DisplayArea[], defaults: WindowDefaults): WindowState {
  const parsed = parseWindowState(saved, defaults);
  const primary = displays[0] ?? { x: 0, y: 0, width: defaults.width, height: defaults.height };
  if (!parsed) return { ...centerOnDisplay(defaults, primary), maximized: false };

  const visibleDisplay = displays.find(display => overlapsDisplay(parsed, display));
  if (!visibleDisplay) return { ...centerOnDisplay(defaults, primary), maximized: parsed.maximized };

  return { ...fitToDisplay(parsed, visibleDisplay), maximized: parsed.maximized };
}

export function readWindowState(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function writeWindowState(path: string, state: WindowState): void {
  const payload = `${JSON.stringify(state, null, 2)}\n`;
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, payload, 'utf8');
  try {
    renameSync(temporaryPath, path);
  } catch {
    writeFileSync(path, payload, 'utf8');
  }
}
