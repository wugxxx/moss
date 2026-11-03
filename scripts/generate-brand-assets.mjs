import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_MARK_SVG } from '../src/core/brand.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const content = `<!-- Generated from src/core/brand.js by npm run brand:assets. Do not edit directly. -->\n${BRAND_MARK_SVG}\n`;

for (const file of ['public/favicon.svg', 'build/icon.svg']) {
  const target = resolve(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
