/* ---------- FILES ---------- */
import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, task } from '../core/store.js';
import { FT, empty, filePrev, fileType } from '../ui/helpers.js';
import { t as tr } from '../i18n/index.js';

export function filesHtml(pid) {
  const u = S.ui;
  const q = (u.fileQ || '').toLowerCase();
  const ft = u.fileType || 'all';
  const sort = u.fileSort || 'date';
  let fs = D().files.filter(f => f.project === pid && (!q || f.name.toLowerCase().includes(q)) && (ft === 'all' || f.type === ft));
  fs.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'type' ? a.type.localeCompare(b.type) : b.at - a.at));
  const ups = (u.uploads || []).filter(x => x.project === pid);
  const view = u.fileView;
  return `<div class="toolbar">
      <div class="inwrap">${ic('search', 13)}<input class="input search-sm" id="file-q" data-in="fileQ" placeholder="${tr('files.searchPlaceholder')}" value="${esc(u.fileQ || '')}" aria-label="${tr('files.searchPlaceholder')}"></div>
      <select class="select" style="height:26px;width:auto;font-size:12px" data-in="fileType" aria-label="${tr('files.filterByType')}"><option value="all">${tr('files.allTypes')}</option>${Object.entries(
        FT,
      )
        .filter(([k]) => k !== 'other')
        .map(([k, v]) => `<option value="${k}" ${ft === k ? 'selected' : ''}>${v.n}</option>`)
        .join('')}</select>
      <select class="select" style="height:26px;width:auto;font-size:12px" data-in="fileSort" aria-label="${tr('common.sort')}">${[
        ['date', tr('files.newest')],
        ['name', tr('common.name')],
        ['type', tr('common.type')],
      ]
        .map(([k, n]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>${tr('files.sortPrefix', { value: n })}</option>`)
        .join('')}</select>
      <span class="sp"></span>
      <div class="seg">${[
        ['grid', 'layout-grid'],
        ['list', 'list'],
      ]
        .map(
          ([k, i]) =>
            `<button class="${view === k ? 'on' : ''}" data-a="set" data-k="fileView" data-v="${k}" aria-label="${k === 'grid' ? tr('files.gridView') : tr('files.listView')}">${ic(i, 13)}</button>`,
        )
        .join('')}</div>
      <label class="btn btn-primary btn-sm" style="cursor:pointer">${ic('upload', 13)}${tr('files.upload')}<input type="file" multiple hidden data-in="uploadFiles" data-project="${pid}"></label>
    </div>
    <div class="page wide" style="padding-top:16px">
      <label class="dropzone" data-dropzone="${pid}" style="margin-bottom:16px">${ic('upload-cloud', 18)}<span>${tr('files.dropzone')}</span><input type="file" multiple hidden data-in="uploadFiles" data-project="${pid}"></label>
      ${ups.length ? `<div class="col" style="gap:6px;margin-bottom:16px">${ups.map(x => `<div class="upl"><span class="ftype" style="--c:${FT[fileType(x.name)].c}">${ic(FT[fileType(x.name)].i, 14)}</span><div class="grow"><div class="row"><span class="trunc" style="font-weight:500">${esc(x.name)}</span><span class="sp"></span><span class="faint num" style="font-size:11.5px" id="upct-${x.id}">${x.pct}%</span></div><div class="prog" style="margin-top:6px"><i id="upbar-${x.id}" style="--p:${x.pct / 100}"></i></div></div></div>`).join('')}</div>` : ''}
      ${
        !fs.length
          ? empty(
              q || ft !== 'all' ? 'search-x' : 'folder-open',
              q || ft !== 'all' ? tr('files.noResults') : tr('files.noFiles'),
              q || ft !== 'all' ? tr('files.noResultsHelp') : tr('files.noFilesHelp'),
              '',
            )
          : view === 'grid'
            ? `<div class="fgrid">${fs.map(f => `<div class="fcard" data-ctx="file" data-id="${f.id}" data-a="previewFile" role="button" tabindex="0">${filePrev(f)}<div class="fi"><span class="fn trunc">${esc(f.name)}</span><span class="fm">${f.size} · ${ago(f.at)}</span></div><button class="ibtn ibtn-xs more" data-a="ctxBtn" data-ctx="file" data-id="${f.id}" aria-label="${tr('files.fileOptions')}">${ic('ellipsis', 13)}</button></div>`).join('')}</div>`
            : `<div class="panel" style="overflow-x:auto"><table class="perm-t" style="min-width:560px"><thead><tr><th style="padding-left:14px">${tr('common.name')}</th><th style="text-align:left">${tr('common.type')}</th><th style="text-align:left">${tr('common.size')}</th><th style="text-align:left">${tr('common.date')}</th><th></th></tr></thead><tbody>${fs.map(f => `<tr data-ctx="file" data-id="${f.id}"><td style="padding-left:14px"><span class="row"><span class="ftype" style="--c:${FT[f.type].c}">${ic(FT[f.type].i, 14)}</span><span style="font-weight:500">${esc(f.name)}</span>${f.task && task(f.task) ? `<button class="badge" data-a="openTask" data-id="${f.task}">${ic('link', 10)}${task(f.task).key}</button>` : ''}</span></td><td style="text-align:left" class="muted">${FT[f.type].n}</td><td style="text-align:left" class="num muted">${f.size}</td><td style="text-align:left" class="muted">${ago(f.at)}</td><td><button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="file" data-id="${f.id}" aria-label="${tr('files.fileOptions')}">${ic('ellipsis', 14)}</button></td></tr>`).join('')}</tbody></table></div>`
      }
    </div>`;
}
