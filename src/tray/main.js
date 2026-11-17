import './tray.css';
import { getIntlLocale, normalizeLocale, setLocale, t } from '../i18n/index.js';
import { diffD, esc, iso, parse, sod } from '../core/utils.js';
import { PCOLORS } from '../core/constants.js';
import { collectTrayTasks } from './tasks.js';

const root = document.getElementById('tray');
const storeKey = 'moss.v2';
let snapshot = null;
let failed = false;
let currentDay = '';
let requestedHeight = 0;
const pendingCompletions = new Set();
let undoState = null;
let undoTimer;

const chevron =
  '<svg class="i" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
const openIcon =
  '<svg class="i" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>';
const checkIcon =
  '<svg class="i" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m20 6-11 11-5-5"/></svg>';

function preferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
    return saved?.prefs || {};
  } catch {
    return {};
  }
}

function applyPreferences() {
  const prefs = preferences();
  const language = prefs.language || 'zh-CN';
  setLocale(normalizeLocale(language));
  const element = document.documentElement;
  if (prefs.theme === 'dark' || prefs.theme === 'light') element.dataset.theme = prefs.theme;
  else delete element.dataset.theme;
  if (prefs.accent && prefs.accent !== 'indigo') element.dataset.accent = prefs.accent;
  else delete element.dataset.accent;
}

function dateLine(day) {
  const date = new Intl.DateTimeFormat(getIntlLocale(), { month: 'long', day: 'numeric' }).format(day);
  const weekday = new Intl.DateTimeFormat(getIntlLocale(), { weekday: 'long' }).format(day);
  return `${date} · ${weekday}`;
}

function taskRow(task, day) {
  const project = snapshot.projects.find(item => item.id === task.project);
  const overdueDays = task.due ? -diffD(parse(task.due), day) : 0;
  const meta = [];
  if (project)
    meta.push(`<span class="task-dot" style="--c:${PCOLORS[project.color] || PCOLORS.slate}"></span><span class="task-project">${esc(project.name)}</span>`);
  if (overdueDays > 0) meta.push(`<span class="task-due">${esc(t('tray.overdueDays', { count: overdueDays }))}</span>`);
  return `<div class="task-row">
    <button class="task-check" type="button" data-complete="${esc(task.id)}" aria-label="${esc(t('tray.completeTask', { title: task.title }))}">${checkIcon}</button>
    <button class="task-open" type="button" data-task="${esc(task.id)}" aria-label="${esc(t('tray.openTask', { title: task.title }))}">
      <span class="task-body">
        <span class="task-title">${esc(task.title)}</span>
        ${meta.length ? `<span class="task-meta">${meta.join('')}</span>` : ''}
      </span>
      <span class="task-chevron">${chevron}</span>
    </button>
  </div>`;
}

function group(name, tasks, day) {
  return `<section class="group">
    <div class="group-head"><span>${esc(name)}</span><span class="group-count">${tasks.length}</span></div>
    ${tasks.map(task => taskRow(task, day)).join('')}
  </section>`;
}

function render() {
  applyPreferences();
  const day = sod(new Date());
  currentDay = iso(day);
  document.title = t('tray.title');

  if (failed) {
    root.innerHTML = `<div class="scroll"><div class="scroll-body"><div class="empty">${esc(t('tray.unavailable'))}</div></div></div>`;
    root.setAttribute('aria-busy', 'false');
    requestAnimationFrame(resize);
    return;
  }
  if (!snapshot) {
    root.innerHTML = '';
    root.setAttribute('aria-busy', 'true');
    return;
  }

  const model = collectTrayTasks(snapshot, day);
  const total = model.overdue.length + model.today.length;
  const sections = [];
  if (model.overdue.length) sections.push(group(t('tray.overdue'), model.overdue, day));
  if (model.today.length) sections.push(group(t('tray.today'), model.today, day));

  root.innerHTML = `<header class="head">
    <div class="head-main">
      <span class="head-title">${esc(t('tray.title'))}</span>
      <span class="head-date">${esc(dateLine(day))}</span>
    </div>
    <div class="head-side">
      <span class="head-count">${esc(t('tray.pending', { count: total }))}</span>
      <button class="icon-btn" type="button" data-app aria-label="${esc(t('tray.open'))}" title="${esc(t('tray.open'))}">${openIcon}</button>
    </div>
  </header>
  <div class="scroll"><div class="scroll-body">${sections.length ? sections.join('') : `<div class="empty">${esc(t('tray.empty'))}</div>`}</div></div>
  ${
    undoState
      ? `<div class="undo" role="status"><span class="undo-title">${esc(t('tray.completedTask', { title: undoState.title }))}</span><button type="button" data-undo="${esc(undoState.id)}">${esc(t('common.undo'))}</button></div>`
      : ''
  }`;
  root.setAttribute('aria-busy', 'false');
  requestAnimationFrame(resize);
}

function resize() {
  const header = root.querySelector('.head');
  const scroll = root.querySelector('.scroll');
  const body = root.querySelector('.scroll-body');
  const footer = root.querySelector('.undo');
  if (!scroll) return;
  const style = getComputedStyle(scroll);
  const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const height = Math.ceil(
    (header?.getBoundingClientRect().height ?? 0) + (body?.getBoundingClientRect().height ?? 0) + padding + (footer?.getBoundingClientRect().height ?? 0) + 2,
  );
  if (height === requestedHeight) return;
  requestedHeight = height;
  window.mossDesktop?.resizeTray(height);
}

async function refresh() {
  if (!window.mossDesktop) {
    failed = true;
    render();
    return;
  }
  try {
    snapshot = await window.mossDesktop.snapshot();
    failed = false;
  } catch (error) {
    console.warn('Failed to load tray tasks', error);
    failed = true;
  }
  render();
}

async function complete(taskId, button) {
  if (!taskId || pendingCompletions.has(taskId)) return;
  const title = snapshot?.tasks.find(item => item.id === taskId)?.title || '';
  pendingCompletions.add(taskId);
  const row = button.closest('.task-row');
  row?.classList.add('is-completing');
  button.disabled = true;
  try {
    const completed = await window.mossDesktop?.completeTask(taskId);
    if (completed) {
      undoState = { id: taskId, title };
      clearTimeout(undoTimer);
      undoTimer = setTimeout(() => {
        if (undoState?.id === taskId) {
          undoState = null;
          render();
        }
      }, 6000);
      await refresh();
    } else row?.classList.remove('is-completing');
  } catch (error) {
    console.warn('Failed to complete a tray task', error);
    row?.classList.remove('is-completing');
  } finally {
    pendingCompletions.delete(taskId);
    if (button.isConnected) button.disabled = false;
  }
}

async function undo(taskId, button) {
  if (!taskId) return;
  button.disabled = true;
  try {
    const undone = await window.mossDesktop?.undoCompleteTask(taskId);
    if (undone) {
      clearTimeout(undoTimer);
      undoState = null;
      await refresh();
    }
  } catch (error) {
    console.warn('Failed to undo a tray task', error);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

root.addEventListener('click', event => {
  const appButton = event.target.closest('[data-app]');
  if (appButton) {
    void window.mossDesktop?.openApp();
    return;
  }
  const completeButton = event.target.closest('[data-complete]');
  if (completeButton) {
    void complete(completeButton.dataset.complete, completeButton);
    return;
  }
  const undoButton = event.target.closest('[data-undo]');
  if (undoButton) {
    void undo(undoButton.dataset.undo, undoButton);
    return;
  }
  const taskButton = event.target.closest('[data-task]');
  if (taskButton) void window.mossDesktop?.openTask(taskButton.dataset.task);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') window.mossDesktop?.hideTray();
});

window.mossDesktop?.onTrayRefresh(() => void refresh());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refresh();
});
document.fonts?.ready.then(resize);

setInterval(() => {
  const day = iso(sod(new Date()));
  if (day !== currentDay) void refresh();
}, 30_000);

void refresh();
