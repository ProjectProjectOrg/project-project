import { describe, expect, it } from "vitest"

import { displayUrl, linkKind } from "./projectLinks"

describe("linkKind", () => {
  it.each([
    ["https://www.figma.com/design/aBcDeF1234567890GhIjKl/Board", "figma"],
    ["https://github.com/acme/web/pulls", "github"],
    ["http://localhost:5173", "local"],
    ["http://127.0.0.1:3000", "local"],
    ["http://web.test/admin", "local"],
    ["https://staging.acme.com", "web"],
    ["https://localhost.acme.com", "web"]
  ])("reads %s as %s", (url, kind) => {
    expect(linkKind(url)).toBe(kind)
  })
})

describe("displayUrl", () => {
  it.each([
    ["https://docs.acme.dev/handbook/", "docs.acme.dev/handbook"],
    ["http://localhost:5173/", "localhost:5173"],
    ["https://acme.dev/search?q=a", "acme.dev/search?q=a"]
  ])("shows %s as %s", (url, expected) => {
    expect(displayUrl(url)).toBe(expected)
  })
})
