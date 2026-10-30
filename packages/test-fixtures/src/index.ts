import type { Project, Task, WorkspaceSnapshot } from '@moss/contracts';

export function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    project: 'project-1',
    key: 'PRJ-201',
    title: 'Test task',
    status: 'todo',
    assignee: 'member-1',
    priority: 'medium',
    due: '2026-10-30',
    start: '2026-10-28',
    labels: [],
    subtasks: [],
    attachments: [],
    deps: [],
    desc: '',
    estimate: null,
    created: 1_700_000_000_000,
    updated: 1_700_000_000_000,
    order: 1,
    fav: false,
    recur: null,
    revision: 0,
    ...overrides,
  };
}

export function projectFixture(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    key: 'PRJ',
    name: 'Test project',
    icon: 'folder',
    color: 'indigo',
    status: 'active',
    team: 'product',
    lead: 'member-1',
    due: '2026-11-30',
    start: '2026-10-01',
    fav: false,
    members: ['member-1'],
    desc: 'A test project.',
    milestones: [],
    last: 0,
    revision: 0,
    ...overrides,
  };
}

export function snapshotFixture(): WorkspaceSnapshot {
  return {
    ws: { name: 'Test workspace' },
    workspaces: [],
    me: 'member-1',
    members: [
      {
        id: 'member-1',
        name: 'Test User',
        email: 'test@example.com',
        role: 'Owner',
        team: 'product',
        title: 'Tester',
        c: '#5A67D8',
        status: 'active',
        last: 0,
        tz: 'UTC',
      },
    ],
    projects: [projectFixture()],
    tasks: [taskFixture()],
    labels: [],
    comments: [],
    activity: [],
    notifs: [],
    files: [],
    events: [],
    projOrder: ['project-1'],
    savedViews: [],
    recentSearches: [],
    sessions: [],
    invoices: [],
    tfa: false,
    notifPrefs: {},
  };
}
