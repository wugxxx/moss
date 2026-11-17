import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { FOLDED_PATHS, MARK_GLYPH_TRANSFORM } from '../src/core/brand.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public');
const CURVE_STEPS = 24;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    scanlines[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const source = (y * size + x) * 4;
      const target = row + 1 + x * 4;
      scanlines[target] = pixels[source];
      scanlines[target + 1] = pixels[source + 1];
      scanlines[target + 2] = pixels[source + 2];
      scanlines[target + 3] = pixels[source + 3];
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function parsePath(d) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let index = 0;
  let command = '';
  let current = [0, 0];
  let start = [0, 0];
  let points = [];
  const subpaths = [];
  const readNumber = () => Number(tokens[index++]);
  const isCommand = token => /^[a-zA-Z]$/.test(token);

  while (index < tokens.length) {
    if (isCommand(tokens[index])) command = tokens[index++];
    if (!command) break;
    const upper = command.toUpperCase();
    const relative = command !== upper;
    if (upper === 'M') {
      if (points.length > 1) subpaths.push(points);
      const x = readNumber();
      const y = readNumber();
      current = relative ? [current[0] + x, current[1] + y] : [x, y];
      start = current;
      points = [current];
      command = relative ? 'l' : 'L';
    } else if (upper === 'L') {
      const x = readNumber();
      const y = readNumber();
      current = relative ? [current[0] + x, current[1] + y] : [x, y];
      points.push(current);
    } else if (upper === 'C') {
      const x1 = readNumber();
      const y1 = readNumber();
      const x2 = readNumber();
      const y2 = readNumber();
      const x = readNumber();
      const y = readNumber();
      const control1 = relative ? [current[0] + x1, current[1] + y1] : [x1, y1];
      const control2 = relative ? [current[0] + x2, current[1] + y2] : [x2, y2];
      const end = relative ? [current[0] + x, current[1] + y] : [x, y];
      for (let step = 1; step <= CURVE_STEPS; step += 1) {
        const t = step / CURVE_STEPS;
        const inv = 1 - t;
        points.push([
          inv ** 3 * current[0] + 3 * inv ** 2 * t * control1[0] + 3 * inv * t ** 2 * control2[0] + t ** 3 * end[0],
          inv ** 3 * current[1] + 3 * inv ** 2 * t * control1[1] + 3 * inv * t ** 2 * control2[1] + t ** 3 * end[1],
        ]);
      }
      current = end;
    } else if (upper === 'Z') {
      if (points.length > 1) {
        points.push(start);
        subpaths.push(points);
      }
      points = [];
      current = start;
      command = '';
    } else {
      throw new Error(`Unsupported path command: ${command}`);
    }
  }

  if (points.length > 1) subpaths.push(points);
  return subpaths;
}

function transformPoint([x, y]) {
  return [MARK_GLYPH_TRANSFORM.x + x * MARK_GLYPH_TRANSFORM.scale, MARK_GLYPH_TRANSFORM.y + y * MARK_GLYPH_TRANSFORM.scale];
}

function polygonBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[previous];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function renderIcon(size) {
  const polygons = Object.values(FOLDED_PATHS)
    .flatMap(d => parsePath(d))
    .map(points => points.map(transformPoint));
  const bounds = polygonBounds(polygons.flat());
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const padding = size * 0.06;
  const fit = Math.min((size - padding * 2) / width, (size - padding * 2) / height);
  const offsetX = (size - width * fit) / 2 - bounds.minX * fit;
  const offsetY = (size - height * fit) / 2 - bounds.minY * fit;
  const scaled = polygons.map(points => points.map(([x, y]) => [x * fit + offsetX, y * fit + offsetY]));
  const scaledBounds = scaled.map(polygonBounds);
  const supersample = size <= 18 ? 8 : 4;
  const samples = supersample * supersample;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let covered = 0;
      for (let sy = 0; sy < supersample; sy += 1) {
        for (let sx = 0; sx < supersample; sx += 1) {
          const sampleX = x + (sx + 0.5) / supersample;
          const sampleY = y + (sy + 0.5) / supersample;
          const inside = scaled.some((points, index) => {
            const box = scaledBounds[index];
            if (sampleX < box.minX || sampleX > box.maxX || sampleY < box.minY || sampleY > box.maxY) return false;
            return insidePolygon(sampleX, sampleY, points);
          });
          if (inside) covered += 1;
        }
      }
      const offset = (y * size + x) * 4;
      pixels[offset] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 0;
      pixels[offset + 3] = Math.round((covered / samples) * 255);
    }
  }
  return encodePng(size, pixels);
}

mkdirSync(output, { recursive: true });
for (const [file, size] of [
  ['trayTemplate.png', 18],
  ['trayTemplate@2x.png', 36],
  ['trayTemplate@3x.png', 54],
]) {
  writeFileSync(resolve(output, file), renderIcon(size));
}
