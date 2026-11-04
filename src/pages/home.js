/* ---------- HOME ---------- */
import { DAY, TODAY, addD, diffD, esc, fmtDate, fmtWeekdayDate, iso, monthLong, parse, weekdayShort } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { allTasks, isOver, me, progressOf, visibleProjects } from '../core/store.js';
import { empty, pIcon, pStatus, progBar } from '../ui/helpers.js';
import { sortTasks } from '../shell/view-engine.js';
import { startOfWeek } from '../views/calendar.js';
import { miniRow } from '../components/task-list.js';
import { t } from '../i18n/index.js';

export function pageHome() {
  const h = new Date().getHours();
  const greet = h < 12 ? t('home.morning') : h < 18 ? t('home.afternoon') : t('home.evening');
  const ownerName = me()?.name || '';
  const all = allTasks();
  const activeP = visibleProjects().filter(p => p.status !== 'complete');
  const open = all.filter(t => t.status !== 'done');
  const doneWk = all.filter(t => t.status === 'done' && t.completedAt && Date.now() - t.completedAt < 7 * DAY);
  const summary = (key, count) => t(key, { count, value: `<span class="v">${count}</span>` });
  const overdue = open.filter(isOver);
  const upcoming = sortTasks(
    open.filter(t => t.due && diffD(parse(t.due), TODAY) >= 0 && diffD(parse(t.due), TODAY) < 7),
    { f: 'due', dir: 1 },
  );
  const cur = upcoming.slice(0, 7);
  const weekStart = startOfWeek(TODAY);
  const weekDays = Array.from({ length: 7 }, (_, i) => addD(weekStart, i));
  const dueCounts = new Map();
  for (const task of open) {
    if (task.due) dueCounts.set(task.due, (dueCounts.get(task.due) || 0) + 1);
  }
  const nextDue = sortTasks(
    open.filter(t => t.due && diffD(parse(t.due), TODAY) >= 0),
    { f: 'due', dir: 1 },
  )[0]?.due;
  const scheduleCounts = [
    { label: t('time.today'), count: dueCounts.get(iso(TODAY)) || 0 },
    { label: t('time.tomorrow'), count: dueCounts.get(iso(addD(TODAY, 1))) || 0 },
    { label: t('home.nextSevenDays'), count: upcoming.length },
  ];
  return `<div class="page">
    <div class="ph"><div><h1>${greet}, ${esc(ownerName.split(' ')[0])}</h1><p><span class="num">${fmtWeekdayDate(TODAY)}</span> · ${t('home.attention')}</p></div>
      <div class="acts"><button class="btn btn-secondary hide-m" data-a="newProject">${ic('folder-plus', 14)}${t('common.newProject')}</button><button class="btn btn-primary" data-a="newTask">${ic('plus', 14)}${t('common.newTask')}</button></div></div>
    <div class="stats">
      <button class="stat" data-a="go" data-r="projects">${ic('folder-kanban', 14)}<span class="k">${summary('home.activeProjectsSummary', activeP.length)}</span></button>
      <button class="stat" data-a="goTasks" data-f="open">${ic('circle-dashed', 14)}<span class="k">${summary('home.openTasksSummary', open.length)}</span></button>
      <button class="stat" data-a="goTasks" data-f="done">${ic('circle-check', 14)}<span class="k">${summary('home.completedThisWeekSummary', doneWk.length)}</span></button>
    </div>
    <div class="grid2 home-grid">
      <div class="stack">
        <section class="panel" aria-labelledby="h-mytasks">
          <div class="panel-h"><h2 id="h-mytasks">${t('home.recentTasks')}</h2>
            <div class="acts"><button class="btn btn-sm btn-ghost" data-a="goTasks">${t('tasks.allTasks')}${ic('arrow-up-right', 14)}</button></div></div>
          ${overdue.length ? `<div class="home-task-notice alert danger"><span class="row">${ic('circle-alert', 15)}<b>${t('home.overdueTasksNotice', { count: overdue.length })}</b></span><button class="btn btn-sm btn-ghost" data-a="goTasks" data-f="overdue">${t('home.reviewOverdue')}${ic('arrow-right', 14)}</button></div>` : ''}
          <div class="home-task-heading">${t('home.upcomingDeadlines')}<span class="cnt">${upcoming.length}</span></div>
          ${cur.length ? cur.map(t => miniRow(t, { av: false })).join('') : empty('list-checks', t('home.noUpcomingTasks'), '', '', 'sm')}
          <div class="home-task-footer"><button class="btn btn-sm btn-ghost" data-a="newTask">${ic('plus', 14)}${t('common.addTask')}</button>
            ${upcoming.length > 7 ? `<button class="btn btn-sm btn-ghost" data-a="goTasks" data-f="open">${t('home.viewAllTasks', { count: open.length })}${ic('arrow-right', 13)}</button>` : ''}</div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2>${t('home.projectProgress')}</h2><div class="acts"><button class="btn btn-sm btn-ghost" data-a="go" data-r="projects">${t('home.allProjects')}${ic('arrow-up-right', 14)}</button></div></div>
          <div style="overflow-x:auto"><table class="perm-t" style="min-width:500px" aria-label="${esc(t('home.projectProgress'))}"><tbody>
          ${activeP
            .map(p => {
              const pr = progressOf(p.id);
              return `<tr style="cursor:pointer" data-a="go" data-r="project" data-id="${p.id}" data-tab="overview"><td style="padding-left:14px"><span class="row">${pIcon(p, '', 14)}<b style="font-weight:500">${esc(p.name)}</b></span></td><td style="text-align:left">${pStatus(p.status)}</td><td><span class="row">${progBar(pr, p.status === 'risk' ? 'red' : '')}<span class="num faint" style="font-size:11.5px;width:30px">${pr}%</span></span></td><td style="text-align:left" class="num muted">${t('common.dueOn', { date: fmtDate(p.due) })}</td></tr>`;
            })
            .join('')}
          </tbody></table></div>
        </section>
      </div>
      <div class="stack">
        <section class="panel">
          <div class="panel-h"><h2>${t('home.scheduleOverview')}</h2><div class="acts"><button class="btn btn-sm btn-ghost" data-a="go" data-r="calendar">${ic('calendar', 13)}${t('nav.calendar')}</button></div></div>
          <div class="panel-b">
            <div class="home-schedule-month">${monthLong(TODAY.getMonth())}</div>
            <div class="home-schedule-week">
              ${weekDays
                .map(day => {
                  const date = iso(day);
                  const count = dueCounts.get(date) || 0;
                  const today = diffD(day, TODAY) === 0;
                  return `<div class="home-schedule-day"><span class="muted">${weekdayShort(day.getDay())}</span><time datetime="${date}" class="num ${today ? 'today' : ''}" ${today ? 'aria-current="date"' : ''}>${day.getDate()}</time><span class="home-schedule-dot ${count ? 'has-tasks' : ''}" ${count ? `role="img" aria-label="${esc(t('home.tasksDueCount', { count }))}" title="${esc(t('home.tasksDueCount', { count }))}"` : 'aria-hidden="true"'}></span></div>`;
                })
                .join('')}
            </div>
            <dl class="home-schedule-counts">${scheduleCounts.map(({ label, count }) => `<div><dt>${label}</dt><dd>${count ? t('home.tasksDueCount', { count }) : t('home.noTasksDue')}</dd></div>`).join('')}</dl>
            <p class="home-schedule-next muted">${nextDue ? t('home.nextDeadline', { date: fmtDate(nextDue) }) : t('home.noNextDeadline')}</p>
          </div>
        </section>
      </div>
    </div>
  </div>`;
}
