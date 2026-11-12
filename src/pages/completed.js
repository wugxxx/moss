/* ---------- COMPLETED ---------- */
import { ago, esc } from '../core/utils.js';
import { allTasks, pColor, proj } from '../core/store.js';
import { t } from '../i18n/index.js';

function doneRow(task) {
  const p = proj(task.project);
  return `<div class="hrow done" data-a="openTask" data-id="${task.id}" data-ctx="task" role="button" tabindex="0">
    <input type="checkbox" class="check round" checked data-a="toggleDone" data-id="${task.id}" aria-label="${esc(t('tasks.completeTask', { title: task.title }))}">
    <div class="grow">
      <div class="tt">${esc(task.title)}</div>
      <div class="meta">
        <span class="pj"><span class="pdot" style="--c:${pColor(p)}"></span><span class="trunc">${esc(p?.name || '')}</span></span>
        ${task.completedAt ? `<span class="faint" style="font-size:var(--fs-xs)">${esc(t('completed.doneWhen', { when: ago(task.completedAt) }))}</span>` : ''}
      </div>
    </div>
  </div>`;
}

export function pageCompleted() {
  const done = allTasks()
    .filter(t => t.status === 'done')
    .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
  return `<div class="page home-cmd">
    <div class="ph home-ph"><div><p class="home-greet">${t('completed.lead')}</p></div></div>
    <section class="home-col done">
      <header class="home-col-h"><h3>${t('completed.title', { count: done.length })}</h3></header>
      <div class="home-col-list">${done.length ? done.map(doneRow).join('') : `<p class="home-col-empty">${t('completed.emptyText')}</p>`}</div>
    </section>
  </div>`;
}
