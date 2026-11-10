/* ---------- FOCUS ---------- */
import { TODAY, diffD, esc, parse } from '../core/utils.js';
import { allTasks, isOver, pColor, proj } from '../core/store.js';
import { sortTasks } from '../shell/view-engine.js';
import { t } from '../i18n/index.js';

function focusRow(task, overdue) {
  const p = proj(task.project);
  const days = overdue ? -diffD(parse(task.due), TODAY) : 0;
  return `<div class="hrow" data-a="openTask" data-id="${task.id}" data-ctx="task" role="button" tabindex="0">
    <input type="checkbox" class="check round" data-a="toggleDone" data-id="${task.id}" aria-label="${esc(t('tasks.completeTask', { title: task.title }))}">
    <div class="grow">
      <div class="tt">${esc(task.title)}</div>
      <div class="meta">
        ${overdue ? `<span class="due-over">${t('home.overdueDays', { count: days })}</span>` : ''}
        <span class="pj"><span class="pdot" style="--c:${pColor(p)}"></span><span class="trunc">${esc(p?.name || '')}</span></span>
      </div>
    </div>
  </div>`;
}

function focusCol(kind, title, rows, emptyKey) {
  return `<section class="home-col ${kind}">
    <header class="home-col-h"><h3>${title}</h3></header>
    <div class="home-col-list">${rows.length ? rows : `<p class="home-col-empty">${emptyKey}</p>`}</div>
  </section>`;
}

export function pageFocus() {
  const open = allTasks().filter(t => t.status !== 'done');
  const overdue = sortTasks(open.filter(isOver), { f: 'due', dir: 1 });
  const today = sortTasks(
    open.filter(t => t.due && diffD(parse(t.due), TODAY) === 0),
    { f: 'priority', dir: 1 },
  );

  const columns = [
    focusCol('over', t('home.overdueCol', { count: overdue.length }), overdue.map(t => focusRow(t, true)).join(''), t('home.colEmptyOverdue')),
    focusCol('today', t('home.todayCol', { count: today.length }), today.map(t => focusRow(t, false)).join(''), t('home.colEmptyToday')),
  ];

  return `<div class="page home-cmd">
    <div class="ph home-ph">
      <div>
        <p class="home-greet">${t('home.attention')}</p>
      </div>
    </div>
    <div class="home-cols">${columns.join('')}</div>
  </div>`;
}
