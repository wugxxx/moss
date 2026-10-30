/* ---------------- COMMAND PALETTE ---------------- */
import { MOD, clamp, esc } from '../core/utils.js';
import { LOGO, ic } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, allTasks, pColor, proj } from '../core/store.js';
import { FT, hl, stIcon } from '../ui/helpers.js';
import { effectiveDark } from '../core/theme.js';
import { go, render } from '../shell/render.js';
import { sortTasks } from '../shell/view-engine.js';
import { searchAll } from '../pages/search.js';
import { openModal } from './modals.js';
import { A, runCommand } from '../actions/actions.js';
import { t as tr } from '../i18n/index.js';

export function commands() {
  return [
    { id: 'c-task', name: tr('palette.createTask'), icon: 'plus', kbd: 'N', run: () => A.newTask(document.body) },
    { id: 'c-proj', name: tr('palette.createProject'), icon: 'folder-plus', kbd: 'P', run: () => A.newProject() },
    {
      id: 'c-search',
      name: tr('palette.searchWorkspace'),
      icon: 'search',
      kbd: '/',
      run: () => {
        S.ui.palette = { q: '', mode: 'search', scope: 'all', hl: 0 };
        render();
      },
    },
    { id: 'c-home', name: tr('palette.goHome'), icon: 'house', kbd: 'G H', run: () => go('home') },
    { id: 'c-tasks', name: tr('palette.goTasks'), icon: 'circle-check', kbd: 'G T', run: () => go('tasks') },
    { id: 'c-projs', name: tr('palette.goProjects'), icon: 'folder-kanban', kbd: 'G P', run: () => go('projects') },
    { id: 'c-cal', name: tr('palette.goCalendar'), icon: 'calendar', kbd: 'G C', run: () => go('calendar') },
    { id: 'c-tl', name: tr('palette.goTimeline'), icon: 'chart-gantt', run: () => go('timeline') },
    { id: 'c-set', name: tr('palette.openSettings'), icon: 'settings', kbd: 'G S', run: () => go('settings') },
    { id: 'c-app', name: tr('palette.appearanceSettings'), icon: 'palette', run: () => go('settings', { sec: 'appearance' }) },
    {
      id: 'c-dark',
      name: effectiveDark() ? tr('palette.switchLight') : tr('palette.switchDark'),
      icon: effectiveDark() ? 'sun' : 'moon',
      kbd: MOD + ' ⇧ L',
      run: () => A.toggleDark(),
    },
    { id: 'c-side', name: tr('palette.toggleSidebar'), icon: 'panel-left', kbd: '[', run: () => A.toggleSide() },
    { id: 'c-keys', name: tr('palette.keyboardShortcuts'), icon: 'keyboard', kbd: '?', run: () => A.shortcuts() },
    { id: 'c-data', name: tr('palette.exportBackup'), icon: 'download', run: () => A.exportData() },
  ];
}
export function paletteItems() {
  const pl = S.ui.palette;
  const q = pl.q.trim();
  const ql = q.toLowerCase();
  const groups = [];
  if (pl.mode === 'cmd') {
    const cmds = commands().filter(c => !q || c.name.toLowerCase().includes(ql));
    if (!q) {
      groups.push({ name: tr('palette.suggestions'), items: cmds.slice(0, 3).concat(cmds.filter(c => c.id === 'c-dark')) });
      const recent = sortTasks(
        allTasks().filter(t => t.fav),
        { f: 'updated', dir: 1 },
      ).slice(0, 4);
      groups.push({
        name: tr('palette.recentTasks'),
        items: recent.map(t => ({
          html: stIcon(t.status),
          name: t.title,
          sub: proj(t.project).name,
          r: t.key,
          run: () => A.openTask({ dataset: { id: t.id } }),
        })),
      });
      groups.push({ name: tr('palette.navigation'), items: cmds.filter(c => ['c-home', 'c-tasks', 'c-projs', 'c-cal', 'c-tl', 'c-set'].includes(c.id)) });
      return groups;
    }
    if (cmds.length) groups.push({ name: tr('palette.commands'), items: cmds.slice(0, 5) });
  }
  const r = searchAll(q, false);
  const sc = pl.mode === 'search' ? pl.scope : 'all';
  const lim = sc === 'all' ? 4 : 12;
  if (pl.mode === 'search' && !q) {
    groups.push({
      name: tr('palette.recentSearches'),
      items: D().recentSearches.map(s => ({
        icon: 'history',
        name: s,
        run: () => {
          pl.q = s;
          pl.hl = 0;
          render();
        },
      })),
    });
    groups.push({
      name: tr('palette.suggested'),
      items: [
        { icon: 'clock-alert', name: tr('palette.overdueTasks'), run: () => A.goTasks({ dataset: { f: 'overdue' } }) },
        { icon: 'circle-check', name: tr('palette.allOpenTasks'), run: () => A.goTasks({ dataset: { f: 'open' } }) },
        {
          icon: 'signal-high',
          name: tr('palette.highPriorityIn', { project: 'Website Redesign' }),
          run: () => {
            go('project', { id: 'p1', tab: 'v:v1' });
          },
        },
        { icon: 'paperclip', name: tr('palette.filesIn', { project: 'Website Redesign' }), run: () => go('project', { id: 'p1', tab: 'files' }) },
      ],
    });
    return groups;
  }
  if (!q) return groups;
  if (sc === 'all' || sc === 'tasks')
    groups.push({
      name: tr('palette.tasks'),
      items: r.tasks
        .slice(0, lim)
        .map(t => ({ html: stIcon(t.status), name: t.title, sub: proj(t.project).name, r: t.key, run: () => A.openTask({ dataset: { id: t.id } }) })),
    });
  if (sc === 'all' || sc === 'projects')
    groups.push({
      name: tr('palette.projects'),
      items: r.projects.slice(0, lim).map(p => ({
        html: `<span class="pdot" style="--c:${pColor(p)}"></span>`,
        name: p.name,
        sub: PSTAT[p.status].name,
        run: () => go('project', { id: p.id }),
      })),
    });
  if (sc === 'all' || sc === 'files')
    groups.push({
      name: tr('palette.files'),
      items: r.files.slice(0, lim).map(f => ({
        icon: FT[f.type].i,
        name: f.name,
        sub: proj(f.project).name,
        r: f.size,
        run: () => openModal({ type: 'filePreview', file: f, tid: f.task }),
      })),
    });
  const out = groups.filter(g => g.items.length);
  out.push({
    name: '',
    items: [
      {
        icon: 'search',
        name: tr('palette.viewAllResults', { query: q }),
        run: () => {
          S.ui.searchQ = q;
          S.ui.searchCat = sc;
          S.ui.searchArchived = false;
          void runCommand('recentSearch.add', { query: q, limit: 5 }, null, { render: false });
          go('search');
        },
      },
    ],
  });
  return out;
}
export function paletteHtml() {
  const pl = S.ui.palette;
  const groups = paletteItems();
  const flat = groups.flatMap(g => g.items);
  pl._flat = flat;
  pl.hl = clamp(pl.hl, 0, Math.max(flat.length - 1, 0));
  let idx = 0;
  const ph = pl.mode === 'search' ? tr('palette.searchPlaceholder') : tr('palette.typeCommand');
  return `<div class="palette" role="dialog" aria-modal="true" aria-label="${tr('palette.commandMenu')}">
    <div class="pal-in">${ic(pl.mode === 'search' ? 'search' : 'command', 17)}${pl.mode === 'search' ? `<span class="badge" style="flex-shrink:0">${tr('common.search')}</span>` : ''}<input id="pal-in" data-in="palQ" value="${esc(pl.q)}" placeholder="${ph}" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant="pi-${pl.hl}"><kbd>Esc</kbd></div>
    ${
      pl.mode === 'search'
        ? `<div class="pal-scope" role="tablist">${[
            ['all', tr('search.categories.all'), 'layers'],
            ['tasks', tr('search.categories.tasks'), 'circle-check'],
            ['projects', tr('search.categories.projects'), 'folder'],
            ['files', tr('search.categories.files'), 'paperclip'],
          ]
            .map(([k, n, i]) => `<button role="tab" class="${pl.scope === k ? 'on' : ''}" data-a="palScope" data-v="${k}">${ic(i, 12)}${n}</button>`)
            .join('')}</div>`
        : ''
    }
    <div class="pal-list" id="pal-list" role="listbox">${
      flat.length
        ? groups
            .map(
              g =>
                `<div class="pal-group">${g.name ? `<div class="pal-sec">${g.name}</div>` : ''}${g.items
                  .map(it => {
                    const i = idx++;
                    return `<div class="pi ${i === pl.hl ? 'hl' : ''}" id="pi-${i}" role="option" aria-selected="${i === pl.hl}" data-a="palRun" data-i="${i}" data-hover-i="${i}">${it.html || ic(it.icon || 'circle', 15)}<span class="trunc">${hl(it.name, pl.q.trim())}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}<span class="r">${it.r ? `<span class="mono">${esc(it.r)}</span>` : ''}${
                      it.kbd
                        ? it.kbd
                            .split(' ')
                            .map(k => `<kbd>${k}</kbd>`)
                            .join('')
                        : ''
                    }</span></div>`;
                  })
                  .join('')}</div>`,
            )
            .join('')
        : `<div class="empty-state sm"><div class="glyph">${ic('search-x', 18)}</div><h2 class="es-h">${tr('palette.noResults')}</h2><p>${tr('palette.tryDifferent')}</p></div>`
    }</div>
    <div class="pal-f"><span><kbd>↑</kbd><kbd>↓</kbd>${tr('palette.navigate')}</span><span><kbd>↵</kbd>${tr('palette.select')}</span>${pl.mode === 'cmd' ? `<span><kbd>Tab</kbd>${tr('palette.searchMode')}</span>` : `<span><kbd>⌫</kbd>${tr('palette.backToCommands')}</span>`}<span class="sp" style="flex:1"></span><span>${LOGO(12)}</span></div>
  </div>`;
}
