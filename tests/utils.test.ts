import { describe, expect, it } from 'vitest';
import { ago, fmtDate } from '../src/core/utils.js';

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
