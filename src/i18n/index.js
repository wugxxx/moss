import en from './locales/en.js';
import zhCN from './locales/zh-CN.js';

export const LOCALES = {
  en: { label: 'English', intl: 'en-US', messages: en },
  'zh-CN': { label: '简体中文', intl: 'zh-CN', messages: zhCN },
};

export const LOCALE_OPTIONS = Object.entries(LOCALES).map(([id, locale]) => [id, locale.label]);

let locale = 'en';
let pluralRules = new Intl.PluralRules(LOCALES[locale].intl);

export function normalizeLocale(value) {
  if (value === 'zh' || /^zh-(cn|hans)/i.test(value || '')) return 'zh-CN';
  return LOCALES[value] ? value : 'en';
}

export function setLocale(value) {
  locale = normalizeLocale(value);
  pluralRules = new Intl.PluralRules(LOCALES[locale].intl);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  return locale;
}

export function getLocale() {
  return locale;
}

export function getIntlLocale() {
  return LOCALES[locale].intl;
}

function lookup(messages, key) {
  return key.split('.').reduce((value, part) => value?.[part], messages);
}

function interpolate(value, params) {
  return value.replace(/\{(\w+)\}/g, (_, key) => (params[key] == null ? `{${key}}` : String(params[key])));
}

export function t(key, params = {}, fallback = null) {
  let value = lookup(LOCALES[locale].messages, key);
  if (value == null) value = lookup(LOCALES.en.messages, key);
  if (value && typeof value === 'object') {
    const category = params.count == null ? 'other' : pluralRules.select(Number(params.count));
    value = value[category] ?? value.other ?? value.one;
  }
  if (typeof value !== 'string') return fallback ?? key;
  return interpolate(value, params);
}

export function localeTag() {
  return locale;
}

export function localeLabel(value = locale) {
  return LOCALES[normalizeLocale(value)].label;
}
