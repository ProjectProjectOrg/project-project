import type { TicketBranchEntry } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { orderStackLayers } from "./ticketStack"

const layer = (branch: string, base?: string): TicketBranchEntry =>
  base === undefined ? { branch } : { branch, base }

const order = (
  ownBranch: string | null,
  stack: ReadonlyArray<TicketBranchEntry>
) =>
  orderStackLayers(ownBranch, stack).map(({ layer, depth }) => [
    layer.branch,
    depth
  ])

describe("orderStackLayers", () => {
  it("follows base branches up from the ticket's branch", () => {
    expect(order("api", [layer("polish", "ui"), layer("ui", "api")])).toEqual([
      ["ui", 1],
      ["polish", 2]
    ])
  })

  it("keeps stored order for layers on the same base", () => {
    expect(
      order("api", [
        layer("docs", "api"),
        layer("ui", "api"),
        layer("polish", "ui")
      ])
    ).toEqual([
      ["docs", 1],
      ["ui", 1],
      ["polish", 2]
    ])
  })

  it("puts layers outside the chain last, with what builds on them", () => {
    expect(
      order("api", [
        layer("hotfix", "release"),
        layer("hotfix-2", "hotfix"),
        layer("spike"),
        layer("ui", "api")
      ])
    ).toEqual([
      ["ui", 1],
      ["hotfix", 1],
      ["hotfix-2", 2],
      ["spike", 1]
    ])
  })

  it("survives a cycle between layers", () => {
    expect(order(null, [layer("a", "b"), layer("b", "a")])).toEqual([
      ["a", 1],
      ["b", 2]
    ])
  })
})
