/* =====================================================================
   PAGES
   ===================================================================== */
import { ago, esc, relDate } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PR, PSTAT, ST } from '../core/constants.js';
import { S, isOver, pColor, proj, task } from '../core/store.js';
import { dueHtml, empty, lbl, prIcon, prPill, stIcon, stPill } from '../ui/helpers.js';
import { fxc } from '../shell/render.js';
import { t as tt } from '../i18n/index.js';

/* ---------- shared list renderer ---------- */
export const LCOLS = {
  get status() {
    return [tt('common.status'), '126px'];
  },
  get priority() {
    return [tt('common.priority'), '108px'];
  },
  get due() {
    return [tt('common.dueDate'), '104px'];
  },
  get labels() {
    return [tt('common.labels'), '168px'];
  },
  get project() {
    return [tt('common.project'), '160px'];
  },
};
export function cellStatus(t) {
  return `<button class="pillbtn" data-a="pop" data-pop="status" data-id="${t.id}" aria-label="${tt('common.status')}: ${ST[t.status].name}">${stPill(t.status)}</button>`;
}
export function cellPrio(t) {
  return `<button class="pillbtn ${t.priority === 'none' ? 'empty' : ''}" data-a="pop" data-pop="priority" data-id="${t.id}" aria-label="${tt('common.priority')}">${prPill(t.priority)}</button>`;
}
export function cellDue(t) {
  return `<button class="pillbtn ${t.due ? (isOver(t) ? 'over' : '') : 'empty'}" data-a="pop" data-pop="date" data-field="due" data-id="${t.id}" aria-label="${tt('common.dueDate')}">${t.due ? `${ic('calendar', 13)}<span class="num">${relDate(t.due)}</span>` : `${ic('calendar', 13)}<span>${tt('tasks.setDate')}</span>`}</button>`;
}
export function cellLabels(t) {
  return `<button class="pillbtn ${t.labels.length ? '' : 'empty'}" data-a="pop" data-pop="labels" data-id="${t.id}" aria-label="${tt('common.labels')}" style="gap:4px;overflow:hidden">${t.labels.length ? t.labels.slice(0, 2).map(lbl).join('') + (t.labels.length > 2 ? `<span class="faint" style="font-size:11px">+${t.labels.length - 2}</span>` : '') : `${ic('tag', 13)}<span>${tt('tasks.add')}</span>`}</button>`;
}
export function cellProject(t) {
  const p = proj(t.project);
  return `<button class="pillbtn" data-a="pop" data-pop="project" data-id="${t.id}" aria-label="${tt('common.project')}"><span class="pdot" style="--c:${pColor(p)}"></span><span class="trunc">${esc(p?.name)}</span></button>`;
}
export const CELL = { status: cellStatus, priority: cellPrio, due: cellDue, labels: cellLabels, project: cellProject };

export function taskRow(t, cols, tpl, opt = {}) {
  const sel = S.ui.sel.has(t.id);
  const open = S.ui.openTasks[t.id];
  const editing = S.ui.editCell && S.ui.editCell.id === t.id && S.ui.editCell.f === 'title';
  const sd = t.subtasks.filter(s => s.done).length;
  return `<div class="trow ${t.status === 'done' ? 'done' : ''} ${sel ? 'sel' : ''}${fxc('done', t.id)}${fxc('added', t.id)}" style="--cols:${tpl}" data-task-row="${t.id}" data-group="${opt.group || ''}" data-lkey="${opt.key || ''}" data-ctx="task" data-id="${t.id}">
    <div class="handle" draggable="${opt.drag !== false}" data-drag-row="${t.id}" aria-hidden="true">${opt.drag !== false ? ic('grip-vertical', 14) : ''}</div>
    <div class="c-check">${
      opt.complete
        ? `<input type="checkbox" class="check round" ${t.status === 'done' ? 'checked' : ''} data-a="toggleDone" data-id="${t.id}" aria-label="${esc(tt('tasks.completeTask', { title: t.title }))}">`
        : `<input type="checkbox" class="check" ${sel ? 'checked' : ''} data-a="selRow" data-id="${t.id}" aria-label="${esc(tt('tasks.selectTask', { title: t.title }))}">`
    }</div>
    <div class="ttl" ${editing ? '' : `data-a="openTask" data-id="${t.id}"`} data-dbl="editTitle">
      ${t.subtasks.length ? `<span class="ibtn ibtn-xs" data-a="expandRow" data-id="${t.id}" aria-label="${open ? tt('tasks.hideSubtasks') : tt('tasks.showSubtasks')}" aria-expanded="${!!open}" style="margin-left:-4px">${ic(open ? 'chevron-down' : 'chevron-right', 13)}</span>` : '<span style="width:18px;flex-shrink:0"></span>'}
      <span class="key">${t.key}</span>
      ${editing ? `<input class="inline-in" id="edit-title" data-in="noop" data-blur="commitTitle" data-key-enter="commitTitle" data-id="${t.id}" value="${esc(t.title)}" aria-label="${tt('tasks.taskTitle')}">` : `<span class="tt">${esc(t.title)}</span>`}
      ${t.recur ? `<span class="meta-mini" data-tip="${esc(tt('tasks.repeats', { value: t.recur.toLowerCase() }))}">${ic('repeat', 11)}</span>` : ''}
      ${t.subtasks.length ? `<span class="meta-mini">${ic('list-checks', 11)}${sd}/${t.subtasks.length}</span>` : ''}
    </div>
    ${cols.map(c => `<div class="c-meta c-${c === 'labels' ? 'lbl' : c}">${CELL[c](t)}</div>`).join('')}
    <div class="c-more"><button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="task" data-id="${t.id}" aria-label="${tt('tasks.actions')}">${ic('ellipsis', 15)}</button></div>
  </div>
  ${open ? `<div class="subrows">${t.subtasks.map(s => `<div class="subrow ${s.done ? 'done' : ''}"><input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${t.id}" data-sid="${s.id}" aria-label="${tt('tasks.completeSubtask')}"><span>${esc(s.title)}</span></div>`).join('')}</div>` : ''}`;
}
export function listHtml(groups, key, opt = {}) {
  const cols = opt.cols || ['status', 'priority', 'due', 'labels'];
  const tpl = `18px 30px minmax(220px,1fr) ${cols.map(c => LCOLS[c][1]).join(' ')} 40px`;
  const all = groups.flatMap(g => g.tasks.map(t => t.id));
  const nSel = all.filter(id => S.ui.sel.has(id)).length;
  const total = all.length;
  if (!total && !opt.keepEmpty)
    return (
      opt.emptyHtml ||
      empty(
        'list-checks',
        tt('project.noTasks'),
        tt('project.noTasksText'),
        `<button class="btn btn-primary btn-sm" data-a="newTask" ${opt.project ? `data-project="${opt.project}"` : ''}>${ic('plus', 14)}${tt('common.newTask')}</button>`,
      )
    );
  const v = S.views[key];
  return `<div class="tlist" role="table" aria-label="${tt('common.tasksLabel')}">
    <div class="thead" style="--cols:${tpl}" role="row">
      <div></div>
      <div>${opt.complete ? '' : `<input type="checkbox" class="check" data-a="selAll" data-key="${key}" ${nSel && nSel === total ? 'checked' : ''} ${nSel && nSel < total ? 'data-indet="1"' : ''} aria-label="${tt('tasks.selectAll')}">`}</div>
      <div data-a="sortBy" data-key="${key}" data-f="title" style="cursor:pointer">${tt('view.task')} ${v?.sort.f === 'title' ? ic(v.sort.dir > 0 ? 'arrow-up' : 'arrow-down', 11) : ''}</div>
      ${cols.map(c => `<div data-a="sortBy" data-key="${key}" data-f="${c === 'labels' ? 'manual' : c}" style="cursor:pointer">${LCOLS[c][0]} ${v?.sort.f === c ? ic(v.sort.dir > 0 ? 'arrow-up' : 'arrow-down', 11) : ''}</div>`).join('')}
      <div></div>
    </div>
    ${groups
      .map(g => {
        const gk = key + ':' + g.key;
        const coll = S.ui.collapsedGroups[gk] ?? (g.collapsed || false);
        const comp = S.ui.composer && S.ui.composer.ctx === key && S.ui.composer.group === g.key;
        return `${
          groups.length > 1 || g.key !== 'all'
            ? `<div class="grp" data-grp-drop="${g.key}" data-key="${key}">
          <button class="ibtn ibtn-xs" data-a="toggleGroup" data-gk="${gk}" aria-expanded="${!coll}" aria-label="${tt('common.group')}">${ic(coll ? 'chevron-right' : 'chevron-down', 13)}</button>
          ${g.html || ''}<span>${esc(g.name)}</span><span class="cnt">${g.tasks.length}</span>
          ${opt.noAdd ? '' : `<button class="ibtn ibtn-xs" data-a="startComposer" data-ctx="${key}" data-group="${g.key}" data-gb="${esc(JSON.stringify(g.set || {}))}" aria-label="${esc(tt('tasks.addTaskTo', { group: g.name }))}">${ic('plus', 13)}</button>`}
        </div>`
            : ''
        }
        ${coll ? '' : g.tasks.map(t => taskRow(t, cols, tpl, { group: g.key, drag: opt.drag, complete: opt.complete, key })).join('')}
        ${coll || opt.noAdd ? '' : comp ? `<div class="addrow" style="background:var(--surface-2)">${ic('plus', 14)}<input class="inline-in" id="composer-in" data-in="composer" data-key-enter="commitComposer" value="${esc(comp.draft || '')}" placeholder="${tt('tasks.addTaskPlaceholder')}" aria-label="${tt('common.taskName')}"></div>` : `<button class="addrow" data-a="startComposer" data-ctx="${key}" data-group="${g.key}" data-gb="${esc(JSON.stringify(g.set || {}))}">${ic('plus', 14)}${tt('common.addTask')}</button>`}`;
      })
      .join('')}
  </div>${bulkBar(all)}`;
}
export function bulkBar(ids) {
  const n = ids.filter(id => S.ui.sel.has(id)).length;
  if (!n) return '';
  return `<div class="bulkbar${S.ui.fx.bulk ? ' enter' : ''}" role="toolbar" aria-label="${tt('tasks.bulkActions')}"><b style="font-weight:600">${tt('tasks.selectedCount', { count: n })}</b><span class="sep"></span>
    <button class="btn btn-sm" data-a="pop" data-pop="bulk-status">${ic('circle-dot', 14)}${tt('common.status')}</button>
    <button class="btn btn-sm" data-a="pop" data-pop="bulk-priority">${ic('signal-high', 14)}${tt('common.priority')}</button>
    <button class="btn btn-sm" data-a="bulkDelete">${ic('trash-2', 14)}${tt('common.delete')}</button><span class="sep"></span>
    <button class="btn btn-sm" data-a="clearSel" aria-label="${tt('tasks.clearSelection')}">${ic('x', 14)}</button></div>`;
}

/* ---------- activity rendering ---------- */
export function actHtml(a, opt = {}) {
  if (a.verb === 'commented on' || a.verb === 'assigned') return '';
  const t = a.task ? task(a.task) : null;
  const p = a.project ? proj(a.project) : null;
  const verbKeys = {
    completed: 'completed',
    moved: 'moved',
    renamed: 'renamed',
    'changed priority of': 'changedPriority',
    'changed due date of': 'changedDueDate',
    'changed start date of': 'changedStartDate',
    'updated labels on': 'updatedLabels',
    'set repeat on': 'setRepeat',
    estimated: 'estimated',
    'updated dependencies of': 'updatedDependencies',
    'added subtask to': 'addedSubtask',
    'removed a subtask from': 'removedSubtask',
    'updated subtasks on': 'updatedSubtasks',
    'added a file to': 'addedFile',
    'removed a file from': 'removedFile',
    'updated the description of': 'updatedDescription',
    updated: 'updated',
    created: 'created',
    archived: 'archived',
    restored: 'restored',
    'created project': 'createdProject',
    'renamed project': 'renamedProject',
    'changed status of project': 'changedProjectStatus',
    'updated project': 'updatedProject',
  };
  const verb = tt(`activity.${verbKeys[a.verb] || 'updated'}`);
  const extra = activityExtra(a.verb, a.extra);
  const obj = t
    ? `<span class="obj" data-a="openTask" data-id="${t.id}">${esc(t.title)}</span>`
    : p
      ? `<span class="obj" data-a="go" data-r="project" data-id="${p.id}">${esc(p.name)}</span>`
      : '';
  return `<div class="fitem"><div class="grow"><b>${esc(verb)}</b> ${obj} ${extra ? `<span class="muted">${esc(extra)}</span>` : ''}${opt.proj && p && t ? ` <span class="faint">${esc(tt('activity.inProject', { project: p.name }))}</span>` : ''}</div><time>${ago(a.at)}</time></div>`;
}
function activityExtra(verb, extra) {
  if (!extra) return '';
  if (verb === 'moved') {
    const statusMove = /^from ([a-z-]+) to ([a-z-]+)$/.exec(extra);
    if (statusMove) return tt('activity.fromTo', { from: ST[statusMove[1]]?.name || statusMove[1], to: ST[statusMove[2]]?.name || statusMove[2] });
  }
  if (verb === 'changed priority of') {
    const priority = extra.replace(/^to\s+/i, '').toLowerCase();
    if (PR[priority]) return tt('activity.toValue', { value: PR[priority].name });
  }
  if (verb === 'changed status of project') {
    const status = extra.replace(/^to\s+/i, '');
    if (PSTAT[status]) return tt('activity.toValue', { value: PSTAT[status].name });
  }
  if (verb === 'set repeat on' && extra === 'off') return tt('activity.off');
  if (verb === 'estimated' && extra === 'none') return tt('view.none');
  if (/^to\s+/i.test(extra)) return tt('activity.toValue', { value: extra.replace(/^to\s+/i, '') });
  return extra;
}
export function miniRow(t, opt = {}) {
  const p = proj(t.project);
  return `<div class="mini ${t.status === 'done' ? 'done' : ''}${fxc('done', t.id)}${fxc('added', t.id)}" data-a="openTask" data-id="${t.id}" data-ctx="task" role="button" tabindex="0">
    <input type="checkbox" class="check round" ${t.status === 'done' ? 'checked' : ''} data-a="toggleDone" data-id="${t.id}" aria-label="${esc(tt('tasks.completeTask', { title: t.title }))}">
    <span data-tip="${ST[t.status].name}">${stIcon(t.status)}</span>
    <span class="tt">${esc(t.title)}</span>
    ${opt.noProj ? '' : `<span class="pj hide-m"><span class="pdot" style="--c:${pColor(p)}"></span><span class="trunc">${esc(p.name)}</span></span>`}
    <span data-tip="${esc(tt('common.priority') + ': ' + PR[t.priority].name)}">${prIcon(t.priority)}</span>
    <span style="width:74px;text-align:right" class="hide-m">${dueHtml(t, false)}</span>
  </div>`;
}
