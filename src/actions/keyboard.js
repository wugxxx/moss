/* ---------- keyboard ---------- */
import { $, $$ } from '../core/utils.js';
import { STATUSES } from '../core/constants.js';
import { S } from '../core/store.js';
import { go, render } from '../shell/render.js';
import { closeModal } from '../overlays/modals.js';
import { closePop } from '../overlays/popovers.js';
import { A, KEY } from './actions.js';

export let gPending = 0;
document.addEventListener('keydown', e => {
  const mod = e.metaKey || e.ctrlKey;
  const t = e.target;
  const typing = t.matches?.('input, textarea, select, [contenteditable="true"]');
  const pl = S.ui.palette;
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    pl ? A.closePalette() : A.openPalette();
    return;
  }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    A.toggleDark();
    return;
  }
  // Keep Tab inside whichever surface is modal right now.
  if (e.key === 'Tab') {
    const box = pl ? $('.palette') : S.ui.modals.length ? $$('.modal').pop() : S.ui.drawer && S.ui.drawerFull ? $('.drawer') : null;
    if (box && !pl) {
      const f = [
        ...box.querySelectorAll(
          'a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]',
        ),
      ].filter(x => x.offsetParent !== null);
      if (f.length) {
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          f[f.length - 1].focus();
          return;
        }
        if (!e.shiftKey && (i === f.length - 1 || i === -1)) {
          e.preventDefault();
          f[0].focus();
          return;
        }
      }
    }
  }
  // Arrow keys move through open menus and pickers.
  if (S.ui.pop && !pl && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End')) {
    const items = $$('.pop.floating .mi:not(:disabled), .pop.floating .valbtn, .pop.floating [data-a="popPick"]').filter(x => x.offsetParent !== null);
    if (items.length) {
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      const n =
        e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[n].focus();
      return;
    }
  }
  if (pl) {
    const n = pl._flat?.length || 0;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      pl.hl = (pl.hl + 1) % Math.max(n, 1);
      render();
      $('.pi.hl')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      pl.hl = (pl.hl - 1 + n) % Math.max(n, 1);
      render();
      $('.pi.hl')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      A.palRun({ dataset: { i: pl.hl } });
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      A.closePalette();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      pl.mode = pl.mode === 'cmd' ? 'search' : 'cmd';
      pl.hl = 0;
      render();
      return;
    }
    if (e.key === 'Backspace' && !pl.q && pl.mode !== 'cmd') {
      e.preventDefault();
      pl.mode = 'cmd';
      render();
      return;
    }
    return;
  }
  if (e.key === 'Escape') {
    if (S.ui.pop) {
      closePop();
      return;
    }
    if (S.ui.editCell) {
      S.ui.editCell = null;
      render();
      return;
    }
    if (S.ui.composer) {
      A.cancelComposer();
      return;
    }
    if (S.ui.modals.length) {
      closeModal();
      return;
    }
    if (S.ui.subOpen) {
      if (typing) t.blur();
      S.ui.lastSub = S.ui.subOpen.sid;
      A.closeSub();
      return;
    }
    if (S.ui.drawer) {
      if (typing) t.blur();
      A.closeDrawer();
      return;
    }
    if (S.ui.mnav) {
      A.closeMnav();
      return;
    }
    if (S.ui.sel.size) {
      A.clearSel();
      return;
    }
    if (typing) t.blur();
    return;
  }
  if (mod && e.key === 'Enter') {
    const top = S.ui.modals[S.ui.modals.length - 1];
    if (top?.type === 'task') {
      e.preventDefault();
      A.submitTask();
      return;
    }
    if (top?.type === 'project') {
      e.preventDefault();
      A.submitProject();
      return;
    }
    if (t.dataset?.keyModEnter) {
      e.preventDefault();
      KEY[t.dataset.keyModEnter]?.(t);
      return;
    }
  }
  if (e.key === 'Enter' && !e.shiftKey && t.dataset?.keyEnter) {
    e.preventDefault();
    KEY[t.dataset.keyEnter]?.(t);
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && t.matches?.('[role="button"], [role="link"]') && t.tagName !== 'BUTTON') {
    e.preventDefault();
    t.click();
    return;
  }
  if (typing || mod || e.altKey) return;
  // number keys inside status popover
  if (S.ui.pop?.type === 'status' && /^[1-5]$/.test(e.key)) {
    A.popPick({ dataset: { v: STATUSES[+e.key - 1].id } });
    return;
  }
  const k = e.key;
  if (gPending && Date.now() - gPending < 1200) {
    gPending = 0;
    const map = { h: 'home', t: 'tasks', p: 'projects', c: 'calendar', s: 'settings' };
    if (map[k.toLowerCase()]) {
      e.preventDefault();
      go(map[k.toLowerCase()]);
    }
    return;
  }
  if (S.ui.modals.length) return;
  if (k === 'g' || k === 'G') {
    gPending = Date.now();
    return;
  }
  if (k === '/') {
    e.preventDefault();
    A.openSearch();
    return;
  }
  if (k === 'n' || k === 'N') {
    e.preventDefault();
    A.newTask();
    return;
  }
  if (k === 'p' || k === 'P') {
    e.preventDefault();
    A.newProject();
    return;
  }
  if (k === '?') {
    e.preventDefault();
    A.shortcuts();
    return;
  }
  if (k === '[') {
    e.preventDefault();
    A.toggleSide();
    return;
  }
  if ((k === 'e' || k === 'E') && S.ui.drawer) {
    e.preventDefault();
    A.editTask({ dataset: { id: S.ui.drawer } });
    return;
  }
});
