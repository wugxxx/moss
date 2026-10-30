/* ---------- drag & drop ---------- */
import { $, $$, addD, diffD, fmtDate, iso, parse } from '../core/utils.js';
import { PR, ST } from '../core/constants.js';
import { D, S, isTaskActive, proj, save, task } from '../core/store.js';
import { toast } from '../ui/toast.js';
import { fxSet, render } from '../shell/render.js';
import { viewOf } from '../shell/view-engine.js';
import { handleFiles, runCommand, updateTask } from './actions.js';
import { t as tr } from '../i18n/index.js';

export let DRAG = null;
export function clearDropMarks() {
  $$('.drop-line').forEach(x => x.remove());
  $$('.over').forEach(x => x.classList.remove('over'));
  $$('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
  $$('.dragging').forEach(x => x.classList.remove('dragging'));
}
document.addEventListener('dragstart', e => {
  const card = e.target.closest?.('[data-drag-card]'),
    row = e.target.closest?.('[data-drag-row]'),
    cal = e.target.closest?.('[data-drag-cal]'),
    sp = e.target.closest?.('[data-drag-proj]');
  const el = card || row || cal || sp;
  if (!el) return;
  DRAG = card
    ? { type: 'card', id: card.dataset.dragCard }
    : row
      ? { type: 'row', id: row.dataset.dragRow }
      : cal
        ? { type: 'cal', id: cal.dataset.dragCal }
        : { type: 'proj', id: sp.dataset.dragProj };
  e.dataTransfer.effectAllowed = 'move';
  try {
    e.dataTransfer.setData('text/plain', DRAG.id);
  } catch {
    /* not supported here; safe to skip */
  }
  const vis = row ? row.closest('.trow') : el;
  if (row)
    try {
      e.dataTransfer.setDragImage(vis, 20, 18);
    } catch {
      /* not supported here; safe to skip */
    }
  S.ui.pop = null;
  setTimeout(() => vis.classList.add('dragging'), 0);
});
document.addEventListener('dragend', () => {
  DRAG = null;
  clearDropMarks();
});
document.addEventListener('dragover', e => {
  const hasFiles = e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  if (hasFiles) {
    const dz = e.target.closest?.('[data-dropzone],[data-dropzone-task],.drawer');
    if (dz) {
      e.preventDefault();
      $$('.dropzone.over').forEach(x => x !== dz && x.classList.remove('over'));
      dz.classList?.add('over');
    }
    return;
  }
  if (!DRAG) return;
  if (DRAG.type === 'card') {
    const col = e.target.closest('[data-drop-col]');
    if (!col) return;
    e.preventDefault();
    $$('.bcol.over').forEach(x => x !== col && x.classList.remove('over'));
    col.classList.add('over');
    const body = col.querySelector('[data-col-body]');
    if (!body) return;
    const cards = [...body.querySelectorAll('.kcard:not(.dragging)')];
    const after = cards.find(c => {
      const r = c.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    let line = $('.drop-line');
    if (!line) {
      line = document.createElement('div');
      line.className = 'drop-line';
    }
    const ref = after || body.querySelector('.addcard, .composer');
    if (line.nextSibling !== ref || line.parentNode !== body) body.insertBefore(line, ref);
    DRAG.col = col.dataset.dropCol;
    DRAG.before = after ? after.dataset.dragCard : null;
  } else if (DRAG.type === 'row') {
    const row = e.target.closest('.trow[data-task-row]');
    if (!row || row.dataset.taskRow === DRAG.id) return;
    e.preventDefault();
    const r = row.getBoundingClientRect();
    const before = e.clientY < r.top + r.height / 2;
    $$('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    row.classList.add(before ? 'drop-before' : 'drop-after');
    DRAG.target = row.dataset.taskRow;
    DRAG.pos = before ? 'before' : 'after';
    DRAG.group = row.dataset.group;
    DRAG.lkey = row.dataset.lkey;
  } else if (DRAG.type === 'cal') {
    const day = e.target.closest('[data-drop-day]');
    if (!day) return;
    e.preventDefault();
    $$('.over').forEach(x => x !== day && x.classList.remove('over'));
    day.classList.add('over');
    DRAG.day = day.dataset.dropDay;
  } else if (DRAG.type === 'proj') {
    const it = e.target.closest('[data-proj-drop]');
    if (!it) return;
    e.preventDefault();
    $$('.drop-before').forEach(x => x.classList.remove('drop-before'));
    it.querySelector('.sitem')?.classList.add('drop-before');
    DRAG.before = it.dataset.projDrop;
  }
});
document.addEventListener('dragleave', e => {
  const dz = e.target.closest?.('.dropzone');
  if (dz && !dz.contains(e.relatedTarget)) dz.classList.remove('over');
});
document.addEventListener('drop', e => {
  const files = e.dataTransfer?.files;
  if (files && files.length && !DRAG) {
    const dz = e.target.closest?.('[data-dropzone],[data-dropzone-task],.drawer');
    if (!dz) return;
    e.preventDefault();
    clearDropMarks();
    if (dz.dataset.dropzone) handleFiles(files, { project: dz.dataset.dropzone });
    else {
      const t = task(dz.dataset.dropzoneTask || S.ui.drawer);
      if (t) handleFiles(files, { project: t.project, task: t.id });
    }
    return;
  }
  if (!DRAG) return;
  e.preventDefault();
  const d = DRAG;
  DRAG = null;
  clearDropMarks();
  if (d.type === 'card' && d.col) {
    const t = task(d.id);
    const colTs = D()
      .tasks.filter(x => x.status === d.col && x.id !== t.id && isTaskActive(x))
      .sort((a, b) => a.order - b.order);
    let order;
    if (d.before) {
      const i = colTs.findIndex(x => x.id === d.before);
      const prev = colTs[i - 1];
      const nx = colTs[i];
      order = prev ? (prev.order + nx.order) / 2 : nx.order - 1;
    } else order = colTs.length ? colTs[colTs.length - 1].order + 1 : t.order;
    const moved = t.status !== d.col;
    fxSet({ moved: t.id });
    void runCommand('task.move', { order, ...(moved ? { status: d.col } : {}) }, t.id).then(result => {
      if (result && moved) toast(tr('toast.movedTaskToStatus', { title: t.title, status: ST[d.col].name }), { ms: 2200 });
    });
  } else if (d.type === 'row' && d.target) {
    const t = task(d.id),
      tg = task(d.target);
    const key = d.lkey;
    const v = key ? viewOf(key) : null;
    const all = D()
      .tasks.filter(x => isTaskActive(x) && x.id !== t.id)
      .sort((a, b) => a.order - b.order);
    const i = all.findIndex(x => x.id === tg.id);
    const nb = d.pos === 'before' ? all[i - 1] : all[i + 1];
    const order = nb ? (tg.order + nb.order) / 2 : tg.order + (d.pos === 'before' ? -1 : 1);
    const patch = {};
    if (v && d.group) {
      const g = v.group;
      if (g === 'status' && ST[d.group]) patch.status = d.group;
      if (g === 'priority' && PR[d.group]) patch.priority = d.group;
      if (g === 'assignee') patch.assignee = d.group === 'none' ? null : d.group;
      if (g === 'project' && proj(d.group)) patch.project = d.group;
    }
    let switched = false;
    if (v && v.sort.f !== 'manual') {
      v.sort = { f: 'manual', dir: 1 };
      switched = true;
    }
    void runCommand('task.move', { order, ...patch }, t.id).then(result => {
      if (result && switched) toast(tr('toast.sortedManually'), { kind: 'info', ms: 2200 });
    });
  } else if (d.type === 'cal' && d.day) {
    const t = task(d.id);
    if (t.due === d.day) return;
    const len = t.start && t.due ? diffD(parse(t.due), parse(t.start)) : null;
    fxSet({ moved: t.id });
    updateTask(t.id, { due: d.day, ...(len != null ? { start: iso(addD(parse(d.day), -len)) } : {}) });
    toast(tr('toast.rescheduledTask', { title: t.title, date: fmtDate(d.day) }), { ms: 2200 });
  } else if (d.type === 'proj' && d.before && d.before !== d.id) {
    const o = D().projOrder.filter(x => x !== d.id);
    o.splice(o.indexOf(d.before), 0, d.id);
    void runCommand('project.reorder', { orderedIds: o });
  }
});

/* timeline bar drag + table column resize (pointer events) */
document.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const rz = e.target.closest?.('[data-rsz]');
  if (rz) {
    e.preventDefault();
    e.stopPropagation();
    const c = rz.dataset.rsz,
      key = rz.dataset.key,
      v = viewOf(key);
    const col = $(`col[data-col="${c}"]`);
    const tbl = rz.closest('table');
    const w0 = col.getBoundingClientRect().width || parseFloat(col.style.width);
    const tw0 = tbl.getBoundingClientRect().width;
    const x0 = e.clientX;
    rz.classList.add('on');
    const mv = ev => {
      const w = Math.max(64, w0 + ev.clientX - x0);
      col.style.width = w + 'px';
      tbl.style.width = tw0 + w - w0 + 'px';
    };
    const up = ev => {
      removeEventListener('pointermove', mv);
      removeEventListener('pointerup', up);
      v.colW[c] = Math.max(64, Math.round(w0 + ev.clientX - x0));
      save();
      S.ui.justResized = true;
      setTimeout(() => {
        S.ui.justResized = false;
      }, 60);
      render();
    };
    addEventListener('pointermove', mv);
    addEventListener('pointerup', up);
    return;
  }
  const b = e.target.closest?.('[data-bar]');
  if (!b) return;
  const x0 = e.clientX;
  const l0 = parseFloat(b.style.left);
  const dw = +b.dataset.dw;
  let moved = false;
  const mv = ev => {
    const dx = ev.clientX - x0;
    if (Math.abs(dx) > 4) {
      moved = true;
      b.classList.add('dragging');
    }
    if (moved) b.style.left = l0 + Math.round(dx / dw) * dw + 'px';
  };
  const up = ev => {
    removeEventListener('pointermove', mv);
    removeEventListener('pointerup', up);
    if (!moved) return;
    S.ui.suppressClick = true;
    setTimeout(() => {
      S.ui.suppressClick = false;
    }, 60);
    const days = Math.round((ev.clientX - x0) / dw);
    const t = task(b.dataset.bar);
    if (!days) {
      render();
      return;
    }
    updateTask(t.id, { due: iso(addD(parse(t.due), days)), start: t.start ? iso(addD(parse(t.start), days)) : null });
    toast(
      tr('toast.movedTaskDays', {
        title: t.title,
        count: Math.abs(days),
        direction: days > 0 ? tr('toast.later') : tr('toast.earlier'),
      }),
      { ms: 2200 },
    );
  };
  addEventListener('pointermove', mv);
  addEventListener('pointerup', up);
});
