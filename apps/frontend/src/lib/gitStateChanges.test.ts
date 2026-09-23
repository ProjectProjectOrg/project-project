import { StatusSlug, type GitStatesResponse } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  changedGitStateTicketIds,
  shouldInvalidateTicketsForGitStates
} from "./gitStateChanges"

const s = Schema.decodeUnknownSync(StatusSlug)

describe("shouldInvalidateTicketsForGitStates", () => {
  it("ignores git-state responses without ticket transitions", () => {
    expect(shouldInvalidateTicketsForGitStates({ transitioned: [] })).toBe(
      false
    )
  })

  it("invalidates when git-state responses report changed tickets", () => {
    expect(
      shouldInvalidateTicketsForGitStates({
        transitioned: [],
        changedTicketIds: ["T-2"]
      })
    ).toBe(true)
  })

  it("invalidates when a git-state response transitioned tickets", () => {
    expect(
      shouldInvalidateTicketsForGitStates({
        transitioned: [
          {
            ticketId: "T-1",
            fromStatus: s("in_progress"),
            toStatus: s("done"),
            prNumber: 80
          }
        ]
      })
    ).toBe(true)
  })
})

describe("changedGitStateTicketIds", () => {
  it("does not derive changes from an initial response", () => {
    const initial: GitStatesResponse = {
      states: {
        "T-1": { tag: "branch_no_pr", name: "feat/T-1", baseBranch: "main" }
      },
      transitioned: [],
      tokenStatus: "ok",
      repoStatus: "ok"
    }

    expect(changedGitStateTicketIds(undefined, initial)).toEqual([])
  })

  it("detects webhook-driven state changes without server change lists", () => {
    const before: GitStatesResponse = {
      states: {
        "T-1": {
          tag: "pr_open",
          branch: "feat/T-1",
          baseBranch: "main",
          number: 80,
          url: "https://github.com/acme/app/pull/80",
          draft: false,
          title: "Feature",
          checks: "passing"
        }
      },
      transitioned: [],
      tokenStatus: "ok",
      repoStatus: "ok"
    }
    const after: GitStatesResponse = {
      ...before,
      states: {
        "T-1": {
          tag: "pr_merged",
          branch: "feat/T-1",
          baseBranch: "main",
          number: 80,
          url: "https://github.com/acme/app/pull/80",
          title: "Feature",
          mergedAt: null
        }
      }
    }
    expect(changedGitStateTicketIds(before, after)).toEqual(["T-1"])
  })

  it("does not invalidate for a checks-only update", () => {
    const state = {
      tag: "pr_open",
      branch: "feat/T-1",
      baseBranch: "main",
      number: 80,
      url: "https://github.com/acme/app/pull/80",
      draft: false,
      title: "Feature",
      checks: "passing"
    } as const
    const before: GitStatesResponse = {
      states: { "T-1": state },
      transitioned: [],
      tokenStatus: "ok",
      repoStatus: "ok"
    }
    expect(
      changedGitStateTicketIds(before, {
        ...before,
        states: { "T-1": { ...state, checks: "failing" } }
      })
    ).toEqual([])
  })
})
