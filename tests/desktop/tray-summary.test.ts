import { describe, expect, it } from 'vitest';
import { traySummary } from '../../apps/desktop/src/tray-summary.js';

const today = '2026-11-17';

function project(id: string, archived = false) {
  return { id, archived };
}

function task(id: string, due: string | null, options: { status?: string; project?: string; archived?: boolean } = {}) {
  return {
    id,
    due,
    status: options.status ?? 'todo',
    project: options.project ?? 'p1',
    archived: options.archived ?? false,
  };
}

describe('tray summary', () => {
  it('counts open tasks due today or earlier', () => {
    const snapshot = {
      projects: [project('p1'), project('p2', true)],
      tasks: [
        task('overdue', '2026-11-15'),
        task('today', '2026-11-17'),
        task('future', '2026-11-18'),
        task('no-date', null),
        task('done', '2026-11-16', { status: 'done' }),
        task('archived', '2026-11-15', { archived: true }),
        task('in-archived-project', '2026-11-15', { project: 'p2' }),
      ],
    };

    expect(traySummary(snapshot as never, today)).toEqual({ pending: 2, overdue: 1 });
  });

  it('reports a clear day when nothing is due', () => {
    const snapshot = { projects: [project('p1')], tasks: [task('future', '2026-11-20')] };

    expect(traySummary(snapshot as never, today)).toEqual({ pending: 0, overdue: 0 });
  });
});
