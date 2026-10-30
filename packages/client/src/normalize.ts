import type { Project, Task, WorkspaceSnapshot } from '@moss/contracts';
import { normalizeLabelDefinitions } from '@moss/contracts';

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
  const labels = normalizeLabelDefinitions(copy.labels);
  const labelIds = new Set(labels.map(label => label.id));
  return {
    ...copy,
    members: copy.members ?? [],
    projects: (copy.projects ?? []).map(normalizeProject),
    tasks: (copy.tasks ?? []).map(task => ({
      ...normalizeTask(task),
      labels: (task.labels ?? []).filter(id => labelIds.has(id)),
    })),
    labels,
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
    savedViews: (copy.savedViews ?? []).map(view => ({
      ...view,
      filters: view.filters.flatMap(filter => {
        if (filter.f !== 'labels') return [filter];
        const values = filter.v.filter(id => labelIds.has(id));
        return values.length ? [{ ...filter, v: values }] : [];
      }),
    })),
    recentSearches: copy.recentSearches ?? [],
    sessions: copy.sessions ?? [],
    invoices: copy.invoices ?? [],
    notifPrefs: copy.notifPrefs ?? {},
  };
}
