import { focusCounts } from '../core/focus-stats.js';

const PRIORITY_WEIGHT = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

const priorityOf = task => PRIORITY_WEIGHT[task.priority] ?? 0;

function compareToday(a, b) {
  return priorityOf(b) - priorityOf(a) || (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title);
}

function compareOverdue(a, b) {
  return String(a.due ?? '').localeCompare(String(b.due ?? '')) || compareToday(a, b);
}

export function activeWorkspaceTasks(snapshot) {
  const archivedProjects = new Set(snapshot.projects.filter(project => project.archived).map(project => project.id));
  return snapshot.tasks.filter(task => !task.archived && !archivedProjects.has(task.project));
}

export function collectTrayTasks(snapshot, today) {
  const counts = focusCounts(activeWorkspaceTasks(snapshot), today);
  return {
    overdue: [...counts.overdue].sort(compareOverdue),
    today: [...counts.todayOpen].sort(compareToday),
  };
}
