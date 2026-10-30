/* ---------- PROJECTS ---------- */
import { ago, esc, fmtDate } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, progressOf, tasksOf, visibleProjects } from '../core/store.js';
import { empty, pIcon, pStatus, progBar } from '../ui/helpers.js';
import { t } from '../i18n/index.js';

function projectLastAt(p) {
  if (typeof p.last === 'number' && Number.isFinite(p.last) && p.last > 0) return p.last;
  return D().activity.find(activity => activity.project === p.id)?.at ?? null;
}

export function projectCard(p) {
  const ts = tasksOf(p.id);
  const pr = progressOf(p.id);
  const open = ts.filter(t => t.status !== 'done').length;
  return `<div class="pcard" data-a="go" data-r="project" data-id="${p.id}" data-ctx="project" role="link" tabindex="0" aria-label="${esc(p.name)}">
    <div class="row">${pIcon(p)}<div class="grow" style="min-width:0"><div class="row" style="gap:6px"><b class="trunc" style="font-weight:600;font-size:14px">${esc(p.name)}</b>${p.fav ? `<span style="color:var(--amber)">${ic('star', 12)}</span>` : ''}</div></div>${pStatus(p.status)}</div>
    <div class="desc">${esc(p.desc)}</div>
    <div class="row" style="gap:10px">${progBar(pr, p.status === 'complete' ? 'green' : p.status === 'risk' ? 'red' : '')}<span class="num" style="font-size:12px;font-weight:500">${pr}%</span></div>
    <div class="foot"><span class="row" style="gap:4px">${ic('circle-check', 12)}${ts.length - open}/${ts.length}</span><span class="row" style="gap:4px">${ic('calendar', 12)}${fmtDate(p.due)}</span><span class="row hide-m" style="gap:4px">${ic('clock', 12)}${ago(projectLastAt(p))}</span></div>
    <button class="ibtn ibtn-sm more" data-a="ctxBtn" data-ctx="project" data-id="${p.id}" aria-label="${t('nav.projectOptions')}" style="background:var(--surface);box-shadow:0 0 0 1px var(--border)">${ic('ellipsis', 14)}</button>
  </div>`;
}
export function pageProjects() {
  const u = S.ui;
  const q = (u.projQ || '').toLowerCase();
  const st = u.projStatus || 'all';
  const sort = u.projSort || 'recent';
  let ps = visibleProjects().filter(p => (st === 'all' || p.status === st) && (!q || p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)));
  const sorter = { recent: p => p.last, name: p => p.name, due: p => p.due, progress: p => -progressOf(p.id) }[sort];
  ps.sort((a, b) => (sorter(a) > sorter(b) ? 1 : -1));
  const view = u.projView;
  let body;
  if (!visibleProjects().length)
    body = `<div class="panel">${empty('folder-kanban', t('projects.noProjects'), t('projects.noProjectsText'), `<button class="btn btn-primary btn-sm" data-a="newProject">${ic('plus', 14)}${t('projects.createProject')}</button>`)}</div>`;
  else if (!ps.length)
    body = `<div class="panel">${empty('search-x', t('common.noResults'), t('projects.noMatches'), `<button class="btn btn-secondary btn-sm" data-a="clearProjFilters">${t('common.clearFilters')}</button>`)}</div>`;
  else if (view === 'grid') body = `<div class="pgrid">${ps.map(projectCard).join('')}</div>`;
  else if (view === 'list')
    body = `<div class="panel" style="overflow:hidden">${ps
      .map(p => {
        const pr = progressOf(p.id);
        return `<div class="mini" style="min-height:52px;gap:12px" data-a="go" data-r="project" data-id="${p.id}" data-ctx="project">${pIcon(p)}<div class="grow" style="min-width:0"><div class="row" style="gap:6px"><b style="font-weight:500">${esc(p.name)}</b></div><div class="trunc faint" style="font-size:12px">${esc(p.desc)}</div></div><span class="hide-m">${pStatus(p.status)}</span><span class="row hide-m" style="width:140px">${progBar(pr)}<span class="num faint" style="font-size:11.5px">${pr}%</span></span><span class="num muted hide-m" style="width:70px;font-size:12px">${fmtDate(p.due)}</span><button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="project" data-id="${p.id}" aria-label="${t('common.options')}">${ic('ellipsis', 14)}</button></div>`;
      })
      .join('')}</div>`;
  else
    body = `<div class="panel" style="overflow-x:auto"><table class="perm-t" style="min-width:760px"><thead><tr><th style="padding-left:14px">${t('common.project')}</th><th style="text-align:left">${t('common.status')}</th><th style="text-align:left;width:18%">${t('common.progress')}</th><th>${t('common.tasksLabel')}</th><th style="text-align:left">${t('projects.start')}</th><th style="text-align:left">${t('projects.due')}</th><th style="text-align:left">${t('common.lastActivity')}</th><th></th></tr></thead><tbody>
    ${ps
      .map(p => {
        const ts = tasksOf(p.id);
        const pr = progressOf(p.id);
        return `<tr style="cursor:pointer" data-a="go" data-r="project" data-id="${p.id}" data-ctx="project"><td style="padding-left:14px"><span class="row">${pIcon(p, '', 14)}<span style="font-weight:500">${esc(p.name)}</span></span></td><td style="text-align:left">${pStatus(p.status)}</td><td><span class="row">${progBar(pr)}<span class="num faint" style="font-size:11.5px">${pr}%</span></span></td><td class="num">${ts.length}</td><td style="text-align:left" class="num muted">${fmtDate(p.start)}</td><td style="text-align:left" class="num muted">${fmtDate(p.due)}</td><td style="text-align:left" class="muted">${ago(projectLastAt(p))}</td><td><button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="project" data-id="${p.id}" aria-label="${t('common.options')}">${ic('ellipsis', 14)}</button></td></tr>`;
      })
      .join('')}
    </tbody></table></div>`;
  return `<div class="page wide">
    <div class="ph"><div><h1>${t('projects.title')}</h1><p>${t('projects.activeCompleted', { active: visibleProjects().filter(p => p.status !== 'complete').length, completed: visibleProjects().filter(p => p.status === 'complete').length })}</p></div><div class="acts"><button class="btn btn-primary" data-a="newProject">${ic('plus', 14)}${t('common.newProject')}</button></div></div>
    <div class="row" style="margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div class="inwrap">${ic('search', 13)}<input class="input search-sm" id="proj-q" data-in="projQ" placeholder="${t('projects.searchPlaceholder')}" value="${esc(u.projQ || '')}" aria-label="${t('projects.searchPlaceholder')}"></div>
      <select class="select" style="height:26px;width:auto;font-size:12px" data-in="projStatus" aria-label="${t('projects.filterByStatus')}"><option value="all">${t('projects.allStatuses')}</option>${Object.entries(
        PSTAT,
      )
        .map(([k, v]) => `<option value="${k}" ${st === k ? 'selected' : ''}>${v.name}</option>`)
        .join('')}</select>
      <select class="select" style="height:26px;width:auto;font-size:12px" data-in="projSort" aria-label="${t('common.sort')}">${[
        ['recent', t('projects.recentlyActive')],
        ['name', t('common.name')],
        ['due', t('common.dueDate')],
        ['progress', t('common.progress')],
      ]
        .map(([k, n]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>${t('projects.sortPrefix', { value: n })}</option>`)
        .join('')}</select>
      <span class="sp"></span>
      <div class="seg" role="tablist" aria-label="${t('projects.layout')}">${[
        ['grid', t('projects.grid'), 'layout-grid'],
        ['list', t('projects.list'), 'list'],
        ['table', t('projects.table'), 'table-2'],
      ]
        .map(
          ([k, n, i]) =>
            `<button class="${view === k ? 'on' : ''}" data-a="set" data-k="projView" data-v="${k}" aria-label="${n}">${ic(i, 13)}<span class="hide-m">${n}</span></button>`,
        )
        .join('')}</div>
    </div>
    ${body}
  </div>`;
}
