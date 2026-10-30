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
    collapsed: !!saved?.collapsed,
    mnav: false,
    expanded: { p1: true },
    drawer: null,
    drawerFull: false,
    modals: [],
    taskSaving: false,
    pop: null,
    palette: null,
    loading: false,
    sel: new Set(),
    composer: null,
    editCell: null,
    openTasks: {},
    collapsedGroups: {},
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
    persistWorkspace();
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

export async function replaceWorkspace(snapshot) {
  await workspace.replaceWorkspace(snapshot);
  S.data = workspace.snapshot();
}

/* ---------- lookups ---------- */
export const D = () => S.data;
export const me = () => D().members.find(m => m.id === D().me);
export const mem = id => D().members.find(m => m.id === id);
export const proj = id => D().projects.find(p => p.id === id);
export const task = id => D().tasks.find(t => t.id === id);
export const labels = () => D().labels || [];
export const label = id => labels().find(item => item.id === id);
export const labelName = item => item?.name || '';
export const labelColor = item => labelColorValue(item?.color);
export const pColor = p => PCOLORS[p?.color] || PCOLORS.slate;
export const visibleProjects = () =>
  D()
    .projOrder.map(proj)
    .filter(Boolean)
    .filter(p => !p.archived);
export const isTaskActive = t => !t.archived && !proj(t.project)?.archived;
// Archiving a project keeps its tasks inspectable on the project page, but
// workspace-wide task views should only include active project scopes.
export const tasksOf = pid => D().tasks.filter(t => t.project === pid && !t.archived);
export const allTasks = () => D().tasks.filter(isTaskActive);
export const isOver = t => t.due && t.status !== 'done' && diffD(parse(t.due), TODAY) < 0;
export const commentsOf = tid => D().comments.filter(c => c.task === tid);
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
