import { describe, expect, it } from "vitest"
import * as Schema from "effect/Schema"
import { TicketId } from "@projectproject/shared"
import type { RawProjectStates } from "./Services/GitHub"
import {
  planTicketGitStates,
  type TicketGitStateInput
} from "./ticketGitStatePlanner"

const now = new Date("2026-05-08T10:00:00.000Z")
const ticketId = Schema.decodeUnknownSync(TicketId)

const baseTicket = {
  id: ticketId("T-1"),
  status: "in_progress",
  branch: null,
  pr: null,
  lastTransitionedPr: null
} satisfies TicketGitStateInput

function raw(overrides: Partial<RawProjectStates> = {}): RawProjectStates {
  return {
    defaultBranch: "main",
    existingBranches: new Set(),
    prByBranch: new Map(),
    ...overrides
  }
}

describe("planTicketGitStates", () => {
  it("marks tickets without branches without writes", () => {
    const plan = planTicketGitStates([baseTicket], raw(), now)

    expect(plan.states).toEqual({ "T-1": { tag: "no_branch" } })
    expect(plan.transitioned).toEqual([])
    expect(plan.writes).toEqual([])
  })

  it("marks missing remote branches as stale", () => {
    const plan = planTicketGitStates(
      [{ ...baseTicket, branch: "feat/T-1" }],
      raw(),
      now
    )

    expect(plan.states["T-1"]).toEqual({
      tag: "stale_branch",
      name: "feat/T-1"
    })
    expect(plan.writes).toEqual([])
  })

  it("auto-transitions a ticket when its PR merged", () => {
    const plan = planTicketGitStates(
      [{ ...baseTicket, branch: "feat/T-1" }],
      raw({
        existingBranches: new Set(["feat/T-1"]),
        prByBranch: new Map([
          [
            "feat/T-1",
            {
              headRefName: "feat/T-1",
              baseRefName: "main",
              state: "merged",
              draft: false,
              number: 42,
              url: "https://github.test/pr/42",
              title: "Ship it",
              mergedAt: null,
              checks: "passing"
            }
          ]
        ])
      }),
      now
    )

    expect(plan.states["T-1"]).toEqual({
      tag: "pr_merged",
      branch: "feat/T-1",
      baseBranch: "main",
      number: 42,
      url: "https://github.test/pr/42",
      title: "Ship it",
      mergedAt: now
    })
    expect(plan.transitioned).toEqual([
      {
        ticketId: "T-1",
        fromStatus: "in_progress",
        toStatus: "done",
        prNumber: 42
      }
    ])
    expect(plan.writes).toEqual([
      {
        ticketId: "T-1",
        patch: {
          status: "done",
          pr: 42,
          lastTransitionedPr: 42
        }
      }
    ])
  })

  it("does not re-transition an already transitioned merged PR", () => {
    const plan = planTicketGitStates(
      [
        {
          ...baseTicket,
          status: "done",
          branch: "feat/T-1",
          pr: 42,
          lastTransitionedPr: 42
        }
      ],
      raw({
        existingBranches: new Set(["feat/T-1"]),
        prByBranch: new Map([
          [
            "feat/T-1",
            {
              headRefName: "feat/T-1",
              baseRefName: "main",
              state: "merged",
              draft: false,
              number: 42,
              url: "https://github.test/pr/42",
              title: "Ship it",
              mergedAt: now,
              checks: "passing"
            }
          ]
        ])
      }),
      now
    )

    expect(plan.transitioned).toEqual([])
    expect(plan.writes).toEqual([])
  })
})
