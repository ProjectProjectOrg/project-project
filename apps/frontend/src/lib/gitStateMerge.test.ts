import type { GitStatesResponse } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { mergeStaleGitStateDetails } from "./gitStateMerge"

const previous: GitStatesResponse = {
  states: {
    "T-1": {
      tag: "pr_open",
      branch: "feat/T-1",
      baseBranch: "main",
      number: 80,
      url: "https://github.com/acme/app/pull/80",
      draft: false,
      title: "Keep details",
      checks: "failing"
    }
  },
  transitioned: [],
  tokenStatus: "ok",
  repoStatus: "ok",
  refreshStatus: "fresh"
}

describe("mergeStaleGitStateDetails", () => {
  it("keeps matching PR summaries when a stale response omits them", () => {
    const merged = mergeStaleGitStateDetails(
      previous,
      {
        ...previous,
        states: {
          "T-1": {
            tag: "pr_open",
            branch: "feat/T-1",
            baseBranch: "main",
            number: 80,
            url: "https://github.com/acme/app/pull/80",
            draft: false,
            title: "",
            checks: "none"
          }
        },
        refreshStatus: "stale"
      },
      false
    )

    expect(merged.states["T-1"]).toMatchObject({
      title: "Keep details",
      checks: "failing"
    })
  })

  it("keeps matching PR summaries when the response is rate limited", () => {
    const merged = mergeStaleGitStateDetails(
      previous,
      {
        ...previous,
        states: {
          "T-1": {
            tag: "pr_open",
            branch: "feat/T-1",
            baseBranch: "main",
            number: 80,
            url: "https://github.com/acme/app/pull/80",
            draft: false,
            title: "",
            checks: "none"
          }
        },
        refreshStatus: "rate_limited"
      },
      false
    )

    expect(merged.states["T-1"]).toMatchObject({
      title: "Keep details",
      checks: "failing"
    })
  })

  it("keeps a matching PR while stale data falls back to branch pending", () => {
    const merged = mergeStaleGitStateDetails(
      previous,
      {
        ...previous,
        states: {
          "T-1": { tag: "branch_pending", name: "feat/T-1", baseBranch: "main" }
        },
        refreshStatus: "stale"
      },
      false
    )

    expect(merged.states["T-1"]).toEqual(previous.states["T-1"])
  })

  it("clears previous PR details when the repository changes", () => {
    const next: GitStatesResponse = {
      ...previous,
      states: {},
      refreshStatus: "stale"
    }
    expect(mergeStaleGitStateDetails(previous, next, true)).toEqual(next)
  })

  it("clears stale details when a fresh response omits them", () => {
    const next: GitStatesResponse = {
      ...previous,
      states: {
        "T-1": {
          tag: "pr_open",
          branch: "feat/T-1",
          baseBranch: "main",
          number: 80,
          url: "https://github.com/acme/app/pull/80",
          draft: false,
          title: "",
          checks: "none"
        }
      },
      refreshStatus: "fresh"
    }
    expect(mergeStaleGitStateDetails(previous, next, false)).toEqual(next)
  })

  it("returns the response untouched when there is nothing earlier to keep", () => {
    const next: GitStatesResponse = { ...previous, refreshStatus: "stale" }
    expect(mergeStaleGitStateDetails(undefined, next, false)).toEqual(next)
  })

  it("returns the response untouched once the repository is disconnected", () => {
    const next: GitStatesResponse = {
      ...previous,
      states: {},
      repoStatus: "not_connected",
      refreshStatus: "stale"
    }
    expect(mergeStaleGitStateDetails(previous, next, false)).toEqual(next)
  })
})
