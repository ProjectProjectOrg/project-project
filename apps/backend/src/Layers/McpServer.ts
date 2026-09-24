import { Server as SdkMcpServer } from "@modelcontextprotocol/sdk/server/index.js"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { registerAllTools } from "../mcp/dispatch"
import { handlers } from "../mcp/handlers"
import * as McpServer from "../Services/McpServer"

export const McpServerLive = Layer.effect(
  McpServer.McpServer,
  Effect.gen(function* () {
    const context = yield* Effect.context<McpServer.McpToolServices>()

    const createServer = () => {
      const server = new SdkMcpServer(
        { name: "projectproject", version: "0.1.0" },
        {
          capabilities: { tools: {} },
          instructions:
            "Access the user's organizations, projects, groups, and tickets. Create and update tickets, comments, and sprints. " +
            "Upload ticket attachments using prepare_ticket_attachment, then POST the file bytes to its uploadUrl from your file environment. " +
            "The upload response contains committed attachment metadata; use update_ticket to place the permanent URL in the description. " +
            "Ticket bodies can hold named blocks — reusable, structured sections such as acceptance criteria or a definition of done — " +
            'written as <block type="key">, a blank line, the content, a blank line, then </block>. Call list_blocks and list_templates ' +
            "to see what a project defines before writing a ticket by hand, and prefer create_ticket's `template` parameter over hand-rolled " +
            "blocks when a template fits. When filling in a template or an existing ticket, fill blocks in rather than replacing them: keep " +
            "the <block> tags and headings, and replace each trailing {{hint}} placeholder with real content or leave the line empty. " +
            'A block written with the trailing sync attribute (<block type="key" sync>) is a shared, managed definition — leave its text ' +
            "alone and only tick or untick its checkboxes. Malformed block markup in create_ticket/update_ticket bodies is rejected with a " +
            "Validation error describing the exact line and fix."
        }
      )
      registerAllTools(server, context, handlers)
      return server
    }

    return { createServer, runtime: context }
  })
)
