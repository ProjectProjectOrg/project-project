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
}).pipe(
  Layer.provideMerge(McpServer.toolkit(McpToolkit)),
  Layer.provide(McpToolkitHandlersLive),
  Layer.provide(McpAuthMiddlewareLive),
  Layer.orDie
)
