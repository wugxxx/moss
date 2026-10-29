/* =====================================================================
   ACTIONS · INPUT HANDLERS · DRAG & DROP · KEYBOARD · INIT
   ===================================================================== */
import { $, $$, TODAY, addD, dOff, esc, iso, parse, uid } from '../core/utils.js';
import { PR, PSTAT } from '../core/constants.js';
import { seed } from '../data/seed.js';
import { D, DEFAULT_PREFS, S, allTasks, me, proj, replaceWorkspace, save, task, tasksOf, visibleProjects } from '../core/store.js';
import { fileType, fsize } from '../ui/helpers.js';
import { effectiveDark } from '../core/theme.js';
import { toast } from '../ui/toast.js';
import { focusKey, fxSet, go, render } from '../shell/render.js';
import { viewOf } from '../shell/view-engine.js';
import { TEMPLATES, closeModal, openModal } from '../overlays/modals.js';
import { closePop, openPop, tgt } from '../overlays/popovers.js';
import { workspace } from '../core/workspace-client.js';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_PREVIEW_BYTES } from '@moss/client';
import { t as tr } from '../i18n/index.js';

export const A = {},
  IN = {},
  KEY = {},
  DBL = {},
  BLUR = {};

function syncSnapshot() {
  S.data = workspace.snapshot();
}

function fileErrorMessage(error, fallback) {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
  if (/ENOENT|no such file|not found/i.test(normalized)) return tr('toast.fileNotFound');
  if (/EACCES|EPERM|permission/i.test(normalized)) return tr('toast.fileAccessDenied');
  if (/ENOSPC|no space/i.test(normalized)) return tr('toast.fileDiskFull');
  return normalized || fallback;
}

export async function runCommand(type, payload = {}, entityId = null, options = {}) {
  try {
    const result = await workspace.executeOrThrow(type, payload, entityId);
    syncSnapshot();
    if (options.render !== false) render();
    return result;
  } catch {
    syncSnapshot();
    if (options.render !== false) render();
    toast(tr('toast.changeFailed'), { kind: 'err' });
    return null;
  }
}

export function updateTask(id, patch) {
  if (id === '__form') {
    Object.assign(S.ui.form, patch);
    render();
    return;
  }
  const t = task(id);
  if (!t) return;
  void runCommand('task.patch', { patch }, id).then(() => {
    const changed = task(id);
    if (changed?.status === 'done' && t.status !== 'done' && changed.recur && changed.due) {
      toast(tr('toast.nextRecurring'), { kind: 'info' });
    }
  });
}
export function confirmDlg(o) {
  S.ui.confirmText = '';
  openModal({ type: 'confirm', ...o });
}
export function snapshot() {
  return JSON.stringify(S.data);
}
export async function restore(snap) {
  try {
    await replaceWorkspace(JSON.parse(snap));
    render();
  } catch {
    toast(tr('toast.restoreFailed'), { kind: 'err' });
  }
}
export async function copy(text, msg = tr('common.linkCopied')) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast(tr('toast.copyUnavailable', { text }), { kind: 'info', ms: 6000 });
  }
}
export function loadingBtn(id, ms, fn) {
  const b = document.getElementById(id);
  if (b) {
    b.classList.add('is-loading');
    b.setAttribute('aria-busy', 'true');
  }
  setTimeout(fn, ms);
}
export function curProjectId() {
  if (S.ui.route === 'project') return S.ui.params.id;
  return null;
}
export function projectFromKey(key) {
  if (!key) return null;
  if (key.startsWith('p:')) return key.slice(2);
  if (key.startsWith('sv:')) return D().savedViews.find(v => v.id === key.slice(3))?.project;
  return null;
}
function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/* ---------- navigation ---------- */
A.go = el => {
  const r = el.dataset.r;
  const p = {};
  if (el.dataset.id) p.id = el.dataset.id;
  if (el.dataset.tab) p.tab = el.dataset.tab;
  else if (r === 'project') p.tab = S.prefs.defaultTab || 'board';
  if (el.dataset.sec) p.sec = el.dataset.sec;
  S.ui.palette = null;
  const tabOnly = r === 'project' && S.ui.route === 'project' && S.ui.params.id === p.id;
  go(r, p, { tab: tabOnly });
};
A.back = () => {
  const h = S.ui.history.pop();
  if (h) go(h.route, h.params, { back: true });
  else go('home');
};
A.reload = () => render();
A.openProject = el => go('project', { id: el.dataset.id, tab: S.prefs.defaultTab || 'board' });
A.set = el => {
  const k = el.dataset.k;
  let v = el.dataset.v;
  if (/Tab$|Cat$|Mode$|View$/.test(k)) fxSet({ tabs: true });
  S.ui[k] = v;
  if (k === 'searchCat') S.ui.pop = null;
  render();
};
A.toggleSide = () => {
  S.ui.collapsed = !S.ui.collapsed;
  save();
  render();
};
A.openMnav = () => {
  S.ui.mnav = true;
  render();
};
A.closeMnav = () => {
  S.ui.mnav = false;
  render();
};
A.toggleExpand = el => {
  S.ui.expanded[el.dataset.id] = !S.ui.expanded[el.dataset.id];
  render();
};
A.goTasks = el => {
  const f = el.dataset.f;
  const v = viewOf('tasks');
  v.mode = 'list';
  v.filters =
    f === 'open'
      ? [{ f: 'status', op: 'not', v: ['done'] }]
      : f === 'done'
        ? [
            { f: 'status', op: 'is', v: ['done'] },
            { f: 'updated', op: 'is', v: ['7'] },
          ]
        : f === 'overdue'
          ? [{ f: 'due', op: 'is', v: ['overdue'] }]
          : [];
  go('tasks');
};
A.goFilteredList = el => {
  const v = viewOf('p:' + el.dataset.id);
  v.filters = [{ f: 'status', op: 'is', v: [el.dataset.st] }];
  v.group = 'status';
  go('project', { id: el.dataset.id, tab: 'list' }, { tab: true });
};

/* ---------- theme ---------- */
A.setTheme = el => {
  S.prefs.theme = el.dataset.v;
  save();
  render();
};
A.toggleDark = () => {
  S.prefs.theme = effectiveDark() ? 'light' : 'dark';
  save();
  S.ui.palette = null;
  render();
  toast(effectiveDark() ? tr('toast.darkMode') : tr('toast.lightMode'), { kind: 'info', ms: 1800 });
};
A.setPref = el => {
  S.prefs[el.dataset.k] = el.dataset.v;
  save();
  render();
};

/* ---------- popovers ---------- */
A.pop = el => {
  const d = el.dataset;
  const p = S.ui.pop;
  if (p && p.type === d.pop && p.id === d.id && p.key === d.key && p.i == (d.i != null ? +d.i : undefined) && p.field === d.field) {
    closePop();
    return;
  }
  openPop(el);
};
A.ctxBtn = el => {
  const r = el.getBoundingClientRect();
  const d = el.dataset;
  const p = S.ui.pop;
  if (p && p.type === 'ctx' && p.id === d.id && p.ctx === d.ctx) {
    closePop();
    return;
  }
  S.ui.pop = { type: 'ctx', ctx: d.ctx, id: d.id, key: d.key, vid: d.vid, x: r.left, y: r.bottom + 4, top: r.top, w: r.width };
  render();
};
A.popPick = el => {
  const p = S.ui.pop;
  let v = el.dataset.v;
  if (p.type === 'date' && p.field === 'subdue') {
    const t = task(p.id);
    const sb = t?.subtasks[p.i];
    if (!sb) return;
    S.ui.pop = null;
    void runCommand(
      'task.patch',
      {
        patch: {
          subtasks: t.subtasks.map(item => (item.id === sb.id ? { ...item, due: v || null } : item)),
        },
      },
      t.id,
    );
    return;
  }
  if (p.type === 'pstatus') {
    const pr = proj(p.id);
    void runCommand('project.patch', { patch: { status: v } }, pr.id).then(() => toast(tr('toast.projectMarked', { project: pr.name, status: PSTAT[v].name })));
    S.ui.pop = null;
    return;
  }
  const field = { status: 'status', priority: 'priority', project: 'project', recur: 'recur', estimate: 'estimate', date: p.field }[p.type];
  if (!field) return;
  if (field === 'recur' && v === 'Does not repeat') v = null;
  if ((field === 'estimate' || field === 'due' || field === 'start') && !v) v = null;
  S.ui.pop = null;
  const patch = { [field]: v };
  if (field === 'due' && v && p.id !== '__form') {
    const t = task(p.id);
    if (t.start && t.start > v) patch.start = v;
  }
  updateTask(p.id, patch);
};
A.popToggleLabel = el => {
  const p = S.ui.pop;
  const t = tgt(p);
  const v = el.dataset.v;
  const labels = t.labels.includes(v) ? t.labels.filter(x => x !== v) : [...t.labels, v];
  updateTask(p.id, { labels });
};
A.popToggleDep = el => {
  const p = S.ui.pop;
  const t = task(p.id);
  const v = el.dataset.v;
  updateTask(p.id, { deps: t.deps.includes(v) ? t.deps.filter(x => x !== v) : [...t.deps, v] });
};
A.popMonth = el => {
  const p = S.ui.pop;
  const m = parse(p.m);
  p.m = iso(new Date(m.getFullYear(), m.getMonth() + +el.dataset.d, 1));
  render();
};
IN.popQ = el => {
  if (S.ui.pop) {
    S.ui.pop.q = el.value;
    render();
  }
};
export const ctxTo = type => () => {
  S.ui.pop = { ...S.ui.pop, type, q: '' };
  if (type === 'date') S.ui.pop.m = iso(TODAY);
  render();
};
A.ctxStatus = ctxTo('status');
A.ctxPrio = ctxTo('priority');
A.ctxMove = ctxTo('project');

/* ---------- tasks ---------- */
A.openTask = el => {
  const id = el.dataset.id;
  if (!task(id)) return;
  if (!S.ui.drawer || !document.activeElement?.closest?.('.drawer')) S.ui.drawerOpener = el.isConnected ? focusKey(el) : S.ui.drawerOpener;
  S.ui.drawer = id;
  S.ui.drawerFull = S.prefs.openTasks === 'full' || (S.ui.drawerFull && S.ui.drawer === id);
  S.ui.pop = null;
  S.ui.palette = null;
  S.ui.modals = [];
  S.ui.subOpen = null;
  render();
  const dr = $('.drawer');
  if (dr && !dr.contains(document.activeElement)) dr.focus({ preventScroll: true });
};
A.closeDrawer = () => {
  S.ui.drawer = null;
  S.ui.drawerFull = false;
  S.ui.subOpen = null;
  render();
};
A.skipToContent = () => {
  const c = $('#main-content');
  c?.focus();
};
A.projUp = el => A._projMove(el, -1);
A.projDown = el => A._projMove(el, 1);
A._projMove = (el, d) => {
  const vis = visibleProjects().map(p => p.id);
  const i = vis.indexOf(el.dataset.id);
  const j = i + d;
  if (j < 0 || j >= vis.length) return;
  const o = [...D().projOrder];
  const a = o.indexOf(vis[i]),
    b = o.indexOf(vis[j]);
  [o[a], o[b]] = [o[b], o[a]];
  S.ui.pop = null;
  void runCommand('project.reorder', { orderedIds: o }).then(() =>
    toast(tr('toast.movedProject', { project: proj(el.dataset.id).name, direction: d < 0 ? tr('toast.up') : tr('toast.down') }), { ms: 1600 }),
  );
};
A.toggleDrawerFull = () => {
  S.ui.drawerFull = !S.ui.drawerFull;
  render();
};
A.toggleDone = el => {
  const t = task(el.dataset.id);
  if (!t) return;
  const wasDone = t.status === 'done';
  S.ui.pop = null;
  updateTask(t.id, { status: wasDone ? (t.prevStatus && t.prevStatus !== 'done' ? t.prevStatus : 'todo') : 'done' });
  if (!wasDone)
    toast(tr('toast.completed', { title: t.title }), { action: tr('common.undo'), onAction: () => updateTask(t.id, { status: t.prevStatus || 'todo' }) });
};
A.toggleFavTask = el => {
  const t = task(el.dataset.id);
  const wasFav = t.fav;
  void runCommand('task.patch', { patch: { fav: !wasFav } }, t.id).then(result => {
    if (result) toast(wasFav ? tr('toast.favoriteRemoved') : tr('toast.favoriteAdded'), { ms: 1800 });
  });
  S.ui.pop = null;
};
A.toggleFavProj = el => {
  const p = proj(el.dataset.id);
  const wasFav = p.fav;
  void runCommand('project.patch', { patch: { fav: !wasFav } }, p.id).then(result => {
    if (result) toast(wasFav ? tr('toast.favoriteRemoved') : tr('toast.favoriteAddedProject', { project: p.name }), { ms: 1800 });
  });
  S.ui.pop = null;
};
A.copyText = el => copy(el.dataset.text, tr('common.copied'));
A.dupTask = el => {
  const t = task(el.dataset.id);
  S.ui.pop = null;
  void duplicateTask(t);
};
async function duplicateTask(t) {
  const pending = [];
  try {
    for (const attachment of t.attachments) {
      if (attachment.storageKey && workspace.attachments) pending.push(await copyAttachment(attachment));
      else pending.push({ ...attachment });
    }
    const result = await runCommand('task.create', {
      projectId: t.project,
      title: `${t.title} (${tr('common.copySuffix')})`,
      status: t.status,
      assignee: t.assignee,
      priority: t.priority,
      due: t.due,
      start: t.start,
      labels: [...t.labels],
      subtasks: t.subtasks.map(s => ({ ...s })),
      attachments: pending,
      desc: t.desc,
      recur: t.recur,
      estimate: t.estimate,
      fav: false,
    });
    if (!result) {
      await removeStoredFiles(pending);
      return;
    }
    const id = result.affected.ids[0];
    toast(tr('toast.taskDuplicated'), { action: tr('common.open'), onAction: () => A.openTask({ dataset: { id } }) });
  } catch {
    await removeStoredFiles(pending);
    toast(tr('toast.taskDuplicateFailed'), { kind: 'err' });
  }
}
A.archiveTask = el => {
  const t = task(el.dataset.id);
  const snap = snapshot();
  S.ui.pop = null;
  if (S.ui.drawer === t.id) S.ui.drawer = null;
  void runCommand('task.archive', {}, t.id).then(result => {
    if (result) toast(tr('toast.archived', { title: t.title }), { action: tr('common.undo'), onAction: () => restore(snap) });
  });
};
A.delTask = el => {
  const t = task(el.dataset.id);
  S.ui.pop = null;
  if (!t) return;
  const stored = t.attachments.filter(a => a.storageKey);
  const run = () => {
    const snap = snapshot();
    if (S.ui.drawer === t.id) S.ui.drawer = null;
    S.ui.sel.delete(t.id);
    void runCommand('task.delete', {}, t.id).then(async result => {
      if (!result) return;
      await removeStoredFiles(t.attachments);
      toast(tr('toast.deleted', { title: t.title }), stored.length ? { ms: 2200 } : { action: tr('common.undo'), onAction: () => restore(snap) });
    });
  };
  if (S.prefs.confirmDel === false && !el.dataset.demo) return run();
  confirmDlg({
    title: tr('modals.confirmDeleteTask'),
    body: tr('modals.confirmDeleteTaskBody', {
      title: esc(t.title),
      subtasks: t.subtasks.length ? tr('modals.confirmDeleteTaskSubtasks', { count: t.subtasks.length }) : '',
    }),
    ok: tr('modals.deleteTask'),
    danger: true,
    run,
  });
};
A.editTask = el => {
  const t = task(el.dataset.id);
  if (!t) return;
  S.ui.form = {
    title: t.title,
    desc: (t.desc || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    project: t.project,
    status: t.status,
    assignee: t.assignee,
    priority: t.priority,
    due: t.due,
    start: t.start,
    labels: [...t.labels],
    subtasks: t.subtasks.map(s => ({ ...s })),
    files: [],
    recur: t.recur,
    more: false,
  };
  S.ui.errors = {};
  openModal({ type: 'task', edit: t.id });
};
A.newTask = el => {
  const d = el?.dataset || {};
  const pid =
    d.project ||
    curProjectId() ||
    projectFromKey(S.ui.composer?.ctx) ||
    (S.ui.drawer && task(S.ui.drawer)?.project) ||
    visibleProjects().find(p => p.status !== 'complete')?.id;
  S.ui.form = {
    title: '',
    desc: '',
    project: pid,
    status: 'todo',
    assignee: d.assignee || D().me,
    priority: 'medium',
    due: d.due || null,
    start: null,
    labels: [],
    subtasks: [],
    files: [],
    recur: null,
    more: S.ui.form?.more || false,
  };
  S.ui.errors = {};
  openModal({ type: 'task' });
};
IN.form = el => {
  S.ui.form[el.dataset.f] = el.value;
  if (el.dataset.f === 'title' && S.ui.errors.title && el.value.trim()) {
    S.ui.errors.title = null;
    render();
  }
};
IN.formMore = el => {
  S.ui.form.more = el.checked;
};
IN.formFiles = el => {
  for (const file of [...el.files]) {
    if (!file.size) {
      toast(tr('toast.fileEmpty', { name: file.name }), { kind: 'err' });
      continue;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast(tr('toast.fileTooLarge', { name: file.name }), { kind: 'err' });
      continue;
    }
    S.ui.form.files.push({
      id: uid('u'),
      name: file.name,
      size: fsize(file.size),
      type: fileType(file.name),
      file,
    });
  }
  el.value = '';
  render();
};
KEY.formAddSub = el => {
  const v = el.value.trim();
  if (!v) return;
  S.ui.form.subtasks.push({ id: uid('s'), title: v, done: false });
  render();
  setTimeout(() => $('#f-sub')?.focus(), 0);
};
A.formRmSub = el => {
  S.ui.form.subtasks.splice(+el.dataset.i, 1);
  render();
};
A.formRmFile = el => {
  S.ui.form.files.splice(+el.dataset.i, 1);
  render();
};
A.submitTask = async () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  if (S.ui.taskSaving) return;
  if (m?.type !== 'task') return;
  const f = S.ui.form;
  const title = ($('#f-title')?.value ?? f.title).trim();
  f.title = title;
  f.desc = $('#f-desc')?.value ?? f.desc;
  if (!title) {
    S.ui.errors.title = tr('toast.taskNameRequired');
    render();
    $('#f-title')?.focus();
    return;
  }
  S.ui.errors = {};
  S.ui.taskSaving = true;
  const pendingFiles = [...f.files];
  f.files = [];
  render();
  const button = document.getElementById('f-submit');
  if (button) {
    button.disabled = true;
    button.classList.add('is-loading');
  }
  let files = [];
  try {
    files = await storeFormFiles({ ...f, files: pendingFiles });
  } catch (error) {
    S.ui.taskSaving = false;
    f.files = pendingFiles;
    document.getElementById('f-submit')?.classList.remove('is-loading');
    render();
    toast(fileErrorMessage(error, tr('toast.attachmentFailed')), { kind: 'err' });
    return;
  }
  const base = {
    title,
    project: f.project,
    status: f.status,
    assignee: f.assignee,
    priority: f.priority,
    due: f.due,
    start: f.start && f.due && f.start > f.due ? f.due : f.start,
    labels: f.labels,
    recur: f.recur,
    subtasks: f.subtasks,
  };
  if (m.edit) {
    const t = task(m.edit);
    const patch = { ...base };
    if (
      f.desc !==
      (t.desc || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
      patch.desc = f.desc ? `<p>${esc(f.desc)}</p>` : '';
    if (files.length) patch.attachments = [...t.attachments, ...files];
    S.ui.modals.pop();
    S.ui.taskSaving = false;
    void runCommand('task.patch', { patch }, t.id).then(result => {
      if (!result) {
        void removeStoredFiles(files);
        return;
      }
      toast(tr('toast.changesSaved'));
    });
    return;
  }
  const fileCount = files.length;
  S.ui.modals.pop();
  S.ui.taskSaving = false;
  void runCommand('task.create', {
    ...base,
    projectId: f.project,
    desc: f.desc ? `<p>${esc(f.desc)}</p>` : '',
    attachments: files,
  }).then(result => {
    if (!result) {
      void removeStoredFiles(files);
      return;
    }
    const id = result.affected.ids[0];
    if (f.more) {
      Object.assign(f, { title: '', desc: '', subtasks: [], files: [] });
      setTimeout(() => $('#f-title')?.focus(), 0);
      toast(fileCount && !workspace.attachments ? tr('toast.taskCreatedMetadata') : tr('toast.taskCreated'), { ms: 2600 });
      return;
    }
    fxSet({ added: id });
    render();
    toast(fileCount && !workspace.attachments ? tr('toast.taskCreatedMetadata') : tr('toast.taskCreated'), {
      action: tr('common.open'),
      onAction: () => A.openTask({ dataset: { id } }),
      ms: 2600,
    });
  });
};

async function removeStoredFiles(files) {
  await Promise.all(files.map(item => (item.storageKey ? workspace.attachments?.remove(item.storageKey).catch(() => {}) : null)));
}

async function storeFormFiles(form) {
  const stored = [];
  try {
    for (const item of form.files || []) {
      let file = null;
      if (workspace.attachments) {
        file = await workspace.attachments.save({
          name: item.name,
          contentType: item.file?.type || 'application/octet-stream',
          bytes: new Uint8Array(await item.file.arrayBuffer()),
        });
      }
      stored.push({
        id: uid('a'),
        name: file?.name ?? item.name,
        type: fileType(file?.name ?? item.name),
        size: fsize(file?.byteSize ?? item.file.size),
        by: D().me,
        at: Date.now(),
        contentType: file?.contentType ?? (item.file.type || null),
        byteSize: file?.byteSize ?? item.file.size,
        sha256: file?.sha256 ?? null,
        storageKey: file?.storageKey ?? null,
      });
    }
  } catch (error) {
    await Promise.all(stored.map(item => (item.storageKey ? workspace.attachments?.remove(item.storageKey).catch(() => {}) : null)));
    throw error;
  }
  return stored;
}

/* inline composer */
A.startComposer = el => {
  S.ui.composer = { ctx: el.dataset.ctx, group: el.dataset.group, gb: JSON.parse(el.dataset.gb || '{}') };
  S.ui.pop = null;
  render();
  setTimeout(() => $('#composer-in')?.focus(), 0);
};
A.cancelComposer = () => {
  S.ui.composer = null;
  render();
};
KEY.commitComposer = () => A.commitComposer();
A.commitComposer = () => {
  const c = S.ui.composer;
  const el = $('#composer-in');
  const v = el?.value.trim();
  if (!c) return;
  if (!v) {
    A.cancelComposer();
    return;
  }
  const f = { title: v, ...c.gb };
  f.project = f.project || projectFromKey(c.ctx) || curProjectId() || 'p1';
  if (c.ctx === 'mytasks') f.assignee = D().me;
  void runCommand('task.create', { ...f, projectId: f.project }).then(result => {
    if (!result) return;
    A.cancelComposer();
    setTimeout(() => $('#composer-in')?.focus(), 0);
  });
};
KEY.commitTitle = el => DBL._commitTitle(el);
DBL.editTitle = el => {
  const row = el.closest('[data-task-row]');
  if (!row) return;
  S.ui.drawer = null;
  S.ui.editCell = { id: row.dataset.taskRow, f: 'title' };
  render();
  const i = $('#edit-title');
  if (i) {
    i.focus();
    i.select();
  }
};
DBL._commitTitle = el => {
  const c = S.ui.editCell;
  if (!c) return;
  S.ui.editCell = null;
  const v = el.value.trim();
  if (v && v !== task(c.id).title) updateTask(c.id, { title: v });
  else render();
};
DBL.editCell = el => {
  S.ui.drawer = null;
  S.ui.editCell = { id: el.dataset.id || el.closest('[data-id]').dataset.id, f: el.dataset.f };
  render();
  const i = $('#edit-cell');
  if (i) {
    i.focus();
    i.select();
  }
};
A.editCell = el => DBL.editCell(el);
KEY.commitCell = el => {
  const c = S.ui.editCell;
  if (!c) return;
  S.ui.editCell = null;
  const v = el.value.trim();
  if (c.f === 'title' && !v) {
    render();
    return;
  }
  updateTask(c.id, { [c.f]: v || null });
};
BLUR.commitCell = el => KEY.commitCell(el);
BLUR.commitTitle = el => DBL._commitTitle(el);
BLUR.commitDrawerTitle = el => {
  const t = task(el.dataset.id);
  const v = el.value.trim();
  if (t && v && v !== t.title) updateTask(t.id, { title: v });
};
KEY.blur = el => el.blur();

/* subtasks */
A.toggleSub = el => {
  const t = task(el.dataset.id);
  const s = t.subtasks.find(x => x.id === el.dataset.sid);
  if (!s.done) fxSet({ done: s.id });
  void runCommand(
    'task.patch',
    {
      patch: {
        subtasks: t.subtasks.map(item => (item.id === s.id ? { ...item, done: !item.done } : item)),
      },
    },
    t.id,
  );
};
A.rmSub = el => {
  const t = task(el.dataset.id);
  void runCommand(
    'task.patch',
    {
      patch: { subtasks: t.subtasks.filter(x => x.id !== el.dataset.sid) },
    },
    t.id,
  );
};
KEY.addSub = el => {
  const t = task(el.dataset.id);
  const v = el.value.trim();
  if (!v) return;
  const nid = uid('s');
  fxSet({ added: nid });
  void runCommand(
    'task.patch',
    {
      patch: { subtasks: [...t.subtasks, { id: nid, title: v, done: false }] },
    },
    t.id,
  ).then(result => {
    if (result) setTimeout(() => $('#d-sub')?.focus(), 0);
  });
};
A.expandRow = el => {
  S.ui.openTasks[el.dataset.id] = !S.ui.openTasks[el.dataset.id];
  render();
};

/* attachments */
A.rmAttach = el => {
  const t = task(el.dataset.id);
  const f = t.attachments.find(a => a.id === el.dataset.aid);
  if (!f) return;
  void runCommand('file.delete', {}, f.id).then(async result => {
    if (!result) return;
    await workspace.attachments?.remove(f.storageKey).catch(() => {});
    toast(tr('toast.attachmentRemoved', { name: f.name }));
  });
};
A.filePreview = el => {
  const t = task(el.dataset.tid);
  const f = t.attachments.find(a => a.id === el.dataset.aid);
  openModal({ type: 'filePreview', file: f, tid: t.id });
};
A.previewFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  if (f) openModal({ type: 'filePreview', file: f, tid: f.task });
};
A.openFile = async el => {
  if (!el.dataset.key) return;
  try {
    await workspace.attachments?.open(el.dataset.key);
  } catch (error) {
    toast(fileErrorMessage(error, tr('toast.openFailed')), { kind: 'err' });
  }
};
A.revealFile = async el => {
  if (!el.dataset.key) return;
  try {
    await workspace.attachments?.reveal(el.dataset.key);
  } catch (error) {
    toast(fileErrorMessage(error, tr('toast.revealFailed')), { kind: 'err' });
  }
};
A.toggleFileImagePreview = async el => {
  const host = document.getElementById('file-preview-media');
  if (!host || !workspace.attachments || !el.dataset.key) return;
  try {
    if (host.dataset.loaded === 'true') {
      host.dataset.loaded = 'false';
      if (host.dataset.objectUrl) URL.revokeObjectURL(host.dataset.objectUrl);
      delete host.dataset.objectUrl;
      host.innerHTML = '';
      host.dataset.previewHtml ||= '';
      if (host.dataset.previewHtml) host.innerHTML = host.dataset.previewHtml;
      el.textContent = tr('common.preview');
      return;
    }
    if (+el.dataset.size > MAX_ATTACHMENT_PREVIEW_BYTES) {
      toast(tr('toast.imageTooLarge'), { kind: 'info' });
      return;
    }
    if (!host.dataset.previewHtml) host.dataset.previewHtml = host.innerHTML;
    const bytes = await workspace.attachments.read(el.dataset.key);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy], { type: el.dataset.type || undefined });
    const url = URL.createObjectURL(blob);
    host.dataset.objectUrl = url;
    host.innerHTML = `<img src="${url}" alt="${esc(tr('modals.previewOf', { name: el.closest('.modal')?.querySelector('h2')?.textContent || tr('common.attachments') }))}" style="display:block;width:100%;max-height:56vh;object-fit:contain;background:var(--sunken)">`;
    host.dataset.loaded = 'true';
    el.textContent = tr('modals.closePreview');
    host.querySelector('img')?.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
  } catch (error) {
    toast(fileErrorMessage(error, tr('toast.previewFailed')), { kind: 'err' });
  }
};
export function handleFiles(files, ctx) {
  if (!files || !files.length) return;
  S.ui.uploads = S.ui.uploads || [];
  for (const file of [...files]) {
    if (!file.size) {
      toast(tr('toast.fileEmpty', { name: file.name }), { kind: 'err' });
      continue;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast(tr('toast.fileTooLarge', { name: file.name }), { kind: 'err' });
      continue;
    }
    const up = {
      id: uid('u'),
      name: file.name,
      size: fsize(file.size),
      type: fileType(file.name),
      project: ctx.project,
      task: ctx.task || null,
      pct: 5,
      state: 'reading',
    };
    S.ui.uploads.push(up);
    S.ui.uploadChain = (S.ui.uploadChain || Promise.resolve()).then(() => persistAttachment(file, up));
  }
  render();
}

async function persistAttachment(file, up) {
  try {
    let stored = null;
    if (workspace.attachments) {
      up.pct = 25;
      up.state = 'saving';
      updateUploadProgress(up);
      stored = await workspace.attachments.save({
        name: file.name,
        contentType: file.type || 'application/octet-stream',
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
    }
    up.pct = 85;
    up.state = 'indexing';
    up.storageKey = stored?.storageKey ?? null;
    updateUploadProgress(up);
    const rec = {
      id: uid('f'),
      name: stored?.name || up.name,
      type: fileType(stored?.name || up.name),
      size: fsize(stored?.byteSize ?? file.size),
      by: D().me,
      at: Date.now(),
      contentType: stored?.contentType ?? (file.type || null),
      byteSize: stored?.byteSize ?? file.size,
      sha256: stored?.sha256 ?? null,
      storageKey: stored?.storageKey ?? null,
    };
    const result = await runCommand('file.create', {
      file: { ...rec, project: up.project, task: up.task || null },
    });
    if (!result) throw new Error(tr('toast.fileAddFailed'));
    S.ui.uploads = (S.ui.uploads || []).filter(x => x !== up);
    render();
    toast(workspace.attachments ? tr('toast.uploaded', { name: up.name }) : tr('toast.metadataAdded', { name: up.name }));
  } catch (error) {
    if (up.storageKey) await workspace.attachments?.remove(up.storageKey).catch(() => {});
    S.ui.uploads = (S.ui.uploads || []).filter(x => x !== up);
    render();
    toast(fileErrorMessage(error, tr('toast.uploadFailed', { name: up.name })), { kind: 'err' });
  }
}

function updateUploadProgress(up) {
  const bar = document.getElementById('upbar-' + up.id);
  const pc = document.getElementById('upct-' + up.id);
  if (bar) bar.style.setProperty('--p', up.pct / 100);
  if (pc) pc.textContent = up.pct + '%';
}
IN.uploadFiles = el => {
  handleFiles(el.files, { project: el.dataset.project, task: el.dataset.task });
  el.value = '';
};

/* rich text description */
document.addEventListener('mousedown', e => {
  const b = e.target.closest('[data-cmd]');
  if (!b) return;
  e.preventDefault();
  const [cmd, arg] = b.dataset.cmd.split(':');
  if (cmd === 'createLink') {
    const s = String(getSelection());
    if (/^https?:\/\//.test(s)) document.execCommand('createLink', false, s);
    else toast(tr('toast.selectUrl'), { kind: 'info' });
  } else document.execCommand(cmd, false, arg ? `<${arg}>` : null);
  const ed = $('#d-desc');
  if (ed) {
    const t = task(ed.dataset.rte);
    scheduleDescriptionSave(t.id, ed.innerHTML);
  }
});
document.addEventListener('input', e => {
  const ed = e.target.closest?.('[data-rte]');
  if (!ed) return;
  const t = task(ed.dataset.rte);
  if (t) scheduleDescriptionSave(t.id, ed.innerHTML);
});

const descriptionSaveTimers = new Map();
function scheduleDescriptionSave(taskId, desc) {
  clearTimeout(descriptionSaveTimers.get(taskId));
  descriptionSaveTimers.set(
    taskId,
    setTimeout(() => {
      descriptionSaveTimers.delete(taskId);
      void runCommand('task.patch', { patch: { desc } }, taskId, { render: false });
    }, 500),
  );
}

/* selection & bulk */
A.selRow = el => {
  const id = el.dataset.id;
  S.ui.sel.has(id) ? S.ui.sel.delete(id) : S.ui.sel.add(id);
  render();
};
A.selAll = el => {
  const ids = $$('[data-task-row]', el.closest('.tlist')).map(r => r.dataset.taskRow);
  const all = ids.every(i => S.ui.sel.has(i));
  ids.forEach(i => (all ? S.ui.sel.delete(i) : S.ui.sel.add(i)));
  render();
};
A.clearSel = () => {
  S.ui.sel.clear();
  render();
};
A.bulkSet = el => {
  const f = el.dataset.f;
  let v = el.dataset.v || null;
  const ids = [...S.ui.sel];
  S.ui.pop = null;
  void runCommand('task.bulkPatch', { ids, patch: { [f]: v } }).then(result => {
    if (result) toast(tr('toast.updatedTasks', { count: ids.length }));
  });
};
A.bulkDelete = () => {
  const ids = [...S.ui.sel];
  const attachments = D()
    .tasks.filter(t => ids.includes(t.id))
    .flatMap(t => t.attachments);
  const hasStoredFiles = attachments.some(a => a.storageKey);
  confirmDlg({
    title: tr('modals.confirmDeleteTasks', { count: ids.length }),
    body: tr('modals.confirmDeleteTasksBody'),
    ok: tr('modals.deleteTasks', { count: ids.length }),
    danger: true,
    run: () => {
      const snap = snapshot();
      ids.forEach(id => {
        S.ui.sel.delete(id);
        if (S.ui.drawer === id) S.ui.drawer = null;
      });
      void runCommand('task.bulkDelete', { ids }).then(async result => {
        if (!result) return;
        await removeStoredFiles(attachments);
        toast(tr('toast.bulkDeleted', { count: ids.length }), hasStoredFiles ? { ms: 2200 } : { action: tr('common.undo'), onAction: () => restore(snap) });
      });
    },
  });
};

/* views: sort, group, filters, columns */
A.sortBy = el => {
  const v = viewOf(el.dataset.key);
  const f = el.dataset.f;
  if (S.ui.justResized) return;
  v.sort = v.sort.f === f ? { f, dir: -v.sort.dir } : { f, dir: 1 };
  save();
  render();
};
A.setSort = el => {
  const v = viewOf(el.dataset.key);
  v.sort = { f: el.dataset.v, dir: v.sort.dir || 1 };
  S.ui.pop = null;
  save();
  render();
};
A.setSortDir = el => {
  viewOf(el.dataset.key).sort.dir = +el.dataset.v;
  save();
  render();
};
A.setGroup = el => {
  viewOf(el.dataset.key).group = el.dataset.v;
  S.ui.pop = null;
  save();
  render();
};
A.toggleGroup = el => {
  const gk = el.dataset.gk;
  S.ui.collapsedGroups[gk] = el.getAttribute('aria-expanded') === 'true';
  render();
};
A.setViewMode = el => {
  viewOf(el.dataset.key).mode = el.dataset.v;
  save();
  render();
};
A.toggleCol2 = el => {
  const v = viewOf(el.dataset.key);
  const c = el.dataset.v;
  v.hidden = v.hidden.includes(c) ? v.hidden.filter(x => x !== c) : [...v.hidden, c];
  save();
  render();
};
A.resetCols = el => {
  viewOf(el.dataset.key).colW = {};
  S.ui.pop = null;
  save();
  render();
};
IN.viewQ = el => {
  viewOf(el.dataset.key).q = el.value;
  render();
};
A.addFilter = el => {
  const v = viewOf(el.dataset.key);
  v.filters.push({ f: el.dataset.f, op: 'is', v: [] });
  if (S.ui.pop?.type === 'filter') S.ui.pop.edit = v.filters.length - 1;
  else {
    const r = el.getBoundingClientRect();
    S.ui.pop = { type: 'filter', key: el.dataset.key, x: r.left, y: r.bottom + 4, edit: v.filters.length - 1 };
  }
  save();
  render();
};
A.fEdit = el => {
  const p = S.ui.pop;
  p.edit = p.edit === +el.dataset.i ? null : +el.dataset.i;
  render();
};
A.fToggleVal = el => {
  const f = viewOf(el.dataset.key).filters[+el.dataset.i];
  const x = el.dataset.v;
  f.v = f.v.includes(x) ? f.v.filter(y => y !== x) : [...f.v, x];
  save();
  render();
};
A.rmFilter = el => {
  const v = viewOf(el.dataset.key);
  v.filters.splice(+el.dataset.i, 1);
  if (S.ui.pop && S.ui.pop.type === 'fvals') S.ui.pop = null;
  if (S.ui.pop?.type === 'filter') S.ui.pop.edit = null;
  save();
  render();
};
A.clearFilters = el => {
  const v = viewOf(el.dataset.key);
  v.filters = [];
  v.q = '';
  S.ui.pop = null;
  save();
  render();
};
IN.fField = el => {
  const f = viewOf(el.dataset.key).filters[+el.dataset.i];
  f.f = el.value;
  f.v = [];
  S.ui.pop.edit = +el.dataset.i;
  save();
  render();
};
IN.fOp = el => {
  viewOf(el.dataset.key).filters[+el.dataset.i].op = el.value;
  save();
  render();
};
A.saveView = el => {
  const k = 'p:' + el.dataset.id;
  openModal({ type: 'saveView', pid: el.dataset.id, nf: viewOf(k).filters.length });
};
A.saveViewSubmit = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const name = $('#sv-name').value.trim() || tr('modals.untitledView');
  const type = $('#sv-type').value;
  const sv = { id: uid('v'), project: m.pid, name, type, filters: JSON.parse(JSON.stringify(viewOf('p:' + m.pid).filters)) };
  void runCommand('savedView.create', { view: sv }).then(result => {
    if (!result) return;
    S.ui.modals.pop();
    go('project', { id: m.pid, tab: 'v:' + sv.id }, { tab: true });
    toast(tr('toast.viewSaved', { name }));
  });
};
A.renameView = el => {
  const v = D().savedViews.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  openModal({
    type: 'prompt',
    title: tr('modals.renameView'),
    label: tr('modals.viewName'),
    value: v.name,
    run: val => {
      if (val) {
        void runCommand('savedView.patch', { patch: { name: val } }, v.id).then(result => {
          if (result) toast(tr('toast.viewRenamed'));
        });
      }
    },
  });
};
A.delView = el => {
  const v = D().savedViews.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  void runCommand('savedView.delete', {}, v.id).then(result => {
    if (!result) return;
    if (S.ui.params.tab === 'v:' + v.id) go('project', { id: v.project, tab: 'list' }, { tab: true });
    else render();
    toast(tr('toast.viewDeleted', { name: v.name }));
  });
};

/* board column menu */
A.toggleCol = el => {
  delete S.ui.collapsedCols[el.dataset.ck];
  render();
};
A.colCollapse = el => {
  S.ui.collapsedCols[S.ui.pop.key + ':' + el.dataset.id] = true;
  S.ui.pop = null;
  render();
};
A.colAdd = el => {
  const key = S.ui.pop.key;
  const pid = projectFromKey(key);
  S.ui.pop = null;
  A.startComposer({ dataset: { ctx: key, group: el.dataset.id, gb: JSON.stringify({ status: el.dataset.id, ...(pid ? { project: pid } : {}) }) } });
};
export function colTasks(key, st) {
  const pid = projectFromKey(key);
  return (pid ? tasksOf(pid) : allTasks()).filter(t => t.status === st);
}
A.colDoneAll = el => {
  const ts = colTasks(S.ui.pop.key, el.dataset.id);
  S.ui.pop = null;
  if (!ts.length) {
    render();
    return;
  }
  const snap = snapshot();
  void runCommand('task.bulkPatch', {
    ids: ts.map(t => t.id),
    patch: { status: 'done' },
  }).then(result => {
    if (result) toast(tr('toast.markedDone', { count: ts.length }), { action: tr('common.undo'), onAction: () => restore(snap) });
  });
};
A.colArchive = () => {
  const ts = colTasks(S.ui.pop.key, 'done');
  S.ui.pop = null;
  const snap = snapshot();
  void runCommand('task.bulkArchive', { ids: ts.map(t => t.id) }).then(result => {
    if (result) toast(tr('toast.archivedCompleted', { count: ts.length }), { action: tr('common.undo'), onAction: () => restore(snap) });
  });
};
A.colSortPrio = el => {
  const ts = colTasks(S.ui.pop.key, el.dataset.id).sort((a, b) => PR[b.priority].w - PR[a.priority].w);
  const base = Math.min(...ts.map(t => t.order));
  S.ui.pop = null;
  void runCommand('task.batchMove', {
    updates: ts.map((t, i) => ({ id: t.id, order: base + i * 0.001 })),
  });
};

/* calendar & timeline */
A.calNav = el => {
  const d = +el.dataset.d;
  const cur = parse(S.ui.calDate);
  S.ui.calDate = d === 0 ? iso(TODAY) : S.ui.calMode === 'month' ? iso(new Date(cur.getFullYear(), cur.getMonth() + d, 1)) : iso(addD(cur, d * 7));
  render();
};
A.tlToday = () => {
  const r = $('#tl-right');
  if (r) r.scrollTo({ left: Math.max(0, +$('.tl').dataset.tlToday - 160), behavior: 'smooth' });
};
IN.tlGroup = el => {
  S.ui.tlGroup = el.value;
  render();
};

/* calendar events */
A.newEvent = el => {
  const activeProjects = visibleProjects();
  const requestedProject = el.dataset.project || curProjectId();
  const project = activeProjects.find(item => item.id === requestedProject)?.id || activeProjects[0]?.id || '';
  S.ui.eform = {
    title: '',
    date: el.dataset.date || dOff(0),
    time: '09:00',
    project,
    notes: '',
  };
  S.ui.errors = {};
  S.ui.pop = null;
  openModal({ type: 'event' });
};
A.editEvent = el => {
  const event = D().events.find(item => item.id === el.dataset.id);
  if (!event) return;
  S.ui.eform = {
    title: event.title,
    date: event.date,
    time: event.time,
    project: event.project,
    notes: event.notes || '',
  };
  S.ui.errors = {};
  S.ui.pop = null;
  openModal({ type: 'event', edit: event.id });
};
IN.eform = el => {
  if (!S.ui.eform) return;
  S.ui.eform[el.dataset.f] = el.value;
};
A.submitEvent = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const f = S.ui.eform;
  f.title = ($('#e-title')?.value || '').trim();
  f.date = $('#e-date')?.value || '';
  f.time = $('#e-time')?.value || '';
  f.project = $('#e-project')?.value || f.project;
  f.notes = $('#e-notes')?.value || '';
  S.ui.errors.etitle = null;
  S.ui.errors.edate = null;
  S.ui.errors.etime = null;
  S.ui.errors.eproject = null;
  if (!f.title) {
    S.ui.errors.etitle = tr('toast.validTitle');
    render();
    $('#e-title')?.focus();
    return;
  }
  if (!validIsoDate(f.date)) {
    S.ui.errors.edate = tr('toast.validDate');
    render();
    $('#e-date')?.focus();
    return;
  }
  if (!validTime(f.time)) {
    S.ui.errors.etime = tr('toast.validTime');
    render();
    $('#e-time')?.focus();
    return;
  }
  if (!D().projects.some(project => project.id === f.project)) {
    S.ui.errors.eproject = tr('toast.chooseProject');
    render();
    $('#e-project')?.focus();
    return;
  }
  S.ui.modals.pop();
  if (m.edit) {
    void runCommand(
      'event.patch',
      {
        patch: {
          title: f.title,
          date: f.date,
          time: f.time,
          project: f.project,
          notes: f.notes,
        },
      },
      m.edit,
    ).then(result => {
      if (result) toast(tr('toast.eventUpdated'));
    });
    return;
  }
  void runCommand('event.create', {
    event: {
      id: uid('ev-'),
      title: f.title,
      date: f.date,
      time: f.time,
      project: f.project,
      notes: f.notes,
    },
  }).then(result => {
    if (result) toast(tr('toast.eventCreated'));
  });
};
A.delEvent = el => {
  const event = D().events.find(item => item.id === el.dataset.id);
  if (!event) return;
  S.ui.pop = null;
  confirmDlg({
    title: tr('toast.deleteEventQuestion', { title: event.title }),
    body: tr('toast.eventDeleteBody'),
    ok: tr('modals.deleteEvent'),
    danger: true,
    icon: 'trash-2',
    run: () => {
      void runCommand('event.delete', {}, event.id).then(result => {
        if (result) toast(tr('toast.eventDeleted'));
      });
    },
  });
};

/* projects */
IN.projQ = el => {
  S.ui.projQ = el.value;
  render();
};
IN.projStatus = el => {
  S.ui.projStatus = el.value;
  render();
};
IN.projSort = el => {
  S.ui.projSort = el.value;
  render();
};
A.clearProjFilters = () => {
  S.ui.projQ = '';
  S.ui.projStatus = 'all';
  render();
};
A.newProject = () => {
  S.ui.pform = {
    name: '',
    desc: '',
    icon: 'folder',
    color: 'indigo',
    team: me().team,
    lead: D().me,
    start: dOff(0),
    due: dOff(30),
    milestones: [],
    tmpl: 'blank',
  };
  S.ui.errors = {};
  S.ui.pop = null;
  openModal({ type: 'project' });
};
A.editProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  S.ui.pform = {
    name: p.name,
    desc: p.desc,
    icon: p.icon,
    color: p.color,
    team: p.team,
    lead: p.lead,
    start: p.start,
    due: p.due,
    milestones: (p.milestones || []).map(milestone => ({ ...milestone })),
    tmpl: 'blank',
  };
  S.ui.errors = {};
  openModal({ type: 'project', edit: p.id });
};
IN.pform = el => {
  S.ui.pform[el.dataset.f] = el.value;
  if (el.dataset.f === 'name' && S.ui.errors.pname && el.value.trim()) {
    S.ui.errors.pname = null;
    render();
  }
};
A.pformSet = el => {
  S.ui.pform[el.dataset.f] = el.dataset.v;
  if (el.dataset.f === 'tmpl') {
    const t = TEMPLATES.find(x => x.id === el.dataset.v);
    if (t && S.ui.pform.icon === 'folder') S.ui.pform.icon = t.icon === 'file' ? 'folder' : t.icon;
  }
  render();
};
IN.pformMilestone = el => {
  const milestone = S.ui.pform.milestones[+el.dataset.i];
  if (milestone) milestone[el.dataset.f] = el.value;
};
A.pformAddMilestone = () => {
  S.ui.pform.milestones.push({ name: '', date: S.ui.pform.due || dOff(30) });
  S.ui.errors.pmilestone = null;
  render();
  setTimeout(() => document.getElementById(`p-ms-name-${S.ui.pform.milestones.length - 1}`)?.focus(), 30);
};
A.pformRmMilestone = el => {
  S.ui.pform.milestones.splice(+el.dataset.i, 1);
  S.ui.errors.pmilestone = null;
  render();
};
A.submitProject = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const f = S.ui.pform;
  f.name = ($('#p-name')?.value || '').trim();
  f.desc = $('#p-desc')?.value || '';
  f.start = $('#p-start')?.value || '';
  f.due = $('#p-due')?.value || '';
  f.milestones = f.milestones.map(milestone => ({ name: milestone.name.trim(), date: milestone.date })).filter(milestone => milestone.name || milestone.date);
  S.ui.errors.pname = null;
  S.ui.errors.pdate = null;
  S.ui.errors.pmilestone = null;
  if (!f.name) {
    S.ui.errors.pname = tr('toast.projectNameRequired');
    render();
    $('#p-name')?.focus();
    return;
  }
  if (!validIsoDate(f.start) || !validIsoDate(f.due) || f.start > f.due) {
    S.ui.errors.pdate = !validIsoDate(f.start) || !validIsoDate(f.due) ? tr('toast.validProjectDates') : tr('toast.startBeforeTarget');
    render();
    $('#p-start')?.focus();
    return;
  }
  if (f.milestones.some(milestone => !milestone.name || !validIsoDate(milestone.date))) {
    S.ui.errors.pmilestone = tr('toast.milestoneInvalid');
    render();
    return;
  }
  if (m.edit) {
    const p = proj(m.edit);
    S.ui.modals.pop();
    void runCommand(
      'project.patch',
      {
        patch: {
          name: f.name,
          desc: f.desc,
          icon: f.icon,
          color: f.color,
          team: f.team,
          lead: f.lead,
          start: f.start,
          due: f.due,
          milestones: f.milestones,
          members: [...new Set([...p.members, f.lead])],
        },
      },
      p.id,
    ).then(result => {
      if (result) toast(tr('toast.projectUpdated'));
    });
    return;
  }
  S.ui.modals.pop();
  const template = TEMPLATES.find(t => t.id === f.tmpl);
  void runCommand('project.create', {
    name: f.name,
    desc: f.desc,
    icon: f.icon,
    color: f.color,
    team: f.team,
    lead: f.lead,
    start: f.start,
    due: f.due,
    milestones: f.milestones,
    tasks: (template?.tasks || []).map((title, i) => ({
      title,
      status: i === 0 ? 'todo' : 'backlog',
      assignee: i === 0 ? D().me : null,
      priority: i === 0 ? 'high' : 'medium',
      due: dOff(5 + i * 5),
      start: dOff(i * 5),
    })),
  }).then(result => {
    if (!result) return;
    const id = result.affected.ids[0];
    go('project', { id, tab: f.tmpl === 'blank' ? 'overview' : S.prefs.defaultTab || 'board' });
    const created = template?.tasks?.length;
    toast(created ? tr('toast.projectCreatedTasks', { project: f.name, count: created }) : tr('toast.projectCreated', { project: f.name }));
  });
};
A.dupProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  const originalTasks = tasksOf(p.id).map(t => ({
    title: t.title,
    status: 'todo',
    assignee: t.assignee,
    priority: t.priority,
    due: t.due,
    start: t.start,
    labels: [...t.labels],
    subtasks: t.subtasks.map(s => ({ ...s })),
    desc: t.desc,
    recur: t.recur,
  }));
  void runCommand('project.create', {
    name: `${p.name} ${tr('common.copySuffix')}`,
    desc: p.desc,
    icon: p.icon,
    color: p.color,
    team: p.team,
    lead: p.lead,
    start: p.start,
    due: p.due,
    milestones: p.milestones.map(milestone => ({ ...milestone })),
    tasks: originalTasks,
  }).then(result => {
    if (!result) return;
    const projectId = result.affected.ids[0];
    toast(tr('toast.projectDuplicated', { project: p.name }), { action: tr('common.open'), onAction: () => go('project', { id: projectId }) });
  });
};
A.archiveProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  confirmDlg({
    title: tr('toast.archiveProjectQuestion', { project: p.name }),
    body: tr('modals.archiveProjectBody'),
    ok: tr('modals.archiveProject'),
    icon: 'archive',
    run: () => {
      const snap = snapshot();
      void runCommand('project.archive', {}, p.id).then(result => {
        if (!result) return;
        if (S.ui.route === 'project' && S.ui.params.id === p.id) go('projects');
        toast(tr('toast.projectArchived', { project: p.name }), { action: tr('common.undo'), onAction: () => restore(snap) });
      });
    },
  });
};
A.restoreProject = el => {
  const p = proj(el.dataset.id);
  void runCommand('project.restore', {}, p.id).then(result => {
    if (result) toast(tr('toast.projectRestored', { project: p.name }));
  });
};
A.delProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  const n = tasksOf(p.id).length;
  const attachments = D()
    .files.filter(f => f.project === p.id)
    .map(f => ({ storageKey: f.storageKey }));
  const hasStoredFiles = attachments.some(a => a.storageKey);
  confirmDlg({
    title: tr('toast.deleteProjectQuestion', { project: p.name }),
    body: tr('toast.deleteProjectBody', { tasks: tr('common.tasks', { count: n }) }),
    ok: tr('context.deleteProject'),
    danger: true,
    typeName: p.name,
    run: () => {
      const snap = snapshot();
      void runCommand('project.delete', {}, p.id).then(async result => {
        if (!result) return;
        await removeStoredFiles(attachments);
        if (S.ui.route === 'project' && S.ui.params.id === p.id) go('projects');
        toast(tr('toast.projectDeleted', { project: p.name }), hasStoredFiles ? { ms: 2200 } : { action: tr('common.undo'), onAction: () => restore(snap) });
      });
    },
  });
};
/* files */
IN.fileQ = el => {
  S.ui.fileQ = el.value;
  render();
};
IN.fileType = el => {
  S.ui.fileType = el.value;
  render();
};
IN.fileSort = el => {
  S.ui.fileSort = el.value;
  render();
};
A.renameFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  openModal({
    type: 'prompt',
    title: tr('modals.renameFile'),
    label: tr('modals.fileName'),
    value: f.name,
    run: v => {
      if (v) {
        void runCommand('file.patch', { patch: { name: v, type: fileType(v) } }, f.id).then(result => {
          if (result) toast(tr('toast.fileRenamed'));
        });
      }
    },
  });
};
A.dupFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  if (!f) return;
  void duplicateFile(f);
};

async function copyAttachment(attachment) {
  if (!workspace.attachments || !attachment.storageKey) return { ...attachment };
  const stored = await workspace.attachments.copy(attachment.storageKey, attachment.contentType);
  return {
    ...attachment,
    id: uid('a'),
    contentType: stored.contentType,
    byteSize: stored.byteSize,
    sha256: stored.sha256,
    storageKey: stored.storageKey,
  };
}

async function duplicateFile(f) {
  let copied = null;
  try {
    copied = await copyAttachment(f);
    const result = await runCommand('file.create', {
      file: {
        ...f,
        ...copied,
        id: uid('f'),
        name: f.name.replace(/(\.[^.]+)$/, ' copy$1'),
        at: Date.now(),
        by: D().me,
      },
    });
    if (!result) {
      if (copied.storageKey && copied.storageKey !== f.storageKey) await workspace.attachments?.remove(copied.storageKey).catch(() => {});
      return;
    }
    toast(tr('toast.fileDuplicated'));
  } catch (error) {
    if (copied?.storageKey && copied.storageKey !== f.storageKey) await workspace.attachments?.remove(copied.storageKey).catch(() => {});
    toast(fileErrorMessage(error, tr('toast.fileDuplicateFailed')), { kind: 'err' });
  }
}
A.delFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  confirmDlg({
    title: tr('modals.confirmDeleteFile'),
    body: tr('modals.confirmDeleteFileBody', {
      name: esc(f.name),
      task: f.task ? tr('modals.confirmDeleteFileTask') : '',
    }),
    ok: tr('modals.deleteFile'),
    danger: true,
    run: () => {
      const snap = snapshot();
      void runCommand('file.delete', {}, f.id).then(async result => {
        if (!result) return;
        await workspace.attachments?.remove(f.storageKey).catch(() => {});
        toast(tr('toast.deleted', { title: f.name }), f.storageKey ? { ms: 2200 } : { action: tr('common.undo'), onAction: () => restore(snap) });
      });
    },
  });
};

/* search & palette */
A.openPalette = () => {
  S.ui.palOpener = focusKey(document.activeElement);
  S.ui.palette = { q: '', mode: 'cmd', scope: 'all', hl: 0 };
  S.ui.pop = null;
  render();
};
A.openSearch = () => {
  S.ui.palOpener = focusKey(document.activeElement);
  S.ui.palette = { q: '', mode: 'search', scope: 'all', hl: 0 };
  S.ui.pop = null;
  S.ui.mnav = false;
  render();
};
A.closePalette = () => {
  S.ui.palette = null;
  render();
};
A.palScope = el => {
  S.ui.palette.scope = el.dataset.v;
  S.ui.palette.hl = 0;
  render();
  $('#pal-in')?.focus();
};
IN.palQ = el => {
  S.ui.palette.q = el.value;
  S.ui.palette.hl = 0;
  render();
};
A.palRun = el => {
  const it = S.ui.palette?._flat?.[+el.dataset.i];
  if (!it) return;
  S.ui.palette = null;
  render();
  it.run();
};
IN.searchQ = el => {
  S.ui.searchQ = el.value;
  render();
};
A.setSearch = el => {
  S.ui.searchQ = el.dataset.q;
  render();
  $('#search-page-q')?.focus();
};

A.shortcuts = () => {
  S.ui.pop = null;
  S.ui.palette = null;
  openModal({ type: 'shortcuts' });
};
A.resetDemo = () => {
  S.ui.pop = null;
  confirmDlg({
    title: tr('modals.resetData'),
    body: tr('modals.resetDataBody'),
    ok: tr('modals.resetWorkspace'),
    danger: true,
    icon: 'rotate-ccw',
    run: async () => {
      try {
        const attachments = [...D().tasks.flatMap(t => t.attachments), ...D().files];
        await replaceWorkspace(seed());
        await removeStoredFiles(attachments);
        workspace.resetDeviceState();
        S.views = {};
        S.ui.drawer = null;
        go('home');
        toast(tr('toast.workspaceReset'));
      } catch (error) {
        toast(error instanceof Error ? error.message : tr('toast.resetFailed'), { kind: 'err' });
      }
    },
  });
};
A.resetLocalData = A.resetDemo;
A.exportData = () => {
  const payload = {
    format: 'moss-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: D(),
    prefs: S.prefs,
    views: S.views,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `moss-backup-${iso(TODAY)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(tr('toast.backupExported'));
};
IN.importData = async el => {
  const file = el.files?.[0];
  el.value = '';
  if (!file) return;
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    toast(tr('toast.invalidJson'), { kind: 'err' });
    return;
  }
  if (payload?.format && payload.format !== 'moss-backup') {
    toast(tr('toast.invalidBackup'), { kind: 'err' });
    return;
  }
  const imported = payload?.format === 'moss-backup' ? payload.data : payload?.data || payload;
  if (!imported || !Array.isArray(imported.tasks) || !Array.isArray(imported.projects) || !Array.isArray(imported.members)) {
    toast(tr('toast.invalidBackup'), { kind: 'err' });
    return;
  }
  confirmDlg({
    title: tr('toast.importQuestion'),
    body: tr('toast.importBody', { projects: imported.projects.length, tasks: imported.tasks.length }),
    ok: tr('modals.importBackupAction'),
    danger: true,
    icon: 'upload',
    run: async () => {
      try {
        const existing = [...D().tasks.flatMap(t => t.attachments), ...D().files];
        await replaceWorkspace(imported);
        const importedKeys = new Set(
          [...imported.tasks.flatMap(t => t.attachments || []), ...(imported.files || [])].map(item => item.storageKey).filter(Boolean),
        );
        await removeStoredFiles(existing.filter(item => item.storageKey && !importedKeys.has(item.storageKey)));
        workspace.resetDeviceState();
        if (payload?.prefs) S.prefs = Object.assign({}, DEFAULT_PREFS, payload.prefs);
        S.views = payload?.views && typeof payload.views === 'object' ? payload.views : {};
        S.ui.drawer = null;
        S.ui.sel.clear();
        save();
        go('home');
        toast(tr('toast.backupImported'));
      } catch (error) {
        toast(error instanceof Error ? error.message : tr('toast.importFailed'), { kind: 'err' });
      }
    },
  });
};
A.toastInfo = el => toast(el.dataset.msg, { kind: 'info' });
A.demoToast = el => {
  const v = el.dataset.v;
  if (v === 'err') toast(tr('toast.unsaved'), { kind: 'err', action: tr('common.tryAgain'), onAction: () => toast(tr('toast.changesSaved')) });
  else if (v === 'retry') {
    toast(tr('toast.retry'), { kind: 'info', ms: 1200 });
    setTimeout(() => toast(tr('toast.loaded')), 1300);
  } else
    toast(tr('toast.movedToReview'), {
      action: tr('common.undo'),
      onAction: () => toast(tr('toast.undone'), { kind: 'info' }),
    });
};
A.demoConfirm = () =>
  confirmDlg({
    title: tr('toast.archiveProjectQuestion', { project: 'Marketing Website' }),
    body: tr('modals.archiveProjectBody'),
    ok: tr('modals.archiveProject'),
    icon: 'archive',
    run: () => toast(tr('toast.previewNoArchive'), { kind: 'info' }),
  });
A.demoLoad = el => {
  el.classList.add('is-loading');
  setTimeout(() => {
    el.classList.remove('is-loading');
    toast(tr('toast.loadedShort'));
  }, 1400);
};
A.reloadPage = () => {
  S.ui.loading = true;
  render();
  setTimeout(() => {
    S.ui.loading = false;
    render();
  }, 1400);
};

/* modals */
A.closeModal = () => closeModal();
A.closeModalBg = (el, e) => {
  if (e.target === el) closeModal();
};
A.confirmOk = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  if (m.typeName && S.ui.confirmText !== m.typeName) return;
  S.ui.modals.pop();
  S.ui.confirmText = '';
  render();
  m.run && m.run();
};
IN.confirmText = el => {
  S.ui.confirmText = el.value;
  const m = S.ui.modals[S.ui.modals.length - 1];
  const b = $('.modal:last-of-type [data-a="confirmOk"]') || $$('[data-a="confirmOk"]').pop();
  if (b) b.disabled = el.value !== m.typeName;
};
A.promptSubmit = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const v = $('#prompt-in').value.trim();
  S.ui.modals.pop();
  render();
  m.run(v);
};
IN.noop = () => {};

/* settings */
A.syncNow = async () => {
  try {
    const status = await workspace.sync();
    S.ui.sync = status;
    S.data = workspace.snapshot();
    render();
    if (status.state === 'synced') toast(tr('toast.syncSuccess'), { ms: 1800 });
    else if (status.state === 'offline') toast(tr('toast.syncOffline'), { kind: 'info', ms: 3000 });
    else if (status.state === 'error') toast(status.lastError || tr('toast.syncNeedsAttention'), { kind: 'err', ms: 4000 });
    else toast(status.configured ? tr('toast.syncNoChanges') : tr('toast.syncNotConnected'), { kind: 'info', ms: 2500 });
  } catch (error) {
    toast(error instanceof Error ? error.message : tr('toast.syncStartFailed'), { kind: 'err', ms: 4000 });
  }
};
A.retryFailedSync = async () => {
  try {
    const status = await workspace.retryFailed();
    S.ui.sync = status;
    S.data = workspace.snapshot();
    render();
    if (status.state === 'synced') toast(tr('toast.retrySuccess'), { ms: 2200 });
    else if (status.state === 'offline') toast(tr('toast.retryOffline'), { kind: 'info', ms: 3000 });
    else toast(status.lastError || tr('toast.retryNeedsAttention'), { kind: 'err', ms: 4000 });
  } catch (error) {
    toast(error instanceof Error ? error.message : tr('toast.retryFailed'), { kind: 'err', ms: 4000 });
  }
};
IN.prefToggle = el => {
  S.prefs[el.dataset.k] = el.checked;
  save();
};
IN.prefSel = el => {
  const k = el.dataset.k;
  S.prefs[k] = k === 'weekStart' ? +el.value : el.value;
  save();
  render();
  toast(tr('common.preferencesSaved'), { ms: 1500 });
};
A.avColor = el => {
  void runCommand('member.patch', { patch: { c: el.dataset.v } }, D().me).then(result => {
    if (result) toast(tr('toast.avatarSaved'), { ms: 1500 });
  });
};
A.saveProfile = () => {
  const n = $('#pf-name').value.trim();
  if (!n) {
    S.ui.errors.pname2 = tr('toast.nameRequired');
    render();
    return;
  }
  S.ui.errors.pname2 = null;
  const tt = $('#pf-title').value.trim();
  loadingBtn('pf-save', 600, () => {
    void runCommand('member.patch', { patch: { name: n, title: tt } }, D().me).then(result => {
      if (!result) return;
      toast(tr('toast.profileUpdated'));
    });
  });
};
