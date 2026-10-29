# Moss Architecture

Status: Accepted

Date: 2026-10-27

## Decision summary

Moss will be a local-first desktop application with optional cloud sync.

- The first desktop shell will be Electron.
- Electron is only the host adapter, so Tauri or Wails can replace it without
  rewriting UI or domain code.
- Local SQLite is the source of truth for desktop business data.
- Core desktop features work with no account and no network.
- Cloud sync uses a Node.js API and PostgreSQL.
- The web build remains supported and uses the HTTP adapter.
- UI, domain rules, and command contracts are shared across shells.
- Desktop and cloud adapters are replaceable implementation details.
- The first release does not need real-time collaboration or CRDT.
- Outbox, stable IDs, revisions, and tombstones are built into the first
  desktop data model so sync can be added without a data model rewrite.

## Product assumptions

The first desktop release targets one user and one active workspace. Multiple
workspaces and teams are supported by the schema, but are not first-release UI
requirements.

- A user can start using the desktop app without signing in.
- Signing in links a guest workspace to an account.
- Cross-device sync is added after the offline desktop product is stable.
- Web is an online client. Browser-local-first is not required initially.
- Attachments are stored outside the relational database.
- The interface ships in English and Simplified Chinese (`zh-CN`), with a
  locale registry that can add further catalogues without changing feature
  modules.
- Task, project, and event dates use local calendar-date semantics; the product
  does not convert them between time zones.
- Projects expose editable start dates and milestones.
- Calendar events support create, edit, and delete, but not drag, recurrence,
  or events spanning multiple days.
- Comment types and storage remain available, but comments are not part of the
  first-release UI and are deferred to future collaboration work.

## Runtime topology

```text
Web browser                    Electron desktop
    |                               |
    | HTTP                          | preload IPC
    v                               v
Cloud adapter                 Desktop adapter
    |                               |
    |                               +--> SQLite
    |                               +--> attachment store
    |                               +--> sync outbox
    v
Node.js API
    |
    +--> PostgreSQL
    +--> S3-compatible object storage
```

The renderer never talks to PostgreSQL, SQLite, the filesystem, or arbitrary
Electron/Tauri/Wails APIs directly.

## Repository layout

The project moves from a single Vite app to npm workspaces. npm remains the
package manager because the project already uses npm.

```text
apps/
  web/                   Vite UI used by web and desktop
  desktop/               Electron main process, preload, packaging
services/
  api/                   Fastify API, authentication, sync endpoints
packages/
  contracts/             Command, query, DTO, and error schemas
  domain/                Entity types and pure business rules
  application/           Command handlers and permission contexts
  client/                WorkspaceClient interface and adapters
  local-db/              SQLite migrations and repositories
  sync-core/             Outbox, retry, merge, and conflict rules
  test-fixtures/         Shared fixtures and conformance cases
```

`apps/web` owns the UI. `apps/desktop` packages the built renderer and supplies
the desktop adapter through preload.

New platform, domain, application, contract, and sync code uses strict
TypeScript. Existing UI modules migrate incrementally. The UI framework does
not need to change.

Current Milestone 3 layout:

```text
src/                    existing Vite renderer and incremental UI migration
packages/contracts/     implemented
packages/domain/        implemented
packages/application/   implemented
packages/client/        WorkspaceClient, memory, browser, and local adapters implemented
packages/test-fixtures/ implemented
packages/local-db/      implemented: SQLite schema, repository, import, and outbox
packages/sync-core/     implemented: protocol validation, push/pull runner, retry scheduling
apps/web/               planned extraction; current app remains at repository root
apps/desktop/           implemented Electron main process, preload bridge, and packaging
services/api/           planned: hosted sync service and PostgreSQL schema
```

## Dependency rules

Dependencies point inward:

```text
UI / desktop host / API transport
                |
          application layer
           /           \
       domain        contracts
```

- `domain` has no browser, Electron, Node, SQL, or network imports.
- `contracts` contains serializable schemas and types only.
- `application` depends on `domain` and `contracts`, not SQLite or HTTP.
- Storage and platform capabilities are interfaces implemented by adapters.
- `apps/web` and `apps/desktop` do not import each other.
- `packages/local-db` is never imported by browser renderer code.
- `createSqliteWorkspace` is the desktop main-process composition root. It
  constructs the repository and client; only the client contract crosses IPC.
- Local and cloud command handlers pass the same conformance tests.

This is the primary migration goal. It lets the desktop host change without
forcing pages to change.

## State ownership

The current `S` store splits into three categories:

1. Ephemeral UI state
   - Route, drawer, selection, modal, popover, and focus state.
   - Stored in renderer memory only.

2. Device preferences
   - Language, theme, density, zoom, window layout, local shortcut overrides.
   - Stored locally and not synced by default.

3. Workspace data
   - Projects, tasks, event definitions, comments, attachments, activity, and
     saved views.
   - Loaded through the application layer.
   - Held in memory only as a query cache for the synchronous renderer.

`S.data` remains as a read cache during migration. It is no longer the source
of truth and is not mutated by UI actions. The browser adapter is the current
web persistence boundary. `LocalWorkspaceClient` and
`SqliteWorkspaceRepository` make the desktop SQLite boundary available without
changing command contracts.

## Localization

The renderer uses a lightweight first-party translation layer in `src/i18n`.
Locale files are grouped by feature namespace (`common`, `nav`, `tasks`,
`settings`, and so on), and the `t()` helper supports interpolation, plural
categories through `Intl.PluralRules`, and English fallback.

- `S.prefs.language` is a device preference and persists locally.
- Locale changes apply immediately and update `document.documentElement.lang`.
- Dates, weekdays, relative time, and date-time formatting use `Intl` with the
  active locale.
- Stored domain IDs and enum values remain stable; only display labels are
  translated.
- Adding a locale requires one catalogue module plus a registry entry in
  `src/i18n/index.js`. `tests/i18n.test.ts` enforces catalogue key parity and
  static key references.

## Workspace client boundary

The renderer accesses the application through one interface:

```ts
interface WorkspaceClient {
  initialize(): Promise<BootstrapResult>;
  query<T>(query: WorkspaceQuery): Promise<T>;
  execute(command: WorkspaceCommand): Promise<CommandResult>;
  executeBatch(commands: WorkspaceCommand[]): Promise<CommandResult[]>;
  subscribe(listener: (change: ChangeSet) => void): () => void;
  sync(): Promise<SyncStatus>;
  getSyncStatus(): SyncStatus;
}
```

Implementations:

- `MemoryClient`: tests and local development.
- `DesktopClient`: typed preload IPC calls.
- `HttpClient`: cloud API calls for web.

Adapter selection happens once at startup. UI code does not branch on
`isElectron` or inspect `navigator.userAgent`.

## Commands and queries

Writes are domain commands, not generic table updates.

```ts
type WorkspaceCommand = {
  clientCommandId: string;
  workspaceId: string;
  deviceId: string;
  type: string;
  entityId: string | null;
  baseRevision: number | null;
  payload: unknown;
  createdAt: string;
};
```

Initial command families:

- `task.create`, `task.patch`, `task.move`, `task.archive`, `task.delete`
- Task subtask mutations through `task.patch`; `subtask.promote` for promotion
- `event.create`, `event.patch`, `event.delete`
- `comment.delete` and the underlying comment types remain for future
  collaboration, but no first-release UI creates or displays comments
- `project.create`, `project.patch`, `project.archive`, `project.delete`
- `project.reorder`, `task.reorder`
- `savedView.create`, `savedView.patch`, `savedView.delete`
- `workspace.linkAccount`

Rules:

- Commands are validated with runtime schemas at every boundary.
- `clientCommandId` is generated by the client and is idempotent.
- Server-side actors come from authentication, never from payload.
- A command returns the authoritative entity, revision, and sync status.
- Multi-entity operations are one batch or one domain command.
- The renderer may apply a projection immediately, but the application layer
  owns validation and rollback.

Example:

```json
{
  "clientCommandId": "01JAB7C6N4E3Q0V9M8K2T5R1XP",
  "workspaceId": "01JAB6WPD3Q4J8F9E2M7N5K1AC",
  "deviceId": "01JAB70A4XQ8M3N6P2R9T5V1BC",
  "type": "task.patch",
  "entityId": "01JAB7D2H5M8Q1N4P7R3T6V9XZ",
  "baseRevision": 12,
  "payload": {
    "patch": {
      "status": "done"
    }
  },
  "createdAt": "2026-10-27T06:31:12.000Z"
}
```

Initial queries:

```ts
type WorkspaceQuery =
  | { type: 'bootstrap'; workspaceId: string }
  | { type: 'tasks.list'; projectId?: string; includeArchived?: boolean }
  | { type: 'task.detail'; taskId: string }
  | { type: 'projects.list'; includeArchived?: boolean }
  | { type: 'activity.list'; projectId?: string; limit: number };
```

The renderer stays synchronous. Async loading updates the cache, then calls
`render()`.

## Local SQLite design

The desktop main process uses Node's built-in `node:sqlite` in WAL mode:

It is synchronous, needs no native addon build step, and is available to the
Electron main process. If packaging later requires a different SQLite runtime,
only `openDatabase` changes; repository and transaction contracts remain
stable.

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

The database lives under Electron `app.getPath("userData")`.

Core tables:

```text
workspaces
users
memberships
projects
project_members
tasks
subtasks
labels
task_labels
task_dependencies
comments
comment_reactions
attachments
activity
notifications
saved_views
sync_outbox
sync_state
entity_tombstones
schema_migrations
```

Canonical entity fields:

```text
id                 ULID
workspace_id       ULID
created_at         UTC ISO timestamp
updated_at         UTC ISO timestamp
deleted_at         nullable UTC ISO timestamp
revision           integer, incremented on accepted change
```

Additional rules:

- IDs are stable ULIDs and are never reused.
- Human keys such as `WEB-204` are display metadata, not relational IDs.
- Deletes become tombstones. Physical purge is a separate retention task.
- Ordering uses explicit `rank` values, not array position.
- Subtasks, labels, dependencies, comments, and attachments are normalized.
- Project milestones may use JSON initially because they are not independently
  queried or permissioned.
- Rich descriptions store sanitized HTML plus a plain-text search projection.

Every local command runs in one SQLite transaction:

```text
BEGIN
  validate command
  update entity tables
  append activity rows
  increment revision
  insert into sync_outbox
  record local change sequence
COMMIT
```

No code path updates workspace tables and the outbox in separate transactions.

## Attachments

An attachment record contains metadata only:

```text
id
workspace_id
project_id
task_id
file_name
content_type
byte_size
sha256
storage_key
created_at
deleted_at
```

Desktop files live in a managed directory under user data. Cloud files use an
S3-compatible object store and pre-signed URLs.

The renderer never receives a filesystem path. It sends bytes through the
narrow desktop attachment bridge and gets back generated metadata:

```ts
interface AttachmentStorage {
  save(input: { name: string; contentType: string; bytes: Uint8Array }): Promise<StoredAttachment>;
  copy(storageKey: string, contentType?: string): Promise<StoredAttachment>;
  read(storageKey: string): Promise<Uint8Array>;
  open(storageKey: string): Promise<void>;
  reveal(storageKey: string): Promise<void>;
  remove(storageKey: string): Promise<void>;
}
```

Desktop storage keys have the form
`attachments/<generated-directory>/<generated-file>` and are validated against
a strict pattern before resolution. Display names are normalized to a basename,
files are limited to 250 MB, temporary writes are synced and atomically renamed,
and SHA-256 is computed by the host. Browser mode remains metadata-only until an
IndexedDB/OPFS implementation is introduced.

Attachment lifecycle:

- The renderer validates the empty-file and 250 MB limits before reading bytes.
- Form uploads are saved before the task command, so a failed write leaves no
  task referencing absent contents.
- Deletes remove the workspace record first, then the host-owned blob. If blob
  removal fails, startup cleanup removes it once no file record references it.
- Startup cleanup enumerates generated attachment directories and deletes only
  directories whose workspace key is absent from the current file records.
- Deleting a record with stored bytes intentionally omits Undo. Restoring the
  metadata would otherwise create a broken file entry.
- In-app image previews are capped at 25 MB; larger files open in the system
  viewer.

Upload sequence:

1. Create a pending attachment record.
2. Write the file to local or cloud blob storage.
3. Verify size and checksum.
4. Mark the attachment available and commit the command.
5. Clean orphaned blobs with a background job.

## Sync protocol

Sync is asynchronous and eventually consistent. It is not a prerequisite for
local writes.

```text
POST /v1/sync/push
GET  /v1/sync/pull?after=<serverSeq>
GET  /v1/bootstrap
```

Push sends committed local outbox commands. The server:

1. Authenticates the user and validates workspace membership.
2. Deduplicates by `clientCommandId`.
3. Validates the command and `baseRevision`.
4. Applies it in a PostgreSQL transaction.
5. Assigns a monotonically increasing `serverSeq`.
6. Records the change and returns the authoritative result.

Pull returns changes after the client cursor, including tombstones. The client
applies changes in `serverSeq` order and advances the cursor atomically with
the local data update.

Sync triggers:

- After a local command, with a short debounce.
- On app start.
- When the network returns.
- When the app regains focus.
- On a low-frequency timer.
- On a server hint through SSE or WebSocket in a later release.

Push and pull are both required. A server hint only causes an earlier pull.

## Conflict policy

The first sync release uses revision-checked field merging, not CRDT.

- Disjoint field changes merge automatically.
- Same-field conflicts return a conflict result and are never silently dropped.
- The client keeps the command pending until the user chooses local, remote,
  or a conflict copy.
- Comments are append-only.
- Labels and project members use add/remove commands.
- Reordering uses `rank`, not whole-list replacement.
- Delete and archive operations are tombstones and win over edits.
- Restoring deleted data is an explicit command.
- Rich-text conflicts preserve both versions rather than overwriting a body.

The local database records `pending`, `synced`, `conflict`, and `failed` states
for every outbox command. The UI exposes sync status and retry.

CRDT is deferred. If real-time collaborative rich-text editing is added, a
CRDT such as Yjs stays isolated to that editor and does not become the storage
model for projects, tasks, permissions, or ordering.

## Cloud API

The API is a separate Node.js 22 service:

- Fastify for HTTP and schema validation.
- PostgreSQL for workspace data and sync history.
- `pg` plus Kysely for typed queries.
- Explicit SQL migrations as the schema source of truth.
- S3-compatible object storage for attachments.
- Structured logs with request, workspace, device, and serverSeq IDs.

Authentication:

- Web: secure HttpOnly session cookie.
- Desktop: system browser OAuth/OIDC with PKCE; refresh token in OS keychain.
- The server derives actor and permissions from the session.
- Guest desktop workspaces require no account.

Authorization is scoped by workspace membership. A client-supplied
`workspaceId` is never trusted without a membership check.

The API deploys independently from the static web build. Vercel can continue to
host the web renderer.

## Desktop host

Electron is the first shell because the product is JavaScript and the main
process can reuse domain, application, and sync packages.

Security requirements:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- The renderer loads only packaged application assets.
- Preload exposes a narrow typed API for workspace commands and platform
  services.
- No generic `db.query()`, `fs`, `child_process`, or shell bridge is exposed.
- External links use a vetted `openExternal` handler.
- Content Security Policy blocks remote script execution.
- Rich HTML is sanitized on write and before rendering.
- Tokens live in the OS keychain, not `localStorage`.
- Database and attachment directories use user-only permissions.

Platform services have a separate interface:

```ts
interface Platform {
  pickFiles(options: PickFilesOptions): Promise<PickedFile[]>;
  saveFile(options: SaveFileOptions): Promise<void>;
  notify(notification: AppNotification): Promise<void>;
  openExternal(url: string): Promise<void>;
  getDeviceInfo(): Promise<DeviceInfo>;
}
```

Electron, Tauri, and Wails can implement this interface and the workspace
adapter without changing UI code.

## Web client

The first web release uses the HTTP adapter and PostgreSQL as its source of
truth. It is an online client, not a local-first client.

The UI and domain contracts match desktop. Browser-local persistence with
SQLite WASM/OPFS is a later option and does not block desktop.

## Migration from the current app

The current `localStorage` workspace is migrated once:

1. Read and validate `moss.v2`.
2. Save an immutable backup copy.
3. Map legacy IDs to ULIDs while preserving relationships.
4. Import into SQLite in one transaction.
5. Record migration completion.
6. Keep the legacy backup until the user removes it.

JSON import/export remains supported. Export becomes a logical backup generated
by the application layer, not a raw SQLite file.

## Testing strategy

- Domain unit tests for transitions, recurrence, archive, delete, and rank.
- Contract tests for every command and query.
- SQLite integration tests using a temporary database.
- Sync conformance tests shared by local and server handlers.
- HTTP API tests with PostgreSQL.
- Electron tests for preload isolation and offline startup.
- Playwright tests for create, edit, move, delete, restart, and offline reopen.
- Two-client sync tests for duplicate commands, tombstones, and conflicts.

The same fixtures drive desktop-local and cloud-server command tests so behavior
cannot drift between adapters.

## Delivery plan

### Milestone 1: Boundaries

- Introduce TypeScript and npm workspaces.
- Create `contracts`, `domain`, `application`, and `client`.
- Add `WorkspaceClient` and the memory adapter.
- Move task and project mutations out of UI actions.
- Make UI actions await or explicitly optimistic-update through the client.

Exit gate: pages do not directly mutate workspace entities or call `save()` for
business data.

### Milestone 2: Local store

- [x] Add SQLite schema and migrations.
- [x] Implement local repositories and command handlers.
- [x] Import current JSON/localStorage data.
- [x] Add outbox and tombstone plumbing.
- [x] Replace business-data localStorage persistence with the local store in
      the packaged app. The web build intentionally remains on localStorage.

Exit gate: core CRUD and restart persistence work without the cloud. The
storage integration and persistence tests pass. The packaged renderer connects
to SQLite through the desktop adapter.

### Milestone 3: Desktop shell

- [x] Add Electron main and preload packages.
- [x] Load the built renderer through the desktop adapter.
- [x] Store data under userData.
- [x] Add local backup and restore.
- [x] Implement local file attachments.

Exit gate: the packaged app starts and remains usable with networking disabled.

### Milestone 4: Cloud sync

- [x] Add transport-neutral push/pull protocol and response validation.
- [x] Add HTTP sync transport, durable pull cursor, and ordered remote changes.
- [x] Apply remote entities and tombstones atomically with the pull cursor.
- [x] Add sync status, manual sync, failed-command retry, and conflict summary UI.
- [ ] Add account linking, PostgreSQL schema, and the hosted API.
- [ ] Add server-side idempotency, revisions, and conflict resolution.
- [ ] Add cloud attachment upload and download.

See [remaining-work.md](remaining-work.md) for the complete follow-up checklist.

Exit gate: two devices synchronize one workspace without duplicate commands or
silent data loss.

### Milestone 5: Product hardening

- Code signing, notarization, and automatic updates.
- Database backup before upgrade.
- Crash reporting with user consent.
- Performance work for larger workspaces.
- Optional team permissions and real-time notifications.

## Non-goals for the first desktop release

- Real-time collaborative editing.
- CRDT-based document storage.
- End-to-end encrypted cloud sync.
- Multiple GUI windows editing one workspace.
- A browser-local-first implementation.
- Plugin APIs.
- Mobile clients.

## Consequences

The main cost is an intentional refactor of the synchronous data path. UI
actions become async at the application boundary, and business data moves from
whole-workspace snapshots to entity commands.

The payoff is that Electron, Tauri, and Wails remain replaceable hosts. They
differ in IPC, language, packaging, and platform integration, but UI, contracts,
domain rules, and sync protocol do not need to be rewritten.

The architecture does not promise zero-cost shell replacement. It promises a
stable boundary around the parts that should survive replacement.
