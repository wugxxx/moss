import type { DatabaseSync } from 'node:sqlite';
import type {
  Activity,
  CalendarEvent,
  Comment,
  CommandResult,
  FileRecord,
  Member,
  Project,
  SavedView,
  Task,
  WorkspaceCommand,
  WorkspaceSnapshot,
} from '@moss/contracts';
import type { CommandReceipt, WorkspaceCommitContext, WorkspaceRepository } from '@moss/application';
import type { SyncChange, SyncEntityKind, SyncWorkspaceValue } from '@moss/sync-core';
import { normalizeSnapshot, parseRow } from './snapshot.js';
import { transaction } from './sql.js';

interface WorkspaceRow {
  id: string;
  name: string;
  url: string | null;
  color: string | null;
  brand: number;
  me: string;
  data: string;
  revision: number;
}

interface EntityRow {
  id: string;
  data: string;
  revision: number;
}

interface SettingsRow {
  kind: string;
  data: string;
}

export interface Clock {
  now(): number;
}

const wallClock: Clock = { now: () => Date.now() };

function iso(clock: Clock): string {
  return new Date(clock.now()).toISOString();
}

export interface SqliteWorkspaceRepositoryOptions {
  workspaceId?: string;
  clock?: Clock;
}

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  readonly workspaceId: string;
  private readonly clock: Clock;

  constructor(
    private readonly db: DatabaseSync,
    { workspaceId = 'local', clock = wallClock }: SqliteWorkspaceRepositoryOptions = {},
  ) {
    this.workspaceId = workspaceId;
    this.clock = clock;

    const workspace = this.db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId);
    if (!workspace) {
      this.db
        .prepare(
          `INSERT INTO workspaces
             (id, name, url, color, brand, me, data, created_at, updated_at, revision)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        )
        .run(workspaceId, 'Moss', null, null, 0, '', '{}', iso(this.clock), iso(this.clock));
    }

    const sync = this.db.prepare('SELECT workspace_id FROM sync_state WHERE workspace_id = ?').get(workspaceId);
    if (!sync) {
      this.db.prepare('INSERT INTO sync_state (workspace_id, updated_at) VALUES (?, ?)').run(workspaceId, iso(this.clock));
    }
  }

  snapshot(): WorkspaceSnapshot {
    const workspace = this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(this.workspaceId) as unknown as WorkspaceRow | undefined;
    if (!workspace) throw new Error(`Workspace ${this.workspaceId} was not found`);

    const metadata = JSON.parse(workspace.data) as {
      workspaces?: Array<Record<string, unknown>>;
      notifs?: Array<Record<string, unknown>>;
      events?: CalendarEvent[];
      projOrder?: string[];
      recentSearches?: string[];
      sessions?: Array<Record<string, unknown>>;
      invoices?: Array<Record<string, unknown>>;
      tfa?: boolean;
      notifPrefs?: Record<string, boolean>;
    };
    const settings = new Map(
      (this.db.prepare('SELECT kind, data FROM workspace_settings WHERE workspace_id = ?').all(this.workspaceId) as unknown as SettingsRow[]).map(setting => [
        setting.kind,
        JSON.parse(setting.data),
      ]),
    );

    const tasks = this.rows('tasks').map(row => parseRow<Task>(row as unknown as EntityRow));
    const projects = this.rows('projects').map(row => parseRow<Project>(row as unknown as EntityRow));
    const storedProjOrder = settings.get('projOrder');
    const projOrder =
      Array.isArray(storedProjOrder) && storedProjOrder.length
        ? (storedProjOrder as string[])
        : Array.isArray(metadata.projOrder) && metadata.projOrder.length
          ? metadata.projOrder
          : projects.map(project => project.id);

    return normalizeSnapshot({
      ws: {
        name: workspace.name,
        ...(workspace.url ? { url: workspace.url } : {}),
        ...(workspace.color ? { c: workspace.color } : {}),
        ...(workspace.brand ? { brand: true } : {}),
      },
      workspaces: metadata.workspaces ?? [],
      me: workspace.me,
      members: this.rows('members').map(row => parseRow<Member>(row as unknown as EntityRow)),
      projects,
      tasks,
      comments: this.rows('comments').map(row => parseRow<Comment>(row as unknown as EntityRow)),
      activity: this.rows('activity').map(row => parseRow<Activity>(row as unknown as EntityRow)),
      notifs: settings.get('notifs') ?? metadata.notifs ?? [],
      files: this.rows('files').map(row => parseRow<FileRecord>(row as unknown as EntityRow)),
      events: settings.get('events') ?? metadata.events ?? [],
      projOrder,
      savedViews: this.rows('saved_views').map(row => parseRow<SavedView>(row as unknown as EntityRow)),
      recentSearches: settings.get('recentSearches') ?? metadata.recentSearches ?? [],
      sessions: metadata.sessions ?? [],
      invoices: metadata.invoices ?? [],
      tfa: Boolean(metadata.tfa),
      notifPrefs: settings.get('notifPrefs') ?? metadata.notifPrefs ?? {},
    });
  }

  replaceSnapshot(snapshot: WorkspaceSnapshot): void {
    this.atomic(() => {
      this.replaceSnapshotUnsafe(normalizeSnapshot(snapshot), new Date(this.clock.now()).toISOString());
    });
  }

  /**
   * Applies ordered remote changes and advances the pull cursor in the caller's
   * transaction. Remote payloads are validated structurally before any write.
   */
  applySyncChanges(changes: readonly SyncChange[], cursor: number): void {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('Invalid sync cursor');
    const at = iso(this.clock);
    const currentCursor = Number(
      (this.db.prepare('SELECT server_cursor FROM sync_state WHERE workspace_id = ?').get(this.workspaceId) as unknown as { server_cursor: number } | undefined)
        ?.server_cursor ?? 0,
    );
    let previousSequence = currentCursor;
    for (const change of changes) {
      validateSyncChange(change);
      if (change.sequence <= previousSequence || change.sequence > cursor) throw new Error('Sync changes are out of order');
      previousSequence = change.sequence;
      if (change.type === 'delete') {
        if (change.entity === 'workspace') throw new Error('Remote workspace deletion is not supported');
        this.deleteEntity(change.entity, change.id, change.revision);
        continue;
      }
      if (change.entity === 'workspace') {
        if (change.id !== this.workspaceId) throw new Error('Remote workspace change has a mismatched id');
        this.applyRemoteWorkspace(change.value as SyncWorkspaceValue, change.revision, at);
      } else {
        this.applyRemoteEntity(change.entity, change.id, change.value as Record<string, unknown>, change.revision, at);
      }
    }
    this.db
      .prepare(
        `UPDATE sync_state
            SET server_cursor = MAX(server_cursor, ?), updated_at = ?
          WHERE workspace_id = ?`,
      )
      .run(cursor, at, this.workspaceId);
  }

  findCommandResult(clientCommandId: string): CommandResult | null {
    const row = this.db
      .prepare('SELECT result FROM processed_commands WHERE workspace_id = ? AND client_command_id = ?')
      .get(this.workspaceId, clientCommandId) as unknown as { result: string } | undefined;
    return row ? (JSON.parse(row.result) as CommandResult) : null;
  }

  findCommandReceipt(clientCommandId: string): CommandReceipt | null {
    const row = this.db
      .prepare(
        `SELECT p.result, o.revision
           FROM processed_commands p
           JOIN sync_outbox o
             ON o.workspace_id = p.workspace_id AND o.client_command_id = p.client_command_id
          WHERE p.workspace_id = ? AND p.client_command_id = ?`,
      )
      .get(this.workspaceId, clientCommandId) as unknown as { result: string; revision: number } | undefined;
    return row ? { result: JSON.parse(row.result) as CommandResult, revision: Number(row.revision) } : null;
  }

  commit({ command, previous, snapshot, result }: WorkspaceCommitContext): void {
    const at = iso(this.clock);
    const write = () => {
      this.replaceSnapshotUnsafe(normalizeSnapshot(snapshot), at);
      this.rememberCommand(result, at);
      this.recordOutbox(command, previous, result, at);
    };
    // The application starts a transaction for batches. Reuse it instead of
    // nesting, but still guard standalone commits.
    if (this.db.isTransaction) write();
    else transaction(this.db, write);
  }

  atomic<T>(run: () => T): T {
    if (this.db.isTransaction) return run();
    return transaction(this.db, run);
  }

  atomicBatch<T>(run: () => T): T {
    if (this.db.isTransaction) return run();
    return transaction(this.db, run);
  }

  private rows(table: 'tasks' | 'projects' | 'members' | 'comments' | 'files' | 'activity' | 'saved_views'): EntityRow[] {
    const order = table === 'activity' ? 'created_at DESC, id' : table === 'projects' ? 'rank, id' : table === 'tasks' ? 'rank, id' : 'id';
    const columns = table === 'activity' ? 'id, data, 0 AS revision' : 'id, data, revision';
    return this.db
      .prepare(
        `SELECT ${columns} FROM ${table}
          WHERE workspace_id = ? AND ${table === 'activity' ? '1 = 1' : 'deleted_at IS NULL'}
          ORDER BY ${order}`,
      )
      .all(this.workspaceId) as unknown as EntityRow[];
  }

  private rememberCommand(result: CommandResult, at: string): void {
    this.db
      .prepare(
        `INSERT INTO processed_commands (workspace_id, client_command_id, result, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (workspace_id, client_command_id) DO NOTHING`,
      )
      .run(this.workspaceId, result.commandId, JSON.stringify(result), at);
  }

  private recordOutbox(command: WorkspaceCommitContext['command'], previous: WorkspaceSnapshot, result: CommandResult, at: string): void {
    if (!result.ok) return;
    const baseRevision = command.baseRevision ?? baseRevisionFor(command, previous);
    this.db
      .prepare(
        `INSERT INTO sync_outbox
           (workspace_id, client_command_id, device_id, actor_id, command_type, entity_id, payload,
            base_revision, revision, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
         ON CONFLICT (workspace_id, client_command_id) DO NOTHING`,
      )
      .run(
        this.workspaceId,
        command.clientCommandId,
        command.deviceId,
        command.actorId,
        command.type,
        'entityId' in command ? (command.entityId ?? null) : null,
        JSON.stringify(command.payload),
        baseRevision,
        result.revision,
        at,
        at,
      );
  }

  private replaceSnapshotUnsafe(snapshot: WorkspaceSnapshot, at: string): void {
    const previousTasks = new Set(
      (this.db.prepare('SELECT data FROM tasks WHERE workspace_id = ? AND deleted_at IS NULL').all(this.workspaceId) as unknown as Array<{ data: string }>).map(
        row => (JSON.parse(row.data) as Task).id,
      ),
    );
    const previousProjects = new Set(
      (
        this.db.prepare('SELECT data FROM projects WHERE workspace_id = ? AND deleted_at IS NULL').all(this.workspaceId) as unknown as Array<{ data: string }>
      ).map(row => (JSON.parse(row.data) as Project).id),
    );

    this.upsertWorkspace(snapshot, at);
    this.syncTable('members', snapshot.members, snapshot, at);
    this.syncTable('projects', snapshot.projects, snapshot, at, project => ({ rank: snapshot.projOrder.indexOf(project.id) }));
    this.syncTable('tasks', snapshot.tasks, snapshot, at, task => ({
      rank: task.order,
      project_id: task.project,
      description_text: task.desc.replace(/<[^>]*>/g, ' '),
    }));
    this.syncTable('comments', snapshot.comments, snapshot, at, comment => ({ task_id: comment.task }));
    this.syncTable('files', snapshot.files, snapshot, at, file => ({
      project_id: file.project,
      task_id: file.task ?? null,
    }));
    this.syncTable('saved_views', snapshot.savedViews, snapshot, at, view => ({ project_id: view.project }));

    this.db.prepare('DELETE FROM activity WHERE workspace_id = ?').run(this.workspaceId);
    const activity = this.db.prepare('INSERT INTO activity (id, workspace_id, project_id, task_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const entry of snapshot.activity) {
      activity.run(entry.id, this.workspaceId, entry.project, entry.task, JSON.stringify(entry), new Date(entry.at).toISOString());
    }

    this.setMetadata(snapshot, at);

    const now = new Date(this.clock.now()).toISOString();
    const taskIds = new Set(snapshot.tasks.map(task => task.id));
    const projectIds = new Set(snapshot.projects.map(project => project.id));
    for (const id of previousTasks) {
      if (taskIds.has(id)) continue;
      this.addTombstone('task', id, now);
    }
    for (const id of previousProjects) {
      if (projectIds.has(id)) continue;
      this.addTombstone('project', id, now);
    }
  }

  private upsertWorkspace(snapshot: WorkspaceSnapshot, at: string): void {
    const metadata = JSON.stringify({
      workspaces: snapshot.workspaces,
      sessions: snapshot.sessions,
      invoices: snapshot.invoices,
      tfa: snapshot.tfa,
    });
    const revision = Math.max(0, ...snapshot.tasks.map(task => task.revision), ...snapshot.projects.map(project => project.revision));
    const updated = this.db
      .prepare(
        `UPDATE workspaces
            SET name = ?, url = ?, color = ?, brand = ?, me = ?, data = ?, updated_at = ?, revision = ?
          WHERE id = ?`,
      )
      .run(snapshot.ws.name, snapshot.ws.url ?? null, snapshot.ws.c ?? null, snapshot.ws.brand ? 1 : 0, snapshot.me, metadata, at, revision, this.workspaceId);
    if (Number(updated.changes) === 0) {
      this.db
        .prepare(
          `INSERT INTO workspaces
             (id, name, url, color, brand, me, data, created_at, updated_at, revision)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          this.workspaceId,
          snapshot.ws.name,
          snapshot.ws.url ?? null,
          snapshot.ws.c ?? null,
          snapshot.ws.brand ? 1 : 0,
          snapshot.me,
          metadata,
          at,
          at,
          revision,
        );
    }
  }

  private setMetadata(snapshot: WorkspaceSnapshot, at: string): void {
    const values: Array<[string, unknown]> = [
      ['notifs', snapshot.notifs],
      ['events', snapshot.events],
      ['projOrder', snapshot.projOrder],
      ['recentSearches', snapshot.recentSearches],
      ['notifPrefs', snapshot.notifPrefs],
    ];
    const upsert = this.db.prepare(
      `INSERT INTO workspace_settings (workspace_id, kind, data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (workspace_id, kind) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    );
    for (const [kind, value] of values) upsert.run(this.workspaceId, kind, JSON.stringify(value), at);
  }

  private syncTable<T extends { id: string; revision?: number }>(
    table: 'members' | 'projects' | 'tasks' | 'comments' | 'files' | 'saved_views',
    records: T[],
    snapshot: WorkspaceSnapshot,
    at: string,
    columns: (record: T) => Record<string, string | number | null> = () => ({}),
  ): void {
    const existing = new Map(
      (
        this.db.prepare(`SELECT id, data, revision FROM ${table} WHERE workspace_id = ? AND deleted_at IS NULL`).all(this.workspaceId) as unknown as EntityRow[]
      ).map(row => [row.id, { revision: Number(row.revision), data: JSON.parse(row.data) as T }]),
    );

    const idSet = new Set(records.map(record => record.id));
    for (const id of existing.keys()) {
      if (!idSet.has(id)) this.addTombstone(table, id, at);
    }

    for (const record of records) {
      const previous = existing.get(record.id);
      if (previous && JSON.stringify(previous.data) === JSON.stringify(record)) continue;
      const changed = columns(record);
      const fields = Object.keys(changed);
      const createdAt = 'created' in record && typeof record.created === 'number' ? new Date(record.created).toISOString() : at;
      const updatedAt = 'updated' in record && typeof record.updated === 'number' ? new Date(record.updated).toISOString() : at;
      const insertColumns = ['id', 'workspace_id', 'data', 'deleted_at', 'created_at', 'updated_at', 'revision', ...fields];
      const values: Array<string | number | null> = [
        record.id,
        this.workspaceId,
        JSON.stringify(record),
        null,
        createdAt,
        updatedAt,
        record.revision ?? 0,
        ...fields.map(field => changed[field] ?? null),
      ];
      const placeholders = insertColumns.map(() => '?').join(', ');
      const updates = [
        'data = excluded.data',
        'deleted_at = NULL',
        'updated_at = excluded.updated_at',
        'revision = excluded.revision',
        ...fields.map(field => `${field} = excluded.${field}`),
      ];
      this.db
        .prepare(
          `INSERT INTO ${table} (${insertColumns.join(', ')}) VALUES (${placeholders})
           ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}`,
        )
        .run(...values);

      this.db
        .prepare('DELETE FROM entity_tombstones WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?')
        .run(this.workspaceId, entityKind(table), record.id);
    }
  }

  private addTombstone(entityType: string, id: string, at: string): void {
    const tombstoneType = entityKind(entityType);
    const table = tableForKind(tombstoneType);
    const previous = this.db
      .prepare('SELECT revision FROM entity_tombstones WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?')
      .get(this.workspaceId, tombstoneType, id) as unknown as { revision: number } | undefined;
    const revision = Math.max(0, Number(previous?.revision ?? 0) + 1);
    this.db
      .prepare(
        `INSERT INTO entity_tombstones (workspace_id, entity_type, entity_id, revision, deleted_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (workspace_id, entity_type, entity_id)
         DO UPDATE SET revision = excluded.revision, deleted_at = excluded.deleted_at`,
      )
      .run(this.workspaceId, tombstoneType, id, revision, at);
    this.db.prepare(`UPDATE ${table} SET deleted_at = ? WHERE workspace_id = ? AND id = ?`).run(at, this.workspaceId, id);
  }

  private applyRemoteWorkspace(value: SyncWorkspaceValue, revision: number, at: string): void {
    const current = this.db.prepare('SELECT revision, data, me FROM workspaces WHERE id = ?').get(this.workspaceId) as unknown as
      { revision: number; data: string; me: string } | undefined;
    if (!current) throw new Error(`Workspace ${this.workspaceId} was not found`);

    const metadata = JSON.parse(current.data) as Record<string, unknown>;
    const nextMetadata = JSON.stringify({
      ...metadata,
      ...(value.workspaces !== undefined ? { workspaces: value.workspaces } : {}),
      ...(value.sessions !== undefined ? { sessions: value.sessions } : {}),
      ...(value.invoices !== undefined ? { invoices: value.invoices } : {}),
      ...(value.tfa !== undefined ? { tfa: value.tfa } : {}),
    });
    this.db
      .prepare(
        `UPDATE workspaces
            SET name = ?, url = ?, color = ?, brand = ?, me = ?, data = ?, updated_at = ?, revision = ?
          WHERE id = ?`,
      )
      .run(value.name, value.url ?? null, value.c ?? null, value.brand ? 1 : 0, value.me ?? current.me, nextMetadata, at, revision, this.workspaceId);
    if (value.projOrder !== undefined) {
      this.writeRemoteSetting('projOrder', value.projOrder, at);
    }
    if (value.notifPrefs !== undefined) {
      this.writeRemoteSetting('notifPrefs', value.notifPrefs, at);
    }
  }

  private applyRemoteEntity(entity: Exclude<SyncEntityKind, 'workspace'>, id: string, value: Record<string, unknown>, revision: number, at: string): void {
    const table = tableForKind(entity);
    const existing = this.db.prepare(`SELECT revision, data FROM ${table} WHERE id = ? AND workspace_id = ?`).get(id, this.workspaceId) as unknown as
      { revision: number; data: string } | undefined;
    if (existing && Number(existing.revision) > revision) return;

    const normalized = { ...value, id, ...(entity === 'project' || entity === 'task' ? { revision } : {}) };
    const fields = remoteColumns(entity, normalized);
    const columns = ['id', 'workspace_id', 'data', 'deleted_at', 'created_at', 'updated_at', 'revision', ...Object.keys(fields)];
    const values = [
      id,
      this.workspaceId,
      JSON.stringify(normalized),
      null,
      timestampFor(normalized, 'created', at),
      timestampFor(normalized, 'updated', at),
      revision,
      ...Object.values(fields),
    ];
    const updates = [
      'data = excluded.data',
      'deleted_at = NULL',
      'updated_at = excluded.updated_at',
      'revision = excluded.revision',
      ...Object.keys(fields).map(field => `${field} = excluded.${field}`),
    ];
    this.db
      .prepare(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
         ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}`,
      )
      .run(...values);
    this.db.prepare('DELETE FROM entity_tombstones WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?').run(this.workspaceId, entity, id);
  }

  private deleteEntity(entity: Exclude<SyncEntityKind, 'workspace'>, id: string, revision: number): void {
    const at = iso(this.clock);
    const table = tableForKind(entity);
    const existing = this.db.prepare(`SELECT revision FROM ${table} WHERE id = ? AND workspace_id = ?`).get(id, this.workspaceId) as unknown as
      { revision: number } | undefined;
    const tombstone = this.db
      .prepare('SELECT revision FROM entity_tombstones WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?')
      .get(this.workspaceId, entity, id) as unknown as { revision: number } | undefined;
    if ((existing && Number(existing.revision) > revision) || (tombstone && Number(tombstone.revision) > revision)) return;
    this.db.prepare(`UPDATE ${table} SET deleted_at = ? WHERE workspace_id = ? AND id = ?`).run(at, this.workspaceId, id);
    this.db
      .prepare(
        `INSERT INTO entity_tombstones (workspace_id, entity_type, entity_id, revision, deleted_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (workspace_id, entity_type, entity_id)
         DO UPDATE SET revision = excluded.revision, deleted_at = excluded.deleted_at`,
      )
      .run(this.workspaceId, entity, id, revision, at);
  }

  private writeRemoteSetting(kind: string, value: unknown, at: string): void {
    this.db
      .prepare(
        `INSERT INTO workspace_settings (workspace_id, kind, data, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (workspace_id, kind) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(this.workspaceId, kind, JSON.stringify(value), at);
  }
}

function baseRevisionFor(command: WorkspaceCommand, snapshot: WorkspaceSnapshot): number | null {
  if (command.type.startsWith('task.')) {
    if ('entityId' in command && command.entityId) {
      return snapshot.tasks.find(task => task.id === command.entityId)?.revision ?? null;
    }
    if ('ids' in command.payload) {
      const ids = new Set(command.payload.ids);
      return maxRevision(snapshot.tasks.filter(task => ids.has(task.id)));
    }
    if (command.type === 'task.batchMove') {
      const ids = new Set(command.payload.updates.map(update => update.id));
      return maxRevision(snapshot.tasks.filter(task => ids.has(task.id)));
    }
  }
  if (command.type.startsWith('project.') && 'entityId' in command && command.entityId) {
    return snapshot.projects.find(project => project.id === command.entityId)?.revision ?? null;
  }
  return null;
}

function maxRevision(items: ReadonlyArray<{ revision: number }>): number | null {
  return items.length ? Math.max(...items.map(item => item.revision)) : null;
}

function entityKind(table: string): string {
  return table === 'saved_views' ? 'savedView' : table.endsWith('s') ? table.slice(0, -1) : table;
}

function tableForKind(kind: string): string {
  if (kind === 'savedView') return 'saved_views';
  return `${kind}s`;
}

function validateSyncChange(change: SyncChange): void {
  if (!change || (change.type !== 'upsert' && change.type !== 'delete')) throw new Error('Invalid sync change');
  if (!Number.isSafeInteger(change.sequence) || change.sequence < 1) throw new Error('Invalid sync sequence');
  if (!Number.isSafeInteger(change.revision) || change.revision < 0) throw new Error('Invalid sync revision');
  if (typeof change.id !== 'string' || !change.id) throw new Error('Invalid sync entity id');
  if (!['workspace', 'member', 'project', 'task', 'comment', 'file', 'savedView'].includes(change.entity)) throw new Error('Invalid sync entity type');
  if (change.type === 'delete' && change.entity === 'workspace') throw new Error('Remote workspace deletion is not supported');
}

function remoteColumns(entity: Exclude<SyncEntityKind, 'workspace'>, value: Record<string, unknown>): Record<string, string | number | null> {
  if (entity === 'task') {
    return {
      rank: numberOr(value.order, 0),
      project_id: typeof value.project === 'string' ? value.project : null,
      description_text: typeof value.desc === 'string' ? value.desc.replace(/<[^>]*>/g, ' ') : '',
    };
  }
  if (entity === 'project') return { rank: numberOr(value.rank, 0) };
  if (entity === 'comment') return { task_id: typeof value.task === 'string' ? value.task : null };
  if (entity === 'file') {
    return {
      project_id: typeof value.project === 'string' ? value.project : null,
      task_id: typeof value.task === 'string' ? value.task : null,
    };
  }
  if (entity === 'savedView') return { project_id: typeof value.project === 'string' ? value.project : null };
  return {};
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function timestampFor(value: Record<string, unknown>, key: 'created' | 'updated', fallback: string): string {
  const raw = value[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw).toISOString();
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return fallback;
}
