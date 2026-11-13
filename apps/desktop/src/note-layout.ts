export interface NoteBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const GAP = 12;
const RIGHT_MARGIN = 24;
const TOP_OFFSET = 72;

export function nextNoteBounds(area: NoteBounds, open: NoteBounds[], width: number, height: number): NoteBounds {
  const startX = Math.max(area.x, area.x + area.width - width - RIGHT_MARGIN);
  const startY = area.y + TOP_OFFSET;
  for (let y = startY; y + height <= area.y + area.height; y += height + GAP) {
    for (let x = startX; x >= area.x; x -= width + GAP) {
      const candidate = { x, y, width, height };
      if (!open.some(bounds => intersects(candidate, bounds))) return candidate;
    }
  }
  const offset = Math.min(open.length, 6) * 24;
  return {
    x: Math.max(area.x, startX - offset),
    y: Math.max(area.y, Math.min(area.y + area.height - height, startY + offset)),
    width,
    height,
  };
}

function intersects(a: NoteBounds, b: NoteBounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
