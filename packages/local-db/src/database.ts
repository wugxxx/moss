import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './schema.js';

export interface OpenDatabaseOptions {
  path: string;
  wal?: boolean;
}

export type WorkspaceDatabase = DatabaseSync;

export function openDatabase({ path, wal = true }: OpenDatabaseOptions): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path, {
    enableForeignKeyConstraints: true,
    timeout: 5_000,
  });

  if (wal && path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = NORMAL');
  migrate(db);
  return db;
}
