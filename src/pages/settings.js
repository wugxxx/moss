/* =====================================================================
   SETTINGS · APPEARANCE · LOCAL PROFILE · DATA & BACKUP
   ===================================================================== */
import { dOff, esc, fmtDate, fmtDateTime } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, labelColor, labelName, labels, me } from '../core/store.js';
import { av } from '../ui/helpers.js';
import { SHORTCUTS } from '../overlays/modals.js';
import { archiveBody } from '../features/archive.js';
import { workspace } from '../core/workspace-client.js';
import { render } from '../shell/render.js';
import { LOCALE_OPTIONS, t } from '../i18n/index.js';

export const SET_NAV = [
  [
    'settings.general',
    [
      ['appearance', 'settings.appearance', 'palette'],
      ['language', 'settings.language', 'languages'],
      ['datetime', 'settings.datetime', 'clock'],
    ],
  ],
  [
    'settings.work',
    [
      ['labels', 'settings.labels', 'tag'],
      ['archive', 'archive.title', 'archive'],
      ['preferences', 'settings.preferences', 'sliders-horizontal'],
    ],
  ],
  [
    'settings.personal',
    [
      ['profile', 'settings.localProfile', 'user'],
      ['shortcuts', 'settings.shortcuts', 'keyboard'],
    ],
  ],
  [
    'settings.localData',
    [
      ['data', 'settings.dataBackup', 'hard-drive'],
      ['about', 'settings.about', 'info'],
    ],
  ],
];

export function srow(t, d, ctl) {
  return `<div class="srow"><div><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div><div class="row">${ctl}</div></div>`;
}
export const tog = (k, on, src = 'pref') =>
  `<input type="checkbox" class="toggle" data-in="${src}Toggle" data-k="${k}" ${on ? 'checked' : ''} aria-label="${esc(t('settings.' + k, {}, k))}">`;
export const sel = (k, opts, v) =>
  `<select class="select" style="width:auto;min-width:180px" data-in="prefSel" data-k="${k}" aria-label="${esc(t('settings.' + k, {}, k))}">${opts
    .map(o => {
      const [val, n] = Array.isArray(o) ? o : [o, o];
      return `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${n}</option>`;
    })
    .join('')}</select>`;

export function pageSettings() {
  const sec = S.ui.params.sec || S.ui.settings || 'appearance';
  const title = SET_NAV.flatMap(g => g[1]).find(x => x[0] === sec) || ['appearance', 'settings.appearance'];
  return `<div class="set">
    <nav class="set-nav" aria-label="${t('settings.title')}">${SET_NAV.map(([g, items]) => `<div class="gh">${t(g)}</div>${items.map(([k, n, i]) => `<button class="sitem ${sec === k ? 'on' : ''}" data-a="go" data-r="settings" data-sec="${k}">${ic(i, 15)}<span>${t(n)}</span></button>`).join('')}`).join('')}</nav>
    <div class="set-body" data-keep="set:${sec}"><div class="set-in">${settingsBody(sec, t(title[1]))}</div></div>
  </div>`;
}

export function settingsBody(sec, title) {
  if (sec === 'data') return dataSettings(title);
  const P = S.prefs;
  const d = D();
  const H = lead => `<h1>${title}</h1><p class="lead">${lead}</p>`;
  switch (sec) {
    case 'appearance':
      return (
        H(t('settings.appearanceLead')) +
        `
      <div class="sblock" style="margin-top:0"><h2>${t('settings.theme')}</h2><div class="themecards" style="margin-top:12px" role="radiogroup" aria-label="${t('settings.theme')}">${[
        ['light', 'settings.light'],
        ['dark', 'settings.dark'],
        ['system', 'settings.system'],
      ]
        .map(([k, n]) => {
          const L = { bg: '#FBFAF8', s: '#F2F1EE', t: '#1D1C1A', b: '#E3E1DC', a: '#4B5BD6' },
            Dk = { bg: '#1D1D1C', s: '#151514', t: '#ECEAE5', b: '#333230', a: '#8E9AF3' };
          const pv = c =>
            `<div class="s" style="background:${c.s}"><i style="background:${c.b};width:70%"></i><i style="background:${c.a};width:55%"></i><i style="background:${c.b};width:80%"></i><i style="background:${c.b};width:60%"></i></div><div class="m" style="background:${c.bg}"><i style="background:${c.t};width:45%;height:7px"></i><i style="background:${c.b}"></i><i style="background:${c.b};width:80%"></i><i style="background:${c.a};width:30%;height:10px;margin-top:4px"></i></div>`;
          return `<button class="tcard ${P.theme === k ? 'on' : ''}" role="radio" aria-checked="${P.theme === k}" data-a="setTheme" data-v="${k}"><div class="tprev" style="${k === 'system' ? 'grid-template-columns:1fr 1fr;display:grid' : ''}">${k === 'system' ? `<div style="display:grid;grid-template-columns:30% 1fr">${pv(L)}</div><div style="display:grid;grid-template-columns:30% 1fr">${pv(Dk)}</div>` : pv(k === 'light' ? L : Dk)}</div><span class="row" style="font-weight:500;font-size:13px;gap:6px">${ic(k === 'light' ? 'sun' : k === 'dark' ? 'moon' : 'monitor', 14)}${t(n)}${P.theme === k ? `<span class="sp"></span><span style="color:var(--accent)">${ic('circle-check', 15)}</span>` : ''}</span></button>`;
        })
        .join('')}</div></div>
      <div class="sblock"><h2>${t('settings.accentColor')}</h2>${srow(
        t('settings.accent'),
        t('settings.accentHelp'),
        `<div class="swatches" role="radiogroup" aria-label="${t('settings.accentColor')}">${[
          ['indigo', '#4B5BD6'],
          ['blue', '#2F6CD4'],
          ['violet', '#7348CC'],
          ['teal', '#1A7F7A'],
          ['rose', '#B93D68'],
          ['graphite', '#34332F'],
        ]
          .map(
            ([k, c]) =>
              `<button class="sw ${P.accent === k ? 'on' : ''}" style="--c:${c}" role="radio" aria-checked="${P.accent === k}" data-a="setPref" data-k="accent" data-v="${k}" aria-label="${t('settings.accentColors.' + k)}" data-tip="${t('settings.accentColors.' + k)}">${P.accent === k ? ic('check', 13) : ''}</button>`,
          )
          .join('')}</div>`,
      )}</div>
      <div class="sblock"><h2>${t('settings.density')}</h2>
        ${srow(t('settings.sidebarDensity'), t('settings.compactHelp'), `<div class="seg">${['comfortable', 'compact'].map(k => `<button class="${P.side === k ? 'on' : ''}" data-a="setPref" data-k="side" data-v="${k}">${t('settings.' + k)}</button>`).join('')}</div>`)}
        ${srow(t('settings.taskDisplay'), t('settings.taskDisplayHelp'), `<div class="seg">${['comfortable', 'compact'].map(k => `<button class="${P.density === k ? 'on' : ''}" data-a="setPref" data-k="density" data-v="${k}">${t('settings.' + k)}</button>`).join('')}</div>`)}
        ${srow(
          t('settings.motion'),
          t('settings.motionHelp'),
          sel(
            'motion',
            [
              ['system', t('settings.followSystem')],
              ['reduce', t('settings.reduceMotion')],
            ],
            P.motion,
          ),
        )}
      </div>`
      );
    case 'language':
      return (
        H(t('settings.languageLead')) +
        srow(t('settings.language'), t('settings.languageHelp'), sel('language', LOCALE_OPTIONS, P.language || 'en')) +
        srow(t('settings.spellcheck'), t('settings.spellcheckHelp'), tog('spell', P.spell !== false))
      );
    case 'datetime':
      return (
        H(t('settings.datetimeLead')) +
        srow(
          t('settings.dateFormat'),
          t('settings.preview', { value: `<b>${fmtDate(dOff(8))}</b>` }),
          sel(
            'dateFmt',
            [
              ['MMM d', t('settings.dateExampleMonthDay')],
              ['d/M', '1/10'],
              ['M/d', '10/1'],
              ['yyyy-MM-dd', '2026-10-01'],
            ],
            P.dateFmt,
          ),
        ) +
        srow(
          t('settings.weekStart'),
          t('settings.weekStartHelp'),
          sel(
            'weekStart',
            [
              ['1', t('settings.monday')],
              ['0', t('settings.sunday')],
              ['6', t('settings.saturday')],
            ],
            P.weekStart,
          ),
        ) +
        srow(
          t('settings.timeFormat'),
          '',
          sel(
            'timeFmt',
            [
              ['12', t('settings.time12')],
              ['24', t('settings.time24')],
            ],
            P.timeFmt || '12',
          ),
        )
      );
    case 'labels':
      return labelsSettings(title);
    case 'archive':
      return H(t('archive.lead')) + archiveBody();
    case 'preferences':
      return (
        H(t('settings.preferencesLead')) +
        srow(
          t('settings.openOnLaunch'),
          t('settings.openOnLaunchHelp'),
          sel(
            'home',
            [
              ['home', t('nav.home')],
              ['tasks', t('nav.tasks')],
              ['projects', t('nav.projects')],
            ],
            ['home', 'tasks', 'projects'].includes(P.home) ? P.home : 'home',
          ),
        ) +
        srow(
          t('settings.openTasksIn'),
          t('settings.openTasksInHelp'),
          sel(
            'openTasks',
            [
              ['drawer', t('settings.sidePanel')],
              ['full', t('settings.fullPage')],
            ],
            P.openTasks,
          ),
        ) +
        srow(
          t('settings.defaultProjectView'),
          t('settings.defaultProjectViewHelp'),
          sel(
            'defaultTab',
            [
              ['overview', t('project.overview')],
              ['board', t('project.board')],
              ['list', t('project.list')],
              ['table', t('project.table')],
              ['calendar', t('project.calendar')],
              ['timeline', t('project.timeline')],
              ['files', t('project.files')],
            ],
            P.defaultTab || 'board',
          ),
        ) +
        srow(t('settings.confirmBeforeDelete'), '', tog('confirmDel', P.confirmDel !== false))
      );
    case 'profile': {
      const err = S.ui.errors.pname2;
      const owner = me();
      return (
        H(t('settings.profileLead')) +
        `<form data-submit="saveProfile" class="col" style="gap:16px;max-width:440px">
      <div class="row" style="gap:14px">${av(d.me, 'xl', false)}<div><div class="label" style="margin-bottom:6px">${t('settings.avatarColor')}</div><div class="swatches">${['#5A67D8', '#C54B78', '#3B82C4', '#23918A', '#C48A1E', '#8662C9'].map(c => `<button type="button" class="sw ${owner?.c === c ? 'on' : ''}" style="--c:${c};width:22px;height:22px" data-a="avColor" data-v="${c}" aria-label="${t('settings.avatarColor')}"></button>`).join('')}</div></div></div>
      <div class="field"><label class="label" for="pf-name">${t('settings.displayName')}</label><input class="input ${err ? 'is-error' : ''}" id="pf-name" value="${esc(owner?.name || '')}">${err ? `<span class="err">${ic('circle-alert', 12)}${err}</span>` : ''}</div>
      <div class="field"><label class="label" for="pf-title">${t('settings.titleRole')}</label><input class="input" id="pf-title" value="${esc(owner?.title || '')}"><span class="hint">${t('settings.profileHint')}</span></div>
      <div><button class="btn btn-primary" data-a="saveProfile" id="pf-save">${t('settings.saveProfile')}</button></div></form>`
      );
    }
    case 'shortcuts':
      return (
        H(t('settings.shortcutsLead')) +
        SHORTCUTS.map(
          ([g, list]) =>
            `<div class="sblock" style="margin-top:18px"><h2>${t(g)}</h2>${list.map(([n, k]) => `<div class="srow" style="padding:9px 0"><span>${t(n)}</span><span class="row" style="gap:4px">${k.map((x, i) => `${i && k[0] === 'G' ? `<span class="faint" style="font-size:11px">${t('settings.then')}</span>` : ''}<kbd>${x}</kbd>`).join('')}</span></div>`).join('')}</div>`,
        ).join('')
      );
    case 'about':
      return (
        H(t('settings.aboutLead')) +
        `<div class="sblock" style="margin-top:0"><h2>Moss</h2>
        ${srow(t('settings.version'), t('settings.localDesktopBuild'), '<span class="mono muted">1.0.0</span>')}
        ${srow(t('settings.storage'), window.mossDesktop ? t('settings.desktopStorageDetail') : t('settings.browserStorageDetail'), `<span class="badge">${ic('database', 11)}${window.mossDesktop ? 'SQLite' : t('settings.browser')}</span>`)}
        ${srow(t('settings.desktopShell'), window.mossDesktop ? t('settings.electronDetail') : t('settings.desktopShellDetail'), `<span class="muted">${window.mossDesktop ? 'Electron' : t('settings.web')}</span>`)}
        </div>
        <div class="alert info" style="margin-top:18px">${ic('info', 15)}<span>${t('settings.aboutInfo')}</span></div>`
      );
  }
  return settingsBody('appearance', t('settings.appearance'));
}

function labelsSettings(title) {
  const items = labels();
  const counts = new Map(
    D().tasks.reduce((acc, task) => {
      for (const id of task.labels) acc.set(id, (acc.get(id) || 0) + 1);
      return acc;
    }, new Map()),
  );
  const rows = items
    .map((item, index) => {
      const used = counts.get(item.id) || 0;
      return `<div class="label-row">
        <span class="label-swatch" style="--c:${labelColor(item)}"><i></i></span>
        <div class="grow" style="min-width:0">
          <div class="label-name trunc">${esc(labelName(item))}</div>
          <div class="faint" style="font-size:12px">${t('settings.labelUsage', { count: used })}</div>
        </div>
        <div class="label-row-actions">
          <button id="label-up-${esc(item.id)}" class="ibtn ibtn-sm" data-a="labelUp" data-id="${esc(item.id)}" ${index === 0 ? 'disabled' : ''} aria-label="${t('settings.moveLabelUp', { name: esc(labelName(item)) })}">${ic('arrow-up', 14)}</button>
          <button id="label-down-${esc(item.id)}" class="ibtn ibtn-sm" data-a="labelDown" data-id="${esc(item.id)}" ${index === items.length - 1 ? 'disabled' : ''} aria-label="${t('settings.moveLabelDown', { name: esc(labelName(item)) })}">${ic('arrow-down', 14)}</button>
          <button id="label-edit-${esc(item.id)}" class="ibtn ibtn-sm" data-a="editLabel" data-id="${esc(item.id)}" aria-label="${t('settings.editLabel', { name: esc(labelName(item)) })}">${ic('pencil', 14)}</button>
          <button id="label-delete-${esc(item.id)}" class="ibtn ibtn-sm danger" data-a="deleteLabel" data-id="${esc(item.id)}" aria-label="${t('settings.deleteLabel', { name: esc(labelName(item)) })}">${ic('trash-2', 14)}</button>
        </div>
      </div>`;
    })
    .join('');
  return `<h1>${title}</h1><p class="lead">${t('settings.labelsLead')}</p>
    <div class="sblock" style="margin-top:0">
      <div class="label-manager-head">
        <div><h2>${t('settings.allLabels')}</h2><p class="hint">${t('settings.labelsOrderHelp')}</p></div>
        <button class="btn btn-primary btn-sm" data-a="newLabel">${ic('plus', 14)}${t('settings.addLabel')}</button>
      </div>
      ${rows ? `<div class="label-list">${rows}</div>` : `<div class="label-empty">${ic('tag', 20)}<b>${t('settings.noLabels')}</b><span>${t('settings.noLabelsHelp')}</span></div>`}
    </div>`;
}

function dataSettings(title) {
  const current = S.ui.sync;
  if (!current) {
    const requestId = (S.ui.syncRequestId || 0) + 1;
    S.ui.syncRequestId = requestId;
    void workspace
      .syncStatus()
      .then(sync => {
        if (S.ui.syncRequestId !== requestId) return;
        S.ui.sync = sync;
        if (S.ui.route === 'settings' && S.ui.params.sec === 'data') render();
      })
      .catch(error => {
        if (S.ui.syncRequestId !== requestId) return;
        S.ui.sync = {
          state: 'error',
          pending: 0,
          configured: false,
          lastError: error instanceof Error ? error.message : String(error),
        };
        if (S.ui.route === 'settings' && S.ui.params.sec === 'data') render();
      });
    return `<h1>${title}</h1><p class="lead">${t('settings.loadingSync')}</p>`;
  }

  const P = S.prefs;
  const d = D();
  const raw = JSON.stringify({ data: d, prefs: P, views: S.views });
  const size = new Blob([raw]).size;
  const sizeLabel = size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  const sync = current;
  const pending = sync.pending || 0;
  const conflicts = sync.conflictCount || 0;
  const failed = sync.failedCount || 0;
  const syncState =
    {
      local: t('settings.syncLocalOnly'),
      syncing: t('settings.syncing'),
      synced: t('settings.upToDate'),
      offline: t('settings.offline'),
      error: t('settings.needsAttention'),
    }[sync.state] || t('settings.syncLocalOnly');
  const syncDetail = !sync.configured
    ? t('settings.syncNoEndpoint')
    : sync.lastError
      ? `${esc(sync.lastError)}${sync.lastSyncedAt ? ` ${t('settings.lastSuccessfulSync', { date: esc(fmtDateTime(sync.lastSyncedAt, P.timeFmt)) })}` : ''}`
      : conflicts || failed
        ? t('settings.syncReview', { conflicts, failed })
        : pending
          ? t('settings.syncPending', { count: pending })
          : sync.lastSyncedAt
            ? t('settings.allSynced', { date: esc(fmtDateTime(sync.lastSyncedAt, P.timeFmt)) })
            : t('settings.syncReady');
  const storage = window.mossDesktop
    ? { name: t('settings.desktopWorkspace'), detail: t('settings.desktopWorkspaceDetail'), badge: t('settings.sqliteLocal') }
    : { name: t('settings.browserWorkspace'), detail: t('settings.browserWorkspaceDetail'), badge: t('settings.browserLocal') };
  return (
    `<h1>${title}</h1><p class="lead">${t('settings.dataLead')}</p>` +
    `<div class="sblock" style="margin-top:0"><h2>${t('settings.backup')}</h2>
    ${srow(t('settings.exportLocalData'), t('settings.exportHelp', { projects: d.projects.length, tasks: d.tasks.length }), `<button class="btn btn-primary btn-sm" data-a="exportData">${ic('download', 14)}${t('settings.exportJson')}</button>`)}
    ${srow(t('settings.importBackup'), t('settings.importHelp'), `<label class="btn btn-secondary btn-sm" style="cursor:pointer">${ic('upload', 14)}${t('settings.importJson')}<input type="file" accept="application/json,.json" hidden data-in="importData"></label>`)}
    </div>
    <div class="sblock"><h2>${t('settings.storage')}</h2>
    ${srow(storage.name, storage.detail, `<span class="badge green">${ic('hard-drive', 11)}${storage.badge}</span>`)}
    ${srow(t('settings.localDataSize'), t('settings.localStorageHelp', { size: sizeLabel }), `<span class="muted" style="font-size:12px">${t('settings.onDevice')}</span>`)}
    ${srow(
      t('settings.cloudSync'),
      syncDetail,
      `<span class="badge ${sync.state === 'error' ? 'red' : sync.state === 'synced' ? 'green' : ''}">${ic(
        sync.state === 'synced' ? 'cloud-check' : sync.state === 'offline' ? 'cloud-off' : sync.state === 'error' ? 'circle-alert' : 'cloud',
        11,
      )}${syncState}${pending ? ` · ${t('settings.pendingCount', { count: pending })}` : ''}</span>${
        sync.configured && window.mossDesktop
          ? `<div class="row" style="gap:8px">${
              failed
                ? `<button class="btn btn-secondary btn-sm" data-a="retryFailedSync" ${sync.state === 'syncing' ? 'disabled' : ''}>${ic('rotate-cw', 14)}${t('settings.retryFailed')}</button>`
                : ''
            }<button class="btn btn-secondary btn-sm" data-a="syncNow" ${sync.state === 'syncing' ? 'disabled' : ''}>${ic('refresh-cw', 14)}${
              sync.state === 'syncing' ? t('settings.syncingEllipsis') : t('settings.syncNow')
            }</button></div>`
          : ''
      }`,
    )}
    </div>
    <div class="sblock"><h2 style="color:var(--red)">${t('settings.reset')}</h2>
    ${srow(t('settings.resetLocalData'), t('settings.resetHelp'), `<button class="btn btn-danger-ghost btn-sm" style="border:1px solid color-mix(in srgb,var(--red) 35%,transparent)" data-a="resetLocalData">${ic('rotate-ccw', 14)}${t('settings.resetWorkspace')}</button>`)}
    </div>`
  );
}
