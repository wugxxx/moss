/* ---------- archive ---------- */
import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, proj } from '../core/store.js';
import { empty, pIcon, stIcon } from '../ui/helpers.js';
import { t as tr } from '../i18n/index.js';

export function archiveBody() {
  const tab = S.ui.archTab || 'tasks';
  const ts = D()
    .tasks.filter(t => t.archived && !proj(t.project)?.archived)
    .sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
  const ps = D().projects.filter(p => p.archived);
  const row = (lead, title, sub, when, restoreAct, delAct, id) =>
    `<div class="mini" style="min-height:52px;cursor:default;gap:12px">${lead}<div class="grow" style="min-width:0"><div class="trunc" style="font-weight:500">${title}</div><div class="faint trunc" style="font-size:12px">${sub}</div></div><span class="faint hide-m" style="font-size:12px;white-space:nowrap">${when}</span><button class="btn btn-secondary btn-sm" data-a="${restoreAct}" data-id="${id}">${ic('rotate-ccw', 13)}${tr('common.restore')}</button><button class="ibtn ibtn-sm" data-a="${delAct}" data-id="${id}" data-tip="${tr('archive.deletePermanently')}" aria-label="${tr('archive.deletePermanently')}" style="color:var(--red)">${ic('trash-2', 15)}</button></div>`;
  const body =
    tab === 'tasks'
      ? ts.length
        ? `<div class="panel" style="overflow:hidden">${ts
            .map(t => {
              const p = proj(t.project);
              return row(
                stIcon(t.status, 15),
                esc(t.title),
                `<span class="mono">${t.key}</span> · ${esc(p.name)}`,
                t.archivedAt ? tr('archive.archivedAt', { when: ago(t.archivedAt) }) : tr('archive.archived'),
                'restoreTask',
                'purgeTask',
                t.id,
              );
            })
            .join('')}</div>`
        : `<div class="panel">${empty('archive', tr('archive.noTasks'), tr('archive.noTasksHelp'), '')}</div>`
      : ps.length
        ? `<div class="panel" style="overflow:hidden">${ps.map(p => row(pIcon(p, '', 14), esc(p.name), `${tr('common.tasks', { count: D().tasks.filter(t => t.project === p.id).length })} · ${PSTAT[p.status].name}`, p.archivedAt ? tr('archive.archivedAt', { when: ago(p.archivedAt) }) : tr('archive.archived'), 'restoreProject', 'delProject', p.id)).join('')}</div>`
        : `<div class="panel">${empty('archive', tr('archive.noProjects'), tr('archive.noProjectsHelp'), '')}</div>`;
  return `<div class="tabs" style="margin-bottom:14px" role="tablist" aria-label="${tr('archive.tab')}">${[
    ['tasks', tr('archive.tasks'), ts.length],
    ['projects', tr('archive.projects'), ps.length],
  ]
    .map(
      ([k, n, c]) =>
        `<button role="tab" aria-selected="${tab === k}" class="tab ${tab === k ? 'on' : ''}" data-a="set" data-k="archTab" data-v="${k}">${n}<span class="cnt">${c}</span></button>`,
    )
    .join('')}</div>
    ${body}`;
}
