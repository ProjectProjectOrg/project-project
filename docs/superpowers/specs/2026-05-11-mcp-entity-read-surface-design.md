# MCP Entity Read Surface — Design

**Date:** 2026-05-11
**Status:** Draft, awaiting review
**Builds on:** `docs/superpowers/specs/2026-05-11-mcp-server-design.md` (overall MCP architecture) and `docs/superpowers/plans/2026-05-11-mcp-foundation.md` (the Foundation that lands the dispatcher and `me`).

## Goal

Add the read-only entity tools an agent needs to answer "what's going on in this project". After Foundation, the dispatcher walks `McpTools` and one tool (`me`) is reachable. This plan widens the catalog to cover orgs, groups, projects, tickets, tags, members, and git state. All tools are read-only, server-side filtered, and paginated through one shape.

The acceptance bar: in a Claude Code session, "what's on the backlog for project X" calls `list_tickets({ orgSlug, projectSlug, filter: { status: ["todo"] } })` and produces an answer.

## Non-Goals

- Writes. Mutations land in a later plan.
- Comments tools. Comments service exists but is out of scope here — added alongside the rest of the doc surface.
- Doc surface tools (`list_*_docs` / `get_*_doc`) from the parent spec. Separate plan.
- Cross-project / cross-org aggregations (e.g. "all sprints in this org"). Every list tool stays scoped to one project (where relevant).
- Search / free-text queries.

## Tool catalog

Eleven tools. All inputs include `Pagination` (`{ cursor?, limit? }`) unless they are point-reads. All list outputs are `Page<T>` (`{ items, nextCursor }`); detail outputs are the existing `*Detail` schemas verbatim.

| Tool             | Input                                                | Output                                  | Notes                                                                   |
| ---------------- | ---------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| `list_orgs`      | `Pagination`                                         | `Page<Org>`                             | The caller's orgs. Sort: `name` asc.                                    |
| `get_org`        | `{ orgSlug }`                                        | `Org`                                   | Errors: `NotFound`.                                                     |
| `list_groups`    | `{ orgSlug, projectSlug } & Pagination`              | `Page<Group>`                           | Project-scoped. Sort: `id` asc (G-1, G-2…).                             |
| `get_group`      | `{ orgSlug, projectSlug, id }`                       | `GroupDetail`                           | Body is raw markdown verbatim. Errors: `NotFound`.                      |
| `list_projects`  | `{ orgSlug } & Pagination`                           | `Page<Project>`                         | Sort: `createdAt` desc, `slug` asc tiebreak.                            |
| `get_project`    | `{ orgSlug, projectSlug }`                           | `ProjectDetail`                         | Includes `github`, `members`, raw markdown body. Errors: `NotFound`.    |
| `list_tickets`   | `{ orgSlug, projectSlug, filter? } & Pagination`     | `Page<Ticket>`                          | Server-side filter (see below). Sort: `id` asc (T-1, T-2…).             |
| `get_ticket`     | `{ orgSlug, projectSlug, id }` (`TicketId`)          | `TicketDetail`                          | Body is raw markdown verbatim. Errors: `NotFound`.                      |
| `list_tags`      | `{ orgSlug, projectSlug } & Pagination`              | `Page<Tag>`                             | Sort: `name` asc.                                                       |
| `list_members`   | `{ orgSlug, projectSlug } & Pagination`              | `Page<Member>`                          | From `ProjectDetail.members`. Sort: `name` asc, `id` tiebreak.          |
| `get_git_state`  | `{ orgSlug, projectSlug, ticketId? }`                | `GitStatesResponse`                     | Reuses existing service shape (`states`, `tokenStatus`, `repoStatus`). |

Schemas are reused from `packages/shared/src/schemas/*` for every output (`Ticket`, `TicketDetail`, `Group`, `GroupDetail`, `Project`, `ProjectDetail`, `Tag`, `Member`, `GitStatesResponse`). The one new schema is `Org`.

### `Org` schema

New file `packages/shared/src/schemas/Org.ts`:

```ts
export const OrgRole = Schema.Literal("owner", "admin", "member")
export type OrgRole = typeof OrgRole.Type

export const Org = Schema.Struct({
  slug: Slug,
  name: Schema.String,
  role: OrgRole,
})
export type Org = typeof Org.Type
```

Sourced from the Better Auth `organization` + `member` tables — exactly the data the existing `BetterAuth.listOrganizations(userId)` returns, widened with `name` from `organization.name`.

### Ticket filter

New file `packages/shared/src/mcp/filters/Ticket.ts`:

```ts
export const TicketFilter = Schema.Struct({
  status:       Schema.optional(Schema.Array(TicketStatus)),
  type:         Schema.optional(Schema.Array(TicketType)),
  assignee:     Schema.optional(Schema.Array(Schema.NullOr(Schema.String))), // userId; null = unassigned
  tags:         Schema.optional(Schema.Array(TagName)),
  hasBranch:    Schema.optional(Schema.Boolean),
  hasPr:        Schema.optional(Schema.Boolean),
  updatedAfter: Schema.optional(Schema.Date),
})
```

**Semantics:**

- Each top-level field is an AND. Arrays inside are OR. `{ status: ["todo","in_progress"], type: ["bug"] }` means *(todo OR in_progress) AND bug*.
- `assignee: [null, "alice-id"]` means *unassigned OR assigned to Alice*. Empty array means "match nothing" — handler short-circuits to an empty page.
- `tags: ["bug","perf"]` matches a ticket having any of those tags (OR). If we ever want AND-across-tags, that's a v2 field, not a semantics change here.
- `hasBranch: true` requires `branch !== null`; `hasBranch: false` requires `branch === null`. Same shape for `hasPr` against `pr`.
- `updatedAfter: <ISO date>` is strict greater-than (`updatedAt > updatedAfter`).
- Filters apply **server-side, in the service**, never post-fetch in JS — that was the legacy stdio mistake we're explicitly avoiding.

## Pagination

Already wired in `packages/shared/src/mcp/Pagination.ts` (Foundation). Reuse `Pagination`, `Page<A>`, `encodeCursor`, `decodeCursor` unchanged. The opaque cursor payload is `{ id, sort }` — `sort` carries the entity-specific natural sort value:

| Entity   | `id`        | `sort`                  |
| -------- | ----------- | ----------------------- |
| Org      | `slug`      | `name`                  |
| Project  | `slug`      | `createdAt` ISO string  |
| Group    | `id` (G-N)  | `id` (N as string, zero-padded for lex order) |
| Ticket   | `id` (T-N)  | `id` (N zero-padded)    |
| Tag      | `name`      | `name`                  |
| Member   | `id`        | `name`                  |

Zero-padding for `T-N` / `G-N`: tickets and groups are stored as markdown files; their natural order is numeric, not lexical (`T-2` < `T-10`). The cursor encodes a zero-padded numeric string (`"0000000002"`) so the service can do `WHERE id_sort > $cursor.sort` without parsing.

Default limit: 50. Max: 200 (already enforced by `Pagination` schema).

### `nextCursor` semantics

- Service fetches `limit + 1` rows. If a `(limit + 1)`th row exists, drop it from `items` and emit a cursor from the last *returned* row.
- If exactly `limit` or fewer rows came back, `nextCursor: null`.
- Empty result with no cursor: `{ items: [], nextCursor: null }`. Not an error.

## Service surface additions

The principle from CLAUDE.md: extend existing services, don't build parallel ones. New methods go alongside the existing `list` methods. HttpApi handlers keep using the existing methods; MCP handlers call the new `listPaged` variants.

```ts
// Tickets
listPaged: (
  orgSlug: string,
  userId: string,
  projectSlug: string,
  filter: TicketFilter | undefined,
  cursor: CursorPayload | undefined,
  limit: number,
) => Effect.Effect<{ items: ReadonlyArray<Ticket>; nextCursor: string | null }, NotFound | MarkdownError>

// Groups
listPaged: (
  orgSlug: string,
  userId: string,
  projectSlug: string,
  cursor: CursorPayload | undefined,
  limit: number,
) => Effect.Effect<{ items: ReadonlyArray<Group>; nextCursor: string | null }, NotFound | MarkdownError>

// Projects
listPaged: (
  orgSlug: string,
  userId: string,
  cursor: CursorPayload | undefined,
  limit: number,
) => Effect.Effect<{ items: ReadonlyArray<Project>; nextCursor: string | null }, never>

// Tags (new method on existing Tags service)
listPaged: (
  orgSlug: string,
  userId: string,
  projectSlug: string,
  cursor: CursorPayload | undefined,
  limit: number,
) => Effect.Effect<{ items: ReadonlyArray<Tag>; nextCursor: string | null }, NotFound | MarkdownError>

// Projects (also gains members pagination — sourced from the same in-memory member list ProjectDetail returns; sort + slice + cursor handled in the service to keep the wire shape stable)
listMembersPaged: (
  orgSlug: string,
  userId: string,
  projectSlug: string,
  cursor: CursorPayload | undefined,
  limit: number,
) => Effect.Effect<{ items: ReadonlyArray<Member>; nextCursor: string | null }, NotFound | MarkdownError>

// BetterAuth — list_orgs uses a new paged wrapper
listOrganizationsPaged: (
  userId: string,
  cursor: CursorPayload | undefined,
  limit: number,
) => Effect.Effect<{ items: ReadonlyArray<Org>; nextCursor: string | null }, BetterAuthError>

// BetterAuth — get_org point-read
getOrganization: (
  userId: string,
  orgSlug: string,
) => Effect.Effect<Org, BetterAuthError | NotFound>

// Tickets — get_git_state with optional single-ticket narrowing
getGitState: (
  orgSlug: string,
  userId: string,
  projectSlug: string,
  ticketId: TicketId | undefined,
) => Effect.Effect<GitStatesResponse, NotFound | MarkdownError>
```

`getGitState` reuses `listGitStates` for the project-wide case and trims the `states` map down to a single key when `ticketId` is set (preserving `tokenStatus` / `repoStatus`). Adding a method is cheaper than parameterizing the existing one — keeps callsite-shape stability for HttpApi handlers.

### Where filtering lives

`Tickets.listPaged` does the filtering against the markdown ticket store. Tickets are stored as markdown files with frontmatter; the existing `Tickets.list` reads them all into memory. For the v1 paged variant, we keep the same "read all, filter, sort, slice" approach — the dataset is small (hundreds per project, not millions), and migrating to a DB-backed index is a separate concern. The acceptance bar is "server-side filter, no JS post-fetch in the MCP layer." We meet it: filtering happens inside `Tickets.listPaged`, and the MCP handler is a thin pass-through. When ticket counts grow, this method is the single place to optimize.

## Tool definition style — additions to `McpTools`

`packages/shared/src/mcp/index.ts` gains one entry per tool. The skeleton already imports `Schema` and `Unauthorized`; we add `NotFound`, `Forbidden`, and the new schemas.

```ts
export const McpTools = {
  me: { /* existing */ },

  list_orgs: {
    description: "List organizations the caller belongs to.",
    input: Pagination,
    output: Page(Org),
    errors: [Unauthorized] as const,
  },
  get_org: {
    description: "Fetch one organization by slug.",
    input: Schema.Struct({ orgSlug: Slug }),
    output: Org,
    errors: [Unauthorized, NotFound] as const,
  },

  list_projects: {
    description: "List projects in an org the caller can see.",
    input: Schema.Struct({ orgSlug: Slug, ...Pagination.fields }),
    output: Page(Project),
    errors: [Unauthorized, NotFound] as const,
  },
  get_project: {
    description: "Fetch one project including github connection, members, and raw markdown body.",
    input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug }),
    output: ProjectDetail,
    errors: [Unauthorized, NotFound] as const,
  },

  list_groups: {
    description: "List groups (sprints, epics, milestones) in a project.",
    input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug, ...Pagination.fields }),
    output: Page(Group),
    errors: [Unauthorized, NotFound] as const,
  },
  get_group: {
    description: "Fetch one group including raw markdown body.",
    input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug, id: GroupId }),
    output: GroupDetail,
    errors: [Unauthorized, NotFound] as const,
  },

  list_tickets: {
    description: "List tickets in a project with optional server-side filtering.",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      filter: Schema.optional(TicketFilter),
      ...Pagination.fields,
    }),
    output: Page(Ticket),
    errors: [Unauthorized, NotFound] as const,
  },
  get_ticket: {
    description: "Fetch one ticket including raw markdown body.",
    input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug, id: TicketId }),
    output: TicketDetail,
    errors: [Unauthorized, NotFound] as const,
  },

  list_tags: {
    description: "List tags defined in a project.",
    input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug, ...Pagination.fields }),
    output: Page(Tag),
    errors: [Unauthorized, NotFound] as const,
  },

  list_members: {
    description: "List members of a project with their role.",
    input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug, ...Pagination.fields }),
    output: Page(Member),
    errors: [Unauthorized, NotFound] as const,
  },

  get_git_state: {
    description: "Fetch git / PR state for a project, optionally narrowed to one ticket.",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      ticketId: Schema.optional(TicketId),
    }),
    output: GitStatesResponse,
    errors: [Unauthorized, NotFound] as const,
  },
} as const
```

The dispatcher in `packages/backend/src/mcp/dispatch.ts` already walks this object; no change needed there. Each new tool needs an entry in `packages/backend/src/mcp/handlers.ts`.

## Authorization

Same model as Foundation:

- `CurrentUser` is resolved from the bearer token by the MCP route's `withMcpAuth` wrapper.
- Every handler reads `orgSlug` from input and calls the existing service method, which already enforces org-membership and project-membership filtering against `userId`.
- A user asking for a project they're not a member of resolves to `NotFound`, same as the HttpApi today.

No new auth code lives in this plan. We inherit it.

## Error mapping

All tools surface a subset of `{ Unauthorized, NotFound, Forbidden, ParseError }`. The existing `mapToolError` already handles these tags. No additions needed; we declare each tool's error union in the catalog for documentation and future schema-driven OpenAPI emission.

## Touched files

**New:**

- `packages/shared/src/schemas/Org.ts` — `Org`, `OrgRole`.
- `packages/shared/src/mcp/filters/Ticket.ts` — `TicketFilter`.

**Modified:**

- `packages/shared/src/index.ts` — re-export `Org`.
- `packages/shared/src/mcp/index.ts` — eleven new entries in `McpTools`.
- `packages/backend/src/Services/Tickets.ts` — add `listPaged` and `getGitState` to `TicketsShape`.
- `packages/backend/src/Layers/Tickets.ts` — implement both.
- `packages/backend/src/Services/Groups.ts` — add `listPaged`.
- `packages/backend/src/Layers/Groups.ts` — implement.
- `packages/backend/src/Services/Projects.ts` — add `listPaged` and `listMembersPaged`.
- `packages/backend/src/Layers/Projects.ts` — implement both.
- `packages/backend/src/Services/Tags.ts` — add `listPaged`.
- `packages/backend/src/Layers/Tags.ts` — implement.
- `packages/backend/src/Services/BetterAuth.ts` — add `listOrganizationsPaged` and `getOrganization`.
- `packages/backend/src/Layers/BetterAuth.ts` — implement (widens existing `listOrganizations` query to include `name` and apply keyset pagination).
- `packages/backend/src/mcp/handlers.ts` — ten new handler entries (`me` stays).

**No changes:** dispatcher, error map, route, Foundation OAuth wiring.

## Testing

Match the convention of the sibling file under edit. Foundation MCP tests use `bun:test`; service-layer tests use `@effect/vitest`.

- `packages/backend/src/Services/Tickets.test.ts` (extend or create) — `listPaged` table-driven tests for each filter field, plus pagination boundary cases (exactly `limit`, `limit + 1`, empty, mid-cursor).
- `packages/shared/src/mcp/filters/Ticket.test.ts` — schema decode tests covering the AND-of-OR semantics at the boundary.
- A smoke test invoking `list_tickets` through the dispatcher (mirrors the `me` smoke test) that verifies a filtered call returns a `Page<Ticket>` shape.

End-to-end acceptance is manual through the MCP inspector, same flow as Foundation's Task 16.

## Open items to confirm during implementation

- Exact zero-padding width for ticket/group ids. Proposal: 10 characters (`"0000000042"`). Confirm against any project with > 9.9B tickets — i.e. confirm never.
- Whether `BetterAuth.listOrganizations` already orders by name. If not, add `ORDER BY organization.name ASC, organization.id ASC` and confirm the index covers it.
- Whether `Projects.listMembersPaged` should read members from disk (`project.md` frontmatter, source of truth) or from the cached `ProjectDetail.members` Better Auth join. Default: read from disk for consistency with `get_project`; revisit if it shows up in profiles.
