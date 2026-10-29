/* ---------- initial workspace ---------- */

/* A new workspace starts with a single local owner and no projects or tasks. */
export function seed() {
  return {
    ws: { name: 'Moss', url: 'moss', c: '#1D1C1A', brand: true },
    workspaces: [{ id: 'w1', name: 'Moss', c: '#1D1C1A', plan: 'Free', brand: true }],
    me: 'm1',
    members: [
      {
        id: 'm1',
        name: 'You',
        email: '',
        role: 'Owner',
        team: 'product',
        title: '',
        c: '#5A67D8',
        status: 'active',
        last: 0,
        tz: '',
      },
    ],
    projects: [],
    tasks: [],
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
