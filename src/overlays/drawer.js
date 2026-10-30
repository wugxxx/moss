/* =====================================================================
   OVERLAYS: drawer, modals, popovers, context menus, command palette
   ===================================================================== */
import { TODAY, ago, diffD, esc, fmtDate, parse, relDate } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S, isOver, pColor, proj, task } from '../core/store.js';
import { FT, filePrev, fileType, lbl, progBar } from '../ui/helpers.js';
import { fxc } from '../shell/render.js';
import { cellDue, cellPrio, cellProject, cellStatus } from '../components/task-list.js';
import { modalHtml } from './modals.js';
import { popHtml } from './popovers.js';
import { paletteHtml } from './palette.js';
import { subtaskHtml } from '../features/subtasks.js';
import { t as tr } from '../i18n/index.js';

export function renderLayer() {
  const u = S.ui;
  let h = '';
  if (u.drawer && task(u.drawer))
    h += `<div class="drawer-scrim${u.drawerFull ? ' full' : ''}${u.fx.drawer ? ' enter' : ''}" data-a="closeDrawer"></div>` + drawerHtml(task(u.drawer));
  u.modals.forEach((m, i) => {
    const en = u.fx.modal === i + 1;
    h += `<div class="scrim${en ? ' enter' : ''}" data-a="closeModal" style="z-index:${60 + i * 2}"></div><div class="modal-wrap" data-a="closeModalBg" style="z-index:${61 + i * 2}">${en ? modalHtml(m).replace('class="modal ', 'class="modal enter ') : modalHtml(m)}</div>`;
  });
  if (u.palette) h += `<div class="scrim" data-a="closePalette" style="z-index:89"></div>${paletteHtml()}`;
  if (u.pop) h += popHtml(u.pop);
  return h;
}

/* ---------------- TASK DRAWER ---------------- */
export function drawerHtml(t) {
  const p = proj(t.project);
  const u = S.ui;
  const sd = t.subtasks.filter(s => s.done).length;
  const prop = (icon, label, val) => `<dt>${ic(icon, 14)}${label}</dt><dd>${val}</dd>`;
  const ups = (u.uploads || []).filter(x => x.task === t.id);
  const sub = u.subOpen && u.subOpen.tid === t.id ? t.subtasks.find(s => s.id === u.subOpen.sid) : null;
  return `<aside class="drawer ${u.drawerFull ? 'full' : ''} ${u.fx.drawer ? 'enter' : ''} ${u.fx.tabs ? 'fx-tabs' : ''}" role="dialog" aria-modal="${u.drawerFull}" aria-labelledby="d-h" tabindex="-1">
    <h2 class="sr" id="d-h">${sub ? tr('drawer.subtaskHeading', { title: sub.title }) : tr('drawer.taskHeading', { title: t.title })}</h2>
    <div class="drawer-h">
      <button class="pillbtn" data-a="go" data-r="project" data-id="${p.id}" data-tab="board" style="font-size:12.5px"><span class="pdot" style="--c:${pColor(p)}"></span>${esc(p.name)}</button><span class="faint">/</span><span class="mono faint" style="font-size:11.5px;padding:0 6px">${t.key}</span>
      <span class="sp"></span>
      <button class="btn btn-sm ${t.status === 'done' ? 'btn-secondary' : 'btn-ghost'}" data-a="toggleDone" data-id="${t.id}" style="${t.status === 'done' ? 'color:var(--green)' : ''}">${ic(t.status === 'done' ? 'circle-check' : 'circle', 14)}<span class="hide-m">${t.status === 'done' ? tr('drawer.completedState') : tr('drawer.markComplete')}</span></button>
      <button class="ibtn ibtn-sm" data-a="toggleFavTask" data-id="${t.id}" data-tip="${t.fav ? tr('drawer.unfavorite') : tr('drawer.favorite')}" aria-pressed="${t.fav}" aria-label="${tr('drawer.favorite')}" style="${t.fav ? 'color:var(--amber)' : ''}">${ic('star', 15)}</button>
      <button class="ibtn ibtn-sm hide-m" data-a="toggleDrawerFull" data-tip="${u.drawerFull ? tr('settings.sidePanel') : tr('settings.fullPage')}" aria-label="${tr('drawer.toggleFullPage')}">${ic(u.drawerFull ? 'minimize-2' : 'maximize-2', 15)}</button>
      <button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="task" data-id="${t.id}" aria-label="${tr('common.more')}">${ic('ellipsis', 15)}</button>
      <button class="ibtn ibtn-sm" data-a="closeDrawer" data-tip="${tr('common.close')}  Esc" aria-label="${tr('common.close')}">${ic('x', 16)}</button>
    </div>
    <div class="drawer-b" data-keep="drawer:${t.id}${sub ? ':' + sub.id : ''}">${
      sub
        ? subtaskHtml(t, sub)
        : `
      ${t.status === 'done' ? `<div class="alert ok" style="margin-bottom:12px">${ic('circle-check', 15)}<span>${tr('drawer.completed', { when: t.completedAt ? ago(t.completedAt) : '' })} <button class="link" data-a="toggleDone" data-id="${t.id}">${tr('drawer.reopenTask')}</button></span></div>` : isOver(t) ? `<div class="alert danger" style="margin-bottom:12px">${ic('clock-alert', 15)}<span>${tr('time.overdueBy', { count: -diffD(parse(t.due), TODAY) })} <button class="link" data-a="pop" data-pop="date" data-field="due" data-id="${t.id}">${tr('drawer.reschedule')}</button></span></div>` : ''}
      <textarea class="ttl-edit" id="d-title" rows="1" data-autosize data-blur="commitDrawerTitle" data-key-enter="blur" data-id="${t.id}" aria-label="${tr('common.taskTitle')}">${esc(t.title)}</textarea>
      <dl class="kv" style="margin-top:12px;${u.drawerFull ? 'grid-template-columns:112px minmax(0,1fr) 112px minmax(0,1fr)' : ''}">
        ${prop('circle-dot', tr('common.status'), cellStatus(t))}
        ${prop('signal-high', tr('common.priority'), cellPrio(t))}
        ${prop('calendar', tr('common.dueDate'), cellDue(t))}
        ${prop('calendar-arrow-up', tr('common.startDate'), `<button class="pillbtn ${t.start ? '' : 'empty'}" data-a="pop" data-pop="date" data-field="start" data-id="${t.id}">${ic('calendar', 13)}${t.start ? fmtDate(t.start) : tr('drawer.setDate')}</button>`)}
        ${prop('folder', tr('common.project'), cellProject(t))}
        ${prop('tag', tr('common.labels'), `<button class="pillbtn ${t.labels.length ? '' : 'empty'}" data-a="pop" data-pop="labels" data-id="${t.id}" style="flex-wrap:wrap;height:auto;min-height:26px;padding:3px 7px">${t.labels.length ? t.labels.map(lbl).join('') : ic('tag', 13) + tr('drawer.addLabels')}</button>`)}
        ${prop('repeat', tr('modals.repeat'), `<button class="pillbtn ${t.recur ? '' : 'empty'}" data-a="pop" data-pop="recur" data-id="${t.id}">${ic('repeat', 13)}${t.recur || tr('drawer.doesNotRepeat')}</button>`)}
        ${prop('timer', tr('common.estimate'), `<button class="pillbtn ${t.estimate ? '' : 'empty'}" data-a="pop" data-pop="estimate" data-id="${t.id}">${ic('timer', 13)}${t.estimate ? esc(t.estimate) : tr('drawer.addEstimate')}</button>`)}
        ${prop('git-branch', tr('drawer.blockedBy'), `<button class="pillbtn ${t.deps.length ? '' : 'empty'}" data-a="pop" data-pop="deps" data-id="${t.id}" style="height:auto;min-height:26px;flex-wrap:wrap">${t.deps.length ? t.deps.map(d => (task(d) ? `<span class="depchip mono" style="font-size:11px;padding:1px 5px;border-radius:4px;background:var(--surface-3)">${task(d).key}</span><span class="trunc" style="max-width:160px">${esc(task(d).title)}</span>` : '')).join('') : ic('git-branch', 13) + tr('common.none')}</button>`)}
      </dl>

      <div class="dsec"><div class="dsec-h"><h3 id="d-desc-l">${tr('common.description')}</h3><div class="rte-tb" role="toolbar" aria-label="${tr('drawer.formatting')}" aria-controls="d-desc">
          ${[
            ['bold', 'bold', tr('drawer.bold')],
            ['italic', 'italic', tr('drawer.italic')],
            ['insertUnorderedList', 'list', tr('drawer.bulletedList')],
            ['insertOrderedList', 'list-ordered', tr('drawer.numberedList')],
            ['formatBlock:h4', 'heading', tr('drawer.heading')],
            ['createLink', 'link', tr('drawer.link')],
          ]
            .map(([c, i, n]) => `<button class="ibtn ibtn-xs" data-cmd="${c}" data-tip="${n}" aria-label="${n}">${ic(i, 13)}</button>`)
            .join('')}
        </div></div>
        <div class="rte"><div class="rte-body" id="d-desc" contenteditable="true" data-rte="${t.id}" data-ph="${tr('drawer.addDescription')}" role="textbox" aria-multiline="true" aria-labelledby="d-desc-l">${t.desc}</div></div>
      </div>

      <div class="dsec"><div class="dsec-h"><h3>${tr('common.subtasks')}</h3><span class="cnt num">${sd}/${t.subtasks.length}</span>${t.subtasks.length ? `<span style="width:90px;display:flex">${progBar(Math.round((sd / t.subtasks.length) * 100), sd === t.subtasks.length ? 'green' : '')}</span>` : ''}</div>
        ${t.subtasks.map(s => `<div class="subt ${s.done ? 'done' : ''}${fxc('added', s.id)}${fxc('done', s.id)}"><input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${t.id}" data-sid="${s.id}" aria-label="${tr(s.done ? 'drawer.reopenSubtask' : 'drawer.completeSubtask')} ${esc(s.title)}"><button class="s" data-a="openSub" data-id="${t.id}" data-sid="${s.id}">${esc(s.title)}</button>${s.due ? `<span class="due ${!s.done && diffD(parse(s.due), TODAY) < 0 ? 'over' : ''}">${ic('calendar', 12)}${relDate(s.due)}</span>` : ''}<button class="ibtn ibtn-xs x" data-a="openSub" data-id="${t.id}" data-sid="${s.id}" aria-label="${tr('drawer.openSubtask')}" tabindex="-1">${ic('chevron-right', 14)}</button></div>`).join('')}
        <div class="subt" style="color:var(--text-3)">${ic('plus', 15)}<input class="inline-in" id="d-sub" data-key-enter="addSub" data-id="${t.id}" placeholder="${tr('drawer.addSubtask')}" aria-label="${tr('drawer.addSubtask')}" style="font-size:13.5px"></div>
      </div>

      <div class="dsec"><div class="dsec-h"><h3>${tr('common.attachments')}</h3><span class="cnt">${t.attachments.length}</span><div class="acts"><label class="btn btn-sm btn-ghost" style="cursor:pointer">${ic('upload', 13)}${tr('drawer.upload')}<input type="file" multiple hidden data-in="uploadFiles" data-task="${t.id}" data-project="${t.project}"></label></div></div>
        ${ups.map(x => `<div class="upl" style="margin-bottom:6px"><span class="ftype" style="--c:${FT[fileType(x.name)].c}">${ic(FT[fileType(x.name)].i, 14)}</span><div class="grow"><div class="row"><span class="trunc">${esc(x.name)}</span><span class="sp"></span><span class="faint num" id="upct-${x.id}" style="font-size:11px">${x.pct}%</span></div><div class="prog" style="margin-top:5px"><i id="upbar-${x.id}" style="width:${x.pct}%"></i></div></div></div>`).join('')}
        ${t.attachments.length ? `<div class="att">${t.attachments.map(f => `<div class="attc" data-a="filePreview" data-tid="${t.id}" data-aid="${f.id}" role="button" tabindex="0">${filePrev(f)}<div class="fi"><div class="trunc" style="font-weight:500">${esc(f.name)}</div><div class="faint">${FT[f.type]?.n || tr('drawer.file')} · ${f.size}</div></div><button class="ibtn ibtn-xs x" data-a="rmAttach" data-id="${t.id}" data-aid="${f.id}" aria-label="${tr('drawer.removeAttachment')}">${ic('x', 12)}</button></div>`).join('')}</div>` : !ups.length ? `<label class="dropzone" style="padding:12px" data-dropzone-task="${t.id}">${ic('paperclip', 15)}<span>${tr('drawer.dropToAttach')}</span><input type="file" multiple hidden data-in="uploadFiles" data-task="${t.id}" data-project="${t.project}"></label>` : ''}
      </div>

      <div class="dsec"><div class="dsec-h"><h3>${tr('common.notes')}</h3></div><div class="muted" style="font-size:12.5px;line-height:1.6">${tr('drawer.updated', { when: ago(t.updated) })}</div></div>`
    }
    </div>
  </aside>`;
}
