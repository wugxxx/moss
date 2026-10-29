/* ---------- FAVORITES ---------- */
import { allTasks, visibleProjects } from '../core/store.js';
import { empty } from '../ui/helpers.js';
import { miniRow } from '../components/task-list.js';
import { projectCard } from './projects.js';
import { t } from '../i18n/index.js';

export function pageFavorites() {
  const ps = visibleProjects().filter(p => p.fav);
  const ts = allTasks().filter(t => t.fav);
  return `<div class="page wide">
    <div class="ph"><div><h1>${t('favorites.title')}</h1><p>${t('favorites.lead')}</p></div></div>
    ${
      !ps.length && !ts.length
        ? `<div class="panel">${empty('star', t('favorites.emptyTitle'), t('favorites.emptyText'), `<button class="btn btn-secondary btn-sm" data-a="go" data-r="projects">${t('favorites.browseProjects')}</button>`)}</div>`
        : `
    <h2 class="sec" style="margin-bottom:10px">${t('favorites.projects')} <span class="faint" style="font-weight:500">${ps.length}</span></h2>
    ${ps.length ? `<div class="pgrid" style="margin-bottom:28px">${ps.map(projectCard).join('')}</div>` : `<p class="faint" style="margin-bottom:28px">${t('favorites.noFavoriteProjects')}</p>`}
    <h2 class="sec" style="margin-bottom:6px">${t('favorites.tasks')} <span class="faint" style="font-weight:500">${ts.length}</span></h2>
    ${ts.length ? `<div class="panel" style="overflow:hidden">${ts.map(t => miniRow(t)).join('')}</div>` : `<p class="faint">${t('favorites.noFavoriteTasks')}</p>`}`
    }
  </div>`;
}
