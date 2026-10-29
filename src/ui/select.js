/* =====================================================================
   SELECT: every <select class="select"> renders as the design-system
   dropdown (trigger button + .pop menu) instead of the browser's native list.
   The native <select> stays in the DOM, visually hidden, as the source of
   truth, so existing `data-in` handlers and form reads keep working.
   ===================================================================== */
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { t } from '../i18n/index.js';

export function enhanceSelects(root = document) {
  for (const sel of root.querySelectorAll('select.select:not([data-enhanced])')) {
    sel.dataset.enhanced = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'select select-btn';
    btn.setAttribute('style', sel.getAttribute('style') || '');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute(
      'aria-label',
      sel.getAttribute('aria-label') || (sel.id && document.querySelector(`label[for="${CSS.escape(sel.id)}"]`)?.textContent) || t('common.choose'),
    );
    if (sel.id) btn.dataset.for = sel.id;
    const sync = () => {
      btn.innerHTML = `<span class="trunc">${esc(sel.options[sel.selectedIndex]?.text || '')}</span>`;
    };
    sync();
    sel.classList.add('select-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    sel.after(btn);
    sel.addEventListener('change', sync);
    btn.addEventListener('click', e => {
      e.stopPropagation();
      selectMenu.toggle(sel, btn);
    });
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        selectMenu.open(sel, btn);
      }
    });
  }
}

export const selectMenu = {
  el: null,
  sel: null,
  btn: null,
  toggle(sel, btn) {
    this.sel === sel && this.el ? this.close() : this.open(sel, btn);
  },
  open(sel, btn) {
    this.close();
    const menu = document.createElement('div');
    menu.className = 'pop select-menu enter';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('data-pop-root', '');
    menu.innerHTML = [...sel.options]
      .map(
        (o, i) =>
          `<button type="button" class="mi" role="option" data-i="${i}" aria-selected="${o.selected}"><span class="trunc grow">${esc(o.text)}</span>${o.selected ? `<span class="ck">${ic('check', 14)}</span>` : ''}</button>`,
      )
      .join('');
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    menu.style.minWidth = Math.max(r.width, 160) + 'px';
    const h = menu.offsetHeight,
      w = menu.offsetWidth;
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    menu.style.top = (r.bottom + 4 + h > innerHeight - 8 ? Math.max(8, r.top - 4 - h) : r.bottom + 4) + 'px';
    menu.addEventListener('mousedown', e => e.preventDefault());
    menu.addEventListener('click', e => {
      const it = e.target.closest('.mi');
      if (!it) return;
      e.stopPropagation();
      this.pick(+it.dataset.i);
    });
    menu.addEventListener('keydown', e => {
      const items = [...menu.querySelectorAll('.mi')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[Math.min(items.length - 1, i + 1)]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[Math.max(0, i - 1)]?.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
      } else if (e.key === 'Tab') this.close();
    });
    Object.assign(this, { el: menu, sel, btn });
    btn.setAttribute('aria-expanded', 'true');
    (menu.querySelector('[aria-selected="true"]') || menu.querySelector('.mi'))?.focus({ preventScroll: true });
  },
  pick(i) {
    const { sel, btn } = this;
    this.close(true);
    if (!sel || sel.selectedIndex === i) return;
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (btn.isConnected) btn.focus({ preventScroll: true });
  },
  close(refocus) {
    if (!this.el) return;
    this.el.remove();
    this.btn?.setAttribute('aria-expanded', 'false');
    if (refocus && this.btn?.isConnected) this.btn.focus({ preventScroll: true });
    this.el = this.sel = this.btn = null;
  },
};
document.addEventListener(
  'mousedown',
  e => {
    if (selectMenu.el && !selectMenu.el.contains(e.target) && !e.target.closest('.select-btn')) selectMenu.close();
  },
  true,
);
addEventListener('resize', () => selectMenu.close());
document.addEventListener(
  'scroll',
  e => {
    if (selectMenu.el && !selectMenu.el.contains(e.target)) selectMenu.close();
  },
  true,
);
