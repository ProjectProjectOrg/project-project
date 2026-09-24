# MCP server moves onto Effect's `McpServer`

Effect `4.0.0-rc.116` ships `effect/unstable/ai/McpServer` with the MCP
`2026-07-28` revision. That revision replaces initialization and protocol-level
sessions with per-request metadata, which is exactly the stateless shape the
current `/mcp` endpoint fakes on top of the `@modelcontextprotocol/sdk`
transport. This spec replaces the SDK server, the AsyncLocalStorage bridge and
the hand-rolled dispatcher with the Effect layer, and moves bearer-token
verification into an Effect middleware built on Better Auth's own primitives.

## Goals

- Serve MCP `2026-07-28` as the primary revision. Clients on it need no
  `Mcp-Session-Id` and no server-side state; any backend instance can answer
  any request.
- Keep `2025-11-25` and `2025-06-18` reachable for clients that have not
  caught up (Cursor 3.21, Gemini CLI 0.60). Those go through Effect's
  stateful runtime, which keeps sessions in memory.
- Fix the connected-agents page so each supported platform gets its current,
  verified connect instructions.
- Support Client ID Metadata Documents (CIMD) for client registration, which
  the 2026-07-28 authorization spec asks authorization servers to support,
  while keeping Dynamic Client Registration for legacy clients.
- One source of truth for the tool catalog: `McpTools` in `packages/shared`
  keeps describing every tool; the backend derives `Tool.make` definitions
  from it.
- Agent-facing behaviour is preserved: tool names, success payloads and the
  human-readable `isError` texts from `errorMap.ts` stay byte-for-byte. Input
  JSON Schema is emitted by Effect's `Tool.getJsonSchemaFromSchema` and may
  differ in layout (`$defs` placement), but must accept and reject the same
  inputs.
- Better Auth stays the OAuth authorization server. Only the web-`Request`
  shaped `requireMcpAuth` wrapper goes.

## Non-goals

- Revisions older than `2025-06-18`, and the historical two-endpoint
  HTTP+SSE transport.
- Distributed session storage for the legacy revisions. Until Cursor and
  Gemini CLI ship `2026-07-28`, legacy clients assume a single backend
  instance or sticky routing; the modern path has no such constraint.
- MCP resources, prompts, elicitation, `subscriptions/listen`. Tools only, as
  today.
- Changing the OAuth flow, consent screen, scopes, or the connected-agents
  list. The registration mechanism gains CIMD; everything after registration
  is unchanged.

## What the MCP specification requires

The [2026-07-28 versioning page](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
calls what we are building a **dual-era** server: modern clients declare the
protocol version on every request and are served statelessly; legacy clients
open with `initialize` and get a session scoped to the negotiated revision.
A dual-era server MAY serve both on the same endpoint, which is what
`layerHttp` does with a mixed `protocols` list.

Server-side MUSTs from the versioning and
[Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
pages, and where they are satisfied:

| Requirement | Satisfied by |
| --- | --- |
| Implement `server/discover` | Effect `v2026_07_28` adapter |
| Reject unknown or disabled versions with `400` and `-32022` listing `supported` | Effect runtime, list derived from `protocols` |
| Require `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`; reject mismatches with `400` and `-32020` | Effect runtime |
| Validate `Origin`, `403` when present and not allowed | Effect `layerHttp` (`allowedOrigins` left unset: agents send no `Origin`) |
| `405` for GET and DELETE on the endpoint for modern clients | Effect `layerHttp` |
| Authenticate all connections, `401` with `WWW-Authenticate` for OAuth discovery | `Layers/McpAuth.ts` |
| Modern requests never mint or echo `Mcp-Session-Id` | Effect stateless runtime; asserted in tests |

From the [authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
page: authorization servers SHOULD support Client ID Metadata Documents and
MAY keep Dynamic Client Registration, which is deprecated. Protected resource
metadata, OAuth 2.1 with PKCE, and audience-bound tokens are MUSTs and are
already provided by the Better Auth MCP plugin.

Nothing in our code re-implements protocol mechanics. When Cursor and Gemini
CLI move to the modern era, the legacy adapters and their test leave; the
modern path is unchanged.

## Version bump

`effect`, `@effect/platform-bun`, `@effect/sql-pg`, `@effect/atom-react` and
`@effect/vitest` move from `4.0.0-rc.112` to `4.0.0-rc.116` across the
workspace in one commit before any MCP work. Whatever the bump breaks in the
frontend or backend gets fixed in that commit; the MCP rewrite starts from a
green typecheck and test run.

`@modelcontextprotocol/sdk` leaves the backend's runtime dependencies. It
stays as a dev dependency only: its client (1.30.0, tops out at `2025-11-25`)
is the right tool to exercise the legacy session path in tests. The
`2026-07-28` path is tested with a raw JSON-RPC helper because no released
client library speaks it yet.

## Architecture

```
HttpRouter
  └─ /mcp  (McpServer.layerHttp,
             protocols: [v2026_07_28, v2025_11_25, v2025_06_18])
       ├─ McpAuthMiddleware      verifies bearer, resolves User, sets McpRequestUser
       └─ McpServer.toolkit      Toolkit built from McpTools, handlers from handlers.ts
```

### Files

| Removed | Replaced by |
| --- | --- |
| `Services/McpHttp.ts`, `Layers/McpHttp.ts` | `Layers/McpAuth.ts` (middleware) |
| `Services/McpServer.ts`, `Layers/McpServer.ts` | `Layers/Mcp.ts` (layerHttp + toolkit) |
| `mcp/dispatch.ts`, `mcp/currentUserStorage.ts` | `mcp/toolkit.ts` (catalog → `Tool`/`Toolkit`) |
| `mcpRoute` bridge in `main.ts` | `Layers/Mcp.ts` merged into `RouteLive` |

Kept as is: `packages/shared/src/mcp/*`, `mcp/errorMap.ts`. `mcp/handlers.ts`
is restructured (below); its tests and `attachments.test.ts`,
`orgStorage.test.ts` change only where they provided `CurrentUser`.

### `mcp/toolkit.ts`

Walks `McpTools` once and produces:

- `Tool.make(name, { description, parameters: spec.input, success: spec.output, failure: Schema.String, failureMode: "return" })` per entry. `parameters` must be an object schema; the catalog already guarantees that.
- `McpToolkit = Toolkit.make(...tools)`.
- `McpCurrentUser`: an effect that reads `McpRequestUser` and fails
  `Unauthorized` when it is `None`. Handlers yield this instead of the
  `CurrentUser` service, so no per-call injection is needed.
- `toolFailure`: one `Effect.mapError` that turns a catalog error into the
  `errorMap.ts` text, plus defect logging. It is applied once, at the layer
  level, to every handler in the toolkit.

  `failure: Schema.String` is deliberate: Effect encodes a declared string
  failure as a single `text` content item with `isError: true`, so the agent
  sees exactly the messages `errorMap.ts` produces today. Declared error
  schemas from the catalog stay as documentation and for the HttpApi surface;
  the MCP wire format for errors does not change.

Unknown tool names are handled by Effect: `callTool` maps `ToolNotFound` to
JSON-RPC `-32602`, matching the current behaviour.

### `mcp/handlers.ts`

Becomes the toolkit handler layer itself: `McpToolkit.toLayer({ ... })`. Tool
names, parameter and success types come from the `Tool` definitions, so the
hand-written `HandlersMap` type disappears with `dispatch.ts`. Every
`yield* CurrentUser` becomes `yield* McpCurrentUser`; the domain logic in each
handler is untouched. Spans move to `Effect.withSpan` per handler in the same
file.

### `McpRequestUser`

A `Context.Reference<Option<User>>` with default `None`, defined next to
`CurrentUser` in the backend. References carry a default, so they never show
up as a static requirement of the toolkit layer, yet they are read from the
request fiber. The auth middleware sets it; `McpCurrentUser` reads it.

This mirrors how Effect's own `McpServer` threads `CurrentLogLevel` per request.

### `Layers/McpAuth.ts`

An `HttpRouter.middleware` scoped to the `/mcp` route (not global). Per request:

1. Build `{ authorizationHeader, dpopProofJwt, method, url }` from
   `HttpServerRequest`. Better Auth documents this plain-object input for
   frameworks without a web `Request`.
2. `verifyAccessTokenRequest(input, { verifyOptions: { issuer, audience: mcpResource }, jwksUrl, dpop: { replayStore: createDpopReplayStore(auth.$context.internalAdapter) } })` from `better-auth/oauth2`. The DB-backed replay store keeps DPoP replay protection correct across instances.
3. On failure: `createResourceServerChallenge(error, mcpResource)` from
   `@better-auth/oauth-provider` (added as a direct dependency; it is already
   a transitive one) → respond with its status and headers plus the same
   JSON-RPC error body `requireMcpAuth` emits today.
4. Claims → `sub`, `client_id`, `pp_consent_ids`; the existing consent-row
   lookup against `oauth_consent` and `Users.fullByIds` move here unchanged.
   No matching consent → same 401 challenge.
5. Provide `McpRequestUser = Some(user)` to the downstream effect.

Method gating (`405` for non-POST), `Origin` rejection, content-type and
accept negotiation are all Effect's; nothing to write.

### Client registration: CIMD next to DCR

`auth.ts` composes `cimd()` from `@better-auth/cimd` (same `1.7.3` pin as
`better-auth`) after the `mcp()` plugin, with
`metadataProfile: "mcp-2026-07-28"` as the MCP plugin's own documentation
prescribes. With CIMD an agent's `client_id` is the HTTPS URL of a JSON
document it hosts; Better Auth fetches and validates that document, persists
the client through the same OAuth Provider registration path DCR uses, and
advertises `client_id_metadata_document_supported: true` in the authorization
server metadata. Claude Code and Codex read that flag and prefer CIMD; Codex
exposes the choice as `--oauth-client-registration AUTO|CIMD|DCR`.

Because CIMD clients land in the same `oauth_client` and consent tables, the
consent-row check in `Layers/McpAuth.ts` and the connected-agents list are
unchanged. `allowDynamicClientRegistration` stays on for Cursor and Gemini
CLI and leaves together with the legacy protocol adapters.

The plugin requires a hardened transport for fetching metadata documents
(DNS pinning, TLS identity preserved, redirects refused, 5 KB limit). Better
Auth ships one as `@better-auth/cimd/node`. This backend runs on Bun, so the
plan includes a check that this transport behaves on Bun; if it does not, a
Bun-native `fetchClientMetadataResource` with the same guarantees is written
in `packages/backend/src/auth/cimdTransport.ts`. `isMetadataDocumentUrlAllowed`
is left permissive: any HTTPS origin, since agents host their documents on
their own domains.

### `Layers/Mcp.ts`

```
McpServer.layerHttp({
  name: "projectproject", version, instructions,
  path: "/mcp",
  protocols: [McpProtocol.v2026_07_28, McpProtocol.v2025_11_25, McpProtocol.v2025_06_18]
}).pipe(
  Layer.provideMerge(McpServer.toolkit(McpToolkit)),
  Layer.provide(McpToolkitHandlersLive),
  Layer.provide(McpAuthMiddlewareLive)
)
```

merged into `RouteLive` in `main.ts`; `McpHttpLive`/`McpServerLive` leave
`ServerLive`. The `ManagedRuntime` the old layer created to run handlers
outside Effect disappears; handlers run in the request fiber like every other
route.

## Spike (first task, throwaway)

Before writing the middleware for real, a one-file check: mount `layerHttp`
with a single tool that reads `McpRequestUser`, wrap the route in a
middleware that sets it, and post one `2026-07-28` request. Expected: the
handler sees the value. If it does not, the fallback is for `McpCurrentUser`
to read the bearer token from `HttpServerRequest` (which Effect does retain
in handler context) and call the same `McpAuth` verification there, with the
middleware keeping the 401 challenge role. The spec's file layout is
unchanged either way.

## Connected-agents page

`ConnectedAgentsSection.tsx` keeps its disclosure-per-platform layout but the
platform list and snippets change to what each client documents and ships
today. All instructions rely on the server's OAuth discovery and dynamic
client registration; none needs a pre-shared client id.

| Platform | Snippet | Follow-up |
| --- | --- | --- |
| Claude Code | `claude mcp add --transport http projectproject <url>` | `/mcp` inside Claude Code, or `claude mcp login projectproject` |
| Codex CLI | `codex mcp add projectproject --url <url>` | `codex mcp login projectproject` |
| Cursor | `.cursor/mcp.json` with `{ "mcpServers": { "projectproject": { "url": "<url>" } } }` | Click the login prompt Cursor shows for the server |
| Gemini CLI | `gemini mcp add --transport http projectproject <url>` | The CLI runs OAuth on first request |

The Codex TOML snippet goes; the CLI command is the documented path now. The
Gemini `httpUrl` JSON snippet goes for the same reason. Cursor's docs no
longer describe an install deeplink, so the page offers `mcp.json` only. A
short note per platform states which MCP revision it currently uses, so the
session caveat for Cursor and Gemini CLI is visible where it matters. New message ids stay
under the existing `profile_connect_mcp_` prefix in `account.json`.

## Testing

- `Layers/McpHttp.test.ts` → `Layers/Mcp.test.ts`. Same DB-backed setup and
  assertions (401 challenge headers, expired token, `405`, user isolation,
  consent revocation, validation error text, unknown tool `-32602`), split
  across two clients:
  - Modern path: a small helper posts JSON-RPC exactly as the transport
    page specifies: `MCP-Protocol-Version: 2026-07-28`, `Mcp-Method`,
    `Mcp-Name` for `tools/call`, `Accept` listing both media types, and the
    `_meta` envelope (`io.modelcontextprotocol/protocolVersion`,
    `clientInfo`, `clientCapabilities`). It runs against two runtimes
    round-robin and asserts no `mcp-session-id` header is ever returned.
    Protocol conformance cases, one each: `server/discover` lists all three
    revisions; an unknown version gets `400` with `-32022` and the
    `supported` list; a mismatched `Mcp-Name` gets `400` with `-32020`; a
    request without `MCP-Protocol-Version` gets `400`.
  - Legacy path: the npm SDK `Client` over `StreamableHTTPClientTransport`
    against a single runtime, asserting initialize negotiates `2025-11-25`,
    a session id is issued, and tool calls succeed.
- New `mcp/toolkit.test.ts`: for every tool, the emitted JSON Schema
  validates the same fixture inputs the same way as the schema `dispatch.ts`
  emits today (fixtures and expected verdicts captured before the rewrite
  with Ajv, which stays a dev dependency), and a declared error becomes `{ isError: true, content: [{ type: "text", text }] }`
  with the `errorMap.ts` text.
- Existing handler tests keep their cases; where they provided
  `CurrentUser` they now provide `McpRequestUser`.
- Registration: `oauthCompatibility.test.ts` gains two cases. The
  authorization server metadata advertises
  `client_id_metadata_document_supported: true`, and an authorization
  request whose `client_id` is an HTTPS metadata URL (served by the test
  HTTP server) reaches consent with the document's `client_name`. DCR keeps
  its existing case.

## Open decisions

None blocking. Resolved during planning:

- Protocols: `2026-07-28` primary, `2025-11-25` and `2025-06-18` for Cursor
  and Gemini CLI, in-memory sessions accepted for those.
- Auth placement: middleware + `Context.Reference` (Option A), read directly
  by handlers via `McpCurrentUser`; `handlers.ts` becomes the toolkit layer.
- Client registration: CIMD added, DCR kept until the legacy adapters go.
- Error wire format: keep today's text messages via `failure: Schema.String`.
