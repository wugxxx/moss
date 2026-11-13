import { describe, expect, it } from 'vitest';
import { focusCounts } from '../src/core/focus-stats.js';

const today = new Date(2026, 10, 13);

function task(id: string, status: string, due: string, completedAt: number | null = null) {
  return { id, status, due, completedAt };
}

describe('focus day progress', () => {
  it('keeps a completed overdue task in the denominator and counts it as done', () => {
    const tasks = [
      task('overdue-done', 'done', '2026-11-06', new Date(2026, 10, 13, 10).getTime()),
      task('overdue-open', 'todo', '2026-11-06'),
      task('overdue-open-2', 'todo', '2026-11-12'),
      task('today-open', 'todo', '2026-11-13'),
      task('today-done', 'done', '2026-11-13', new Date(2026, 10, 13, 9).getTime()),
      task('today-done-2', 'done', '2026-11-13', new Date(2026, 10, 13, 12).getTime()),
    ];

    const counts = focusCounts(tasks, today);

    expect(counts.total).toBe(6);
    expect(counts.done).toBe(3);
  });

  it('does not count overdue tasks completed on an earlier day', () => {
    const counts = focusCounts(
      [
        task('overdue-open', 'todo', '2026-11-06'),
        task('overdue-done-yesterday', 'done', '2026-11-06', new Date(2026, 10, 12, 18).getTime()),
        task('today-open', 'todo', '2026-11-13'),
      ],
      today,
    );

    expect(counts.total).toBe(2);
    expect(counts.done).toBe(0);
  });

  it('returns the same total when a today task is completed', () => {
    const before = focusCounts([task('today', 'todo', '2026-11-13')], today);
    const after = focusCounts([task('today', 'done', '2026-11-13', new Date(2026, 10, 13, 15).getTime())], today);

    expect(before.total).toBe(1);
    expect(after.total).toBe(1);
    expect(after.done).toBe(1);
  });
});
