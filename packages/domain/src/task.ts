import type { Task, TaskPriority, TaskStatus } from '@moss/contracts';

export const TASK_STATUSES: TaskStatus[] = ['backlog', 'todo', 'progress', 'review', 'done'];
export const TASK_PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'none'];

export const RECURRENCE_DAYS: Record<string, number> = {
  Daily: 1,
  Weekly: 7,
  'Every 2 weeks': 14,
  Monthly: 30,
};

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function taskOrder(tasks: Task[]): number {
  return Math.max(0, ...tasks.map(task => task.order)) + 1;
}

export function normalizeTaskDates(task: Task): Task {
  if (task.start && task.due && task.start > task.due) {
    return { ...task, start: task.due };
  }
  return task;
}

export function nextRecurringTask(task: Task, now = Date.now()): Task | null {
  if (task.status !== 'done' || !task.recur || !task.due) return null;
  const due = addDays(task.due, RECURRENCE_DAYS[task.recur] ?? 7);
  return normalizeTaskDates({
    ...structuredClone(task),
    id: '',
    key: '',
    status: 'todo',
    due,
    start: due,
    completedAt: null,
    prevStatus: null,
    attachments: [],
    subtasks: task.subtasks.map(subtask => ({ ...subtask, done: false })),
    created: now,
    updated: now,
    revision: 0,
  });
}

export function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus);
}

export function isTaskPriority(value: string): value is TaskPriority {
  return TASK_PRIORITIES.includes(value as TaskPriority);
}
