/* ---------- vocab ---------- */
import { t } from '../i18n/index.js';

export const STATUSES = [
  {
    id: 'backlog',
    get name() {
      return t('vocab.status.backlog');
    },
  },
  {
    id: 'todo',
    get name() {
      return t('vocab.status.todo');
    },
  },
  {
    id: 'progress',
    get name() {
      return t('vocab.status.progress');
    },
  },
  {
    id: 'review',
    get name() {
      return t('vocab.status.review');
    },
  },
  {
    id: 'done',
    get name() {
      return t('vocab.status.done');
    },
  },
];
export const ST = Object.fromEntries(STATUSES.map(s => [s.id, s]));
export const PRIOS = [
  {
    id: 'urgent',
    get name() {
      return t('vocab.priority.urgent');
    },
    w: 4,
  },
  {
    id: 'high',
    get name() {
      return t('vocab.priority.high');
    },
    w: 3,
  },
  {
    id: 'medium',
    get name() {
      return t('vocab.priority.medium');
    },
    w: 2,
  },
  {
    id: 'low',
    get name() {
      return t('vocab.priority.low');
    },
    w: 1,
  },
  {
    id: 'none',
    get name() {
      return t('vocab.priority.none');
    },
    w: 0,
  },
];
export const PR = Object.fromEntries(PRIOS.map(p => [p.id, p]));
export const LABELS = [
  {
    id: 'design',
    get name() {
      return t('vocab.label.design');
    },
    c: 'var(--violet)',
  },
  {
    id: 'frontend',
    get name() {
      return t('vocab.label.frontend');
    },
    c: 'var(--blue)',
  },
  {
    id: 'backend',
    get name() {
      return t('vocab.label.backend');
    },
    c: 'var(--teal)',
  },
  {
    id: 'research',
    get name() {
      return t('vocab.label.research');
    },
    c: 'var(--amber)',
  },
  {
    id: 'content',
    get name() {
      return t('vocab.label.content');
    },
    c: 'var(--rose)',
  },
  {
    id: 'bug',
    get name() {
      return t('vocab.label.bug');
    },
    c: 'var(--red)',
  },
  {
    id: 'qa',
    get name() {
      return t('vocab.label.qa');
    },
    c: 'var(--green)',
  },
  {
    id: 'growth',
    get name() {
      return t('vocab.label.growth');
    },
    c: 'var(--orange)',
  },
];
export const LB = Object.fromEntries(LABELS.map(l => [l.id, l]));
export const PSTAT = {
  planning: {
    get name() {
      return t('vocab.projectStatus.planning');
    },
    c: 'var(--gray)',
  },
  active: {
    get name() {
      return t('vocab.projectStatus.active');
    },
    c: 'var(--blue)',
  },
  risk: {
    get name() {
      return t('vocab.projectStatus.risk');
    },
    c: 'var(--red)',
  },
  hold: {
    get name() {
      return t('vocab.projectStatus.hold');
    },
    c: 'var(--amber)',
  },
  complete: {
    get name() {
      return t('vocab.projectStatus.complete');
    },
    c: 'var(--green)',
  },
};
export const PCOLORS = {
  indigo: '#5A67D8',
  blue: '#3B82C4',
  violet: '#8662C9',
  teal: '#23918A',
  rose: '#C54B78',
  amber: '#C48A1E',
  green: '#3D8E5F',
  slate: '#6B7280',
};
export const PICONS = [
  'globe',
  'smartphone',
  'megaphone',
  'rocket',
  'component',
  'building-2',
  'layout-grid',
  'palette',
  'code',
  'briefcase',
  'target',
  'layers',
  'zap',
  'heart',
  'folder',
  'sparkles',
];
