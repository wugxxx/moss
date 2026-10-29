/* ---------- shell ---------- */
import { MOD, TODAY, diffD, esc, parse } from '../core/utils.js';
import { ic, wsLogo } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, allTasks, pColor, proj, visibleProjects } from '../core/store.js';
import { av } from '../ui/helpers.js';
import { ROUTE_NAMES } from './render.js';
import { skeleton } from './skeletons.js';
import { pageHome } from '../pages/home.js';
import { pageTasks } from '../pages/tasks.js';
import { pageFavorites } from '../pages/favorites.js';
import { pageProjects } from '../pages/projects.js';
import { pageSearch } from '../pages/search.js';
import { page404, stateFailed } from '../pages/errors.js';
import { pageProject } from '../pages/project.js';
import { pageWsCalendar } from '../views/calendar.js';
import { pageWsTimeline } from '../views/timeline.js';
import { pageSettings } from '../pages/settings.js';
import { t } from '../i18n/index.js';

export function renderShell() {
  const u = S.ui;
  return `<button class="skip" data-a="skipToContent">${t('nav.skipToContent')}</button><div class="shell ${u.collapsed ? 'collapsed' : ''} ${u.mnav ? 'mnav' : ''} ${u.fx.tabs ? 'fx-tabs' : ''}">
    ${renderSidebar()}
    ${u.mnav ? '<div class="side-scrim" data-a="closeMnav"></div>' : ''}
    <main class="main" id="main">
      ${renderTopbar()}
      <div class="content ${u.fx.route ? 'fx-route' : ''}" id="main-content" tabindex="-1" data-keep="c:${u.route}:${u.params.id || ''}:${u.params.tab || ''}:${u.params.sec || ''}">${u.loading ? skeleton() : renderPage()}</div>
    </main>
    ${renderBottomNav()}
  </div>`;
}
export function renderPage() {
  const r = S.ui.route;
  try {
    const P = {
      home: pageHome,
      favorites: pageFavorites,
      search: pageSearch,
      projects: pageProjects,
      project: pageProject,
      tasks: pageTasks,
      calendar: pageWsCalendar,
      timeline: pageWsTimeline,
      settings: pageSettings,
    };
    return (P[r] || page404)();
  } catch (e) {
    console.error(e);
    return stateFailed();
  }
}

export function sItem(route, label, icon, opt = {}) {
  const on = S.ui.route === route && (!opt.id || S.ui.params.id === opt.id);
  return `<button class="sitem ${on ? 'on' : ''}" data-a="${opt.act || 'go'}" data-r="${route}" ${opt.id ? `data-id="${opt.id}"` : ''} ${S.ui.collapsed ? `data-tip="${esc(label)}" data-tip-pos="right"` : ''} ${on ? 'aria-current="page"' : ''}>${ic(icon, 16)}<span class="trunc">${esc(label)}</span>${opt.ct ? `<span class="ct ${opt.dot ? 'dotc' : ''}">${opt.ct}</span>` : ''}${opt.kbd ? `<span class="ct hide-m"><kbd>${opt.kbd}</kbd></span>` : ''}</button>`;
}
export function renderSidebar() {
  const u = S.ui,
    d = D();
  const owner = d.members.find(member => member.id === d.me);
  const dueSoon = allTasks().filter(t => t.status !== 'done' && t.due && diffD(parse(t.due), TODAY) <= 0).length;
  const projs = visibleProjects().filter(p => p.status !== 'complete');
  const inProj = u.route === 'project' ? u.params.id : null;
  return `<nav class="side" aria-label="${t('nav.main')}">
    <div class="side-top">
      <div class="row" style="gap:2px">
        <button class="ws grow" data-a="go" data-r="home" aria-label="${t('nav.home')}">
          ${wsLogo(d.ws, 22)}
          <span class="ws-name trunc">${esc(d.ws.name)}</span>
        </button>
        ${u.collapsed ? '' : `<button class="ibtn ibtn-sm hide-m" data-a="toggleSide" data-tip="${t('nav.collapseSidebar')}  [" aria-label="${t('nav.collapseSidebar')}">${ic('panel-left', 15)}</button>`}
      </div>
    </div>
    <div class="side-scroll" data-keep="side">
      ${u.collapsed ? `<button class="sitem" data-a="toggleSide" data-tip="${t('nav.expandSidebar')}" data-tip-pos="right" aria-label="${t('nav.expandSidebar')}">${ic('panel-left', 16)}</button>` : ''}
      ${sItem('home', t('nav.home'), 'house')}
      ${sItem('tasks', t('nav.tasks'), 'circle-check', { ct: dueSoon || '' })}
      ${sItem('favorites', t('nav.favorites'), 'star')}
      <div class="sgroup">
        <div class="sgroup-h">${t('nav.work')}</div>
        ${sItem('projects', t('nav.projects'), 'folder-kanban')}
        ${sItem('calendar', t('nav.calendar'), 'calendar')}
        ${sItem('timeline', t('nav.timeline'), 'chart-gantt')}
      </div>
      <div class="sgroup" id="side-projects">
        <div class="sgroup-h"><span>${t('nav.projects')}</span><span class="sp"></span><button class="ibtn ibtn-xs" data-a="newProject" data-tip="${t('common.newProject')}  P" aria-label="${t('common.newProject')}">${ic('plus', 14)}</button></div>
        ${projs
          .map(p => {
            const open = !!u.expanded[p.id];
            const on = inProj === p.id;
            return `<div class="sproj" data-proj-drop="${p.id}">
            <div class="sitem ${on ? 'on' : ''}" draggable="true" data-drag-proj="${p.id}" data-a="go" data-r="project" data-id="${p.id}" data-ctx="project" role="link" tabindex="0" ${u.collapsed ? `data-tip="${esc(p.name)}" data-tip-pos="right"` : ''}>
              <span class="pico" style="--c:${pColor(p)}" data-a="toggleExpand" data-id="${p.id}" aria-label="${t('nav.toggleSubPages')}">${ic(p.icon, 12)}</span>
              <span class="trunc">${esc(p.name)}</span>
              ${p.fav ? `<span class="fav">${ic('star', 11)}</span>` : ''}
              <span class="sdot" style="background:${PSTAT[p.status].c}" title="${PSTAT[p.status].name}"></span>
              <span class="hov"><span class="ibtn ibtn-xs" data-a="ctxBtn" data-ctx="project" data-id="${p.id}" aria-label="${t('nav.projectOptions')}">${ic('ellipsis', 14)}</span><span class="ibtn ibtn-xs" data-a="toggleExpand" data-id="${p.id}" aria-label="${t('nav.expand')}">${ic('chevron-right', 13, 'chev ' + (open ? 'open' : ''))}</span></span>
            </div>
            <div class="sub ${open && !u.collapsed ? 'open' : ''}">
              ${[
                ['board', t('project.board'), 'square-kanban'],
                ['list', t('project.list'), 'list'],
                ['timeline', t('project.timeline'), 'chart-gantt'],
                ['files', t('project.files'), 'paperclip'],
              ]
                .map(
                  ([tab, n, i]) =>
                    `<button class="sitem ${on && u.params.tab === tab ? 'on' : ''}" data-a="go" data-r="project" data-id="${p.id}" data-tab="${tab}">${ic(i, 14)}<span>${n}</span></button>`,
                )
                .join('')}
            </div>
          </div>`;
          })
          .join('')}
      </div>
    </div>
    <div class="side-bot">
      <button class="sitem" data-a="pop" data-pop="user" style="height:36px" ${u.collapsed ? `data-tip="${t('nav.localProfile')}" data-tip-pos="right"` : ''}>${av(d.me, '', false)}<span class="trunc" style="color:var(--text);font-weight:500">${esc(owner?.name || '')}</span><span class="ct">${ic('chevrons-up-down', 13)}</span></button>
    </div>
  </nav>`;
}

export function crumbs() {
  const u = S.ui,
    r = u.route,
    out = [];
  const c = (label, act = '', cur = false, icon = '') => `<button class="${cur ? 'cur' : ''}" ${act}>${icon}${esc(label)}</button>`;
  if (r === 'project') {
    const p = proj(u.params.id);
    out.push(c(t('nav.projects'), 'data-a="go" data-r="projects"'));
    if (p)
      out.push(
        c(
          p.name,
          `data-a="go" data-r="project" data-id="${p.id}" data-tab="overview"`,
          true,
          `<span class="pico" style="--c:${pColor(p)};width:16px;height:16px;border-radius:4px;display:grid;place-items:center;color:${pColor(p)}">${ic(p.icon, 11)}</span>`,
        ),
      );
  } else if (r === 'settings') {
    out.push(c(t('nav.settings'), '', true));
  } else out.push(c(ROUTE_NAMES[r] || t('nav.notFound'), '', true));
  return out.join('<span class="sep">/</span>');
}
export function renderTopbar() {
  return `<header class="topbar">
    <button class="ibtn" data-a="openMnav" aria-label="${t('nav.openNavigation')}" style="display:none" id="mnav-btn">${ic('menu', 17)}</button>
    <style>@media(max-width:900px){#mnav-btn{display:inline-flex!important}}</style>
    <nav class="crumbs trunc" aria-label="${t('nav.breadcrumb')}">${crumbs()}</nav>
    <span class="sp"></span>
    <button class="topsearch" data-a="openPalette" aria-label="${t('palette.commandMenu')}">${ic('search', 14)}<span class="lbltxt">${t('nav.searchOrJump')}</span><span class="kbd">${MOD}K</span></button>
    <button class="btn btn-secondary btn-sm" data-a="pop" data-pop="create" aria-haspopup="menu" aria-label="${t('nav.createNew')}">${ic('plus', 14)}<span class="hide-m">${t('nav.new')}</span>${ic('chevron-down', 12, 'hide-m')}</button>
    <button class="ibtn hide-m" data-a="pop" data-pop="user" aria-label="${t('nav.profileMenu')}" style="width:auto;padding:0 2px">${av(D().me, 'md', false)}</button>
  </header>`;
}
export function renderBottomNav() {
  const r = S.ui.route;
  const b = (route, label, icon, extra = '') =>
    `<button class="${r === route ? 'on' : ''}" data-a="go" data-r="${route}">${ic(icon, 19)}<span>${label}</span>${extra}</button>`;
  return `<nav class="bottomnav" aria-label="${t('nav.primary')}">
    ${b('home', t('nav.home'), 'house')}${b('tasks', t('nav.tasks'), 'circle-check')}${b('projects', t('nav.projects'), 'folder-kanban')}${b('calendar', t('nav.calendar'), 'calendar')}
    <button data-a="openMnav">${ic('ellipsis', 19)}<span>${t('nav.more')}</span></button>
  </nav>`;
}
