import type { Task, TaskListOptions, WorkspaceSnapshot } from '@moss/contracts';

export function listTasks(snapshot: WorkspaceSnapshot, options: TaskListOptions = {}): Task[] {
  const { projectId, includeArchived = false } = options;
  const archivedProjects = includeArchived ? null : new Set(snapshot.projects.filter(project => project.archived).map(project => project.id));

  return snapshot.tasks.filter(
    task => (!projectId || task.project === projectId) && (includeArchived || (!task.archived && !archivedProjects?.has(task.project))),
  );
}
