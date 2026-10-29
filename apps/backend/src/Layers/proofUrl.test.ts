import { describe, expect, it } from "vitest"

import { proofUrl } from "./proofUrl"

const resource = "https://pp.example.com/mcp"

describe("proofUrl", () => {
  it("binds an MCP request's proof to the MCP endpoint", () => {
    expect(proofUrl("/mcp", resource)).toBe("https://pp.example.com/mcp")
  })

  it("binds a tool request's proof to the tool it called", () => {
    expect(proofUrl("/api/v1/tools/me", resource)).toBe(
      "https://pp.example.com/api/v1/tools/me"
    )
  })

  it("drops the query, which DPoP leaves out of htu", () => {
    expect(proofUrl("/api/v1/tools/me?debug=1", resource)).toBe(
      "https://pp.example.com/api/v1/tools/me"
    )
  })
})
