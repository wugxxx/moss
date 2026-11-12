/* ---------- FOCUS (今日) — 上下流式漏斗布局 ---------- */
import { TODAY, diffD, esc, parse, weekdayLong } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S, allTasks, commentsOf, isOver, pColor, proj } from '../core/store.js';
import { sortTasks } from '../shell/view-engine.js';
import { fxc } from '../shell/render.js';
import { prIcon } from '../ui/helpers.js';
import { getIntlLocale, t } from '../i18n/index.js';

const OVERDUE_LIMIT = 3;

function dueLabel(task) {
  if (!task.due) return '';
  return new Intl.DateTimeFormat(getIntlLocale(), { month: 'long', day: 'numeric' }).format(parse(task.due));
}

function descSnippet(desc) {
  if (!desc) return '';
  const text = desc
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 46 ? text.slice(0, 46) + '…' : text;
}

/* Compact overdue card: 行1 元信息 · 行2 标题(可换行) · 行3+ 子任务/评论 */
function triageCard(task) {
  const p = proj(task.project);
  const sub = task.subtasks || [];
  const comments = commentsOf(task.id).length;
  const days = task.due ? -diffD(parse(task.due), TODAY) : 0;
  const due = dueLabel(task);

  const head = [];
  if (p) head.push(`<span class="fcard-proj"><span class="pdot" style="--c:${pColor(p)}"></span>${esc(p.name)}</span>`);
  if (due) head.push(`<span class="fcard-date">${due}</span>`);

  const extra = [];
  if (sub.length)
    extra.push(`<span class="fcard-mi">${ic('clipboard', 12)}${t('home.subtasksOf', { done: sub.filter(s => s.done).length, total: sub.length })}</span>`);
  if (comments) extra.push(`<span class="fcard-mi">${ic('message-circle', 12)}${comments}</span>`);

  return `<article class="fcard ${fxc('done', task.id)}" data-a="openTask" data-id="${task.id}" data-ctx="task" role="button" tabindex="0">
    <div class="fcard-check"><input type="checkbox" class="check round urgent" data-a="toggleDone" data-id="${task.id}" aria-label="${esc(t('tasks.completeTask', { title: task.title }))}"></div>
    <div class="fcard-body">
      <div class="fcard-meta">
        <span class="fcard-meta-l">${head.join('<span class="fcard-sep">·</span>')}</span>
        <span class="fcard-badge">${t('home.overdueDays', { count: days })}</span>
      </div>
      <p class="fcard-title"><span class="fcard-prio">${prIcon(task.priority, 13)}</span><span class="fcard-title-txt">${esc(task.title)}</span></p>
      ${extra.length ? `<div class="fcard-extra">${extra.join('<span class="fcard-sep">·</span>')}</div>` : ''}
    </div>
  </article>`;
}

/* Wide card in the today timeline */
function timelineCard(task, { done = false } = {}) {
  const p = proj(task.project);
  const sub = task.subtasks || [];
  const comments = commentsOf(task.id).length;
  const desc = descSnippet(task.desc);
  const meta = [];
  if (sub.length)
    meta.push(`<span class="lcard-mi">${ic('clipboard', 12)}${t('home.subtasksOf', { done: sub.filter(s => s.done).length, total: sub.length })}</span>`);
  if (comments) meta.push(`<span class="lcard-mi">${ic('message-circle', 12)}${comments}</span>`);
  if (desc) meta.push(`<span class="lcard-desc">${esc(desc)}</span>`);
  const metaHtml = meta.join('<span class="lcard-sep">·</span>');
  return `<article class="lcard ${done ? 'done' : ''} ${fxc('done', task.id)}" data-a="openTask" data-id="${task.id}" data-ctx="task" role="button" tabindex="0">
    <div class="lcard-main">
      <input type="checkbox" class="check round" ${done ? 'checked' : ''} data-a="toggleDone" data-id="${task.id}" aria-label="${esc(t('tasks.completeTask', { title: task.title }))}">
      <div class="lcard-text">
        <div class="lcard-top">
          <span class="lcard-prio">${prIcon(task.priority, 13)}</span>
          <span class="lcard-title">${esc(task.title)}</span>
          ${p ? `<span class="lcard-proj"><span class="pdot" style="--c:${pColor(p)}"></span>${esc(p.name)}</span>` : ''}
        </div>
        ${metaHtml ? `<div class="lcard-meta">${metaHtml}</div>` : ''}
      </div>
    </div>
  </article>`;
}

export function pageFocus() {
  const open = allTasks().filter(t => t.status !== 'done');
  const overdue = sortTasks(open.filter(isOver), { f: 'due', dir: 1 });
  const todayOpen = sortTasks(
    open.filter(t => t.due && diffD(parse(t.due), TODAY) === 0),
    { f: 'priority', dir: 1 },
  );
  const todayDone = sortTasks(
    allTasks().filter(t => t.status === 'done' && t.due && diffD(parse(t.due), TODAY) === 0),
    { f: 'priority', dir: 1 },
  );

  const total = overdue.length + todayOpen.length + todayDone.length;
  const done = todayDone.length;
  const rate = total ? Math.round((done / total) * 100) : 0;
  const offset = +(88 * (1 - rate / 100)).toFixed(1);
  const dateLine = `${new Intl.DateTimeFormat(getIntlLocale(), { month: 'long', day: 'numeric' }).format(TODAY)} · ${weekdayLong(TODAY.getDay())}`;

  const expanded = !!S.ui.focusOverdueOpen;
  const overdueVisible = expanded ? overdue : overdue.slice(0, OVERDUE_LIMIT);
  const remaining = overdue.length - overdueVisible.length;

  const legend = [];
  const seen = new Set();
  for (const task of [...todayOpen, ...todayDone]) {
    const p = proj(task.project);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      legend.push(p);
    }
  }

  return `<div class="page focus-cmd">
    <section class="focus-ph">
      <div class="focus-ph-main">
        <div class="focus-eyebrow">${t('home.todayHeading')}</div>
        <h1>${dateLine}</h1>
      </div>
      <div class="focus-stats">
        <div class="focus-stats-main">
          <div class="focus-ring-wrap">
            <svg class="focus-ring" viewBox="0 0 36 36" aria-hidden="true">
              <circle class="focus-ring-track" cx="18" cy="18" r="14" fill="none" stroke-width="3.5"></circle>
              <circle class="focus-ring-fill" cx="18" cy="18" r="14" fill="none" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="88" stroke-dashoffset="${offset}" transform="rotate(-90 18 18)"></circle>
            </svg>
          </div>
          <div class="focus-stats-txt">
            <span class="focus-stats-count">${done} / ${total} ${t('home.focusProgress')}</span>
            <span class="focus-stats-rate">${t('home.focusRate', { rate })}</span>
          </div>
        </div>
        <span class="focus-stats-sep"></span>
        <div class="focus-stats-triage">
          <span class="focus-triage-dot"></span>
          <span>${t('home.pendingTriage', { count: overdue.length })}</span>
        </div>
      </div>
    </section>
    <section class="focus-triage">
      <div class="focus-triage-h">
        <div class="focus-triage-h-main">
          <span class="focus-triage-icon">${ic('clock-exclamation-point', 14)}</span>
          <h2>${t('home.triageTitle')}</h2>
          <span class="focus-triage-count">${t('home.triageCount', { count: overdue.length })}</span>
        </div>
        ${overdue.length ? `<button class="focus-triage-btn" data-a="rescheduleAll">${t('home.rescheduleAll')}${ic('arrow-right', 14)}</button>` : ''}
      </div>
      <div class="focus-triage-grid">
        ${overdueVisible.length ? overdueVisible.map(triageCard).join('') : `<p class="focus-empty">${t('home.colEmptyOverdue')}</p>`}
      </div>
      ${
        overdue.length > OVERDUE_LIMIT
          ? `<div class="focus-triage-foot">
        <span class="focus-triage-remain">${expanded ? t('home.overdueDone') : t('home.overdueRemaining', { count: remaining })}</span>
        <button class="focus-triage-toggle" data-a="focusExpandOverdue">${expanded ? t('home.collapseOverdue') : t('home.expandOverdue', { count: overdue.length })}${ic('chevron-down', 14)}</button>
      </div>`
          : ''
      }
    </section>
    <section class="focus-timeline">
      <div class="focus-tl-h">
        <div class="focus-tl-h-main">
          <span class="focus-tl-icon">${ic('clock', 14)}</span>
          <h2>${t('home.timelineTitle')}</h2>
          <span class="focus-tl-count">${t('home.timelineCount', { count: todayOpen.length + todayDone.length })}</span>
        </div>
        ${legend.length ? `<div class="focus-tl-legend">${legend.map(p => `<span class="focus-legend"><span class="pdot" style="--c:${pColor(p)}"></span>${esc(p.name)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="focus-tl-block">
        <div class="focus-tl-list">
          ${todayOpen.length ? todayOpen.map(t => timelineCard(t)).join('') : todayDone.length ? '' : `<p class="focus-empty">${t('home.colEmptyToday')}</p>`}
          ${todayDone.length ? todayDone.map(t => timelineCard(t, { done: true })).join('') : ''}
        </div>
      </div>
    </section>
  </div>`;
}
