// The McpServer Layer builds:
//   1. A CurrentUser Layer backed by AsyncLocalStorage (so the dispatcher's
//      tool callbacks can yield* CurrentUser even though they run outside
//      any Effect-managed scope).
//   2. A ManagedRuntime that provides everything handlers need: the ALS-
//      backed CurrentUser + the existing BackendRuntimeLive (Users,
//      BetterAuth, Db, ...).
//   3. An SDK McpServer with every tool from the catalog registered.
//
// Lifetime: the runtime is acquired in a scope and disposed when the Layer's
// scope ends, so a graceful server shutdown tears everything down.

import { McpServer as SdkMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { CurrentUser, Unauthorized } from "@projectproject/shared"
import { currentUserStorage } from "../mcp/currentUserStorage"
import { registerAllTools } from "../mcp/dispatch"
import { handlers } from "../mcp/handlers"
import {
  BackendInfrastructureLive,
  BackendServicesLive,
} from "../runtime"
import { McpServer } from "../Services/McpServer"

// Reads the per-request user from ALS. The /mcp route wraps
// `transport.handleRequest` in `storage.run(user, ...)`, so the callback that
// eventually runs inside the dispatcher sees the right user. If the ALS is
// empty (a tool ran outside a request scope, or auth was skipped), we fail
// with Unauthorized — the dispatcher's errorMap turns that into a normal MCP
// tool-error response.
const CurrentUserAlsLive = Layer.effect(
  CurrentUser,
  Effect.suspend(() => {
    const user = currentUserStorage.getStore()
    return user
      ? Effect.succeed(user)
      : Effect.fail(new Unauthorized())
  })
)

// We rebuild the backend services stack with `provideMerge` for the
// infrastructure layer so BetterAuth (and Db/BunContext) stay visible in
// ROut. The default `BackendRuntimeLive` uses `Layer.provide`, which hides
// infrastructure — fine for HTTP handlers that go through middleware, but
// the MCP handlers need to `yield* BetterAuth` directly.
//
// `Layer.orDie` collapses the layer-construction error channel (SqlError,
// ConfigError, ...) into defects. The dispatcher requires
// `ManagedRuntime<R, never>`, and these errors aren't recoverable per-
// request anyway — if the DB can't be reached at startup we want a hard
// crash, not a per-tool error response.
const McpBackendLive = BackendServicesLive.pipe(
  Layer.provideMerge(BackendInfrastructureLive)
)

const McpRuntimeLive = Layer.mergeAll(
  CurrentUserAlsLive,
  McpBackendLive
).pipe(Layer.orDie)

export const McpServerLive = Layer.scoped(
  McpServer,
  Effect.gen(function* () {
    // Tie the runtime's lifetime to the layer's scope. dispose() returns a
    // Promise; wrapping it in Effect.promise makes it part of the finalizer.
    const runtime = ManagedRuntime.make(McpRuntimeLive)
    yield* Effect.addFinalizer(() => Effect.promise(() => runtime.dispose()))

    const server = new SdkMcpServer(
      { name: "projectproject", version: "0.1.0" },
      {
        capabilities: { tools: {} },
        instructions:
          "Read-only access to the user's orgs, groups, projects, and tickets.",
      }
    )

    registerAllTools(server, runtime, handlers)

    return { server }
  })
)
