/* =====================================================================
   ACTIONS · SUBTASKS: open, navigate, rename, notes, promote
   ===================================================================== */
import { $ } from '../core/utils.js';
import { S, task } from '../core/store.js';
import { toast } from '../ui/toast.js';
import { render } from '../shell/render.js';
import { A, BLUR, IN, runCommand } from './actions.js';
import { t as tr } from '../i18n/index.js';

export const subOf = (t, sid) => t && t.subtasks.find(s => s.id === sid);
A.openSub = el => {
  S.ui.subOpen = { tid: el.dataset.id, sid: el.dataset.sid };
  S.ui.pop = null;
  render();
  setTimeout(() => $('#s-title')?.focus(), 0);
};
A.closeSub = () => {
  S.ui.lastSub = S.ui.subOpen?.sid;
  S.ui.subOpen = null;
  render();
};
export const _rmSub = A.rmSub;
A.rmSub = el => {
  if (S.ui.subOpen?.sid === el.dataset.sid) {
    S.ui.subOpen = null;
  }
  _rmSub(el);
};
A.subNav = el => {
  const t = task(el.dataset.id);
  const i = t.subtasks.findIndex(s => s.id === S.ui.subOpen?.sid) + +el.dataset.d;
  if (t.subtasks[i]) {
    S.ui.subOpen = { tid: t.id, sid: t.subtasks[i].id };
    render();
  }
};
BLUR.commitSubTitle = el => {
  const t = task(el.dataset.id);
  const s = subOf(t, el.dataset.sid);
  const v = el.value.trim();
  if (s && v && v !== s.title) {
    void runCommand(
      'task.patch',
      {
        patch: {
          subtasks: t.subtasks.map(item => (item.id === s.id ? { ...item, title: v } : item)),
        },
      },
      t.id,
    );
  }
};
IN.subNote = el => {
  const t = task(el.dataset.id);
  const s = subOf(t, el.dataset.sid);
  if (s) {
    void runCommand(
      'task.patch',
      {
        patch: {
          subtasks: t.subtasks.map(item => (item.id === s.id ? { ...item, note: el.value } : item)),
        },
      },
      t.id,
    );
  }
};
A.promoteSub = el => {
  const t = task(el.dataset.id);
  const s = subOf(t, el.dataset.sid);
  if (!s) return;
  void runCommand('subtask.promote', { subtaskId: s.id }, t.id).then(result => {
    if (!result) return;
    S.ui.subOpen = null;
    render();
    const id = result.affected.ids[0];
    toast(tr('toast.convertedToTask'), {
      action: tr('common.open'),
      onAction: () => A.openTask({ dataset: { id } }),
    });
  });
};
