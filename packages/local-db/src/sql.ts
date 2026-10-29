import type { DatabaseSync } from 'node:sqlite';

export function transaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // The failed statement may already have ended the transaction.
    }
    throw error;
  }
}
