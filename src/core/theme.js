/* ---------- theme ---------- */
import { setDateFormat } from './utils.js';
import { S } from './store.js';
import { setLocale } from '../i18n/index.js';

export const SIDE_MIN = 200;
export const SIDE_MAX = 420;
export const SIDE_DEFAULT = 272;

export function sideWidth() {
  const width = Number(S.prefs.sideW);
  return Number.isFinite(width) ? Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(width))) : SIDE_DEFAULT;
}

export function applyPrefs() {
  const r = document.documentElement,
    p = S.prefs;
  setLocale(p.language);
  setDateFormat(p.dateFmt);
  if (p.theme === 'system') r.removeAttribute('data-theme');
  else r.setAttribute('data-theme', p.theme);
  if (p.accent === 'indigo') r.removeAttribute('data-accent');
  else r.setAttribute('data-accent', p.accent);
  r.setAttribute('data-side', p.side);
  r.setAttribute('data-density', p.density);
  r.style.setProperty('--side-w', sideWidth() + 'px');
  if (p.motion === 'reduce') r.setAttribute('data-motion', 'reduce');
  else r.removeAttribute('data-motion');
  r.spellcheck = p.spell !== false;
}
export function effectiveDark() {
  if (S.prefs.theme === 'dark') return true;
  if (S.prefs.theme === 'light') return false;
  return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
}
