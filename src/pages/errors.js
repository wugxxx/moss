/* ---------- 404 / DENIED / FAILED ---------- */
import { ic } from '../core/icons.js';
import { t } from '../i18n/index.js';

export function page404() {
  return `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('file-question', 20)}</div></div><span class="code">ERROR 404</span><h1>${t('errors.notFound')}</h1><p>${t('errors.notFoundBody')}</p><div class="row"><button class="btn btn-secondary" data-a="back">${ic('arrow-left', 14)}${t('errors.goBack')}</button><button class="btn btn-primary" data-a="go" data-r="home">${t('errors.goHome')}</button></div></div></div>`;
}
export function stateFailed() {
  return `<div class="fullstate"><div class="box"><div class="empty-state err" style="padding:0"><div class="glyph">${ic('circle-alert', 20)}</div></div><h1>${t('errors.failed')}</h1><p>${t('errors.failedBody')}</p><div class="row"><button class="btn btn-secondary" data-a="go" data-r="home">${t('errors.goHome')}</button><button class="btn btn-primary" data-a="reload">${ic('refresh-cw', 14)}${t('errors.tryAgain')}</button></div></div></div>`;
}
