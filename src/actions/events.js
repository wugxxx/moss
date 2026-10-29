/* =====================================================================
   EVENT WIRING
   ===================================================================== */
import { $$ } from '../core/utils.js';
import { S } from '../core/store.js';
import { render } from '../shell/render.js';
import { A, BLUR, DBL, IN } from './actions.js';

document.addEventListener(
  'click',
  e => {
    if (S.ui.suppressClick) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const el = e.target.closest('[data-a]');
    const inPop = e.target.closest('[data-pop-root]');
    if (S.ui.pop && !inPop) {
      const trig = el && (el.dataset.a === 'pop' || el.dataset.a === 'ctxBtn' || el.dataset.a === 'addFilter');
      if (!trig) {
        S.ui.pop = null;
        if (!el) {
          render();
          return;
        }
      }
    }
    if (!el) return;
    if (el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && el.type === 'checkbox' && el.dataset.a)) e.preventDefault();
    const fn = A[el.dataset.a];
    if (fn) {
      e.stopPropagation();
      fn(el, e);
    }
  },
  false,
);
document.addEventListener('dblclick', e => {
  const el = e.target.closest('[data-dbl]');
  if (el && DBL[el.dataset.dbl]) DBL[el.dataset.dbl](el, e);
});
document.addEventListener('contextmenu', e => {
  const el = e.target.closest('[data-ctx]');
  if (!el || e.target.closest('input,textarea,[contenteditable]')) return;
  e.preventDefault();
  S.ui.pop = { type: 'ctx', ctx: el.dataset.ctx, id: el.dataset.id, key: el.dataset.key, vid: el.dataset.vid, x: e.clientX, y: e.clientY, top: e.clientY };
  if (el.dataset.ctx === 'column') S.ui.pop.key = el.dataset.key;
  render();
});
export const isChangeEl = el => el.matches('select, input[type=checkbox], input[type=radio], input[type=file], input[type=date]');
document.addEventListener('input', e => {
  const el = e.target;
  if (!el.dataset || !el.dataset.in || isChangeEl(el)) return;
  IN[el.dataset.in]?.(el, e);
});
document.addEventListener('change', e => {
  const el = e.target;
  if (!el.dataset || !el.dataset.in || !isChangeEl(el)) return;
  IN[el.dataset.in]?.(el, e);
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const n = f.dataset.submit;
  if (n && A[n]) A[n](f, e);
});
document.addEventListener('focusout', e => {
  const el = e.target;
  if (el?.dataset?.blur && BLUR[el.dataset.blur]) BLUR[el.dataset.blur](el);
});
document.addEventListener('mouseover', e => {
  const el = e.target.closest?.('[data-hover-i]');
  if (!el || !S.ui.palette) return;
  const i = +el.dataset.hoverI;
  if (S.ui.palette.hl === i) return;
  S.ui.palette.hl = i;
  $$('.pi.hl').forEach(x => x.classList.remove('hl'));
  el.classList.add('hl');
});
addEventListener('resize', () => {
  if (S.ui.pop) {
    S.ui.pop = null;
    render();
  }
});
try {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (S.prefs.theme === 'system') render();
  });
} catch {
  /* not supported here; safe to skip */
}
