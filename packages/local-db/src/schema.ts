import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_workspace',
    sql: `
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT,
        color TEXT,
        brand INTEGER NOT NULL DEFAULT 0,
        me TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        data TEXT NOT NULL,
        rank INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      CREATE INDEX projects_by_workspace
        ON projects(workspace_id, rank, id);

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        project_id TEXT,
        data TEXT NOT NULL,
        description_text TEXT NOT NULL DEFAULT '',
        rank REAL NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      CREATE INDEX tasks_by_workspace
        ON tasks(workspace_id, deleted_at, rank, id);

      CREATE INDEX tasks_by_project
        ON tasks(workspace_id, project_id, deleted_at, rank, id);

      CREATE TABLE members (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        data TEXT NOT NULL,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      CREATE TABLE comments (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        task_id TEXT,
        data TEXT NOT NULL,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      CREATE INDEX comments_by_task
        ON comments(workspace_id, task_id, deleted_at, created_at);

      CREATE TABLE files (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        project_id TEXT,
        task_id TEXT,
        data TEXT NOT NULL,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      CREATE TABLE activity (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        project_id TEXT,
        task_id TEXT,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX activity_by_workspace
        ON activity(workspace_id, created_at DESC, id);

      CREATE TABLE saved_views (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        project_id TEXT,
        data TEXT NOT NULL,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      CREATE TABLE workspace_settings (
        workspace_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, kind)
      ) STRICT;

      CREATE TABLE processed_commands (
        workspace_id TEXT NOT NULL,
        client_command_id TEXT NOT NULL,
        result TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, client_command_id)
      ) STRICT;

      CREATE TABLE sync_outbox (
        local_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        client_command_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        command_type TEXT NOT NULL,
        entity_id TEXT,
        payload TEXT NOT NULL,
        base_revision INTEGER,
        revision INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending'
          CHECK (state IN ('pending', 'synced', 'conflict', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (workspace_id, client_command_id)
      ) STRICT;

      CREATE INDEX sync_outbox_pending
        ON sync_outbox(workspace_id, state, local_sequence);

      CREATE TABLE entity_tombstones (
        workspace_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        deleted_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, entity_type, entity_id)
      ) STRICT;

      CREATE TABLE sync_state (
        workspace_id TEXT PRIMARY KEY,
        server_cursor INTEGER NOT NULL DEFAULT 0,
        last_synced_at TEXT,
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 2,
    name: 'sync_scheduling',
    sql: `
      ALTER TABLE sync_outbox ADD COLUMN actor_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE sync_outbox ADD COLUMN retry_at TEXT;
      ALTER TABLE sync_outbox ADD COLUMN server_sequence INTEGER;
      ALTER TABLE sync_state ADD COLUMN last_state TEXT NOT NULL DEFAULT 'local';
      ALTER TABLE sync_state ADD COLUMN last_error TEXT;

      UPDATE sync_outbox
         SET actor_id = COALESCE((SELECT me FROM workspaces WHERE workspaces.id = sync_outbox.workspace_id), '')
       WHERE actor_id = '';

      CREATE INDEX sync_outbox_scheduled
        ON sync_outbox(workspace_id, state, retry_at, local_sequence);
    `,
  },
];

export function migrate(db: DatabaseSync): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map(row => Number(row.version)),
  );

  let latest = 0;
  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      latest = migration.version;
      continue;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(migration.version, migration.name, new Date().toISOString());
      db.exec('COMMIT');
      latest = migration.version;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // SQLite already rolled back the failed migration.
      }
      throw error;
    }
  }

  return latest;
}
