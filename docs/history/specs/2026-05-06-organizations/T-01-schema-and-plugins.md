# T-01 — Better Auth org + admin plugins; schema migration

**Status:** ready
**Depends on:** —
**Phase:** 1

## Goal

Wire up Better Auth's `organization` and `admin` plugins, generate the auth schema, and apply our own schema changes (UUID id on `projectIndex`, FK to org, rename `ownerId` → `createdBy`). After this ticket, the DB carries the org dimension but no user-visible UI exists yet.

## Scope

- Add `organization` plugin to `packages/backend/src/auth.ts` with `additionalFields`: `billingCustomerId` (string, nullable, not exposed via input), `subscriptionStatus` (string, nullable), `deletedAt` (date, nullable).
- Add `admin` plugin (instance super-admin role).
- Run `bun run auth:generate` to regenerate `db/auth-schema.ts`. Verify it adds `organization`, `member`, `invitation` tables and the `role`/`banned`/`banReason`/`banExpires` columns on `user`.
- Hand-write a Drizzle migration that:
  - Adds `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` to `projectIndex` (nullable to start; tightened in T-03).
  - Adds `organizationId text` to `projectIndex` referencing `organization.id` ON DELETE CASCADE (nullable to start).
  - Renames `projectIndex.owner_id` → `created_by`.
  - Adds `projectId uuid` to `projectMember` referencing `projectIndex.id` ON DELETE CASCADE (nullable to start).
  - Adds UNIQUE `(organization_id, slug)` index on `projectIndex` (deferred until T-03 backfills).
- Update `packages/backend/src/db/schema.ts` to mirror the new shape.
- Update `services/BetterAuth.ts` Effect wrapper to expose org-aware methods we'll need: `createOrganization`, `getActiveOrganization`, `setActiveOrganization`, `createInvitation`, `acceptInvitation`, `listOrganizations`, `addMember`, `removeMember`, `updateMember`. Each is `Effect.tryPromise`-wrapped, errors mapped to tagged classes.

## Out of scope

- Backfilling existing data (T-03).
- Tightening nullables to NOT NULL (T-03 follow-up migration).
- Any UI.
- Any handler / atom changes.

## Acceptance criteria

1. `bun run db:migrate` applies cleanly against a fresh Postgres.
2. `bun run typecheck` passes.
3. `services/BetterAuth.ts` exposes the new methods with typed signatures.
4. Existing handlers and tests still compile (the new columns are nullable so old code paths are unaffected).
5. A smoke test (in `main.test.ts` or similar) creates an org via `auth.api.createOrganization` and asserts a row exists in `organization` and `member`.

## Notes

- Slug validation (regex + reserved-words list) lands in T-04 alongside the onboarding form that consumes it — no point introducing dead code earlier.
- Better Auth's `organizationCreation.afterCreate` hook is the right place to plumb anything we want to run on every org creation (e.g. seeding default project? not in v1).
