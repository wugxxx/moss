import type { WorkspaceSnapshot } from '@moss/contracts';

export interface TraySummary {
  pending: number;
  overdue: number;
}

export function traySummary(snapshot: WorkspaceSnapshot, today: string): TraySummary {
  const archivedProjects = new Set(snapshot.projects.filter(project => project.archived).map(project => project.id));
  let pending = 0;
  let overdue = 0;
  for (const task of snapshot.tasks) {
    if (task.archived || task.status === 'done' || archivedProjects.has(task.project) || !task.due || task.due > today) continue;
    pending += 1;
    if (task.due < today) overdue += 1;
  }
  return { pending, overdue };
}
