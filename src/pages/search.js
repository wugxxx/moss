/* ---------- SEARCH RESULTS ---------- */
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, allTasks, pColor, proj, visibleProjects } from '../core/store.js';
import { FT, empty, hl, pIcon, pStatus, stIcon } from '../ui/helpers.js';
import { t } from '../i18n/index.js';

export function searchAll(q) {
  q = (q || '').trim().toLowerCase();
  if (!q) return { tasks: [], projects: [], files: [] };
  const has = s => (s || '').toLowerCase().includes(q);
  return {
    tasks: allTasks()
      .filter(t => has(t.title) || has(t.key) || has(t.desc.replace(/<[^>]+>/g, '')))
      .slice(0, 30),
    projects: visibleProjects().filter(p => has(p.name) || has(p.desc)),
    files: D().files.filter(f => has(f.name)),
  };
}
export function pageSearch() {
  const q = S.ui.searchQ;
  const r = searchAll(q);
  const cat = S.ui.searchCat;
  const cats = [
    ['all', t('search.categories.all')],
    ['tasks', t('search.categories.tasks')],
    ['projects', t('search.categories.projects')],
    ['files', t('search.categories.files')],
  ];
  const total = Object.values(r).reduce((a, b) => a + b.length, 0);
  const sec = (k, title, html) =>
    (cat === 'all' || cat === k) && r[k].length
      ? `<section style="margin-bottom:22px"><div class="eyebrow" style="margin-bottom:6px">${title} · ${r[k].length}</div><div class="panel" style="overflow:hidden">${html}</div></section>`
      : '';
  return `<div class="page" style="max-width:860px">
    <div class="inwrap" style="margin-bottom:14px">${ic('search', 16)}<input class="input input-lg" id="search-page-q" data-in="searchQ" placeholder="${t('search.placeholder')}" value="${esc(q)}" style="padding-left:34px;font-size:15px" aria-label="${t('common.search')}"></div>
    <div class="tabs" style="margin-bottom:18px">${cats.map(([k, n]) => `<button class="tab ${cat === k ? 'on' : ''}" data-a="set" data-k="searchCat" data-v="${k}">${n}<span class="cnt">${k === 'all' ? total : r[k].length}</span></button>`).join('')}</div>
    ${
      !q
        ? `<div class="row" style="gap:6px;flex-wrap:wrap"><span class="faint" style="font-size:12.5px">${t('search.recent')}</span>${D()
            .recentSearches.map(s => `<button class="badge" data-a="setSearch" data-q="${esc(s)}">${ic('history', 11)}${esc(s)}</button>`)
            .join('')}</div>`
        : total
          ? sec(
              'tasks',
              t('search.categories.tasks'),
              r.tasks
                .map(
                  t =>
                    `<div class="mini" data-a="openTask" data-id="${t.id}">${stIcon(t.status)}<span class="mono faint" style="font-size:11px">${t.key}</span><span class="tt">${hl(t.title, q)}</span><span class="pj"><span class="pdot" style="--c:${pColor(proj(t.project))}"></span>${esc(proj(t.project).name)}</span></div>`,
                )
                .join(''),
            ) +
            sec(
              'projects',
              t('search.categories.projects'),
              r.projects
                .map(
                  p =>
                    `<div class="mini" data-a="go" data-r="project" data-id="${p.id}">${pIcon(p, '', 13)}<span class="tt">${hl(p.name, q)} <span class="faint" style="font-size:12px">— ${esc(p.desc.slice(0, 70))}…</span></span>${pStatus(p.status)}</div>`,
                )
                .join(''),
            ) +
            sec(
              'files',
              t('search.categories.files'),
              r.files
                .map(
                  f =>
                    `<div class="mini" data-a="go" data-r="project" data-id="${f.project}" data-tab="files"><span class="ftype" style="--c:${FT[f.type].c}">${ic(FT[f.type].i, 14)}</span><span class="tt">${hl(f.name, q)}</span><span class="faint" style="font-size:12px">${f.size} · ${esc(proj(f.project).name)}</span></div>`,
                )
                .join(''),
            )
          : `<div class="panel">${empty('search-x', t('common.noResults'), t('search.nothingMatches', { query: q }), `<button class="btn btn-secondary btn-sm" data-a="setSearch" data-q="">${t('search.clearSearch')}</button>`)}</div>`
    }
  </div>`;
}
