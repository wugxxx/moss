import { afterEach, describe, expect, it, vi } from 'vitest';
import { TODAY, ago, fmtDate, refreshToday } from '../src/core/utils.js';

describe('date formatting', () => {
  it('returns an empty string for invalid dates instead of throwing', () => {
    expect(fmtDate('not-a-date')).toBe('');
    expect(ago(Number.NaN)).toBe('');
    expect(ago('not-a-timestamp')).toBe('');
  });

  it('accepts epoch timestamps and numeric timestamp strings', () => {
    const now = Date.now();
    expect(ago(now)).toBe('just now');
    expect(ago(String(now))).toBe('just now');
  });
});

describe('today rollover', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances TODAY when the calendar day changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2031, 3, 9, 23, 59));
    expect(refreshToday()).toBe(true);
    expect(TODAY.getDate()).toBe(9);

    vi.setSystemTime(new Date(2031, 3, 10, 0, 0, 1));
    expect(refreshToday()).toBe(true);
    expect(TODAY.getDate()).toBe(10);
    expect(refreshToday()).toBe(false);
  });
});
