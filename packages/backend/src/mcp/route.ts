// HTTP-side glue for /mcp. The MCP SDK's web-standard transport accepts a
// Request and returns a Response, which slots cleanly into Bun's HTTP path.
// Auth comes from Better Auth's MCP plugin via withMcpAuth; the resolved
// userId is then fanned out into:
//   - the `Users` service (to fetch the full User record), and
//   - the AsyncLocalStorage used by the MCP dispatcher to populate
//     CurrentUser inside tool handlers.
//
// One transport per process: the SDK's transport multiplexes connections
// internally — no need to create one per request. The transport is bound to
// the McpServer instance at construction; we connect them inside an Effect
// scope that lives for the lifetime of the Layer.

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { withMcpAuth } from "better-auth/plugins"
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

// A per-process ManagedRuntime providing the services the route handler
// needs at request time (Users for the userId -> User lookup). We rebuild
// the backend services stack with provideMerge so infrastructure stays
// visible — see the same pattern in Layers/McpServer.ts.
const RouteRuntimeLive = BackendServicesLive.pipe(
  Layer.provideMerge(BackendInfrastructureLive),
  Layer.orDie
)

export const McpHttpLive = Layer.scoped(
  McpHttp,
  Effect.gen(function* () {
    const { server } = yield* McpServer

    // Stateless mode: no sessionIdGenerator. Each POST is self-contained
    // — good fit for read-only tools and simpler horizontal scaling.
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })

    yield* Effect.promise(() => server.connect(transport))
    yield* Effect.addFinalizer(() => Effect.promise(() => transport.close()))

    const runtime = ManagedRuntime.make(RouteRuntimeLive)
    yield* Effect.addFinalizer(() => Effect.promise(() => runtime.dispose()))

    const handle = withMcpAuth(auth, async (req, session) => {
      const users = await runtime.runPromise(
        Effect.flatMap(Users, (u) => u.fullByIds([session.userId]))
      )
      const user = users[0]
      if (!user) return new Response("Unauthorized", { status: 401 })

      // Bun preserves AsyncLocalStorage across awaits, so the dispatcher's
      // callback (which runs inside transport.handleRequest) sees this user.
      return await currentUserStorage.run(user, () =>
        transport.handleRequest(req)
      )
    })

    return { handle }
  })
)
