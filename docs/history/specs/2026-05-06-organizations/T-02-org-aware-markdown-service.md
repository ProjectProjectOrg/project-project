# T-02 — Org-aware Markdown service

**Status:** ready
**Depends on:** T-01
**Phase:** 2

## Goal

Update `Markdown` service so all path resolution uses `data/orgs/<orgSlug>/projects/<projectSlug>/...` instead of `data/projects/<projectSlug>/...`. Introduce `orgSlug` as a required parameter on every method that reads/writes/lists/removes a project-scoped file.

## Scope

- Update `services/Markdown.ts`:
  - `readProjectFile(orgSlug, projectSlug)` — adds `orgSlug` first arg.
  - `writeProjectFile(orgSlug, projectSlug, fm, body)` — same.
  - `removeProjectDir(orgSlug, projectSlug)` — same.
  - `readTicketFile(orgSlug, projectSlug, id)`, `writeTicketFile`, `listTickets`, `removeTicket` — same shape change.
  - Any docs methods (if already implemented) get the same treatment.
- Update path-construction to one helper: `projectDir(orgSlug, projectSlug)` returns the absolute path. Single source of truth.
- Update `Project` schema in `packages/shared/src/schemas/Project.ts`:
  - Rename `ownerId` → `createdBy`.
  - Add `org: string` field (the org slug).
- Update all callers in `services/Projects.ts` and `services/Tickets.ts` to pass `orgSlug`. The org slug is plumbed through from the calling handler — no global lookup.
- Update `Projects.syncFrontmatter` to write the `org` field.
- Update `parseFrontmatter` paths to expect the new field (default to a sentinel and warn-log if missing — the migration will populate it; this gives belt+braces).

## Out of scope

- Handler / route updates (T-05).
- The actual disk move (T-03).
- New endpoint shapes (T-05).

## Acceptance criteria

1. `bun run typecheck` passes.
2. Existing service-level tests updated to thread `orgSlug` through; pass.
3. Reading a `project.md` whose frontmatter is missing `org` produces a logged warning but doesn't crash (defensive — for the brief window before T-03 runs).
4. `Markdown.projectDir("acme", "design-system")` returns the absolute path ending in `data/orgs/acme/projects/design-system`.

## Notes

- Don't introduce an "active org" concept here — every method takes an explicit `orgSlug`. Active org is a request-context concern (T-06).
- Be careful with `listProjectsDir` (or equivalent if it exists) — it now needs to know how to walk `data/orgs/*/projects/*` rather than `data/projects/*`. If the handler always knows the org, this might not be needed; check before adding.
