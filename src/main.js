/* =====================================================================
   ENTRY: styles, then every module in dependency order (several register
   global listeners or add handlers to the action table when they load), then boot.
   ===================================================================== */
import './styles/index.css';
import './core/utils.js';
import './core/icons.js';
import './core/constants.js';
import './data/seed.js';
import './core/store.js';
import './ui/helpers.js';
import './core/theme.js';
import './ui/toast.js';
import './ui/select.js';
import './shell/render.js';
import './shell/layout.js';
import './shell/skeletons.js';
import './shell/view-engine.js';
import './components/task-list.js';
import './pages/home.js';
import './pages/tasks.js';
import './pages/favorites.js';
import './pages/projects.js';
import './pages/search.js';
import './pages/errors.js';
import './pages/project.js';
import './views/project-overview.js';
import './views/board.js';
import './views/table.js';
import './views/calendar.js';
import './views/timeline.js';
import './views/files.js';
import './overlays/drawer.js';
import './overlays/modals.js';
import './overlays/popovers.js';
import './overlays/context-menu.js';
import './overlays/palette.js';
import './pages/settings.js';
import './actions/actions.js';
import './actions/events.js';
import './actions/keyboard.js';
import './actions/drag-drop.js';
import './features/subtasks.js';
import './features/archive.js';
import './actions/subtasks.js';
import './actions/archive.js';
import { D, S, initWorkspaceClient } from './core/store.js';
import { A } from './actions/actions.js';
import { ROUTE_NAMES, render, go } from './shell/render.js';
import { toast } from './ui/toast.js';
import { workspace } from './core/workspace-client.js';
import { setLocale, t } from './i18n/index.js';

document.documentElement.dataset.platform = window.mossDesktop?.platform ?? 'web';

async function boot() {
  try {
    await initWorkspaceClient();
    workspace.onSyncStatus(sync => {
      const previous = S.ui.sync;
      S.ui.sync = sync;
      if (S.ui.route === 'settings' && S.ui.params.sec === 'data') {
        S.data = workspace.snapshot();
        render();
      }
      if (previous?.state === 'syncing' && sync.state === 'synced' && S.ui.route !== 'settings') render();
    });
    workspace.onChangePending(() => {
      S.data = workspace.snapshot();
      if (S.ui.route !== 'settings') render();
    });
    setLocale(S.prefs.language);
    if (!document.getElementById('sr-live')) {
      const l = document.createElement('div');
      l.id = 'sr-live';
      l.className = 'sr';
      l.setAttribute('aria-live', 'polite');
      document.body.appendChild(l);
    }
    const h = (location.hash || '').slice(1);
    S.ui.route = h && ROUTE_NAMES[h] ? h : S.prefs.home || 'home';
    render();
  } catch (error) {
    console.error('Failed to initialize the workspace', error);
    toast(error instanceof Error ? error.message : t('errors.failedBody'), { kind: 'err', ms: 10000 });
  }
}

void boot();

// Local diagnostics for development and the packaged desktop renderer.
if (import.meta.env.DEV || window.mossDesktop) {
  window.__moss = { S, D, A, go, render, workspace };
}
