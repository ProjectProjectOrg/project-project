# MCP Doc Surface — Design

**Date:** 2026-05-11
**Branch:** feat/T-6-mcp-simple-ai-chat
**Parent spec:** `docs/superpowers/specs/2026-05-11-mcp-server-design.md`
**Predecessor plan:** `docs/superpowers/plans/2026-05-11-mcp-entity-read-surface.md` (Plan 2)

## Goal

Expose the raw markdown source of each entity file — project, group, ticket — through three new read-only MCP tools. The whole app stores entities as `.md` files on disk; AI agents handle markdown natively. Giving an agent the verbatim file (frontmatter block intact, body unmodified) lets it reason about the source of truth the same way a human editor does, and sets up future write tools cleanly.

## Non-goals

- **Listing tools.** Plan 2 already exposes `list_projects`, `list_groups`, `list_tickets` for discovery; parallel `list_*_doc` tools would surface the same set with a different envelope. The four `get_*_doc` tools are sufficient.
- **Writes.** No `put_*_doc` in this PR; mirrors the v1 read-only scope from the parent spec.
- **Org-level raw doc.** Orgs are DB-backed; there is no `org.md` on disk.
- **Project Documentation tab.** The `data/projects/<slug>/docs/**` arbitrary-doc tree from `docs/PROJECTPROJECT.md` is a separate feature requiring new services. Explicitly out of scope here.
- **Body-only return.** A body-only string would be byte-identical to `get_project.body` / `get_group.body` / `get_ticket.body` from Plan 2 — pure duplication. Returning the full file (frontmatter + body) is the only shape that earns its slot.

## Tool surface

Three new entries appended to the catalog in `packages/shared/src/mcp/index.ts`:

| Tool | Input | Output | Errors |
| --- | --- | --- | --- |
| `get_project_doc` | `{ orgSlug: Slug, projectSlug: Slug }` | `DocFile` | `Unauthorized`, `NotFound` |
| `get_group_doc` | `{ orgSlug: Slug, projectSlug: Slug, id: GroupId }` | `DocFile` | `Unauthorized`, `NotFound` |
| `get_ticket_doc` | `{ orgSlug: Slug, projectSlug: Slug, id: TicketId }` | `DocFile` | `Unauthorized`, `NotFound` |

Descriptions:

- `get_project_doc` — "Raw markdown source of a project's project.md (frontmatter + body)."
- `get_group_doc` — "Raw markdown source of a group's .md file (frontmatter + body)."
- `get_ticket_doc` — "Raw markdown source of a ticket's .md file (frontmatter + body)."

Input field names match Plan 2 exactly: `orgSlug`, `projectSlug`, `id` (typed as `GroupId` / `TicketId`).

## Shared schema

New file `packages/shared/src/mcp/DocFile.ts`:

```ts
import * as Schema from "effect/Schema"

export const DocFile = Schema.Struct({
  path: Schema.String,
  content: Schema.String
})
export type DocFile = typeof DocFile.Type
```

Re-exported from `packages/shared/src/mcp/index.ts`.

**`path`** is relative to the markdown data root and uses the canonical `orgs/<orgSlug>/projects/<projectSlug>/...` prefix — e.g. `orgs/acme/projects/web/tickets/T-12.md` — not absolute. Reasons:

- Stable across deployments; the FS root differs between dev, prod, and CI.
- Doesn't disclose internal layout (`/var/lib/...`, `/data/...`) to MCP clients.
- Matches what a human grepping `data/projects/` would type.

**`content`** is the file contents read verbatim as UTF-8, including the YAML frontmatter block, the `---` delimiters, and the body. No reformatting, no re-emission through a YAML serializer. Byte-identical to `cat <file>.md` modulo line-ending normalization that the OS already applies on read.

## Backend wiring

### 1. `Markdown` service (`packages/backend/src/Services/Markdown.ts` + `Layers/Markdown.ts`)

The Markdown service owns FS access today; the `*Docs` services don't touch the disk directly. Stay consistent: add three raw-read primitives to `Markdown`.

New methods on `MarkdownShape`:

```ts
readonly readProjectFileRaw: (
  orgSlug: string,
  slug: string
) => Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError>

readonly readTicketFileRaw: (
  orgSlug: string,
  slug: string,
  id: string
) => Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError>

readonly readGroupFileRaw: (
  orgSlug: string,
  slug: string,
  id: string
) => Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError>
```

Implementation in `MarkdownLive`:

- Compute the full path with the same `projectDir(orgSlug, slug)` helper already used by the parsed-read methods, plus `tickets/<id>.md` or `groups/<id>.md` as appropriate.
- `fs.readFile(fullPath, "utf8")`. On `ENOENT`, fail with `NotFound`; on any other FS error, fail with `MarkdownError` carrying the cause — same error-mapping pattern the existing read methods use.
- Return `{ path: path.relative(root, fullPath), content }`.

### 2. `*Docs` services

Each of `ProjectDocs`, `GroupDocs`, `TicketDocs` (in `packages/backend/src/Services/` and `Layers/`) gains a `readRaw` method that thinly delegates to the matching Markdown primitive. Same shape across the three services:

```ts
// ProjectDocs
readonly readRaw: (
  orgSlug: string,
  slug: string
) => Effect.Effect<{ path: string; content: string }, NotFound | MarkdownError>

// GroupDocs / TicketDocs add `id: string` as the third param
```

The `*Docs` interface is the seam the dispatcher already imports for entity reads — keeping `readRaw` there means the dispatcher's import surface doesn't grow.

Telemetry: wrap each `readRaw` in `with*DocTelemetry` the same way `read` is wrapped, with `operation: "readRaw"`.

### 3. MCP dispatcher

Three new branches in the existing dispatcher (the file Plan 2 edited — `packages/backend/src/mcp/dispatcher.ts` or its current equivalent). Each branch:

1. Resolves `CurrentUser` via the same auth path the other `get_*` tools use.
2. Performs the same visibility check the matching entity tool already runs (project membership for `get_project_doc`; project membership + group/ticket existence for the other two).
3. Calls `*Docs.readRaw(...)` and returns the result.

**Visibility ordering matters:** run the visibility check *before* the FS read. Both a disk-level miss and a visibility miss surface as `NotFound`, so existence of a hidden file isn't disclosed.

## Tests

Match the conventions of the surrounding files in each directory.

- **`Markdown` tests** — happy path + NotFound for each of `readProjectFileRaw`, `readTicketFileRaw`, `readGroupFileRaw`. Use a temp-dir fixture mirroring the existing Markdown tests.
- **`ProjectDocs.test.ts` / `GroupDocs.test.ts` / `TicketDocs.test.ts`** — `readRaw` returns the expected `{ path, content }` for a seeded file. Path is data-root-relative.
- **Dispatcher smoke** — extend `dispatcher.test.ts` (the sibling Plan 2 added a smoke for `list_tickets` in) with one happy-path call per new tool, plus one hidden-project NotFound case.

No write tests; nothing in this plan writes.

## Files touched

**Modified:**

- `packages/shared/src/mcp/index.ts` — re-export `DocFile`; append three catalog entries.
- `packages/backend/src/Services/Markdown.ts` — three new interface methods.
- `packages/backend/src/Layers/Markdown.ts` — three new implementations.
- `packages/backend/src/Services/ProjectDocs.ts` / `GroupDocs.ts` / `TicketDocs.ts` — `readRaw` on each interface.
- `packages/backend/src/Layers/ProjectDocs.ts` / `GroupDocs.ts` / `TicketDocs.ts` — `readRaw` impl.
- `packages/backend/src/mcp/dispatcher.ts` (or current name) — three new tool branches.
- `packages/backend/src/.../dispatcher.test.ts` — three new smoke tests.
- One test file per `*Docs` service for the new `readRaw` method.
- One test in the Markdown test file for each of the three new primitives.

**Created:**

- `packages/shared/src/mcp/DocFile.ts`.

## Open items deferred to implementation

- Exact filename of the dispatcher test file (Plan 2 added one; reuse).
- Whether `path.relative` should use POSIX separators on Windows. Match what `Markdown.projectDir` returns today.

## Success criteria

In any Claude Code session against this backend:

- `get_ticket_doc({ orgSlug: "acme", projectSlug: "web", id: "T-12" })` returns the raw markdown of `orgs/acme/projects/web/tickets/T-12.md`, frontmatter delimiters intact, body unchanged.
- Same for `get_project_doc` and `get_group_doc` against their respective on-disk files.
- A call for a project the caller can't see returns `NotFound`, identical to the response for a non-existent file.
