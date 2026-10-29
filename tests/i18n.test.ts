import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '../src/i18n/locales/en.js';
import zhCN from '../src/i18n/locales/zh-CN.js';
import { getIntlLocale, normalizeLocale, setLocale, t } from '../src/i18n/index.js';

type Messages = Record<string, unknown>;

const locales: Record<string, Messages> = { en, 'zh-CN': zhCN };
const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));

function flatten(messages: Messages, prefix = '', result: Record<string, unknown> = {}) {
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value as Messages, path, result);
    else result[path] = value;
  }
  return result;
}

function hasMessage(messages: Messages, key: string) {
  let value: unknown = messages;
  for (const part of key.split('.')) {
    if (!value || typeof value !== 'object' || !(part in value)) return false;
    value = (value as Messages)[part];
  }
  return true;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path.includes(`${join('src', 'i18n')}`) ? [] : sourceFiles(path);
    return /\.(js|ts)$/.test(entry.name) ? [path] : [];
  });
}

function referencedKeys() {
  const keys = new Set<string>();
  for (const file of sourceFiles(sourceRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\b(?:t|tr|tt)\(\s*['"]([^'"]+)['"]/g)) {
      if (match[1].includes('.') && !match[1].endsWith('.')) keys.add(match[1]);
    }
  }
  return keys;
}

describe('i18n locale catalogue', () => {
  it('keeps every locale structurally aligned with English', () => {
    const englishKeys = Object.keys(flatten(en)).sort();
    for (const [locale, messages] of Object.entries(locales)) {
      expect(Object.keys(flatten(messages)).sort(), locale).toEqual(englishKeys);
    }
  });

  it('contains every statically referenced translation key', () => {
    for (const [locale, messages] of Object.entries(locales)) {
      const missing = [...referencedKeys()].filter(key => !hasMessage(messages, key)).sort();
      expect(missing, locale).toEqual([]);
    }
  });

  it('normalizes Chinese locale tags', () => {
    expect(normalizeLocale('zh')).toBe('zh-CN');
    expect(normalizeLocale('zh-Hans')).toBe('zh-CN');
    expect(normalizeLocale('zh-CN')).toBe('zh-CN');
  });

  it('switches locale and applies plural interpolation', () => {
    try {
      setLocale('en');
      expect(t('nav.settings')).toBe('Settings');
      expect(t('common.tasks', { count: 2 })).toBe('2 tasks');

      setLocale('zh-CN');
      expect(getIntlLocale()).toBe('zh-CN');
      expect(t('nav.settings')).toBe('设置');
      expect(t('common.tasks', { count: 2 })).toBe('2 个任务');
    } finally {
      setLocale('en');
    }
  });
});
