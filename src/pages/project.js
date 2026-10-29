/* =====================================================================
   PROJECT PAGE + VIEWS: overview, board, list, table, calendar, timeline, files, activity
   ===================================================================== */
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, proj, tasksOf } from '../core/store.js';
import { empty, pIcon } from '../ui/helpers.js';
import { applyView, groupTasks, viewOf, viewToolbar } from '../shell/view-engine.js';
import { listHtml } from '../components/task-list.js';
import { page404 } from './errors.js';
import { projOverview } from '../views/project-overview.js';
import { boardHtml } from '../views/board.js';
import { tableHtml } from '../views/table.js';
import { calendarHtml } from '../views/calendar.js';
import { timelineHtml, tlControls } from '../views/timeline.js';
import { filesHtml } from '../views/files.js';
import { t } from '../i18n/index.js';

export const projectTabs = () => [
  ['overview', t('project.overview'), 'layout-dashboard'],
  ['board', t('project.board'), 'square-kanban'],
  ['list', t('project.list'), 'list'],
  ['table', t('project.table'), 'table-2'],
  ['calendar', t('project.calendar'), 'calendar'],
  ['timeline', t('project.timeline'), 'chart-gantt'],
  ['files', t('project.files'), 'paperclip'],
];

const LEGACY_SAVED_VIEW_NAMES = {
  'High priority': 'project.highPriority',
};

export function savedViewName(view) {
  const key = view && Object.hasOwn(LEGACY_SAVED_VIEW_NAMES, view.name) ? LEGACY_SAVED_VIEW_NAMES[view.name] : null;
  return key ? t(key, {}, view.name) : view?.name || '';
}

export function pageProject() {
  const p = proj(S.ui.params.id);
  if (!p) return page404();
  const tab = S.ui.params.tab || 'board';
  const tabs = projectTabs();
  const views = D().savedViews.filter(v => v.project === p.id);
  let body = '';
  const key = 'p:' + p.id;
  const ts = tasksOf(p.id);
  if (tab.startsWith('v:')) {
    const sv = views.find(v => 'v:' + v.id === tab);
    if (!sv) body = page404();
    else {
      const k = 'sv:' + sv.id;
      if (!S.views[k]) {
        viewOf(k);
        S.views[k].filters = JSON.parse(JSON.stringify(sv.filters));
      }
      body = taskViewBody(sv.type, applyView(ts, viewOf(k)), k, p);
    }
  } else if (tab === 'overview') body = projOverview(p);
  else if (tab === 'files') body = filesHtml(p.id);
  else body = taskViewBody(tab, applyView(ts, viewOf(key)), key, p);

  return `<div class="page flush">
    <div class="proj-h">
      <div class="t">
        ${pIcon(p, 'lg', 18)}
        <h1>${esc(p.name)}</h1>
        <button class="ibtn ibtn-sm" data-a="toggleFavProj" data-id="${p.id}" data-tip="${p.fav ? t('project.removeFavorite') : t('project.addFavorite')}" aria-pressed="${p.fav}" aria-label="${t('project.favorite')}" style="${p.fav ? 'color:var(--amber)' : ''}">${ic('star', 15)}</button>
        <button class="pillbtn bordered" data-a="pop" data-pop="pstatus" data-id="${p.id}" aria-label="${t('project.projectStatus')}" style="height:24px"><span class="pdot" style="--c:${PSTAT[p.status].c};border-radius:50%;width:7px;height:7px"></span>${PSTAT[p.status].name}${ic('chevron-down', 12)}</button>
        <span class="sp"></span>
        <div class="row" style="gap:4px">
          <button class="ibtn ibtn-sm" data-a="editProject" data-id="${p.id}" data-tip="${t('project.projectSettings')}" aria-label="${t('project.projectSettings')}">${ic('settings', 15)}</button>
          <button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="project" data-id="${p.id}" aria-label="${t('common.more')}">${ic('ellipsis', 15)}</button>
        </div>
      </div>
      <nav class="tabs" aria-label="${t('project.projectViews')}">
        ${tabs.map(([k, n, i]) => `<button ${tab === k ? 'aria-current="page"' : ''} class="tab ${tab === k ? 'on' : ''}" data-a="go" data-r="project" data-id="${p.id}" data-tab="${k}">${ic(i, 14)}${n}</button>`).join('')}
        ${views.map(v => `<button ${tab === 'v:' + v.id ? 'aria-current="page"' : ''} class="tab ${tab === 'v:' + v.id ? 'on' : ''}" data-a="go" data-r="project" data-id="${p.id}" data-tab="v:${v.id}" data-ctx="savedview" data-vid="${v.id}">${ic('list-filter', 14)}${esc(savedViewName(v))}</button>`).join('')}
        <button class="tab" data-a="saveView" data-id="${p.id}" data-tip="${t('project.saveViewTip')}" aria-label="${t('project.saveView')}">${ic('plus', 14)}</button>
      </nav>
    </div>
    <div class="pbody${S.ui.fx.tab ? ' fx-tab' : ''}">${body}</div>
  </div>`;
}
export function taskViewBody(type, ts, key, p) {
  const v = viewOf(key);
  const addBtn = `<button class="btn btn-primary btn-sm" data-a="newTask" data-project="${p.id}">${ic('plus', 13)}${t('common.newTask')}</button>`;
  const noTasks = !tasksOf(p.id).length;
  const emptyAll = empty(
    'list-checks',
    t('project.noTasks'),
    t('project.noTasksText'),
    `<button class="btn btn-primary btn-sm" data-a="newTask" data-project="${p.id}">${ic('plus', 14)}${t('common.addTask')}</button>`,
  );
  const emptyFilter = empty(
    'search-x',
    t('common.noResults'),
    t('project.noFilterMatches'),
    `<button class="btn btn-secondary btn-sm" data-a="clearFilters" data-key="${key}">${t('common.clearFilters')}</button>`,
  );
  if (type === 'board') return viewToolbar(key, { group: false, right: addBtn }) + (noTasks ? emptyAll : boardHtml(ts, key, { project: p.id }));
  if (type === 'list')
    return (
      viewToolbar(key, { right: addBtn }) +
      `<div class="list-wrap">${noTasks ? emptyAll : !ts.length ? emptyFilter : listHtml(groupTasks(ts, v.group), key, { project: p.id })}</div>`
    );
  if (type === 'table') return viewToolbar(key, { cols: true, right: addBtn }) + (noTasks ? emptyAll : tableHtml(ts, key, p));
  if (type === 'calendar') return viewToolbar(key, { group: false, right: addBtn }) + calendarHtml(ts, { key, project: p.id, events: true });
  if (type === 'timeline') return viewToolbar(key, { group: false, right: addBtn, extra: tlControls(key) }) + timelineHtml(ts, key, p);
  return page404();
}
