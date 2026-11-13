import { describe, expect, it } from 'vitest';
import { S, allTasks, me, proj, task, visibleProjects } from '../src/core/store.js';
import { projectFixture, snapshotFixture, taskFixture } from '@moss/test-fixtures';

describe('workspace lookup caches', () => {
  it('resolves entities and reuses the active task list for the same snapshot', () => {
    S.data = snapshotFixture();
    const firstTasks = allTasks();

    expect(task('task-1')?.title).toBe('Test task');
    expect(proj('project-1')?.name).toBe('Test project');
    expect(me()?.name).toBe('Test User');
    expect(allTasks()).toBe(firstTasks);
  });

  it('invalidates caches when the workspace snapshot is replaced', () => {
    S.data = snapshotFixture();
    expect(task('task-1')?.title).toBe('Test task');

    const next = snapshotFixture();
    next.tasks = [taskFixture({ title: 'Renamed task' })];
    S.data = next;

    expect(task('task-1')?.title).toBe('Renamed task');
    expect(allTasks().map(item => item.title)).toEqual(['Renamed task']);
  });

  it('excludes tasks from archived projects', () => {
    const next = snapshotFixture();
    next.projects = [projectFixture({ archived: true })];
    S.data = next;

    expect(visibleProjects()).toEqual([]);
    expect(allTasks()).toEqual([]);
  });
});
