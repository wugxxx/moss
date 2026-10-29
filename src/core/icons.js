/* ---------- icons: inlined Lucide subset (src/00-icons.js), rendered to inline svg ---------- */
import { ICONS } from 'virtual:icons';
import { esc } from './utils.js';

export const _icCache = {};
export function ic(name, size = 16, cls = '') {
  const k = name + '|' + size + '|' + cls;
  if (_icCache[k]) return _icCache[k];
  const inner = ICONS[name] || '<rect x="5" y="5" width="14" height="14" rx="3"/>';
  return (_icCache[k] =
    `<svg class="i ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`);
}
/* Moss brand: a geometric wordmark and a half-tone M with a check-shaped center. */
export const LOGO = (h = 22) =>
  `<svg class="logo" height="${h}" width="${Math.round((h * 250) / 92)}" viewBox="0 0 250 92" role="img" aria-label="Moss"><g fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"><path d="M12 74V18l28 40 28-40v56"/><circle cx="102" cy="46" r="28"/><path d="M158 26c-7-9-22-10-28 0-6 11 10 17 20 20 11 3 17 12 11 23-7 11-24 10-32-1"/><path d="M220 26c-7-9-22-10-28 0-6 11 10 17 20 20 11 3 17 12 11 23-7 11-24 10-32-1"/></g></svg>`;
export const MARK = (px = 22) =>
  `<svg width="${px}" height="${px}" viewBox="0 0 332 332" aria-hidden="true"><rect width="332" height="332" rx="72" fill="#102016"/><path d="M72 244V104l94 128" fill="none" stroke="#E8EED9" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/><path d="M166 232l94-128v140" fill="none" stroke="#8AB36B" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export function wsLogo(w, px = 22) {
  return w && w.brand
    ? `<span class="ws-logo brand" style="width:${px}px;height:${px}px">${MARK(px)}</span>`
    : `<span class="ws-logo" style="--c:${w.c};width:${px}px;height:${px}px;font-size:${Math.max(9, Math.round(px * 0.46))}px">${esc(w.name[0])}</span>`;
}
