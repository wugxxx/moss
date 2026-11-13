import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, task } from '../core/store.js';
import { empty } from '../ui/helpers.js';
import { t } from '../i18n/index.js';
function draft(note) {
  const focused = document.activeElement?.dataset?.noteBody === note.id ? document.activeElement.value : null;
  return focused ?? note.body;
}

export function pageNotes() {
  return `<div class="page notes-page">
    <div class="ph"><div><h1>${t('nav.notes')}</h1></div></div>
    <div class="notes-layout">
      <div class="notes-toolbar-row"><div class="notes-toolbar"><div class="inwrap notes-search">${ic('search', 15)}<input class="input" id="notes-search-q" data-in="noteQuery" value="${esc(S.ui.noteQuery || '')}" placeholder="${t('notes.search')}" aria-label="${t('common.search')}"></div><button class="btn btn-primary notes-new" data-a="newNote">${ic('plus', 14)}${t('notes.new')}</button></div></div>
      <div class="notes-results" data-note-results>${noteResults()}</div>
    </div>
  </div>`;
}

export function noteResults() {
  const query = (S.ui.noteQuery || '').trim().toLocaleLowerCase();
  const notes = [...(D().notes || [])].sort((a, b) => b.updated - a.updated);
  const shown = notes.filter(note => !query || note.body.toLocaleLowerCase().includes(query));
  return shown.length
    ? shown.map(noteCard).join('')
    : `<div class="notes-empty">${empty('sticky-note', query ? t('common.noResults') : t('notes.empty'), '', '', 'sm')}</div>`;
}

function noteCard(note) {
  const linked = note.task ? task(note.task) : null;
  return `<article class="note-card">
    <textarea class="note-body" data-note-body="${note.id}" data-in="noteBody" data-blur="saveNote" data-id="${note.id}" placeholder="${t('notes.placeholder')}" aria-label="${t('notes.body')}">${esc(draft(note))}</textarea>
    <div class="note-meta"><span>${ago(note.updated)}</span><span>${S.ui.noteSaving === note.id ? t('common.loading') : t('notes.saved')}</span></div>
    <div class="note-actions">
      ${linked ? `<button class="note-task trunc" data-a="openTask" data-id="${linked.id}">${ic('circle-check', 13)}<span class="trunc">${esc(linked.title)}</span></button>` : ''}
      <span class="sp"></span>
      ${window.mossDesktop?.notes ? `<button class="ibtn ibtn-sm ${S.ui.pinnedNotes?.has(note.id) ? 'note-pinned' : ''}" data-a="pinNote" data-id="${note.id}" data-tip="${t('notes.pin')}" data-tip-pos="top" aria-label="${t('notes.pin')}" aria-pressed="${!!S.ui.pinnedNotes?.has(note.id)}">${ic('pin', 14)}</button>` : ''}
      <button class="ibtn ibtn-sm" data-a="convertNote" data-id="${note.id}" data-tip="${t('notes.toTask')}" data-tip-pos="top" aria-label="${t('notes.toTask')}" ${note.task || !draft(note).trim() ? 'disabled' : ''}>${ic('arrow-up-right', 14)}</button>
      <button class="ibtn ibtn-sm" data-a="deleteNote" data-id="${note.id}" data-tip="${t('common.delete')}" data-tip-pos="top" aria-label="${t('common.delete')}">${ic('trash-2', 14)}</button>
    </div>
    ${note.task && !linked ? `<span class="err">${t('notes.missingTask')}</span>` : ''}
  </article>`;
}

export function floatingNote(note) {
  const pinned = S.ui.pinnedNotes?.has(note.id);
  return `<div class="floating-note"><header class="floating-note-h"><span>${ic('sticky-note', 15)}${t('nav.notes')}</span><span class="sp"></span><button class="ibtn ibtn-sm ${pinned ? 'note-pinned' : ''}" data-a="pinNote" data-id="${note.id}" aria-label="${t('notes.pin')}" aria-pressed="${!!pinned}">${ic('pin', 15)}</button><button class="ibtn ibtn-sm" data-a="closeNoteWindow" data-id="${note.id}" aria-label="${t('common.close')}">${ic('x', 15)}</button></header><textarea class="floating-note-body" data-note-body="${note.id}" data-in="noteBody" data-blur="saveNote" data-id="${note.id}" placeholder="${t('notes.placeholder')}" aria-label="${t('notes.body')}" autofocus>${esc(draft(note))}</textarea><footer class="floating-note-f">${note.task ? `<button class="btn btn-sm btn-ghost" data-a="showNote" data-id="${note.id}">${ic('circle-check', 13)}${t('notes.viewTask')}</button>` : `<button class="btn btn-sm btn-ghost" data-a="convertNote" data-id="${note.id}" ${!draft(note).trim() ? 'disabled' : ''}>${ic('arrow-up-right', 13)}${t('notes.toTask')}</button>`}<button class="ibtn ibtn-sm" data-a="deleteNote" data-id="${note.id}" aria-label="${t('common.delete')}">${ic('trash-2', 13)}</button><span class="sp"></span><span class="note-meta">${S.ui.noteSaving === note.id ? t('common.loading') : t('notes.saved')}</span></footer></div>`;
}
