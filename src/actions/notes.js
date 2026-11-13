import { $, esc } from '../core/utils.js';
import { D, S, visibleProjects } from '../core/store.js';
import { A, IN, BLUR, restore, runCommand, snapshot } from './actions.js';
import { openModal } from '../overlays/modals.js';
import { go, render } from '../shell/render.js';
import { toast } from '../ui/toast.js';
import { t } from '../i18n/index.js';
import { noteResults } from '../pages/notes.js';

const pending = new Map();
const timers = new Map();
const saving = new Map();
const queuedSaves = new Map();

export async function initNotes() {
  if (!window.mossDesktop?.notes) return;
  window.mossDesktop.notes.onActionRequested((action, id) => {
    if (action === 'convert') void A.convertNote({ dataset: { id } });
    else void A.deleteNote({ dataset: { id } });
  });
  const update = ids => {
    S.ui.pinnedNotes = new Set(ids);
    render();
  };
  update(await window.mossDesktop.notes.getPinned());
  window.mossDesktop.notes.onChanged(update);
  S.ui.noteShortcut = await window.mossDesktop.notes.getShortcut();
  if (S.ui.noteWindow) window.addEventListener('beforeunload', () => void saveNoteNow(S.ui.noteWindow));
}

export function flushPendingNote() {
  const editor = document.activeElement?.closest?.('[data-note-body]');
  if (editor) return saveNoteNow(editor.dataset.id);
}

A.newNote = async () => {
  if (S.ui.noteWindow) return;
  const result = await runCommand('note.create', {}, null, { render: false });
  if (!result) return;
  go('notes');
  setTimeout(() => $(`[data-note-body="${CSS.escape(result.affected.ids[0])}"]`)?.focus(), 0);
};

A.showNote = el => {
  if (S.ui.noteWindow) {
    const note = D().notes.find(item => item.id === el.dataset.id);
    if (note?.task) void window.mossDesktop?.notes?.showMain(`#task/${encodeURIComponent(note.task)}`);
    return;
  }
  go('notes', { id: el.dataset.id });
};

A.pinNote = async el => {
  await flushPendingNote();
  const pinned = !S.ui.pinnedNotes?.has(el.dataset.id);
  await window.mossDesktop?.notes?.setPinned(el.dataset.id, pinned);
};

A.closeNoteWindow = el => {
  void saveNoteNow(el.dataset.id).finally(async () => {
    const note = D().notes.find(item => item.id === el.dataset.id);
    if (note && !note.body.trim() && !note.task && !S.ui.pinnedNotes?.has(note.id)) await runCommand('note.delete', {}, note.id, { render: false });
    await window.mossDesktop?.notes?.close(el.dataset.id);
  });
};

A.convertNote = async el => {
  await saveNoteNow(el.dataset.id);
  if (S.ui.noteWindow) {
    await window.mossDesktop?.notes?.requestAction('convert', el.dataset.id);
    return;
  }
  const note = D().notes.find(item => item.id === el.dataset.id);
  const projects = visibleProjects();
  if (!note?.body.trim() || note.task || !projects.length) return;
  S.ui.noteForm = { project: projects[0].id, deleteAfter: false };
  openModal({ type: 'noteConvert', note: note.id });
};

A.submitNoteConvert = async () => {
  const modal = S.ui.modals.at(-1);
  if (modal?.type !== 'noteConvert' || S.ui.noteConverting) return;
  S.ui.noteConverting = true;
  const deleteAfter = !!S.ui.noteForm.deleteAfter;
  const result = await runCommand('note.convert', { projectId: S.ui.noteForm.project, deleteAfter }, modal.note);
  S.ui.noteConverting = false;
  if (result) {
    S.ui.modals.pop();
    if (deleteAfter) {
      if (S.ui.pinnedNotes?.has(modal.note)) await window.mossDesktop?.notes?.setPinned(modal.note, false);
      await window.mossDesktop?.notes?.close(modal.note);
    }
    toast(t(deleteAfter ? 'notes.convertedDeleted' : 'notes.converted'), {
      action: t('common.open'),
      onAction: () => A.openTask({ dataset: { id: result.affected.ids[1] } }),
    });
    render();
  }
};

A.deleteNote = async el => {
  const id = el.dataset.id;
  if (S.ui.noteWindow) {
    await window.mossDesktop?.notes?.requestAction('delete', id);
    return;
  }
  const note = D().notes.find(item => item.id === id);
  if (!note) return;
  const snap = snapshot();
  const wasPinned = S.ui.pinnedNotes?.has(id) ?? false;
  if (wasPinned) await window.mossDesktop?.notes?.setPinned(id, false);
  const result = await runCommand('note.delete', {}, id);
  if (!result) {
    if (wasPinned) await window.mossDesktop?.notes?.setPinned(id, true);
    return;
  }
  await window.mossDesktop?.notes?.close(id);
  const title = note.body.trim().split(/\r?\n/)[0]?.slice(0, 60) || t('nav.notes');
  toast(t('toast.deleted', { title }), {
    action: t('common.undo'),
    onAction: () => {
      void restore(snap).then(async () => {
        if (wasPinned) await window.mossDesktop?.notes?.setPinned(id, true);
      });
    },
  });
};

A.noteConvertChanged = () => {
  const button =
    document.querySelector(`[data-a="convertNote"][data-id="${CSS.escape(S.ui.noteWindow || '')}"]`) || document.querySelector('[data-a="convertNote"]');
  if (!button) return;
  const note = D().notes.find(item => item.id === button.dataset.id);
  button.disabled = !note || note.task || !(pending.get(note.id) ?? note.body).trim();
};

IN.noteQuery = el => {
  S.ui.noteQuery = el.value;
  const results = $('[data-note-results]');
  if (results) results.innerHTML = noteResults();
};

IN.noteForm = el => {
  S.ui.noteForm[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
};

IN.noteBody = el => {
  pending.set(el.dataset.id, el.value);
  A.noteConvertChanged();
  clearTimeout(timers.get(el.dataset.id));
  timers.set(
    el.dataset.id,
    setTimeout(() => void saveNoteNow(el.dataset.id), 500),
  );
};

BLUR.saveNote = el => void saveNoteNow(el.dataset.id);

async function saveNoteNow(id) {
  if (!id) return;
  if (saving.has(id)) return queuedSaves.get(id);
  const body = pending.get(id);
  if (body == null) return;
  const current = D().notes.find(note => note.id === id);
  if (!current) {
    pending.delete(id);
    return;
  }
  if (current.body.trim() === body.trim()) {
    pending.delete(id);
    clearTimeout(timers.get(id));
    timers.delete(id);
    return;
  }
  clearTimeout(timers.get(id));
  timers.delete(id);
  saving.set(id, body);
  pending.delete(id);
  S.ui.noteSaving = id;
  updateNoteStatus(id);
  let resolveQueued;
  const queued = new Promise(resolve => (resolveQueued = resolve));
  queuedSaves.set(id, queued);
  try {
    const result = await runCommand('note.patch', { body }, id, { render: false });
    if (result) updateNoteStatus(id);
  } finally {
    saving.delete(id);
    S.ui.noteSaving = null;
    updateNoteStatus(id);
    if (pending.has(id)) await saveNoteNow(id);
    if (queuedSaves.get(id) === queued) queuedSaves.delete(id);
    resolveQueued();
  }
}

function updateNoteStatus(id) {
  const card = document.querySelector(`[data-note-body="${CSS.escape(id)}"]`)?.closest('.note-card');
  const status = card?.querySelector('.note-meta span:last-child') || document.querySelector('.floating-note-f .note-meta');
  if (status) status.textContent = saving.has(id) ? t('common.loading') : t('notes.saved');
}

export function noteConversionModal(modal, heading) {
  const note = D().notes.find(item => item.id === modal.note);
  return `${heading(t('notes.toTask'))}<form class="modal-b" data-submit="submitNoteConvert"><div class="note-convert-preview">${esc(note?.body || '')}</div><div class="field"><label class="label" for="note-project">${t('common.project')}</label><select class="select" id="note-project" data-in="noteForm" data-f="project" autofocus>${visibleProjects()
    .map(project => `<option value="${project.id}" ${project.id === S.ui.noteForm.project ? 'selected' : ''}>${esc(project.name)}</option>`)
    .join(
      '',
    )}</select></div></form><div class="modal-f"><label class="note-convert-delete">${t('notes.deleteAfter')}<input type="checkbox" class="toggle" data-in="noteForm" data-f="deleteAfter" ${S.ui.noteForm.deleteAfter ? 'checked' : ''}></label><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${t('common.cancel')}</button><button class="btn btn-primary" data-a="submitNoteConvert">${t('notes.toTask')}</button></div>`;
}
