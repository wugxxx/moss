/* ---------- store ---------- */
import { TODAY, diffD, iso, parse } from './utils.js';
import { PCOLORS, labelColorValue } from './constants.js';
import { seed } from '../data/seed.js';
import { workspace } from './workspace-client.js';

export const STORE_KEY = 'moss.v2';
export const DEFAULT_PREFS = {
  language: 'zh-CN',
  theme: 'system',
  accent: 'indigo',
  side: 'comfortable',
  sideW: 272,
  density: 'comfortable',
  weekStart: 1,
  dateFmt: 'MMM d',
  timeFmt: '12',
  spell: true,
  motion: 'system',
  home: 'home',
  openTasks: 'drawer',
};
export function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (j && (j.data?.tasks || j.prefs || j.views || j.collapsed !== undefined)) {
        return j;
      }
    }
  } catch {
    /* storage blocked or corrupt: start from seed data */
  }
  return null;
}
export const saved = load();
export const S = {
  data: saved?.data || seed(),
  prefs: Object.assign({}, DEFAULT_PREFS, saved?.prefs || {}),
  views: saved?.views || {},
  ui: {
    fx: {},
    route: 'home',
    params: {},
    history: [],
    forward: [],
    collapsed: !!saved?.collapsed,
    mnav: false,
    expanded: { p1: true },
    drawer: null,
    drawerFull: false,
    modals: [],
    taskSaving: false,
    pop: null,
    palette: null,
    descDrafts: new Map(),
    loading: false,
    sel: new Set(),
    composer: null,
    editCell: null,
    openTasks: {},
    collapsedGroups: {},
    focusOverdueOpen: false,
    calDate: iso(TODAY),
    calMode: 'month',
    tlZoom: 'week',
    tlGroup: 'status',
    fileView: 'grid',
    projView: 'grid',
    homeTab: 'upcoming',
    settings: 'appearance',
    searchQ: '',
    searchCat: 'all',
    searchArchived: false,
    collapsedCols: {},
    errors: {},
  },
};

export async function initWorkspaceClient() {
  await workspace.init(S.data, snapshot => {
    S.data = snapshot;
    save();
  });
  S.data = workspace.snapshot();
  persistWorkspace();
  void workspace.cleanupAttachments().catch(error => console.warn('Attachment cleanup failed', error));
}
export let _saveT;
export function save() {
  clearTimeout(_saveT);
  _saveT = setTimeout(() => {
    persistWorkspace();
  }, 150);
}

export function persistWorkspace() {
  try {
    const deviceState = { prefs: S.prefs, views: S.views, collapsed: S.ui.collapsed };
    localStorage.setItem(STORE_KEY, JSON.stringify(window.mossDesktop ? deviceState : { data: S.data, ...deviceState }));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persistWorkspace);
  window.addEventListener('beforeunload', persistWorkspace);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistWorkspace();
    });
  }
}

export async function replaceWorkspace(snapshot) {
  await workspace.replaceWorkspace(snapshot);
  S.data = workspace.snapshot();
}

/* ---------- lookups ---------- */
export const D = () => S.data;
let lookupSource = null;
let taskById = new Map();
let projectById = new Map();
let memberById = new Map();

function lookups() {
  const data = D();
  if (lookupSource !== data) {
    lookupSource = data;
    taskById = new Map(data.tasks.map(item => [item.id, item]));
    projectById = new Map(data.projects.map(item => [item.id, item]));
    memberById = new Map(data.members.map(item => [item.id, item]));
  }
  return { taskById, projectById, memberById };
}

export const me = () => lookups().memberById.get(D().me);
export const mem = id => lookups().memberById.get(id);
export const proj = id => lookups().projectById.get(id);
export const task = id => lookups().taskById.get(id);
export const labels = () => D().labels || [];
export const label = id => labels().find(item => item.id === id);
export const labelName = item => item?.name || '';
export const labelColor = item => labelColorValue(item?.color);
export const pColor = p => PCOLORS[p?.color] || PCOLORS.slate;
let visibleProjectsSource = null;
let visibleProjectsCache = [];
export const visibleProjects = () => {
  const data = D();
  if (visibleProjectsSource !== data) {
    visibleProjectsSource = data;
    visibleProjectsCache = data.projOrder
      .map(proj)
      .filter(Boolean)
      .filter(p => !p.archived);
  }
  return visibleProjectsCache;
};
export const isTaskActive = t => !t.archived && !proj(t.project)?.archived;
// Archiving a project keeps its tasks inspectable on the project page, but
// workspace-wide task views should only include active project scopes.
let tasksSource = null;
let tasksByProject = new Map();
export const tasksOf = pid => {
  const data = D();
  if (tasksSource !== data) {
    tasksSource = data;
    tasksByProject = new Map();
    for (const item of data.tasks) {
      if (item.archived) continue;
      const list = tasksByProject.get(item.project);
      if (list) list.push(item);
      else tasksByProject.set(item.project, [item]);
    }
  }
  return tasksByProject.get(pid) || [];
};
let activeTasksSource = null;
let activeTasksCache = [];
export const allTasks = () => {
  const data = D();
  if (activeTasksSource !== data) {
    activeTasksSource = data;
    activeTasksCache = data.tasks.filter(isTaskActive);
  }
  return activeTasksCache;
};
export const isOver = t => t.due && t.status !== 'done' && diffD(parse(t.due), TODAY) < 0;
let commentsSource = null;
let commentsByTask = new Map();
export const commentsOf = tid => {
  const data = D();
  if (commentsSource !== data) {
    commentsSource = data;
    commentsByTask = new Map();
    for (const comment of data.comments) {
      const list = commentsByTask.get(comment.task);
      if (list) list.push(comment);
      else commentsByTask.set(comment.task, [comment]);
    }
  }
  return commentsByTask.get(tid) || [];
};
export function progressOf(pid) {
  const ts = tasksOf(pid);
  if (!ts.length) return 0;
  return Math.round((ts.filter(t => t.status === 'done').length / ts.length) * 100);
}
export function taskProg(t) {
  if (t.status === 'done') return 100;
  if (t.subtasks.length) return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);
  return { backlog: 0, todo: 5, progress: 45, review: 80 }[t.status] || 0;
}
