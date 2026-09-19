import * as Layer from "effect/Layer"
import { McpProtocol, McpServer } from "effect/unstable/ai"
import { McpToolkitHandlersLive } from "../mcp/handlers"
import { McpToolkit } from "../mcp/toolkit"
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
  instructions:
    "Access the user's organizations, projects, groups, and tickets. Create and update tickets, comments, and sprints. Upload ticket attachments using prepare_ticket_attachment, then POST the file bytes to its uploadUrl from your file environment. The upload response contains committed attachment metadata; use update_ticket to place the permanent URL in the description."
}).pipe(
  Layer.provideMerge(McpServer.toolkit(McpToolkit)),
  Layer.provide(McpToolkitHandlersLive),
  Layer.provide(McpAuthMiddlewareLive),
  Layer.orDie
)
