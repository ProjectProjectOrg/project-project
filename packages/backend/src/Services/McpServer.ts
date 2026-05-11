import * as Context from "effect/Context"
import type { McpServer as SdkMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

export interface McpServerShape {
  readonly server: SdkMcpServer
}

export class McpServer extends Context.Tag(
  "@projectproject/backend/Services/McpServer"
)<McpServer, McpServerShape>() {}
