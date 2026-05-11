// packages/backend/src/mcp/errorMap.ts
//
// Central mapper from tagged errors raised by handlers to MCP tool-error
// responses. The MCP SDK accepts `{ content: [...], isError: true }` for
// soft errors; tagged errors that map here keep the connection alive
// instead of crashing the dispatcher with an unhandled defect.

export interface McpToolErrorResult {
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>
  readonly isError: true
}

const text = (s: string): McpToolErrorResult => ({
  content: [{ type: "text", text: s }],
  isError: true,
})

export const mapToolError = (e: unknown): McpToolErrorResult => {
  if (typeof e === "object" && e !== null && "_tag" in e) {
    const tag = String((e as { _tag: unknown })._tag)
    switch (tag) {
      case "Unauthorized": return text("Unauthorized.")
      case "Forbidden":    return text("Forbidden.")
      case "NotFound":     return text("Not found.")
      case "Conflict":     return text(`Conflict (${(e as { reason?: string }).reason ?? ""}).`)
      case "Validation":   return text(`Validation error (${(e as { reason?: string }).reason ?? ""}).`)
      case "ParseError":   return text(`Validation error: ${JSON.stringify(e)}`)
      default:             return text(`Error (${tag}).`)
    }
  }
  return text("Internal error.")
}
