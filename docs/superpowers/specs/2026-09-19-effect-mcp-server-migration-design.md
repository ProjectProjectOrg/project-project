# MCP server moves onto Effect's `McpServer`

Effect `4.0.0-rc.116` ships `effect/unstable/ai/McpServer` with the MCP
`2026-07-28` revision. That revision replaces initialization and protocol-level
sessions with per-request metadata, which is exactly the stateless shape the
current `/mcp` endpoint fakes on top of the `@modelcontextprotocol/sdk`
transport. This spec replaces the SDK server, the AsyncLocalStorage bridge and
the hand-rolled dispatcher with the Effect layer, and moves bearer-token
verification into an Effect middleware built on Better Auth's own primitives.

## Goals

- Serve MCP `2026-07-28` only. No `Mcp-Session-Id`, no in-memory session state,
  any backend instance can answer any request.
- One source of truth for the tool catalog: `McpTools` in `packages/shared`
  keeps describing every tool; the backend derives `Tool.make` definitions
  from it.
- Agent-facing behaviour stays byte-for-byte where it matters: tool names,
  input JSON Schema, success payloads, and the human-readable `isError` texts
  from `errorMap.ts`.
- Better Auth stays the OAuth authorization server. Only the web-`Request`
  shaped `requireMcpAuth` wrapper goes.

## Non-goals

- Legacy protocol revisions. Claude Code (2.1.273) and Codex (0.154.0) already
  negotiate `2026-07-28`; the npm SDK client lags but is not a production
  consumer here. Adding `McpProtocol.v2025_11_25` later is a one-line change
  plus accepting Effect's in-memory sessions for those clients.
- MCP resources, prompts, elicitation, `subscriptions/listen`. Tools only, as
  today.
- Changing the OAuth flow, consent screen, scopes, or the connected-agents UI.

## Version bump

`effect`, `@effect/platform-bun`, `@effect/sql-pg`, `@effect/atom-react` and
`@effect/vitest` move from `4.0.0-rc.112` to `4.0.0-rc.116` across the
workspace in one commit before any MCP work. Whatever the bump breaks in the
frontend or backend gets fixed in that commit; the MCP rewrite starts from a
green typecheck and test run.

`@modelcontextprotocol/sdk` is removed from `packages/backend`. Its only
remaining uses are the server transport (replaced) and the test client
(cannot speak `2026-07-28`, replaced by a raw JSON-RPC helper).

## Architecture

```
HttpRouter
  └─ /mcp  (McpServer.layerHttp, protocols: [McpProtocol.v2026_07_28])
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

Kept as is: `packages/shared/src/mcp/*`, `mcp/handlers.ts` (signatures
unchanged), `mcp/errorMap.ts`, `handlers.test.ts`, `attachments.test.ts`,
`orgStorage.test.ts`.

### `mcp/toolkit.ts`

Walks `McpTools` once and produces:

- `Tool.make(name, { description, parameters: spec.input, success: spec.output, failure: Schema.String, failureMode: "return" })` per entry. `parameters` must be an object schema; the catalog already guarantees that.
- `McpToolkit = Toolkit.make(...tools)`.
- `makeHandlers(handlers: HandlersMap<R>)` producing the toolkit handler layer.
  Each handler is wrapped once:

  ```
  withCurrentUser(handlers[name](input)).pipe(
    Effect.mapError((e) => mapToolError(e).content[0].text),
    Effect.tapDefect(log), Effect.catchDefect(die → mapToolError text),
    Effect.withSpan(`mcp.tool.${name}`)
  )
  ```

  `failure: Schema.String` is deliberate: Effect encodes a declared string
  failure as a single `text` content item with `isError: true`, so the agent
  sees exactly the messages `errorMap.ts` produces today. Declared error
  schemas from the catalog stay as documentation and for the HttpApi surface;
  the MCP wire format for errors does not change.

Unknown tool names are handled by Effect: `callTool` maps `ToolNotFound` to
JSON-RPC `-32602`, matching the current behaviour.

### `McpRequestUser`

A `Context.Reference<Option<User>>` with default `None`, defined next to
`CurrentUser` in the backend. References carry a default, so they never show
up as a static requirement of the toolkit layer, yet they are read from the
request fiber. The auth middleware sets it; `withCurrentUser` reads it,
fails `Unauthorized` on `None`, and provides `CurrentUser` to the handler.

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

### `Layers/Mcp.ts`

```
McpServer.layerHttp({
  name: "projectproject", version, instructions,
  path: "/mcp", protocols: [McpProtocol.v2026_07_28]
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
handler sees the value. If it does not, the fallback is reading the bearer
token inside `withCurrentUser` from `HttpServerRequest` (which Effect does
retain in handler context) and calling the same `McpAuth` verification there,
with the middleware keeping the 401 challenge role. The spec's file layout is
unchanged either way.

## Testing

- `Layers/McpHttp.test.ts` → `Layers/Mcp.test.ts`. Same DB-backed setup, two
  runtimes round-robin, same assertions (401 challenge headers, expired
  token, `405`, user isolation, consent revocation, validation error text,
  unknown tool `-32602`). The client becomes a small helper that posts
  JSON-RPC with the `MCP-Protocol-Version: 2026-07-28` header and the
  `_meta` envelope the revision requires (`io.modelcontextprotocol/protocolVersion`,
  `clientCapabilities`, `clientInfo`). It asserts no `mcp-session-id` header
  is ever returned.
- New `mcp/toolkit.test.ts`: the JSON Schema emitted for every tool equals
  what `dispatch.ts` emits today (snapshot taken before the rewrite), and a
  declared error becomes `{ isError: true, content: [{ type: "text", text }] }`
  with the `errorMap.ts` text.
- Existing handler tests run unchanged.

## Open decisions

None blocking. Resolved during planning:

- Protocols: `2026-07-28` only.
- Auth placement: middleware + `Context.Reference` (Option A).
- Error wire format: keep today's text messages via `failure: Schema.String`.
