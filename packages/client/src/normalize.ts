import type { Project, Task, WorkspaceSnapshot } from '@moss/contracts';

function finiteRevision(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    labels: task.labels ?? [],
    subtasks: task.subtasks ?? [],
    attachments: task.attachments ?? [],
    deps: task.deps ?? [],
    fav: task.fav ?? false,
    recur: task.recur ?? null,
    revision: finiteRevision(task.revision),
  };
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    fav: project.fav ?? false,
    members: project.members ?? [],
    milestones: project.milestones ?? [],
    revision: finiteRevision(project.revision),
  };
}

/**
 * The web app used localStorage snapshots before revisions existed. Normalize
 * once at the repository boundary so commands never calculate with undefined.
 */
export function normalizeSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const copy = structuredClone(snapshot);
  return {
    ...copy,
    members: copy.members ?? [],
    projects: (copy.projects ?? []).map(normalizeProject),
    tasks: (copy.tasks ?? []).map(normalizeTask),
    comments: copy.comments ?? [],
    activity: copy.activity ?? [],
    notifs: copy.notifs ?? [],
    files: copy.files ?? [],
    events: (copy.events ?? []).map(event => ({
      ...event,
      title: event.title ?? '',
      date: event.date ?? '',
      time: event.time ?? '09:00',
      project: event.project ?? '',
      notes: event.notes ?? '',
    })),
    projOrder: copy.projOrder ?? [],
    savedViews: copy.savedViews ?? [],
    recentSearches: copy.recentSearches ?? [],
    sessions: copy.sessions ?? [],
    invoices: copy.invoices ?? [],
    notifPrefs: copy.notifPrefs ?? {},
  };
}
