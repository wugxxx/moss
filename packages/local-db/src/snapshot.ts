import type { Activity, Comment, FileRecord, Member, Project, SavedView, Task, WorkspaceSnapshot } from '@moss/contracts';
import { normalizeLabelDefinitions } from '@moss/contracts';

export interface SnapshotRow {
  id: string;
  workspace_id: string;
  data: string;
  deleted_at: string | null;
  revision: number;
}

export function parseRow<T>(row: { data: string }): T {
  const data = row.data;
  if (typeof data !== 'string') throw new Error('Stored entity is corrupted');
  return JSON.parse(data) as T;
}

export function normalizeSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const copy = structuredClone(snapshot);
  const labels = normalizeLabelDefinitions(copy.labels);
  const labelIds = new Set(labels.map(label => label.id));
  return {
    ...copy,
    members: copy.members ?? [],
    projects: (copy.projects ?? []).map(project => ({
      ...project,
      fav: project.fav ?? false,
      members: project.members ?? [],
      milestones: project.milestones ?? [],
      revision: project.revision ?? 0,
    })),
    tasks: (copy.tasks ?? []).map(task => ({
      ...task,
      labels: (task.labels ?? []).filter(id => labelIds.has(id)),
      subtasks: task.subtasks ?? [],
      attachments: task.attachments ?? [],
      deps: task.deps ?? [],
      fav: task.fav ?? false,
      recur: task.recur ?? null,
      revision: task.revision ?? 0,
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

export type RowByEntity = {
  task: Task;
  project: Project;
  member: Member;
  comment: Comment;
  file: FileRecord;
  savedView: SavedView;
  activity: Activity;
};
