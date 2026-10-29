# Remaining Work

Status: Active

Date: 2026-10-29

The single-user, local-first product scope is implemented. The items below are
either deliberately deferred product capabilities or cloud/sync work that is
not required for the local first release.

The local-first desktop foundation is implemented: SQLite persistence,
attachments, the durable outbox, HTTP sync transport, push/pull orchestration,
remote change application, retry state, and sync status controls.

The following work is still required before cloud sync can be considered
complete.

## Deferred local product scope

- [ ] Build the comments UI and collaboration flows. Comment types, command
      compatibility, and SQLite tables are intentionally retained.
- [ ] Add more interface locales beyond English and Simplified Chinese
      (`zh-CN`). Locale catalogues, fallback, pluralization, locale-aware dates,
      and key-parity tests are already in place.
- [ ] Add time-zone conversion. First-release task, project, and event dates use
      local calendar-date semantics.
- [ ] Add event drag-and-drop, multi-day events, recurrence, and reminders.

## Hosted API and database

- [ ] Add the Fastify service and PostgreSQL schema/migrations.
- [ ] Add authentication, account linking, and workspace membership checks.
- [ ] Implement server-side command validation and idempotency by
      `clientCommandId`.
- [ ] Persist changes in server sequence order inside a PostgreSQL transaction.
- [ ] Implement revision checks, field-level merge rules, conflict responses,
      and tombstones.
- [ ] Implement paginated pull against the server change log.
- [ ] Add API integration tests, including duplicate delivery and workspace
      authorization.

## Sync completion

- [ ] Define the authoritative server representation for every workspace
      setting and metadata collection, including notifications, events, recent
      searches, sessions, invoices, and notification preferences.
- [ ] Add a conflict review flow so the user can choose local, remote, or a
      conflict copy; conflicts must not remain a terminal dead end.
- [ ] Schedule automatic retries from persisted `retry_at` deadlines. The
      runner currently honors a deadline when invoked but does not wake itself for
      the next retry.
- [ ] Add sync triggers for network recovery, app focus, and a low-frequency
      background timer.
- [ ] Add two-device end-to-end tests against the real API, covering concurrent
      edits, deletes, offline edits, and reconnect.

## Cloud attachments

- [ ] Add S3-compatible object storage and authenticated upload/download
      endpoints.
- [ ] Upload local attachment bytes before or alongside their metadata command.
- [ ] Download and materialize remote attachments with checksum verification.
- [ ] Add server-side orphan cleanup, retention rules, and attachment
      authorization tests.

## Account and security

- [ ] Add sign-in, sign-out, and workspace linking UI.
- [ ] Store desktop refresh tokens in the operating-system keychain.
- [ ] Enforce authorization for every sync and attachment request.
- [ ] Document the production key, token, and object-storage configuration.

## Host portability and hardening

- [ ] Add a Tauri or Wails host adapter when a second desktop shell is needed;
      the existing `WorkspaceClient` and `Platform` boundaries are the intended
      integration points.
- [ ] Add code signing, notarization, and automatic updates.
- [ ] Add pre-upgrade database backups.
- [ ] Add opt-in crash reporting.
- [ ] Profile large workspaces and attachment-heavy libraries.

## Deliberate non-goals

- Real-time collaborative editing.
- CRDT-backed project and task storage.
- End-to-end encrypted cloud sync.
- Browser-local-first persistence.
- Multiple GUI windows editing one workspace.
