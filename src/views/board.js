/* ---------- BOARD ---------- */
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PR, STATUSES } from '../core/constants.js';
import { S, pColor, proj } from '../core/store.js';
import { dueHtml, lbl, prIcon, progBar, stIcon } from '../ui/helpers.js';
import { fxc } from '../shell/render.js';
import { t as tr } from '../i18n/index.js';

export function kcard(t, opt = {}) {
  const ac = t.attachments.length;
  const sd = t.subtasks.filter(s => s.done).length;
  const p = proj(t.project);
  return `<div class="kcard ${t.status === 'done' ? 'done' : ''}${fxc('done', t.id)}${fxc('added', t.id)}${fxc('moved', t.id)}" draggable="true" data-drag-card="${t.id}" data-a="openTask" data-id="${t.id}" data-ctx="task" role="button" tabindex="0" aria-label="${esc(t.title)}">
    ${t.labels.length ? `<div class="labels">${t.labels.map(lbl).join('')}</div>` : ''}
    <div class="top">${t.status === 'done' ? `<span class="done-ic" style="margin:2px 7px 0 0;display:inline-flex" aria-label="${tr('vocab.status.done')}">${stIcon('done', 14)}</span>` : ''}<div class="title">${esc(t.title)}</div></div>
    ${t.subtasks.length ? `<div class="subp">${ic('list-checks', 12)}<span class="num">${sd}/${t.subtasks.length}</span>${progBar(Math.round((sd / t.subtasks.length) * 100), sd === t.subtasks.length ? 'green' : '')}</div>` : ''}
    <div class="meta">
      ${opt.showProj ? `<span class="m" data-tip="${esc(p.name)}"><span class="pdot" style="--c:${pColor(p)}"></span></span>` : ''}
      <span class="key">${t.key}</span>
      <button class="m" data-a="pop" data-pop="priority" data-id="${t.id}" data-tip="${PR[t.priority].name}" aria-label="${tr('common.priority')}: ${PR[t.priority].name}">${prIcon(t.priority, 13)}</button>
      ${t.due ? `<button class="m" data-a="pop" data-pop="date" data-field="due" data-id="${t.id}" aria-label="${tr('common.dueDate')}">${dueHtml(t)}</button>` : ''}
      ${t.recur ? `<span class="m" data-tip="${esc(tr('tasks.repeats', { value: t.recur.toLowerCase() }))}">${ic('repeat', 12)}</span>` : ''}
      ${ac ? `<span class="m" aria-label="${esc(tr('common.attachmentsCount', { count: ac }))}">${ic('paperclip', 12)}${ac}</span>` : ''}
    </div>
    <div class="hacts"><button class="ibtn ibtn-xs" data-a="toggleDone" data-id="${t.id}" data-tip="${t.status === 'done' ? tr('context.reopen') : tr('drawer.markComplete')}" aria-label="${t.status === 'done' ? tr('context.reopen') : tr('drawer.markComplete')}">${ic(t.status === 'done' ? 'rotate-ccw' : 'check', 13)}</button><button class="ibtn ibtn-xs" data-a="editTask" data-id="${t.id}" data-tip="${tr('common.quickEdit')}" aria-label="${tr('common.quickEdit')}">${ic('pencil', 12)}</button><button class="ibtn ibtn-xs" data-a="ctxBtn" data-ctx="task" data-id="${t.id}" aria-label="${tr('common.more')}">${ic('ellipsis', 13)}</button></div>
  </div>`;
}
export function boardHtml(ts, key, opt = {}) {
  return `<div class="board" data-keep="board:${key}">${STATUSES.map(s => {
    const col = ts.filter(t => t.status === s.id).sort((a, b) => a.order - b.order);
    const ck = key + ':' + s.id;
    if (S.ui.collapsedCols[ck])
      return `<div class="bcol collapsed" data-a="toggleCol" data-ck="${ck}" data-drop-col="${s.id}" data-key="${key}" role="button" aria-label="${esc(tr('common.expandNamed', { name: s.name }))}" title="${tr('nav.expand')}">${stIcon(s.id)}<span class="vname">${s.name}<span class="faint">${col.length}</span></span></div>`;
    const comp = S.ui.composer && S.ui.composer.ctx === key && S.ui.composer.group === s.id;
    return `<section class="bcol" data-drop-col="${s.id}" data-key="${key}" aria-label="${s.name}">
      <div class="bcol-h">${stIcon(s.id)}<span>${s.name}</span><span class="cnt">${col.length}</span>
        <span class="acts"><button class="ibtn ibtn-xs" data-a="startComposer" data-ctx="${key}" data-group="${s.id}" data-gb='${JSON.stringify({ status: s.id, ...(opt.project ? { project: opt.project } : {}) })}' data-tip="${tr('common.addTask')}" aria-label="${esc(tr('tasks.addTaskTo', { group: s.name }))}">${ic('plus', 14)}</button><button class="ibtn ibtn-xs" data-a="ctxBtn" data-ctx="column" data-id="${s.id}" data-key="${key}" aria-label="${tr('board.columnOptions')}">${ic('ellipsis', 14)}</button></span></div>
      <div class="bcol-b" data-col-body="${s.id}">
        ${col.map(t => kcard(t, { showProj: !opt.project })).join('')}
        ${
          comp
            ? `<div class="composer"><textarea id="composer-in" data-in="composer" data-key-enter="commitComposer" placeholder="${tr('common.taskName')}" rows="2" aria-label="${tr('common.taskName')}">${esc(comp.draft || '')}</textarea><div class="row"><span class="faint" style="font-size:11px">${tr('common.enterToAddEscCancel')}</span><span class="sp"></span><button class="btn btn-sm btn-ghost" data-a="cancelComposer">${tr('common.cancel')}</button><button class="btn btn-sm btn-primary" data-a="commitComposer">${tr('common.add')}</button></div></div>`
            : `<button class="addcard" data-a="startComposer" data-ctx="${key}" data-group="${s.id}" data-gb='${JSON.stringify({ status: s.id, ...(opt.project ? { project: opt.project } : {}) })}'>${ic('plus', 14)}${tr('common.addTask')}</button>`
        }
      </div>
    </section>`;
  }).join('')}</div>`;
}
