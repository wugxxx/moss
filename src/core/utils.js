/* =====================================================================
   MOSS — core: utils, icons, seed data, store, render loop, events
   ===================================================================== */
import { getIntlLocale, t } from '../i18n/index.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 8);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';

/* ---------- dates ---------- */
export const DAY = 864e5;
export const sod = d => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const TODAY = sod(new Date());
export const iso = d => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const parse = s => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addD = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const dOff = n => iso(addD(TODAY, n));
export const diffD = (a, b) => Math.round((sod(a) - sod(b)) / DAY);
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1));
export const monthShort = i => new Intl.DateTimeFormat(getIntlLocale(), { month: 'short' }).format(MONTHS[i]);
export const monthLong = i => new Intl.DateTimeFormat(getIntlLocale(), { month: 'long' }).format(MONTHS[i]);
export const weekdayShort = i => t(`weekday.${WEEKDAY_KEYS[i]}`);
export const weekdayLong = i =>
  t(`weekday.${{ sun: 'sunday', mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday' }[WEEKDAY_KEYS[i]]}`);
export const fmtWeekdayDate = d => new Intl.DateTimeFormat(getIntlLocale(), { weekday: 'long', month: 'long', day: 'numeric' }).format(d);
/* Set from preferences on every render (core/theme.js), so utils never depends on the store. */
export let dateFormat = 'MMM d';
export function setDateFormat(f) {
  dateFormat = f || 'MMM d';
}
export function fmtDate(s, long) {
  const d = typeof s === 'string' ? parse(s) : s;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const fmt = dateFormat;
  if (fmt === 'd/M') return `${d.getDate()}/${d.getMonth() + 1}${long ? '/' + d.getFullYear() : ''}`;
  if (fmt === 'M/d') return `${d.getMonth() + 1}/${d.getDate()}${long ? '/' + d.getFullYear() : ''}`;
  if (fmt === 'yyyy-MM-dd') return iso(d);
  return new Intl.DateTimeFormat(getIntlLocale(), {
    month: 'short',
    day: 'numeric',
    ...(long || d.getFullYear() !== TODAY.getFullYear() ? { year: 'numeric' } : {}),
  }).format(d);
}
export function relDate(s) {
  if (!s) return '';
  const n = diffD(parse(s), TODAY);
  if (n === 0) return t('time.today');
  if (n === 1) return t('time.tomorrow');
  if (n === -1) return t('time.yesterday');
  if (n > 1 && n < 7) return weekdayShort(parse(s).getDay());
  return fmtDate(s);
}
export function fmtDateTime(value, timeFormat = '12') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString(getIntlLocale(), { month: 'short', day: 'numeric', year: 'numeric' })}, ${date.toLocaleTimeString(getIntlLocale(), {
    hour: 'numeric',
    minute: '2-digit',
    hour12: timeFormat !== '24',
  })}`;
}
export function ago(ts) {
  let value = ts;
  if (value instanceof Date) value = value.getTime();
  else if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    value = Number.isFinite(numeric) ? numeric : Date.parse(value);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const m = Math.round((Date.now() - value) / 6e4);
  if (m < 1) return t('time.justNow');
  if (m < 60) return t('time.minutesAgo', { count: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('time.hoursAgo', { count: h });
  const d = Math.round(h / 24);
  if (d < 7) return t('time.daysAgo', { count: d });
  return fmtDate(iso(new Date(value)));
}
export function dayBucket(ts) {
  const n = diffD(new Date(ts), TODAY);
  if (n === 0) return t('time.today');
  if (n === -1) return t('time.yesterday');
  if (n > -7) return t('time.thisWeek');
  return t('time.earlier');
}
