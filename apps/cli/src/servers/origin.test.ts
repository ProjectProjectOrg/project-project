import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"

import { originOf } from "./origin"

describe("originOf", () => {
  it.each([
    ["pp.example.com", "https://pp.example.com"],
    ["https://pp.example.com/orgs/acme", "https://pp.example.com"],
    ["pp.example.com/", "https://pp.example.com"],
    ["localhost:5173", "http://localhost:5173"],
    ["127.0.0.1:3000", "http://127.0.0.1:3000"],
    ["http://pp.internal:8080", "http://pp.internal:8080"]
  ])("reads %s as %s", (address, origin) => {
    expect(originOf(address)).toEqual(Option.some(origin))
  })

  it("rejects an empty address", () => {
    expect(originOf("  ")).toEqual(Option.none())
  })
})
