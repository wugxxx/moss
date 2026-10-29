/* ---------------- MODALS ---------------- */
import { $$, MOD, ago, esc, fmtDate } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PCOLORS, PICONS } from '../core/constants.js';
import { D, S, pColor, proj, task } from '../core/store.js';
import { FT, filePrev, lbl, prPill, stPill } from '../ui/helpers.js';
import { focusKey, render } from '../shell/render.js';
import { t as tr } from '../i18n/index.js';

export function openModal(m) {
  S.ui.modalOpeners = S.ui.modalOpeners || [];
  S.ui.modalOpeners[S.ui.modals.length] = S.ui.popOpener && S.ui.pop ? S.ui.popOpener : focusKey(document.activeElement);
  S.ui.modals.push(m);
  S.ui.pop = null;
  render();
  setTimeout(() => {
    const all = $$('.modal');
    const last = all[all.length - 1];
    const af = last?.querySelector('[autofocus]');
    (af || last?.querySelector('input,textarea,button'))?.focus();
  }, 30);
}
export function closeModal() {
  S.ui.modals.pop();
  S.ui.pop = null;
  render();
}
export function modalHtml(m) {
  const H = (title, sub = '') =>
    `<div class="modal-h"><div><h2 id="mt-${m.type}">${title}</h2>${sub ? `<div class="muted" style="font-size:12.5px;margin-top:2px">${sub}</div>` : ''}</div><button class="ibtn ibtn-sm" data-a="closeModal" aria-label="${tr('common.close')}">${ic('x', 16)}</button></div>`;
  const wrap = (cls, inner) => `<div class="modal ${cls}" role="dialog" aria-modal="true" aria-labelledby="mt-${m.type}">${inner}</div>`;
  switch (m.type) {
    case 'task':
      return wrap('', taskModal(m, H));
    case 'project':
      return wrap('', projectModal(m, H));
    case 'event':
      return wrap('', eventModal(m, H));
    case 'confirm':
      return wrap('sm', confirmModal(m, H));
    case 'prompt':
      return wrap(
        'sm',
        `${H(m.title)}<form class="modal-b" data-submit="promptSubmit"><div class="field"><label class="label" for="prompt-in">${esc(m.label)}</label><input class="input" id="prompt-in" value="${esc(m.value || '')}" autofocus></div></form><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${tr('common.cancel')}</button><button class="btn btn-primary" data-a="promptSubmit">${esc(m.ok || tr('common.save'))}</button></div>`,
      );
    case 'shortcuts':
      return wrap('lg', shortcutsModal(H));
    case 'filePreview':
      return wrap('lg', filePreviewModal(m, H));
    case 'saveView':
      return wrap(
        'sm',
        `${H(tr('modals.saveView'), tr('modals.saveViewHelp'))}<form class="modal-b" data-submit="saveViewSubmit"><div class="field"><label class="label" for="sv-name">${tr('modals.viewName')}</label><input class="input" id="sv-name" placeholder="${tr('modals.viewNamePlaceholder')}" autofocus></div><div class="field"><label class="label" for="sv-type">${tr('modals.layout')}</label><select class="select" id="sv-type"><option value="list">${tr('project.list')}</option><option value="board">${tr('project.board')}</option><option value="table">${tr('project.table')}</option></select></div>${m.nf ? `<div class="hint">${tr('modals.filtersSaved', { count: m.nf })}</div>` : `<div class="alert info">${ic('info', 14)}<span>${tr('modals.noFilters')}</span></div>`}</form><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${tr('common.cancel')}</button><button class="btn btn-primary" data-a="saveViewSubmit">${tr('modals.saveView')}</button></div>`,
      );
  }
  return '';
}
export function formChip(pop, html, label) {
  return `<button class="pillbtn bordered" data-a="pop" data-pop="${pop}" data-id="__form" ${pop === 'date' ? `data-field="${label}"` : ''} aria-label="${esc(label)}">${html}</button>`;
}
export function taskModal(m, H) {
  const f = S.ui.form;
  const p = proj(f.project);
  const err = S.ui.errors.title;
  return `${H(m.edit ? tr('modals.editTask') : tr('modals.newTask'), m.edit ? `<span class="mono">${task(m.edit)?.key}</span>` : '')}
  <form class="modal-b" data-submit="submitTask" style="gap:12px">
    <div class="field"><label class="sr" for="f-title">${tr('common.taskName')}</label><input class="input input-lg ${err ? 'is-error' : ''}" id="f-title" data-in="form" data-f="title" value="${esc(f.title)}" placeholder="${tr('modals.taskNamePlaceholder')}" autofocus aria-invalid="${!!err}" aria-describedby="f-title-err" style="font-size:15px;font-weight:500">${err ? `<span class="err" id="f-title-err">${ic('circle-alert', 12)}${err}</span>` : ''}</div>
    <div class="field"><label class="sr" for="f-desc">${tr('common.description')}</label><textarea class="textarea" id="f-desc" data-in="form" data-f="desc" placeholder="${tr('modals.descriptionPlaceholder')}" rows="3">${esc(f.desc)}</textarea></div>
    <div class="row" style="flex-wrap:wrap;gap:6px">
      ${formChip('project', `<span class="pdot" style="--c:${pColor(p)}"></span>${esc(p?.name || tr('common.project'))}`, tr('common.project'))}
      ${formChip('status', stPill(f.status), tr('common.status'))}
      ${formChip('priority', prPill(f.priority), tr('common.priority'))}
      ${formChip('date', `${ic('calendar', 13)}${f.due ? tr('common.dueOn', { date: fmtDate(f.due) }) : tr('common.dueDate')}`, 'due')}
      ${formChip('date', `${ic('calendar-arrow-up', 13)}${f.start ? tr('common.startsOn', { date: fmtDate(f.start) }) : tr('common.startDate')}`, 'start')}
      ${formChip('labels', f.labels.length ? f.labels.map(lbl).join('') : `${ic('tag', 13)}${tr('common.labels')}`, tr('common.labels'))}
      ${formChip('recur', `${ic('repeat', 13)}${f.recur || tr('modals.repeat')}`, tr('modals.repeat'))}
    </div>
    <div class="field"><span class="label">${tr('common.subtasks')}</span>
      ${f.subtasks.map((s, i) => `<div class="subt" style="padding:0 4px">${ic('circle', 13)}<span class="s">${esc(s.title)}</span><button type="button" class="ibtn ibtn-xs x" style="opacity:1" data-a="formRmSub" data-i="${i}" aria-label="${tr('common.remove')}">${ic('x', 12)}</button></div>`).join('')}
      <div class="inwrap">${ic('plus', 14)}<input class="input" id="f-sub" data-key-enter="formAddSub" placeholder="${tr('modals.addSubtaskPlaceholder')}"></div></div>
    <div class="field"><span class="label">${tr('common.attachments')}</span>
      ${f.files.length ? `<div class="col" style="gap:4px">${f.files.map((x, i) => `<div class="upl" style="padding:6px 10px"><span class="ftype" style="--c:${FT[x.type]?.c || FT.other.c};width:22px;height:22px">${ic(FT[x.type]?.i || FT.other.i, 12)}</span><span class="grow trunc">${esc(x.name)}</span><span class="faint" style="font-size:11.5px">${x.size}</span><button type="button" class="ibtn ibtn-xs" data-a="formRmFile" data-i="${i}" aria-label="${tr('common.remove')}">${ic('x', 12)}</button></div>`).join('')}</div>` : ''}
      <label class="dropzone" style="padding:10px">${ic('paperclip', 14)}<span>${tr('modals.attachFiles', { suffix: window.mossDesktop ? '' : tr('modals.metadataOnlyBrowser') })}</span><input type="file" multiple hidden data-in="formFiles"></label></div>
  </form>
  <div class="modal-f">${m.edit ? '' : `<label class="row" style="gap:8px;font-size:12.5px;color:var(--text-2);cursor:pointer"><input type="checkbox" class="toggle" id="f-more" data-in="formMore" ${f.more ? 'checked' : ''}>${tr('modals.createMore')}</label>`}<span class="sp"></span>
    <span class="faint hide-m" style="font-size:11.5px"><kbd>${MOD}</kbd> <kbd>↵</kbd></span>
    <button class="btn btn-secondary" data-a="closeModal">${tr('common.cancel')}</button><button class="btn btn-primary ${S.ui.taskSaving ? 'is-loading' : ''}" data-a="submitTask" id="f-submit" ${S.ui.taskSaving ? 'disabled' : ''}>${m.edit ? tr('modals.saveChanges') : tr('modals.createTask')}</button></div>`;
}
export const TEMPLATES = [
  {
    id: 'blank',
    get name() {
      return tr('templates.blankName');
    },
    icon: 'file',
    get desc() {
      return tr('templates.blankDesc');
    },
    tasks: [],
  },
  {
    id: 'product',
    get name() {
      return tr('templates.productName');
    },
    icon: 'target',
    get desc() {
      return tr('templates.productDesc');
    },
    get tasks() {
      return [1, 2, 3, 4, 5, 6].map(i => tr(`templates.productTask${i}`));
    },
  },
  {
    id: 'web',
    get name() {
      return tr('templates.webName');
    },
    icon: 'globe',
    get desc() {
      return tr('templates.webDesc');
    },
    get tasks() {
      return [1, 2, 3, 4, 5, 6].map(i => tr(`templates.webTask${i}`));
    },
  },
  {
    id: 'mkt',
    get name() {
      return tr('templates.marketingName');
    },
    icon: 'megaphone',
    get desc() {
      return tr('templates.marketingDesc');
    },
    get tasks() {
      return [1, 2, 3, 4, 5, 6].map(i => tr(`templates.marketingTask${i}`));
    },
  },
  {
    id: 'design',
    get name() {
      return tr('templates.designName');
    },
    icon: 'palette',
    get desc() {
      return tr('templates.designDesc');
    },
    get tasks() {
      return [1, 2, 3, 4, 5].map(i => tr(`templates.designTask${i}`));
    },
  },
  {
    id: 'software',
    get name() {
      return tr('templates.softwareName');
    },
    icon: 'code',
    get desc() {
      return tr('templates.softwareDesc');
    },
    get tasks() {
      return [1, 2, 3, 4, 5, 6].map(i => tr(`templates.softwareTask${i}`));
    },
  },
  {
    id: 'personal',
    get name() {
      return tr('templates.personalName');
    },
    icon: 'heart',
    get desc() {
      return tr('templates.personalDesc');
    },
    get tasks() {
      return [1, 2, 3, 4].map(i => tr(`templates.personalTask${i}`));
    },
  },
];
export function projectModal(m, H) {
  const f = S.ui.pform;
  const err = S.ui.errors.pname;
  const dateErr = S.ui.errors.pdate;
  const milestoneErr = S.ui.errors.pmilestone;
  return `${H(m.edit ? tr('modals.projectSettings') : tr('modals.newProject'), m.edit ? '' : tr('modals.projectHelp'))}
  <form class="modal-b" data-submit="submitProject">
    <div class="row" style="gap:10px;align-items:flex-start">
      <button type="button" class="picon lg" style="--c:${PCOLORS[f.color]};cursor:default;flex-shrink:0;margin-top:22px" aria-hidden="true" tabindex="-1">${ic(f.icon, 18)}</button>
      <div class="field grow"><label class="label" for="p-name">${tr('common.projectName')}</label><input class="input ${err ? 'is-error' : ''}" id="p-name" data-in="pform" data-f="name" value="${esc(f.name)}" placeholder="${tr('modals.projectNamePlaceholder')}" autofocus aria-invalid="${!!err}">${err ? `<span class="err">${ic('circle-alert', 12)}${err}</span>` : ''}</div>
    </div>
    <div class="field"><label class="label" for="p-desc">${tr('common.description')}</label><textarea class="textarea" id="p-desc" data-in="pform" data-f="desc" rows="2" placeholder="${tr('modals.projectDescPlaceholder')}">${esc(f.desc)}</textarea></div>
    <div class="row" style="gap:16px;align-items:flex-start;flex-wrap:wrap">
      <div class="field" style="flex:1;min-width:220px"><span class="label">${tr('modals.icon')}</span><div class="iconpick" role="radiogroup" aria-label="${tr('modals.icon')}">${PICONS.map(i => `<button type="button" role="radio" aria-checked="${f.icon === i}" class="${f.icon === i ? 'on' : ''}" data-a="pformSet" data-f="icon" data-v="${i}" aria-label="${i}">${ic(i, 15)}</button>`).join('')}</div></div>
      <div class="field"><span class="label">${tr('modals.color')}</span><div class="swatches" role="radiogroup" aria-label="${tr('modals.color')}" style="max-width:140px">${Object.entries(
        PCOLORS,
      )
        .map(
          ([k, v]) =>
            `<button type="button" role="radio" aria-checked="${f.color === k}" class="sw ${f.color === k ? 'on' : ''}" style="--c:${v};width:22px;height:22px" data-a="pformSet" data-f="color" data-v="${k}" aria-label="${k}">${f.color === k ? ic('check', 12) : ''}</button>`,
        )
        .join('')}</div></div>
    </div>
    <div class="row" style="gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="p-start">${tr('common.startDate')}</label><input type="date" class="input ${dateErr ? 'is-error' : ''}" id="p-start" data-in="pform" data-f="start" value="${f.start || ''}"></div>
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="p-due">${tr('modals.targetDate')}</label><input type="date" class="input" id="p-due" data-in="pform" data-f="due" value="${f.due || ''}"></div>
    </div>
    ${dateErr ? `<span class="err">${ic('circle-alert', 12)}${dateErr}</span>` : ''}
    <div class="field">
      <div class="row"><span class="label">${tr('project.milestones')}</span><span class="sp"></span><button type="button" class="btn btn-sm btn-ghost" data-a="pformAddMilestone">${ic('plus', 13)}${tr('modals.addMilestone')}</button></div>
      ${
        f.milestones.length
          ? `<div class="col" style="gap:6px">${f.milestones
              .map(
                (milestone, i) =>
                  `<div class="row" style="gap:6px;align-items:flex-start"><input class="input grow" id="p-ms-name-${i}" data-in="pformMilestone" data-i="${i}" data-f="name" value="${esc(milestone.name)}" placeholder="${tr('modals.milestoneName')}" aria-label="${tr('modals.milestoneNumber', { count: i + 1 })}"><input type="date" class="input" style="width:145px" data-in="pformMilestone" data-i="${i}" data-f="date" value="${milestone.date || ''}" aria-label="${tr('modals.milestoneDate', { count: i + 1 })}"><button type="button" class="ibtn ibtn-sm" data-a="pformRmMilestone" data-i="${i}" aria-label="${tr('modals.removeMilestone')}">${ic('trash-2', 14)}</button></div>`,
              )
              .join('')}</div>`
          : `<p class="hint">${tr('modals.milestonesHelp')}</p>`
      }
      ${milestoneErr ? `<span class="err">${ic('circle-alert', 12)}${milestoneErr}</span>` : ''}
    </div>
    ${m.edit ? '' : `<div class="field"><span class="label">${tr('modals.template')}</span><div class="tmpls" role="radiogroup">${TEMPLATES.map(t => `<button type="button" role="radio" aria-checked="${f.tmpl === t.id}" class="opt ${f.tmpl === t.id ? 'on' : ''}" data-a="pformSet" data-f="tmpl" data-v="${t.id}" style="padding:10px">${ic(t.icon, 16)}<b style="font-size:12.5px">${t.name}</b><span>${t.tasks.length ? tr('modals.starterTasks', { count: t.tasks.length }) : t.desc}</span></button>`).join('')}</div></div>`}
  </form>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${tr('common.cancel')}</button><button class="btn btn-primary" data-a="submitProject">${m.edit ? tr('modals.saveChanges') : tr('modals.createProject')}</button></div>`;
}
export function eventModal(m, H) {
  const f = S.ui.eform;
  const titleErr = S.ui.errors.etitle;
  const dateErr = S.ui.errors.edate;
  const timeErr = S.ui.errors.etime;
  const projectErr = S.ui.errors.eproject;
  const projects = [...D().projects].filter(project => !project.archived || project.id === f.project);
  return `${H(m.edit ? tr('modals.editEvent') : tr('modals.newEvent'), tr('modals.eventHelp'))}
  <form class="modal-b" data-submit="submitEvent">
    <div class="field"><label class="label" for="e-title">${tr('modals.eventTitle')}</label><input class="input ${titleErr ? 'is-error' : ''}" id="e-title" data-in="eform" data-f="title" value="${esc(f.title)}" placeholder="${tr('modals.eventTitlePlaceholder')}" autofocus aria-invalid="${!!titleErr}">${titleErr ? `<span class="err">${ic('circle-alert', 12)}${titleErr}</span>` : ''}</div>
    <div class="row" style="gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="e-date">${tr('common.date')}</label><input type="date" class="input ${dateErr ? 'is-error' : ''}" id="e-date" data-in="eform" data-f="date" value="${f.date || ''}">${dateErr ? `<span class="err">${ic('circle-alert', 12)}${dateErr}</span>` : ''}</div>
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="e-time">${tr('modals.time')}</label><input type="time" class="input ${timeErr ? 'is-error' : ''}" id="e-time" data-in="eform" data-f="time" value="${f.time || ''}">${timeErr ? `<span class="err">${ic('circle-alert', 12)}${timeErr}</span>` : ''}</div>
    </div>
    <div class="field"><label class="label" for="e-project">${tr('common.project')}</label><select class="select ${projectErr ? 'is-error' : ''}" id="e-project" data-in="eform" data-f="project">${projects.map(project => `<option value="${project.id}" ${project.id === f.project ? 'selected' : ''}>${esc(project.name)}</option>`).join('')}</select>${projectErr ? `<span class="err">${ic('circle-alert', 12)}${projectErr}</span>` : ''}</div>
    <div class="field"><label class="label" for="e-notes">${tr('common.notes')}</label><textarea class="textarea" id="e-notes" data-in="eform" data-f="notes" rows="3" placeholder="${tr('modals.agendaPlaceholder')}">${esc(f.notes || '')}</textarea></div>
  </form>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${tr('common.cancel')}</button><button class="btn btn-primary" data-a="submitEvent">${m.edit ? tr('modals.saveChanges') : tr('modals.createEvent')}</button></div>`;
}
export function confirmModal(m) {
  const needs = m.typeName;
  const ok = !needs || (S.ui.confirmText || '') === needs;
  return `<div class="modal-b" style="padding-top:18px;gap:10px">
    <div class="row" style="gap:12px;align-items:flex-start"><span class="ftype" style="--c:${m.danger ? 'var(--red)' : 'var(--amber)'};width:34px;height:34px;border-radius:9px">${ic(m.icon || (m.danger ? 'trash-2' : 'archive'), 17)}</span>
    <div class="grow"><h2 id="mt-confirm" style="font-size:15px;font-weight:600;margin:4px 0 6px">${esc(m.title)}</h2><p class="muted" style="margin:0;font-size:13px;line-height:1.55">${m.body}</p></div></div>
    ${needs ? `<div class="field" style="margin-top:6px"><label class="label" for="confirm-in" style="font-weight:400;color:var(--text-2)">${tr('modals.typeToConfirm', { value: `<b style="color:var(--text);font-weight:600">${esc(needs)}</b>` })}</label><input class="input" id="confirm-in" data-in="confirmText" autocomplete="off" autofocus value="${esc(S.ui.confirmText || '')}"></div>` : ''}
  </div>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal" ${needs ? '' : 'autofocus'}>${tr('common.cancel')}</button><button class="btn ${m.danger ? 'btn-danger' : 'btn-primary'}" data-a="confirmOk" ${ok ? '' : 'disabled'}>${esc(m.ok)}</button></div>`;
}
export const SHORTCUTS = [
  [
    'shortcuts.general',
    [
      ['shortcuts.commandMenu', [MOD, 'K']],
      ['shortcuts.search', ['/']],
      ['shortcuts.keyboardShortcuts', ['?']],
      ['shortcuts.toggleSidebar', ['[']],
      ['shortcuts.toggleDark', [MOD, 'Shift', 'L']],
      ['shortcuts.closeDialog', ['Esc']],
    ],
  ],
  [
    'shortcuts.create',
    [
      ['shortcuts.newTask', ['N']],
      ['shortcuts.newProject', ['P']],
      ['shortcuts.submitForm', [MOD, '↵']],
    ],
  ],
  [
    'shortcuts.navigate',
    [
      ['shortcuts.goHome', ['G', 'H']],
      ['shortcuts.goTasks', ['G', 'T']],
      ['shortcuts.goProjects', ['G', 'P']],
      ['shortcuts.goCalendar', ['G', 'C']],
      ['shortcuts.goSettings', ['G', 'S']],
    ],
  ],
  [
    'shortcuts.commandGroup',
    [
      ['shortcuts.moveSelection', ['↑', '↓']],
      ['shortcuts.runCommand', ['↵']],
      ['shortcuts.searchMode', ['Tab']],
    ],
  ],
];
export function shortcutsModal(H) {
  return `${H(tr('nav.shortcuts'))}<div class="modal-b" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px">${SHORTCUTS.map(([g, list]) => `<div><div class="eyebrow" style="margin-bottom:6px">${tr(g)}</div>${list.map(([n, k]) => `<div class="row" style="height:30px;font-size:13px;border-bottom:1px solid var(--divider)"><span class="grow">${tr(n)}</span>${k.map((x, i) => `${i && k[0] === 'G' ? `<span class="faint" style="font-size:11px">${tr('shortcuts.then')}</span>` : ''}<kbd>${x}</kbd>`).join('')}</div>`).join('')}</div>`).join('')}</div>`;
}
export function filePreviewModal(m, H) {
  const f = m.file;
  const t = FT[f.type] || FT.other;
  const canOpen = Boolean(window.mossDesktop?.attachments && f.storageKey);
  const canPreviewImage = canOpen && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'].includes((f.name.split('.').pop() || '').toLowerCase());
  return `${H(esc(f.name), `${t.n} · ${f.size} · ${ago(f.at)}`)}
  <div class="modal-b"><div id="file-preview-media" style="border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden">${filePrev(f).replace('class="fprev"', 'class="fprev" style="aspect-ratio:16/9"')}</div>
  ${canOpen ? `<div class="hint">${ic('shield-check', 13)} ${tr('modals.locallyStored')}</div>` : `<div class="hint">${ic('cloud-off', 13)} ${window.mossDesktop ? tr('modals.noStoredContent') : tr('modals.browserMetadataOnly')}</div>`}
  ${m.tid ? `<div class="row faint" style="font-size:12.5px">${ic('link', 13)}${tr('modals.attachedTo')} <button class="link" data-a="openTask" data-id="${m.tid}">${esc(task(m.tid)?.title)}</button></div>` : ''}</div>
  <div class="modal-f"><button class="btn btn-ghost" data-a="closeModal">${tr('common.close')}</button><span class="sp"></span>${canPreviewImage ? `<button class="btn btn-secondary" data-a="toggleFileImagePreview" data-id="${f.id}" data-key="${esc(f.storageKey)}" data-size="${f.byteSize ?? 0}" data-type="${esc(f.contentType || '')}">${ic('image', 14)}${tr('common.preview')}</button>` : ''}${canOpen ? `<button class="btn btn-secondary" data-a="revealFile" data-key="${esc(f.storageKey)}">${ic('folder-open', 14)}${tr('modals.showInFolder')}</button><button class="btn btn-primary" data-a="openFile" data-key="${esc(f.storageKey)}">${ic('external-link', 14)}${tr('modals.openFile')}</button>` : ''}</div>`;
}
