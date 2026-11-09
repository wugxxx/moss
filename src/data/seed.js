/* ---------- initial workspace ---------- */

/* A new workspace starts with a single local owner and no projects or tasks. */
export function seed() {
  return {
    ws: { name: 'Moss', url: 'moss', c: '#26332B', brand: true },
    workspaces: [{ id: 'w1', name: 'Moss', c: '#26332B', plan: 'Free', brand: true }],
    me: 'm1',
    members: [
      {
        id: 'm1',
        name: 'You',
        email: '',
        role: 'Owner',
        team: 'product',
        title: '',
        c: '#4E765F',
        status: 'active',
        last: 0,
        tz: '',
      },
    ],
    projects: [],
    tasks: [],
    labels: [],
    comments: [],
    activity: [],
    notifs: [],
    files: [],
    events: [],
    projOrder: [],
    savedViews: [],
    recentSearches: [],
    sessions: [],
    invoices: [],
    tfa: false,
    notifPrefs: {},
  };
}
