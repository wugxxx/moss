/* =====================================================================
   ACTIONS · ARCHIVE: restore and purge
   ===================================================================== */
import { esc } from '../core/utils.js';
import { task } from '../core/store.js';
import { toast } from '../ui/toast.js';
import { workspace } from '../core/workspace-client.js';
import { A, confirmDlg, runCommand } from './actions.js';
import { t as tr } from '../i18n/index.js';

A.restoreTask = el => {
  const t = task(el.dataset.id);
  void runCommand('task.restore', {}, t.id).then(result => {
    if (result) toast(tr('toast.restoredTask', { title: t.title }), { action: tr('common.open'), onAction: () => A.openTask({ dataset: { id: t.id } }) });
  });
};
A.purgeTask = el => {
  const t = task(el.dataset.id);
  confirmDlg({
    title: tr('toast.permanentlyDeleteTaskQuestion'),
    body: tr('toast.permanentlyDeleteTaskBody', { title: esc(t.title) }),
    ok: tr('archive.deletePermanently'),
    danger: true,
    run: () => {
      void runCommand('task.delete', {}, t.id).then(async result => {
        if (!result) return;
        await Promise.all(t.attachments.map(a => (a.storageKey ? workspace.attachments?.remove(a.storageKey).catch(() => {}) : null)));
        toast(tr('toast.deleted', { title: t.title }));
      });
    },
  });
};
