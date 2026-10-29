import type { EntityId, Project, Task, WorkspaceSnapshot } from './entities.js';

export interface TaskListOptions {
  projectId?: EntityId;
  includeArchived?: boolean;
}

export interface TaskDetail {
  task: Task;
  project: Project | null;
}

export type WorkspaceQuery =
  | { type: 'bootstrap' }
  | { type: 'tasks.list'; options?: TaskListOptions }
  | { type: 'task.detail'; taskId: EntityId }
  | { type: 'projects.list'; includeArchived?: boolean }
  | { type: 'workspace.snapshot' };

export type WorkspaceQueryResult = WorkspaceSnapshot | Task[] | TaskDetail | Project[];

export interface ChangeSet {
  revision: number;
  affected: { type: 'task' | 'project' | 'workspace'; ids: EntityId[] };
}
