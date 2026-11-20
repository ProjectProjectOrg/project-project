import { describe, expect, it } from "vitest"

import { recentFirst, rememberCommand } from "./recentCommands"

describe("rememberCommand", () => {
  it("moves a rerun command to the front and keeps the last five", () => {
    expect(rememberCommand(["a", "b", "c", "d", "e"], "d")).toEqual([
      "d",
      "a",
      "b",
      "c",
      "e"
    ])
    expect(rememberCommand(["a", "b", "c", "d", "e"], "f")).toEqual([
      "f",
      "a",
      "b",
      "c",
      "d"
    ])
  })
})

describe("recentFirst", () => {
  it("lifts recent commands in recency order and skips ones unavailable here", () => {
    const commands = [{ id: "a" }, { id: "b" }, { id: "c" }]
    expect(recentFirst(commands, ["c", "gone", "a"])).toEqual({
      recent: [{ id: "c" }, { id: "a" }],
      rest: [{ id: "b" }]
    })
  })
})
