// Central mapper from tagged errors raised by handlers to MCP tool-error
// responses. The MCP SDK accepts `{ content: [...], isError: true }` for
// soft errors; tagged errors that map here keep the connection alive
// instead of crashing the dispatcher with an unhandled defect.

import * as ParseResult from "effect/ParseResult"

export interface McpToolErrorResult {
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>
  readonly isError: true
}

const text = (s: string): McpToolErrorResult => ({
  content: [{ type: "text", text: s }],
  isError: true,
})

const reasonOf = (e: unknown): string | undefined =>
  typeof e === "object" && e !== null && "reason" in e
    ? String((e as { reason?: unknown }).reason ?? "")
    : undefined

export const mapToolError = (e: unknown): McpToolErrorResult => {
  if (typeof e !== "object" || e === null || !("_tag" in e)) {
    return text("Internal error.")
  }
  const tag = String((e as { _tag: unknown })._tag)
  switch (tag) {
    case "Unauthorized":
      return text("Unauthorized.")
    case "Forbidden":
      return text("Forbidden.")
    case "NotFound":
      return text("Not found.")
    case "Conflict":
      return text(`Conflict (${reasonOf(e) ?? ""}).`)
    case "Validation":
      return text(`Validation error (${reasonOf(e) ?? ""}).`)
    case "ParseError":
      return text(
        `Validation error: ${ParseResult.TreeFormatter.formatErrorSync(
          e as ParseResult.ParseError
        )}`
      )
    case "MarkdownError":
      return text("Document read failed.")
    case "BetterAuthError":
      return text("Auth provider error.")
    case "TicketIdTaken":
    case "GroupIdTaken":
      return text("Identifier already taken.")
    default:
      return text("Internal error.")
  }
}
