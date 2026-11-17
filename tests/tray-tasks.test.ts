import { describe, expect, it } from 'vitest';
import { collectTrayTasks } from '../src/tray/tasks.js';

const today = new Date(2026, 10, 17);

function project(id: string, archived = false) {
  return { id, archived };
}

function task(
  id: string,
  due: string | null,
  options: { status?: string; priority?: string; order?: number; project?: string; archived?: boolean; title?: string } = {},
) {
  return {
    id,
    due,
    status: options.status ?? 'todo',
    priority: options.priority ?? 'none',
    order: options.order ?? 0,
    project: options.project ?? 'p1',
    archived: options.archived ?? false,
    title: options.title ?? id,
  };
}

describe('tray task overview', () => {
  it('keeps only open, active tasks due today or earlier', () => {
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

    const model = collectTrayTasks(snapshot, today);

    expect(model.overdue.map(item => item.id)).toEqual(['overdue']);
    expect(model.today.map(item => item.id)).toEqual(['today']);
  });

  it('sorts overdue by due date and today by priority', () => {
    const snapshot = {
      projects: [project('p1')],
      tasks: [
        task('overdue-later', '2026-11-16'),
        task('overdue-earlier', '2026-11-14'),
        task('today-low', '2026-11-17', { priority: 'low', order: 1 }),
        task('today-urgent', '2026-11-17', { priority: 'urgent', order: 4 }),
        task('today-high', '2026-11-17', { priority: 'high', order: 2 }),
      ],
    };

    const model = collectTrayTasks(snapshot, today);

    expect(model.overdue.map(item => item.id)).toEqual(['overdue-earlier', 'overdue-later']);
    expect(model.today.map(item => item.id)).toEqual(['today-urgent', 'today-high', 'today-low']);
  });

  it('excludes tasks completed today from the pending list', () => {
    const snapshot = {
      projects: [project('p1')],
      tasks: [task('done-today', '2026-11-17', { status: 'done' })],
    };

    expect(collectTrayTasks(snapshot, today)).toEqual({ overdue: [], today: [] });
  });
});
