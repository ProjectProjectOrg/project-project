import { describe, expect, it } from "vitest"

import { toProjectLink } from "./opts"

describe("toProjectLink", () => {
  it.each([
    ["localhost:5173", "http://localhost:5173"],
    ["127.0.0.1:3000/admin", "http://127.0.0.1:3000/admin"],
    ["app.test", "http://app.test"],
    ["staging.example.com", "https://staging.example.com"],
    ["  http://example.com  ", "http://example.com"]
  ])("reads %s as %s", (url, expected) => {
    expect(toProjectLink({ label: "Dev", url })?.url).toBe(expected)
  })

  it("names an unlabelled link after its host", () => {
    expect(toProjectLink({ label: "  ", url: "localhost:5173/x" })).toEqual({
      label: "localhost:5173",
      url: "http://localhost:5173/x"
    })
  })

  it.each(["", "   ", "ftp://files.example.com", "has space.com"])(
    "rejects %j",
    (url) => {
      expect(toProjectLink({ label: "", url })).toBeNull()
    }
  )
})
