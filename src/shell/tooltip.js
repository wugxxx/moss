/* =====================================================================
   TOOLTIPS: float collapsed sidebar labels above the app shell so the
   nav's overflow clipping cannot cover them.
   ===================================================================== */
const DELAY = 350;
let tip = null;
let target = null;
let timer = 0;

function node() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'tooltip-float';
  tip.hidden = true;
  tip.setAttribute('aria-hidden', 'true');
  document.body.append(tip);
  return tip;
}

const collapsedTip = el => (el?.closest('.shell.collapsed .side') ? el : null);

function hide() {
  clearTimeout(timer);
  timer = 0;
  target = null;
  if (tip) tip.hidden = true;
}

function place(el) {
  const el2 = node();
  el2.textContent = el.dataset.tip;
  el2.hidden = false;
  const r = el.getBoundingClientRect();
  const w = el2.offsetWidth;
  const h = el2.offsetHeight;
  let left = r.right + 8;
  if (left + w > innerWidth - 8) left = r.left - w - 8;
  const top = Math.max(8, Math.min(r.top + r.height / 2 - h / 2, innerHeight - h - 8));
  el2.style.left = `${Math.max(8, left)}px`;
  el2.style.top = `${top}px`;
}

function schedule(el) {
  hide();
  target = el;
  timer = setTimeout(() => {
    timer = 0;
    if (target === el && el.isConnected) place(el);
  }, DELAY);
}

document.addEventListener('mouseover', e => {
  const el = collapsedTip(e.target.closest?.('[data-tip]'));
  if (!el) {
    if (target) hide();
    return;
  }
  if (el !== target) schedule(el);
});
document.addEventListener('mouseout', e => {
  if (!target) return;
  if (e.relatedTarget instanceof Node && target.contains(e.relatedTarget)) return;
  hide();
});
document.addEventListener('focusin', e => {
  const el = collapsedTip(e.target.closest?.('[data-tip]'));
  if (el) schedule(el);
});
document.addEventListener('focusout', hide);
document.addEventListener('scroll', hide, true);
document.addEventListener('click', hide, true);
addEventListener('resize', hide);

const app = document.getElementById('app');
if (app) {
  new MutationObserver(() => {
    if (target && !target.isConnected) hide();
  }).observe(app, { childList: true });
}
