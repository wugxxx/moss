/* ---------------- CONTEXT MENUS ---------------- */
import { ic } from '../core/icons.js';
import { ST } from '../core/constants.js';
import { proj, task, visibleProjects } from '../core/store.js';
import { t as tr } from '../i18n/index.js';

export function ctxMenu(p) {
  const I = (act, icon, label, extra = '', r = '') =>
    `<button class="mi ${extra}" data-a="${act}" data-id="${p.id}" data-key="${p.key || ''}">${ic(icon, 15)}${label}${r ? `<span class="r">${r}</span>` : ''}</button>`;
  const sep = '<div class="msep"></div>';
  if (p.ctx === 'task') {
    const t = task(p.id);
    if (!t) return '';
    return (
      I('openTask', 'panel-right-open', tr('context.open')) +
      I('editTask', 'pencil', tr('context.edit'), '', 'E') +
      I('toggleDone', t.status === 'done' ? 'rotate-ccw' : 'circle-check', t.status === 'done' ? tr('context.reopen') : tr('context.markComplete')) +
      sep +
      I('ctxStatus', 'circle-dot', tr('context.status')) +
      I('ctxPrio', 'signal-high', tr('context.priority')) +
      I('ctxMove', 'folder-input', tr('context.moveProject')) +
      sep +
      I('toggleFavTask', 'star', t.fav ? tr('context.removeFavorite') : tr('context.addFavorite')) +
      I('dupTask', 'copy', tr('context.duplicate')) +
      I('archiveTask', 'archive', tr('context.archive')) +
      sep +
      I('delTask', 'trash-2', tr('context.delete'), 'danger', 'Del')
    );
  }
  if (p.ctx === 'project') {
    const pr = proj(p.id);
    if (!pr) return '';
    return (
      I('openProject', 'arrow-up-right', tr('context.open')) +
      I('toggleFavProj', 'star', pr.fav ? tr('context.removeFavorite') : tr('context.addFavorite')) +
      I('editProject', 'pencil', tr('context.renameEdit')) +
      I('dupProject', 'copy', tr('context.duplicate')) +
      sep +
      (visibleProjects().indexOf(pr) > 0 ? I('projUp', 'arrow-up', tr('context.moveUp')) : '') +
      (visibleProjects().indexOf(pr) < visibleProjects().length - 1 ? I('projDown', 'arrow-down', tr('context.moveDown')) : '') +
      sep +
      I('archiveProject', 'archive', pr.status === 'complete' ? tr('context.archive') : tr('context.archiveProject')) +
      I('delProject', 'trash-2', tr('context.deleteProject'), 'danger')
    );
  }
  if (p.ctx === 'column') {
    return (
      `<div class="mh">${ST[p.id].name}</div>` +
      I('colAdd', 'plus', tr('common.addTask')) +
      I('colCollapse', 'fold-horizontal', tr('context.collapseColumn')) +
      (p.id !== 'done' ? I('colDoneAll', 'check-check', tr('context.markAllDone')) : I('colArchive', 'archive', tr('context.archiveCompleted'))) +
      I('colSortPrio', 'arrow-down-wide-narrow', tr('context.sortPriority'))
    );
  }
  if (p.ctx === 'file') {
    return (
      I('previewFile', 'eye', tr('context.preview')) +
      I('renameFile', 'pencil', tr('context.rename')) +
      I('dupFile', 'copy', tr('context.duplicate')) +
      sep +
      I('delFile', 'trash-2', tr('context.delete'), 'danger')
    );
  }
  if (p.ctx === 'savedview') {
    return `<button class="mi" data-a="renameView" data-id="${p.vid}">${ic('pencil', 15)}${tr('context.renameEdit')}</button><button class="mi danger" data-a="delView" data-id="${p.vid}">${ic('trash-2', 15)}${tr('context.deleteView')}</button>`;
  }
  return '';
}
