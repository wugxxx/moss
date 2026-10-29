/* ---------- OVERVIEW ---------- */
import { TODAY, diffD, esc, fmtDate, parse } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { STATUSES } from '../core/constants.js';
import { isOver, pColor, progressOf, tasksOf } from '../core/store.js';
import { empty, pStatus, stIcon } from '../ui/helpers.js';
import { sortTasks } from '../shell/view-engine.js';
import { miniRow } from '../components/task-list.js';
import { t as tr } from '../i18n/index.js';

export function projOverview(p) {
  const ts = tasksOf(p.id);
  const pr = progressOf(p.id);
  const cnt = STATUSES.map(s => ({ s, n: ts.filter(t => t.status === s.id).length }));
  const over = ts.filter(isOver);
  const soon = sortTasks(
    ts.filter(t => t.status !== 'done' && t.due),
    { f: 'due', dir: 1 },
  ).slice(0, 6);
  const daysLeft = diffD(parse(p.due), TODAY);
  return `<div class="page" style="max-width:1160px;padding-top:22px">
    <div class="grid2">
      <div class="stack">
        <section class="panel"><div class="panel-h"><h2>${tr('project.about')}</h2><div class="acts"><button class="btn btn-sm btn-ghost" data-a="editProject" data-id="${p.id}">${ic('pencil', 13)}${tr('common.edit')}</button></div></div><div class="panel-b" style="font-size:14px;line-height:1.6;color:var(--text)">${esc(p.desc)}</div></section>
        <section class="panel"><div class="panel-h"><h2>${tr('project.progress')}</h2><div class="acts"><span class="faint" style="font-size:12px">${tr('project.tasksDone', { done: ts.filter(t => t.status === 'done').length, total: ts.length })}</span></div></div>
          <div class="panel-b">
            <div class="row" style="align-items:baseline;gap:10px;margin-bottom:10px"><span style="font-size:30px;font-weight:600;letter-spacing:-.03em" class="num">${pr}%</span><span class="muted">${daysLeft >= 0 ? tr('time.daysUntil', { count: daysLeft, date: fmtDate(p.due) }) : tr('time.ended', { date: fmtDate(p.due) })}</span>${over.length ? `<span class="badge red">${ic('clock-alert', 11)}${tr('project.overdue', { count: over.length })}</span>` : ''}</div>
            <div class="stackbar" style="height:8px;margin-bottom:12px">${cnt.map(c => `<i style="width:${(c.n / Math.max(ts.length, 1)) * 100}%;background:var(--st-${c.s.id})" title="${c.s.name}: ${c.n}"></i>`).join('')}</div>
            <div class="row" style="flex-wrap:wrap;gap:14px;font-size:12.5px">${cnt.map(c => `<button class="row" style="gap:5px" data-a="goFilteredList" data-id="${p.id}" data-st="${c.s.id}">${stIcon(c.s.id, 12)}<span class="muted">${c.s.name}</span><b class="num" style="font-weight:600">${c.n}</b></button>`).join('')}</div>
          </div></section>
        <section class="panel"><div class="panel-h"><h2>${tr('project.comingUp')}</h2><div class="acts"><button class="btn btn-sm btn-ghost" data-a="go" data-r="project" data-id="${p.id}" data-tab="list">${tr('project.viewList')}</button></div></div>${soon.map(t => miniRow(t, { noProj: true })).join('') || empty('circle-check', tr('project.nothingScheduled'), tr('project.dueTasksHere'), '', 'sm')}</section>
      </div>
      <div class="stack">
        <section class="panel"><div class="panel-h"><h2>${tr('project.details')}</h2></div><div class="panel-b"><dl class="kv">
          <dt>${ic('circle-dot', 14)}${tr('common.status')}</dt><dd><button class="pillbtn" data-a="pop" data-pop="pstatus" data-id="${p.id}">${pStatus(p.status)}</button></dd>
          <dt>${ic('calendar', 14)}${tr('project.start')}</dt><dd><span class="pillbtn num">${fmtDate(p.start, true)}</span></dd>
          <dt>${ic('flag', 14)}${tr('project.due')}</dt><dd><span class="pillbtn num">${fmtDate(p.due, true)}</span></dd>
        </dl></div></section>
        <section class="panel"><div class="panel-h"><h2>${tr('project.milestones')}</h2></div><div class="panel-b">${
          (p.milestones || [])
            .map(m => {
              const n = diffD(parse(m.date), TODAY);
              return `<div class="row" style="height:32px;font-size:13px"><span style="width:9px;height:9px;transform:rotate(45deg);border-radius:2px;flex-shrink:0;margin:0 3px;background:${n < 0 ? 'var(--green)' : pColor(p)}"></span><span class="grow trunc ${n < 0 ? 'faint' : ''}">${esc(m.name)}</span><span class="num muted">${fmtDate(m.date)}</span></div>`;
            })
            .join('') || `<span class="faint">${tr('project.noMilestones')}</span>`
        }</div></section>
      </div>
    </div>
  </div>`;
}
