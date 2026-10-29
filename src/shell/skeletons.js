/* ---------- skeletons (loading states) ---------- */
import { S } from '../core/store.js';
import { t } from '../i18n/index.js';

export const sk = (w, h = 10, extra = '') => `<span class="sk" style="width:${w};height:${h}px;${extra}"></span>`;
export function skRows(n = 8) {
  return Array.from(
    { length: n },
    (_, i) =>
      `<div class="row" style="height:40px;border-bottom:1px solid var(--divider);gap:12px;padding:0 8px">${sk('15px', 15, 'border-radius:4px')}${sk(38 + ((i * 13) % 30) + '%', 10)}<span class="sp"></span>${sk('70px', 18, 'border-radius:5px')}${sk('22px', 22, 'border-radius:50%')}${sk('54px', 10)}</div>`,
  ).join('');
}
export function skCards(n = 6) {
  return `<div class="pgrid">${Array.from({ length: n }, () => `<div class="pcard" style="cursor:default">${sk('28px', 28, 'border-radius:7px')}${sk('60%', 12)}${sk('90%', 9)}${sk('70%', 9)}${sk('100%', 4)}</div>`).join('')}</div>`;
}
export function skBoard() {
  return `<div class="board">${[3, 4, 3, 2, 3].map(n => `<div class="bcol"><div class="bcol-h">${sk('80px', 11)}</div><div class="bcol-b">${Array.from({ length: n }, (_, i) => `<div class="kcard" style="cursor:default">${sk('40%', 14, 'border-radius:5px')}${sk(((60 + i * 9) % 95) + '%', 10)}<div class="row">${sk('40px', 9)}${sk('30px', 9)}<span class="sp"></span>${sk('18px', 18, 'border-radius:50%')}</div></div>`).join('')}</div></div>`).join('')}</div>`;
}
export function skeleton() {
  const r = S.ui.route,
    tab = S.ui.params.tab;
  const head = `<div class="ph"><div class="col" style="gap:8px">${sk('220px', 20)}${sk('320px', 11)}</div></div>`;
  let body;
  if (r === 'project') {
    const ph = `<div class="proj-h"><div class="t">${sk('36px', 36, 'border-radius:9px')}${sk('200px', 18)}</div><div class="row" style="gap:16px;padding-bottom:10px">${sk('60px', 10)}${sk('50px', 10)}${sk('50px', 10)}${sk('60px', 10)}</div></div><div class="toolbar">${sk('200px', 22)}</div>`;
    return `<div class="page flush" aria-busy="true">${ph}${tab === 'board' ? skBoard() : `<div style="padding:12px 20px">${skRows(10)}</div>`}</div>`;
  }
  if (r === 'projects') body = skCards(6);
  else if (r === 'home' || r === 'overview')
    body = `<div class="stats" style="margin-bottom:16px">${Array.from({ length: 4 }, () => `<div class="stat">${sk('80px', 10)}${sk('44px', 20)}</div>`).join('')}</div><div class="grid2"><div class="panel" style="padding:14px">${skRows(6)}</div><div class="panel" style="padding:14px">${skRows(6)}</div></div>`;
  else body = skRows(10);
  return `<div class="page" aria-busy="true" aria-label="${t('common.loading')}">${head}${body}</div>`;
}
