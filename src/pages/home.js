/* ---------- HOME ---------- */
import { TODAY, diffD, esc, fmtDate, fmtWeekdayDate, iso, parse } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { allTasks, isOver, me, pColor, proj, progressOf, tasksOf, visibleProjects } from '../core/store.js';
import { empty, pIcon, pStatus, progBar } from '../ui/helpers.js';
import { sortTasks } from '../shell/view-engine.js';
import { t } from '../i18n/index.js';

function homeRow(task, overdue) {
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

function homeProjectCard(p) {
  const ts = tasksOf(p.id);
  const pr = progressOf(p.id);
  const done = ts.filter(t => t.status === 'done').length;
  const overdue = ts.filter(isOver).length;
  return `<div class="pcard" data-a="go" data-r="project" data-id="${p.id}" data-tab="overview" role="link" tabindex="0" aria-label="${esc(p.name)}">
    <div class="row">${pIcon(p)}<div class="grow" style="min-width:0"><b class="trunc" style="font-weight:600">${esc(p.name)}</b></div>${pStatus(p.status)}</div>
    <div class="row" style="gap:10px">${progBar(pr, p.status === 'risk' ? 'red' : '')}<span class="num" style="font-size:12px;font-weight:500">${pr}%</span></div>
    <div class="foot">
      <span class="row" style="gap:4px">${ic('circle-check', 12)}${done}/${ts.length}</span>
      ${overdue ? `<span class="row" style="gap:4px;color:var(--red)" data-tip="${esc(t('home.overdueCount', { count: overdue }))}">${ic('circle-alert', 12)}${overdue}</span>` : ''}
      <span class="sp"></span>
      <span class="row" style="gap:4px">${ic('calendar', 12)}${fmtDate(p.due)}</span>
    </div>
  </div>`;
}

function homeCol(kind, title, rows) {
  return `<section class="home-col ${kind}">
    <header class="home-col-h"><h3>${title}</h3></header>
    <div class="home-col-list">${rows}</div>
  </section>`;
}

export function pageHome() {
  const h = new Date().getHours();
  const greet = h < 12 ? t('home.morning') : h < 14 ? t('home.noon') : h < 18 ? t('home.afternoon') : t('home.evening');
  const ownerName = me()?.name || '';
  const all = allTasks();
  const activeP = visibleProjects().filter(p => p.status !== 'complete');
  const open = all.filter(t => t.status !== 'done');
  const doneCount = all.length - open.length;
  const overdue = sortTasks(open.filter(isOver), { f: 'due', dir: 1 });
  const today = sortTasks(
    open.filter(t => t.due && diffD(parse(t.due), TODAY) === 0),
    { f: 'priority', dir: 1 },
  );
  const pct = all.length ? Math.round((doneCount / all.length) * 100) : 0;

  const columns = [
    homeCol(
      'over',
      t('home.overdueCol', { count: overdue.length }),
      overdue.length ? overdue.map(t => homeRow(t, true)).join('') : `<p class="home-col-empty">${t('home.colEmptyOverdue')}</p>`,
    ),
    homeCol(
      'today',
      t('home.todayCol', { count: today.length }),
      today.length ? today.map(t => homeRow(t, false)).join('') : `<p class="home-col-empty">${t('home.colEmptyToday')}</p>`,
    ),
  ];

  const projects = activeP.map(homeProjectCard).join('');

  return `<div class="page home-cmd">
    <div class="ph home-ph">
      <div>
        <h1>${t('home.todayHeading')}</h1>
        <p class="home-greet">${t('home.greetLine', { greet, name: esc(ownerName.split(' ')[0]), motd: t('home.motd') })}</p>
      </div>
      <div class="acts"><button class="btn btn-primary" data-a="newTask" data-due="${iso(TODAY)}">${ic('plus', 14)}${t('common.newTask')}</button></div>
    </div>
    <div class="home-stats">
      <div class="home-stat date"><span class="row">${ic('calendar', 18)}<span>${fmtWeekdayDate(TODAY)}</span></span></div>
      <div class="home-stat"><b class="num">${activeP.length}</b><span>${t('home.statProjectsLabel')}</span></div>
      <div class="home-stat"><b class="num">${open.length}</b><span>${t('home.statOpenLabel')}</span></div>
      <div class="home-stat"><b class="num">${pct}%</b><span>${t('home.completionLabel')}</span></div>
    </div>
    <div class="home-cols">${columns.join('')}</div>
    <section class="home-progress" aria-labelledby="h-progress">
      <div class="panel-h"><h2 id="h-progress">${t('home.progressOverview')}</h2>
        <div class="acts"><button class="btn btn-sm btn-ghost" data-a="go" data-r="projects">${t('home.allProjects')}${ic('arrow-up-right', 14)}</button></div></div>
      ${activeP.length ? `<div class="home-projects"><div class="pgrid">${projects}</div></div>` : empty('folder-kanban', t('home.noProjects'), t('home.noProjectsText'), '', 'sm')}
    </section>
  </div>`;
}
