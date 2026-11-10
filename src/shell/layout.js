/* ---------- shell ---------- */
import { TODAY, diffD, esc, parse } from '../core/utils.js';
import { ic, wsLogo } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, allTasks, pColor, proj, visibleProjects } from '../core/store.js';
import { av } from '../ui/helpers.js';
import { SIDE_MAX, SIDE_MIN, sideWidth } from '../core/theme.js';
import { ROUTE_NAMES } from './render.js';
import { skeleton } from './skeletons.js';
import { pageHome } from '../pages/home.js';
import { pageFocus } from '../pages/focus.js';
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
    ${renderAppbar()}
    ${renderSidebar()}
    ${u.mnav ? '<div class="side-scrim" data-a="closeMnav"></div>' : ''}
    <main class="main" id="main">
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
      focus: pageFocus,
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
        <button class="ibtn ibtn-sm side-action" data-a="openPalette" data-tip="${t('nav.searchOrJump')}" aria-label="${t('nav.searchOrJump')}">${ic('search', 15)}</button>
        <button class="ibtn ibtn-sm side-action" data-a="pop" data-pop="create" data-tip="${t('nav.createNew')}" aria-label="${t('nav.createNew')}">${ic('square-pen', 15)}</button>
      </div>
    </div>
    <div class="side-scroll" data-keep="side">
      ${sItem('home', t('nav.home'), 'house')}
      ${sItem('focus', t('nav.focus'), 'target')}
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
            const parentOn = on && (u.collapsed || !open || !['board', 'list', 'timeline', 'files'].includes(u.params.tab));
            return `<div class="sproj" data-proj-drop="${p.id}">
            <div class="sitem ${parentOn ? 'on' : ''}" draggable="true" data-drag-proj="${p.id}" data-a="go" data-r="project" data-id="${p.id}" data-ctx="project" role="link" tabindex="0" ${u.collapsed ? `data-tip="${esc(p.name)}" data-tip-pos="right"` : ''}>
              <span class="pico" style="--c:${pColor(p)}" ${u.collapsed ? '' : `data-a="toggleExpand" data-id="${p.id}" aria-label="${t('nav.toggleSubPages')}"`}>${ic(p.icon, 12)}</span>
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
    <div class="side-rsz" role="separator" aria-orientation="vertical" aria-label="${t('nav.resizeSidebar')}" aria-valuemin="${SIDE_MIN}" aria-valuemax="${SIDE_MAX}" aria-valuenow="${sideWidth()}" tabindex="0" data-rsz-side></div>
  </nav>`;
}

export function renderAppbar() {
  const u = S.ui,
    p = u.route === 'project' ? proj(u.params.id) : null;
  const routeIcons = {
    home: 'house',
    focus: 'target',
    favorites: 'star',
    search: 'search',
    projects: 'folder-kanban',
    tasks: 'circle-check',
    calendar: 'calendar',
    timeline: 'chart-gantt',
    settings: 'settings',
  };
  const label = p?.name || ROUTE_NAMES[u.route] || t('nav.notFound');
  const icon = p ? `<span class="appbar-pico" style="--c:${pColor(p)}">${ic(p.icon, 12)}</span>` : ic(routeIcons[u.route] || 'house', 14);
  const sideToggleLabel = u.collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar');
  const backLabel = t('nav.back');
  const forwardLabel = t('nav.forward');
  return `<header class="appbar">
    <div class="appbar-side">
      <button class="ibtn mnav-btn" data-a="openMnav" aria-label="${t('nav.openNavigation')}">${ic('menu', 17)}</button>
      <button class="ibtn appbar-toggle" data-a="toggleSide" data-tip="${sideToggleLabel}" aria-label="${sideToggleLabel}">${ic('panel-left', 16)}</button>
      <div class="appbar-history" role="group" aria-label="${t('nav.history')}">
        <button class="ibtn ibtn-sm" data-a="back" data-tip="${backLabel}" aria-label="${backLabel}" ${u.history.length ? '' : 'disabled'}>${ic('arrow-left', 15)}</button>
        <button class="ibtn ibtn-sm" data-a="forward" data-tip="${forwardLabel}" aria-label="${forwardLabel}" ${u.forward.length ? '' : 'disabled'}>${ic('arrow-right', 15)}</button>
      </div>
    </div>
    <div class="appbar-main">
      <div class="appbar-tab" title="${esc(label)}">
        ${icon}
        <span class="trunc">${esc(label)}</span>
      </div>
      <button class="ibtn ibtn-sm appbar-add" data-a="pop" data-pop="create" data-tip="${t('nav.createNew')}" aria-label="${t('nav.createNew')}">${ic('plus', 15)}</button>
    </div>
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
