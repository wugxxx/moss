/* ---------- HOME: work overview ---------- */
import { TODAY, diffD, dOff, esc, fmtDate, iso, parse } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { allTasks, isOver, me, progressOf, tasksOf, visibleProjects } from '../core/store.js';
import { empty, pIcon, progBar } from '../ui/helpers.js';
import { getIntlLocale, t } from '../i18n/index.js';

const heat = n => (n === 0 ? '' : `style="--heat:color-mix(in srgb, var(--accent) ${Math.min(10 + n * 3, 40)}%, transparent)"`);

function dueCell(date, i, count) {
  const d = parse(date);
  const label = i === 0 ? t('time.today') : `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
  return `<div class="due-cell ${i === 0 ? 'today' : ''}" ${heat(count)} data-a="go" data-r="calendar" role="link" tabindex="0" aria-label="${label}">
    <span class="dd">${label}</span>
    <span class="dn ${count ? '' : 'empty'}">${count || '—'}</span>
  </div>`;
}

function projectRow(p) {
  const ts = tasksOf(p.id);
  const pr = progressOf(p.id);
  const done = ts.filter(t => t.status === 'done').length;
  const overdue = ts.filter(isOver).length;
  return `<div class="prow" data-a="go" data-r="project" data-id="${p.id}" data-tab="overview" role="link" tabindex="0" aria-label="${esc(p.name)}">
    ${pIcon(p)}
    <span class="pname trunc">${esc(p.name)}</span>
    <span class="pprog">${progBar(pr, p.status === 'risk' ? 'red' : '')}</span>
    <span class="pct">${pr}%</span>
    <span class="pdone">${done}/${ts.length}</span>
    ${p.due ? `<span class="pdue">${ic('calendar', 12)}${fmtDate(p.due)}</span>` : ''}
    ${overdue ? `<span class="pover" data-tip="${esc(t('home.overdueCount', { count: overdue }))}">${ic('circle-alert', 12)}${overdue}</span>` : ''}
    <span class="pchev">${ic('chevron-right', 14)}</span>
  </div>`;
}

function greetHeading() {
  const h = new Date().getHours();
  const name = (me()?.name || '').split(' ')[0];
  if (h < 5 || h >= 23) return name ? t('home.lateNight', { name: esc(name) }) : t('home.night');
  const greet = t(h < 8 ? 'home.morning' : h < 11 ? 'home.forenoon' : h < 13 ? 'home.noon' : h < 18 ? 'home.afternoon' : 'home.evening');
  return name ? t('home.greetHeading', { greet, name: esc(name) }) : greet;
}

export function pageHome() {
  const all = allTasks();
  const open = all.filter(t => t.status !== 'done');
  const activeP = visibleProjects().filter(p => p.status !== 'complete');

  const overdue = open.filter(isOver).length;
  const dueToday = open.filter(t => t.due && diffD(parse(t.due), TODAY) === 0).length;
  const upcoming = open.filter(t => {
    if (!t.due) return false;
    const n = diffD(parse(t.due), TODAY);
    return n >= 1 && n <= 7;
  }).length;
  const startsToday = open.filter(t => t.start && diffD(parse(t.start), TODAY) === 0).length;

  const cells = [];
  let totalDue = 0;
  for (let i = 0; i < 7; i++) {
    const date = dOff(i);
    const count = open.filter(t => t.due === date).length;
    totalDue += count;
    cells.push(dueCell(date, i, count));
  }

  const dateLine = new Intl.DateTimeFormat(getIntlLocale(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(TODAY);

  const stats = [
    { v: open.length, label: t('home.statPending'), f: 'open' },
    { v: overdue, label: t('home.statOverdueShort'), cls: 'red', f: 'overdue' },
    { v: dueToday, label: t('home.statDueToday'), f: 'today' },
    { v: upcoming, label: t('home.statUpcoming'), f: 'week', tip: t('home.upcomingHint') },
    { v: startsToday, label: t('home.statStartsToday'), f: 'start' },
  ];

  return `<div class="page home-cmd">
    <div class="ph home-ph">
      <div>
        <h1>${greetHeading()}</h1>
        <p class="home-greet">${dateLine}</p>
      </div>
      <div class="acts"><button class="btn btn-primary" data-a="newTask" data-due="${iso(TODAY)}">${ic('plus', 14)}${t('common.newTask')}</button></div>
    </div>
    <div class="home-stats">
      ${stats
        .map(s => {
          const act = s.f ? `data-a="goTasks" data-f="${s.f}"` : `data-a="go" data-r="${s.r}"`;
          return `<div class="home-stat link" ${act} ${s.tip ? `data-tip="${esc(s.tip)}"` : ''}><b class="num ${s.cls || ''}">${s.v}</b><span>${s.label}</span></div>`;
        })
        .join('')}
    </div>
    <section class="home-rhythm" aria-labelledby="h-rhythm">
      <div class="panel-h"><h2 id="h-rhythm">${t('home.dueDistribution')}</h2></div>
      ${totalDue ? `<div class="due-grid">${cells.join('')}</div>` : `<p class="rhythm-empty">${t('home.rhythmEmpty')}</p>`}
    </section>
    <section class="home-progress" aria-labelledby="h-progress">
      <div class="panel-h"><h2 id="h-progress">${t('home.unfinishedProjects')}</h2>
        <div class="acts"><button class="btn btn-sm btn-ghost" data-a="go" data-r="projects">${t('home.allProjects')}${ic('arrow-up-right', 14)}</button></div></div>
      ${activeP.length ? `<div class="home-projects"><div class="prows">${activeP.map(projectRow).join('')}</div></div>` : empty('folder-kanban', t('home.emptyProjects'), t('home.noProjectsText'), '', 'sm')}
    </section>
  </div>`;
}
