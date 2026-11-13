import { diffD, parse } from './utils.js';

export function isCompletedOn(task, day) {
  if (!task.completedAt) return false;
  const completed = new Date(task.completedAt);
  return !Number.isNaN(completed.getTime()) && diffD(completed, day) === 0;
}

export function focusCounts(tasks, today) {
  const open = tasks.filter(task => task.status !== 'done');
  const overdue = open.filter(task => task.due && diffD(parse(task.due), today) < 0);
  const todayOpen = open.filter(task => task.due && diffD(parse(task.due), today) === 0);
  const todayDone = tasks.filter(task => task.status === 'done' && task.due && diffD(parse(task.due), today) === 0);
  const overdueDone = tasks.filter(task => task.status === 'done' && task.due && diffD(parse(task.due), today) < 0 && isCompletedOn(task, today));

  return {
    overdue,
    todayOpen,
    todayDone,
    overdueDone,
    total: overdue.length + todayOpen.length + todayDone.length + overdueDone.length,
    done: todayDone.length + overdueDone.length,
  };
}
