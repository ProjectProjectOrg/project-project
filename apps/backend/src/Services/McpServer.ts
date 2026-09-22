import type { Server as SdkMcpServer } from "@modelcontextprotocol/sdk/server/index.js"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { McpToolServices } from "../mcp/handlers"

export type { McpToolServices } from "../mcp/handlers"

export type McpToolRuntime = Context.Context<McpToolServices>

export type McpServerShape = Readonly<{
  createServer: () => SdkMcpServer
  runtime: McpToolRuntime
}>

export class McpServer extends Context.Service<McpServer, McpServerShape>()(
  "@pp/backend/Services/McpServer"
) {}

export type ToolEffect<A> = Effect.Effect<A, unknown>
