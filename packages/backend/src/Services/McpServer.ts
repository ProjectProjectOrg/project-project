import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type * as ManagedRuntime from "effect/ManagedRuntime"
import type { McpServer as SdkMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

// The runtime is parameterised by the full backend service stack, but the
// concrete service union changes whenever a new Layer is added to
// BackendServicesLive. We type-erase it here so consumers (the /mcp route)
// can `runPromise` any Effect that needs backend services without having to
// duplicate the union. ManagedRuntime is variant-safe enough that this
// erasure doesn't bypass anything that the layer construction wouldn't
// already have caught at build time.
export type McpToolRuntime = ManagedRuntime.ManagedRuntime<
  // biome-ignore lint/suspicious/noExplicitAny: see comment above
  any,
  never
>

export interface McpServerShape {
  readonly server: SdkMcpServer
  readonly runtime: McpToolRuntime
}

export class McpServer extends Context.Tag(
  "@projectproject/backend/Services/McpServer"
)<McpServer, McpServerShape>() {}

// Helper type for the dispatcher: a handler whose Effect can be run by the
// shared runtime once `CurrentUser` is provided per call.
export type ToolEffect<A> = Effect.Effect<A, unknown, never>
