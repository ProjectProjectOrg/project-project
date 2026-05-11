// HTTP-side glue for /mcp. The MCP SDK's web-standard transport accepts a
// Request and returns a Response, which slots cleanly into Bun's HTTP path.
// Auth comes from Better Auth's MCP plugin via withMcpAuth; the resolved
// userId is then fanned out into:
//   - the `Users` service (to fetch the full User record), and
//   - the AsyncLocalStorage used by the MCP dispatcher to populate
//     CurrentUser inside tool handlers.
//
// SESSION LIFECYCLE
// =================
// The SDK's WebStandardStreamableHTTPServerTransport refuses to be reused
// across requests in stateless mode ("Stateless transport cannot be reused
// across requests. Create a new transport per request."). The official
// stateful pattern is:
//   1. On `initialize` requests with no session header — create a fresh
//      transport, generate an Mcp-Session-Id, register it in a map.
//   2. On non-initialize requests — look up the transport by session id.
//      If unknown, 404.
//   3. On client DELETE — close and forget the transport.
// The SDK server itself stays shared; transports are session-affine.

import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { withMcpAuth } from "better-auth/plugins"
import { randomUUID } from "node:crypto"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { auth } from "../auth"
import { BackendInfrastructureLive, BackendServicesLive } from "../runtime"
import { McpServer } from "../Services/McpServer"
import { Users } from "../Services/Users"
import { currentUserStorage } from "./currentUserStorage"

export interface McpHttpHandler {
  readonly handle: (req: Request) => Promise<Response>
}

export class McpHttp extends Context.Tag(
  "@projectproject/backend/mcp/route/McpHttp"
)<McpHttp, McpHttpHandler>() {}

const RouteRuntimeLive = BackendServicesLive.pipe(
  Layer.provideMerge(BackendInfrastructureLive),
  Layer.orDie
)

export const McpHttpLive = Layer.scoped(
  McpHttp,
  Effect.gen(function* () {
    const { server } = yield* McpServer

    const runtime = ManagedRuntime.make(RouteRuntimeLive)
    yield* Effect.addFinalizer(() => Effect.promise(() => runtime.dispose()))

    // sessionId -> transport. New transport per initialize, looked up by
    // Mcp-Session-Id on subsequent requests.
    const transports = new Map<string, WebStandardStreamableHTTPServerTransport>()
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        for (const t of transports.values()) await t.close().catch(() => {})
        transports.clear()
      })
    )

    const resolveTransport = async (
      req: Request,
      body: unknown
    ): Promise<WebStandardStreamableHTTPServerTransport | Response> => {
      const sessionId = req.headers.get("mcp-session-id") ?? undefined

      if (sessionId && transports.has(sessionId)) {
        return transports.get(sessionId)!
      }

      // No session id. Only valid if this is the initialize request.
      if (!sessionId && isInitializeRequest(body)) {
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport)
          },
          onsessionclosed: (sid) => {
            transports.delete(sid)
          },
        })
        await server.connect(transport)
        return transport
      }

      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: sessionId
              ? "Unknown or expired Mcp-Session-Id"
              : "Mcp-Session-Id header required for non-initialize requests",
          },
          id: null,
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      )
    }

    const handle = withMcpAuth(auth, async (req, session) => {
      const users = await runtime.runPromise(
        Effect.flatMap(Users, (u) => u.fullByIds([session.userId]))
      )
      const user = users[0]
      if (!user) return new Response("Unauthorized", { status: 401 })

      // Pre-parse the body once; we need it both to decide whether this is
      // an initialize request AND to hand the already-parsed body to the
      // transport (so it doesn't try to re-read a consumed stream).
      let body: unknown
      if (req.method === "POST") {
        try {
          body = await req.clone().json()
        } catch {
          body = undefined
        }
      }

      const resolved = await resolveTransport(req, body)
      if (resolved instanceof Response) return resolved

      try {
        return await currentUserStorage.run(user, () =>
          resolved.handleRequest(req, { parsedBody: body })
        )
      } catch (e) {
        return new Response(
          `MCP transport error: ${e instanceof Error ? e.message : String(e)}`,
          { status: 500 }
        )
      }
    })

    return { handle }
  })
)
