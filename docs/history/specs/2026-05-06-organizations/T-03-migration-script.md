# T-03 — One-off migration script for existing dev data

**Status:** ready
**Depends on:** T-01, T-02
**Phase:** 3

## Goal

Migrate the existing project-project dev data (handful of projects, two users) into the new schema and FS layout. Earliest user becomes super-admin and org owner of a new `project-project` organization; the other user becomes org member; all existing project-level roles preserved.

## Scope

- Create `packages/backend/scripts/migrate-orgs.ts`.
- Add `bun run migrate:orgs` script entry.
- Steps the script performs (in order):
  1. **Pre-flight.** Verify schema has the new columns (UUID id, organizationId, createdBy, projectMember.projectId). Verify no `organization` row already has `slug = "project-project"`. Fail loud on any unexpected state.
  2. **Resolve users.** Query `user` ordered by `createdAt asc`. Earliest = primary; second = secondary. Fail loud if 0 or >2 users exist (this script is for our dev data only).
  3. **Promote primary to super-admin.** `UPDATE user SET role = 'admin' WHERE id = <primary>`.
  4. **Create org.** Insert `organization` row: `slug = "project-project"`, `name = "ProjectProject"`. Insert `member` rows: primary as `owner`, secondary as `member`.
  5. **Backfill `projectIndex`.** For every row: assign UUID `id` (already defaulted via `gen_random_uuid()` at INSERT — verify), set `organizationId = <new-org-id>`.
  6. **Remap `projectMember`.** For every row: `UPDATE projectMember SET projectId = (SELECT id FROM projectIndex WHERE slug = projectMember.projectSlug)`. Existing `role` values preserved.
  7. **Filesystem move.** `mkdir -p data/orgs/project-project && mv data/projects data/orgs/project-project/projects`.
  8. **Frontmatter rewrite.** For each `project.md` under the new path: parse → add `org: project-project` → rename `ownerId` → `createdBy` → write back.
  9. **Verify.** Walk every project via `Markdown.readProjectFile`. Assert decode succeeds.
- Add a follow-up Drizzle migration (separate file) that tightens nullable → NOT NULL on `projectIndex.organizationId`, `projectIndex.id` (PK), `projectMember.projectId`. Drop the old `projectIndex.slug PK` + `projectMember.projectSlug` column.

## Out of scope

- Idempotency. This is one-off; failure is loud, recovery is manual.
- Generalizing for production use (we have no production yet).
- Any rollback automation.

## Acceptance criteria

1. `bun run migrate:orgs` against current dev data succeeds end-to-end.
2. After running:
   - `data/projects/` no longer exists.
   - `data/orgs/project-project/projects/` contains every project that was previously under `data/projects/`.
   - Every `project.md` has `org: project-project` and `createdBy:` (no `ownerId:`).
   - `organization` table has one row with `slug = "project-project"`.
   - `member` table has primary as owner, secondary as member.
   - `user.role` column shows primary as `admin`, secondary as default.
   - `projectMember` rows reference the new `projectId` UUIDs; old `projectSlug` column is gone.
3. Follow-up migration tightens nullables; `bun run db:migrate` succeeds.
4. Frontend still loads (project list, project detail) once T-05 is also merged — but this ticket is verified standalone via DB + FS state.
5. The script is moved to `scripts/_archive/` (or deleted) post-success.

## Notes

- The script imports the same Drizzle client and Better Auth instance the backend uses. Use plain SQL where it's clearer than Better Auth's API; the script is intentionally low-level.
- DB and FS aren't transactional. Order: DB first, then FS, then frontmatter. On FS error: log, surface manual `mv` instructions, exit non-zero.
