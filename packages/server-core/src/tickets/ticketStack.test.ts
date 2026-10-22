import type { TicketBranchEntry } from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  orderStackLayers,
  planLayerPullRequest,
  planStackAttach
} from "./ticketStack"

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
        layer("hotfix-2", "hotfix"),
        layer("hotfix", "release"),
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

describe("planLayerPullRequest", () => {
  const pr = {
    branch: "ui",
    base: "api",
    number: 42,
    state: "merged" as const,
    draft: false,
    landed: false
  }

  it("keeps a landed merge landed while the pull request stays the same", () => {
    expect(
      planLayerPullRequest(
        {
          branch: "ui",
          base: "feat/T-1",
          pr: 42,
          prState: "merged",
          landed: true
        },
        pr
      )
    ).toEqual({
      branch: "ui",
      base: "api",
      pr: 42,
      prState: "merged",
      landed: true
    })
  })

  it("drops the landed flag for a new pull request on the branch", () => {
    expect(
      planLayerPullRequest(
        { branch: "ui", pr: 41, prState: "merged", landed: true },
        { ...pr, state: "open", draft: true }
      )
    ).toEqual({
      branch: "ui",
      base: "api",
      pr: 42,
      prState: "open",
      prDraft: true
    })
  })
})

describe("planStackAttach", () => {
  const ticket = {
    branch: "feat/T-1",
    stack: [{ branch: "api", base: "feat/T-1" }],
    archivedAt: null
  }
  const pr = {
    branch: "ui",
    base: "api",
    number: 42,
    state: "open" as const,
    draft: false,
    landed: false
  }

  it("stacks a pull request on one of the ticket's branches", () => {
    expect(planStackAttach(ticket, pr, false)).toEqual({
      branch: "ui",
      base: "api",
      pr: 42,
      prState: "open"
    })
  })

  it("needs the ticket's key in the branch for anything else", () => {
    expect(planStackAttach(ticket, { ...pr, base: "main" }, false)).toBeNull()
    expect(planStackAttach(ticket, { ...pr, base: "main" }, true)).toEqual({
      branch: "ui",
      base: "main",
      pr: 42,
      prState: "open"
    })
  })

  it("never stacks a branch the ticket already has", () => {
    expect(planStackAttach(ticket, { ...pr, branch: "api" }, true)).toBeNull()
  })
})
