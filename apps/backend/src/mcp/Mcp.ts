import { MCP_INSTRUCTIONS, Tools } from "@pp/shared"
import { McpProtocol, McpServer } from "effect/ai"
import * as Layer from "effect/Layer"

import { ToolHandlersLive } from "../tools/handlers"
import { McpAuthMiddlewareLive } from "./McpAuth"

export const McpLive = McpServer.layerHttp({
  name: "projectproject",
  version: "0.1.0",
  path: "/mcp",
  protocols: [
    McpProtocol.v2026_07_28,
    McpProtocol.v2025_11_25,
    McpProtocol.v2025_06_18
  ],
  instructions: MCP_INSTRUCTIONS
}).pipe(
  Layer.provideMerge(McpServer.toolkit(Tools)),
  Layer.provide(ToolHandlersLive),
  Layer.provide(McpAuthMiddlewareLive),
  Layer.orDie
)
