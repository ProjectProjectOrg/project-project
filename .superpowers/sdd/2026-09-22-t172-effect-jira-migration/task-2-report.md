# Task 2 report — Hidden-project schema and visibility barrier

## Implemented

- Added nullable `project_index.published_at` and the shared `publishedProject` Drizzle predicate.
- Generated `20260922120000_jira_effect_workflow`, then staged the migration as add nullable column, backfill every existing project from `created_at`, and set the normal-insert default. The migration also converts `jira_migration.id` to text and adds workflow execution, attempt, scan revision, failure sequence, retention, and cleanup fields while retaining lease fields.
- Applied the predicate at project listing/lookup, ticket indexing and reconciliation, attachments, tags, statuses, GitHub, Everhour, Figma, Better Auth hooks, and the public DB count route. Normal project creation writes the publication time explicitly.
- Preserved the migration-internal staged-project lookup. When a destination ID is present, it selects that project by ID without the public predicate so an unpublished migration project remains reachable for cleanup.
- Added SQL-backed visibility coverage for project list/get/membership, ticket lookup, reconciliation, a direct hidden-row lookup, and MCP `list_projects`.

## TDD evidence

### RED

Command:

```text
cd packages/backend && bun run test -- src/Layers/Projects.access.test.ts
```

Output:

```text
FAIL src/Layers/Projects.access.test.ts
Error: Cannot find module '../db/projectVisibility'
```

The new public-predicate test failed because the required shared visibility module did not exist.

### GREEN

Command:

```text
cd packages/backend && PROJECTPROJECT_TEST_DATABASE_URL=postgres://projectproject:projectproject_dev@127.0.0.1:55432/projectproject_effect_v4_t172 DATABASE_URL=postgres://projectproject:projectproject_dev@127.0.0.1:55432/projectproject_effect_v4_t172 bun run test -- --no-file-parallelism src/db/projectVisibility.test.ts src/Layers/Projects.access.test.ts src/Layers/TicketIndex.publication.test.ts src/Layers/Attachments.test.ts src/Layers/McpHttp.test.ts src/main.test.ts
```

Output:

```text
Test Files  6 passed (6)
Tests  109 passed (109)
```

The SQL test uses only the isolated `projectproject_effect_v4_t172` database. It inserts normal and unpublished project rows with valid membership and verifies public seams do not expose the unpublished row. The MCP test traverses the authenticated streamable HTTP route and verifies `list_projects` returns the published project but not the hidden project.

## Verification

```text
cd packages/backend && bun run db:generate -- --name jira_effect_workflow
No schema changes, nothing to migrate
```

```text
cd packages/backend && bun run typecheck
exit 1: existing Effect diagnostics, including the six TS377033 multipleEffectProvide warnings in src/Jira/Client.test.ts assigned to Task 5. No TypeScript errors in Task 2 files.
```

```text
env -u DATABASE_URL -u PROJECTPROJECT_TEST_DATABASE_URL bun run test
Test Files  173 passed | 13 skipped (186)
Tests  1549 passed | 67 skipped (1616)
```

The full suite emitted the pre-existing experimental SQLite and jsdom canvas/scroll warnings.

## Files changed

- `packages/backend/src/db/projectVisibility.ts`
- `packages/backend/src/db/projectVisibility.test.ts`
- `packages/backend/src/db/schema.ts`
- `packages/backend/src/db/migrations/20260922120000_jira_effect_workflow/migration.sql`
- `packages/backend/src/db/migrations/20260922120000_jira_effect_workflow/snapshot.json`
- `packages/backend/src/Jira/Migrations.ts`
- `packages/backend/src/Layers/Attachments.ts`
- `packages/backend/src/Layers/EverhourIntegrations.ts`
- `packages/backend/src/Layers/EverhourTimeTracking.ts`
- `packages/backend/src/Layers/FigmaLinks.ts`
- `packages/backend/src/Layers/GitHubIntegrations.ts`
- `packages/backend/src/Layers/McpHttp.test.ts`
- `packages/backend/src/Layers/ProjectStatuses.ts`
- `packages/backend/src/Layers/Projects.access.test.ts`
- `packages/backend/src/Layers/Projects.ts`
- `packages/backend/src/Layers/Tags.ts`
- `packages/backend/src/Layers/TicketIndex.ts`
- `packages/backend/src/Layers/Tickets.ts`
- `packages/backend/src/auth.ts`
- `packages/backend/src/main.ts`

## Self-review

Reviewed every changed query and migration artifact. The predicate accepts an optional query-table value so relation-query aliases compile to valid SQL while the required zero-argument predicate remains available for direct Drizzle queries. No lease fields were removed. No shared HTTP API, dependencies, or legacy in-flight-job policy were added.

## Concerns

No Task 2 blocker. Backend typecheck remains nonzero on pre-existing repository diagnostics described above.

## Review round 1 fixes

- `Attachments.resolveForServing` now joins its owning project and requires `published_at` before the membership-or-organization-admin authorization fallback can reach S3 signing.
- `FigmaLinks.resolveThumbnailUrl` now joins each referencing project and requires publication before authorization or thumbnail signing.
- The organization attachment library excludes hidden owning projects from items, totals, summaries, visible ticket references, and deletion. A missing project row remains visible so genuine orphaned attachment cleanup continues to work.
- Added a public HTTP ticket-list regression using `TicketsHandlerLive` and the real `TicketsLive` service. Its project-access adapter delegates to the real SQL-backed `Projects` service; a hidden project returns `404 { "_tag": "NotFound" }`.
- Added a populated-table migration regression that applies the exact `published_at = created_at` backfill against an isolated database and verifies a later insert receives the database default.

### Review RED

```text
PROJECTPROJECT_TEST_DATABASE_URL=postgres://projectproject:projectproject_dev@127.0.0.1:55432/projectproject_effect_v4_t172 bunx vp test run packages/backend/src/db/projectVisibility.test.ts --no-file-parallelism
Test Files  1 failed (1)
Tests  2 failed | 3 passed (5)
```

The pre-fix SQL regression received a signed URL for a hidden-only attachment and included hidden attachments in the organization library.

### Review GREEN

```text
PROJECTPROJECT_TEST_DATABASE_URL=postgres://projectproject:projectproject_dev@127.0.0.1:55432/projectproject_effect_v4_t172 bunx vp test run packages/backend/src/db/projectVisibility.test.ts packages/backend/src/Layers/Attachments.test.ts packages/backend/src/Layers/FigmaLinks.test.ts --no-file-parallelism
Test Files  3 passed (3)
Tests  139 passed (139)
```

```text
bun run --cwd packages/backend typecheck
exit 1: existing repository Effect suggestions and diagnostics; no TypeScript errors in changed Task 2 files.
```

The full repository suite was already green before the review round. Two subsequent `bun run test` invocations emitted the known jsdom/SQLite warnings and each returned from command collection after 30.2 seconds without final test output or an executable session ID. An immediate `pgrep -fal 'vp test|vitest|vite-plus'` check found no remaining test process. The final exit status is therefore unavailable; the changed code is covered by the focused green suite above.

## Review round 2 fixes

- Attachment serving now uses the same published-or-missing-owner rule as the organization library. Existing unpublished owners remain blocked, while a genuinely missing owner keeps the organization-admin fallback and can receive a signed orphan attachment URL.
- The upgrade regression now reads and executes the actual migration SQL file. It creates a temporary PostgreSQL schema in a transaction with populated pre-migration `project_index` and `jira_migration` tables, executes every migration statement in order, verifies `legacy.published_at = legacy.created_at`, verifies the post-migration default on a new insert, and rolls the schema back.

### Review round 2 RED

```text
PROJECTPROJECT_TEST_DATABASE_URL=postgres://projectproject:projectproject_dev@127.0.0.1:55432/projectproject_effect_v4_t172 bunx vp test run packages/backend/src/db/projectVisibility.test.ts --no-file-parallelism
Test Files  1 failed (1)
Tests  2 failed | 6 passed (8)
```

The new orphan-serving assertion failed with `NotFound` before S3 signing because `resolveForServing` used an inner project join. The second failure was the existing library fixture counting the newly inserted orphan; it was made resilient to independent orphan fixtures before GREEN.

### Review round 2 GREEN

```text
PROJECTPROJECT_TEST_DATABASE_URL=postgres://projectproject:projectproject_dev@127.0.0.1:55432/projectproject_effect_v4_t172 bunx vp test run packages/backend/src/db/projectVisibility.test.ts packages/backend/src/Layers/Attachments.test.ts --no-file-parallelism
Test Files  2 passed (2)
Tests  95 passed (95)
```

```text
bun run --cwd packages/backend typecheck
TYPECHECK_EXIT=1
```

Typecheck remains nonzero only on the repository's existing Effect diagnostics; there are no TypeScript errors in the changed files.
