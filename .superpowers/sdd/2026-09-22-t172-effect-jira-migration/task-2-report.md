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
