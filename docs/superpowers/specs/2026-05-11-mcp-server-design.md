# MCP Server v1 — Design

**Date:** 2026-05-11
**Status:** Draft, awaiting review
**Supersedes:** the MCP section of `docs/PROJECTPROJECT.md` (outdated) and the current `packages/backend/src/mcp.ts` (stdio prototype, to be deleted)

## Goal

Expose ProjectProject's read surface to AI agents (Claude Code, Cursor, ChatGPT, custom agents) through a built-in MCP server. Authentication must flow through the app itself — agents register and obtain tokens via OAuth, not by pasting session tokens into env vars. The tool surface must let an agent reach anything from the user's orgs/groups all the way down to individual tickets, with server-side filtering and pagination. Architecture must follow the Effect patterns already established in this codebase, including the in-flight conventions from the open `chore/improve-atom-handling` and `chore/better-lsp-settings` branches.

## Non-Goals (v1)

- Writes of any kind (`create_ticket`, `update_status`, `add_comment`, …).
- Comments. Full-text search across docs.
- MCP **resources** (`markmate://…` URIs). Tools cover the same data; the resource surface can land later if agents ask for it.
- Multi-scope tokens — v1 uses a single `read` scope.
- stdio transport. Streamable HTTP only. Clients without remote-MCP support can use `npx mcp-remote <url>` as a bridge; we don't ship it.

## Architecture

One backend process, three coexisting listener trees sharing a single Effect runtime and one set of service Layers:

```
backend (Bun)
├── HttpApi tree at /api/*            (existing)
├── Better Auth handlers              (existing, plus new MCP plugin routes)
│   ├── /.well-known/oauth-authorization-server   (new)
│   ├── /.well-known/oauth-protected-resource     (new)
│   ├── /api/auth/mcp/register                    (new — Dynamic Client Registration)
│   ├── /api/auth/mcp/authorize                   (new — consent UI)
│   └── /api/auth/mcp/token                       (new)
└── /mcp  Streamable HTTP listener     (new)
        └── withMcpAuth(auth, handler) → Effect dispatcher
              └── shares Services layer with HttpApi (Projects, Tickets, Groups, …)
```

No business logic is duplicated. The MCP dispatcher resolves `userId` from the bearer token, provides a request-scoped `CurrentUser` Layer, then calls the same services that back the HttpApi.

## Authentication & consent

Use Better Auth's MCP plugin. It supplies:

- The two `.well-known` discovery endpoints (`oauth-authorization-server`, `oauth-protected-resource`).
- Dynamic Client Registration (RFC 7591) at `/api/auth/mcp/register`.
- `/api/auth/mcp/authorize` (with PKCE) and `/api/auth/mcp/token`.
- A consent screen that reuses the existing Better Auth session — if the user is not signed in, they fall through to the existing GitHub OAuth flow.
- `withMcpAuth(auth, handler)` and `auth.api.getMcpSession({ headers })` for bearer-token verification on `/mcp`.

### End-to-end flow

1. Agent issues an unauthenticated request to `/mcp`. Server replies `401` with `WWW-Authenticate: Bearer realm=...` pointing at `/.well-known/oauth-protected-resource`.
2. Agent reads AS metadata and calls DCR to register itself dynamically.
3. Agent opens the user's browser to `/api/auth/mcp/authorize?...` with a PKCE challenge. If the user has no session, they sign in via GitHub OAuth first.
4. The user sees the consent screen — `"Allow <client_name> to read your ProjectProject orgs, groups, projects, and tickets?"` — and approves. Single `read` scope in v1.
5. Auth code → token exchange (PKCE verified) at `/api/auth/mcp/token`.
6. All subsequent `/mcp` requests carry `Authorization: Bearer ...`. `withMcpAuth` resolves the session before the Effect dispatcher runs.

### Token management

A new `"Connected agents"` page lives under user settings on the frontend:

- Lists currently-authorized OAuth clients for the user (name, last used, scopes, created at).
- One-click revoke per client.

Backed by a tiny HttpApi group `oauthApplications` that wraps Better Auth's listing and revocation APIs (exact API surface to be confirmed against the installed plugin version when implementing).

### Authorization at the data layer

`CurrentUser` is set per-request from the bearer token's `userId`. `CurrentOrg` is **not** bound to the token — tools take `orgSlug` as an argument, and the services resolve and verify org membership per call. This matches how the HttpApi handlers behave on the `chore/better-lsp-settings` branch and lets a single agent session move across the user's orgs without re-authorizing.

Membership filtering already lives in the services (`Projects.list(userId)`, `Tickets.list(userId, projectSlug)`, …). The MCP path inherits this for free.

## Tool catalog

The catalog is declared once, in `packages/shared/src/mcp/index.ts` (`McpTools`), as a plain object keyed by tool name. Each entry is `{ description, input, output, errors }` using existing Effect Schemas from `packages/shared/src/schemas/*` for input/output.

> The table below is the original planning sketch. The shipped catalog lives in `packages/shared/src/mcp/index.ts` and is the source of truth — it diverges in places (no doc-listing tools, `list_tags` is paged, `get_git_state` returns `GitStatesResponse` instead of `Array<GitState>`, groups are addressed by `id` not `groupSlug`).

Markdown is the whole point of the product: every entity that owns prose is stored as a `.md` file on disk, and the existing schemas already split each entity into a **list shape** (frontmatter fields only, cheap) and a **detail shape** (`= list shape + { body: string }`, where `body` is the raw markdown body after the frontmatter, passed through verbatim with no rendering). The MCP tools follow that split exactly:

| Tool | Input | Output | Notes |
|---|---|---|---|
| `me` | `{}` | `User & { roles: Array<{ orgSlug, role }> }` | |
| `list_orgs` | `Pagination` | `Page<Org>` | |
| `get_org` | `{ orgSlug }` | `Org` | |
| `list_groups` | `{ orgSlug } & Pagination` | `Page<Group>` | index shape |
| `get_group` | `{ orgSlug, groupSlug }` | **`GroupDetail`** | includes `body` (raw markdown) |
| `list_projects` | `{ orgSlug, groupSlug? } & Pagination` | `Page<Project>` | index shape |
| `get_project` | `{ orgSlug, projectSlug }` | **`ProjectDetail`** | includes `body` (raw markdown), github connection, members |
| `list_tickets` | `{ orgSlug, projectSlug, filter? } & Pagination` | `Page<Ticket>` | index shape — no body |
| `get_ticket` | `{ orgSlug, projectSlug, ticketId }` | **`TicketDetail`** | includes `body` (raw markdown) |
| `list_tags` | `{ orgSlug, projectSlug }` | `Array<Tag>` | |
| `list_members` | `{ orgSlug, projectSlug? } & Pagination` | `Page<Member>` | |
| `get_git_state` | `{ orgSlug, projectSlug, ticketId? }` | `Array<GitState>` | |
| `list_group_docs` | `{ orgSlug, groupId } & Pagination` | `Page<DocIndex>` | index shape — path + title + tags |
| `get_group_doc` | `{ orgSlug, groupId, path }` | **`DocDetail`** | raw markdown |
| `list_project_docs` | `{ orgSlug, projectSlug, folder? } & Pagination` | `Page<DocIndex>` | optional folder filter |
| `get_project_doc` | `{ orgSlug, projectSlug, path }` | **`DocDetail`** | raw markdown |
| `list_ticket_docs` | `{ orgSlug, projectSlug, ticketId } & Pagination` | `Page<DocIndex>` | |
| `get_ticket_doc` | `{ orgSlug, projectSlug, ticketId, path }` | **`DocDetail`** | raw markdown |

The detail tools (`get_ticket`, `get_project`, `get_group`, and the three `get_*_doc` tools) return the raw markdown body verbatim — same string the user would see in `cat <file>.md` minus the YAML frontmatter block (which is already decoded into the structured fields of the same payload). Agents never see rendered HTML, and the markdown isn't reformatted on the way out.

`DocIndex` and `DocDetail` are new schemas in `packages/shared/src/schemas/Doc.ts` if they don't already exist on the open branches — to be reconciled with `GroupDocs` / `ProjectDocs` / `TicketDocs` services during implementation. Existing service surfaces are the source of truth for the field shape.

### Pagination

```ts
// packages/shared/src/mcp/Pagination.ts
export const Pagination = Schema.Struct({
  cursor: Schema.optional(Schema.String),                            // opaque base64
  limit:  Schema.optional(Schema.Int.pipe(Schema.between(1, 200))),  // default 50
})

export const Page = <A, I>(item: Schema.Schema<A, I>) =>
  Schema.Struct({
    items: Schema.Array(item),
    nextCursor: Schema.NullOr(Schema.String),
  })
```

Cursors are opaque base64-encoded JSON `{ lastId, lastSortValue }` minted by the service layer. Clients only round-trip them.

### Ticket filter

```ts
// packages/shared/src/mcp/filters/Ticket.ts
export const TicketFilter = Schema.Struct({
  status:       Schema.optional(Schema.Array(TicketStatus)),
  type:         Schema.optional(Schema.Array(TicketType)),
  assignee:     Schema.optional(Schema.Array(Schema.NullOr(UserId))), // null = unassigned
  tags:         Schema.optional(Schema.Array(TagId)),
  hasBranch:    Schema.optional(Schema.Boolean),
  hasPr:        Schema.optional(Schema.Boolean),
  updatedAfter: Schema.optional(Schema.Date),
})
```

**Filters apply server-side**, in the service layer (SQL or markdown-scan-and-filter — whichever the service already does for the HttpApi). Today's `mcp.ts` filters post-fetch in JS; v1 must not.

## Tool definition style — schema-first

The MCP catalog lives in `shared` the same way `HttpApi` does, so handlers stay in `backend` and existing schemas (`Ticket`, `Project`, …) are reused directly with no parallel types.

```ts
// packages/shared/src/mcp.ts
export const McpTools = {
  me: {
    description: "Identity of the authed user and their org/project roles.",
    input:  Schema.Struct({}),
    output: MeOutput,
    errors: [Unauthorized],
  },
  list_tickets: {
    description: "List tickets in a project with optional server-side filtering.",
    input:  ListTicketsInput,
    output: TicketsPage,
    errors: [NotFound, Forbidden],
  },
  // … one entry per tool above
} as const
```

```ts
// packages/backend/src/mcp/handlers.ts
export const handlers: Handlers<typeof McpTools> = {
  list_tickets: ({ orgSlug, projectSlug, filter, cursor, limit }) =>
    Effect.gen(function* () {
      const tickets = yield* Tickets
      return yield* tickets.listPaged({
        orgSlug,
        projectSlug,
        filter,
        cursor,
        limit: limit ?? 50,
      })
    }),
  // …
}
```

```ts
// packages/backend/src/mcp/server.ts (sketch)
for (const [name, spec] of Object.entries(McpTools)) {
  server.registerTool(
    name,
    {
      description: spec.description,
      inputSchema: Schema.standardSchemaV1(spec.input),
      outputSchema: Schema.standardSchemaV1(spec.output),
    },
    async (input) =>
      runtime.runPromise(
        Schema.decodeUnknown(spec.input)(input).pipe(
          Effect.flatMap(handlers[name]),
          Effect.flatMap(Schema.encode(spec.output)),
          Effect.map(asJsonContent),
          Effect.catchTags(toolErrorMap),
        ),
      ),
  )
}
```

Effect Schema implements Standard Schema v1, but the MCP SDK's `inputSchema` expects a Zod object. `dispatch.ts` runs every tool's input through `effectToZodObject` — a small JSONSchema-to-Zod adapter (`packages/backend/src/mcp/inputSchemas.ts`) — at registration time so handlers stay defined in Effect Schema while the SDK sees Zod. Errors map centrally (`NotFound → isError + "Not found"`, `Forbidden → "Forbidden"`, `ValidationError → structured message`, unknown defects → logged and surfaced as a generic "Internal error").

## Effect best-practice alignment

The two open branches define the conventions everything new must follow:

- **`chore/better-lsp-settings`** — adopt `BunContext`, normalized `Effect`/`Layer`/`Schema` imports, tightened `class X extends Effect.Service<X>` Tag style, and validation errors raised at the schema boundary. The new `McpServer` Service and its Layer mirror existing `Layers/*` files exactly.
- **`chore/improve-atom-handling`** — frontend-only. The "Connected agents" settings page uses the typed struct-key atom-family pattern landed there (`oauthApplicationAtom({ applicationId })`).

## Touched files

**New:**

- `packages/shared/src/mcp.ts` — `McpTools` catalog.
- `packages/shared/src/mcp/Pagination.ts` — `Pagination`, `Page` helpers.
- `packages/shared/src/mcp/filters/Ticket.ts` and any other filter schemas.
- `packages/backend/src/Services/McpServer.ts` — Tag.
- `packages/backend/src/Layers/McpServer.ts` — Layer that constructs the SDK server and registers every tool from the catalog.
- `packages/backend/src/mcp/handlers.ts` — per-tool Effect programs.
- `packages/backend/src/mcp/server.ts` — adapter that walks `McpTools` and registers each on the SDK server.
- `packages/backend/src/mcp/errorMap.ts` — tagged errors → MCP tool-error responses.
- `packages/backend/src/handlers/oauthApplications.ts` — HttpApi handler for listing/revoking connected agents.
- `packages/frontend/src/routes/_authed/settings/connected-agents/index.tsx` — UI.
- Drizzle migration adding the Better Auth MCP plugin's tables (oauth applications, codes, tokens, consents).

**Modified:**

- `packages/backend/src/auth.ts` — add the `mcp` plugin to the Better Auth config.
- `packages/backend/src/main.ts` — mount `/mcp` and the new `.well-known` routes.
- `packages/shared/src/api.ts` — add the `oauthApplications` group.
- Services that need a paginated, filterable list variant — at minimum `Tickets`, `Projects`, `Groups`, `Members`, plus the three `*Docs` services. Existing list methods stay; new `listPaged` methods sit next to them and the existing HttpApi handlers eventually migrate to use them too (out of scope for this PR — flagged as a follow-up).

**Deleted:**

- `packages/backend/src/mcp.ts` (the stdio prototype). Functionality is replaced by the HTTP listener.

## Open items to confirm during implementation

- Exact Better Auth API surface for listing and revoking the user's authorized OAuth clients (`auth.api.listOAuthApplications` / `auth.api.revokeOAuthToken` or whatever the installed version names them).
- Whether the Better Auth MCP plugin emits JWT or opaque tokens by default in the version we pin. If JWT, the `oauth-provider`-style `verifyAccessToken` path applies; otherwise `getMcpSession`.
- Cursor format: settle on `base64url(JSON.stringify({ id, sort }))` unless a service has a natural opaque cursor of its own.
