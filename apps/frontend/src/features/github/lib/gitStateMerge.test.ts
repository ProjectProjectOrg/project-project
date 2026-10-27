import type { GitStatesResponse, StackLayerState } from "@pp/shared"
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

const stackPr = {
  number: 81,
  url: "https://github.com/acme/app/pull/81",
  title: "Stack details",
  state: "open",
  draft: false,
  landed: false,
  checks: "failing"
} as const
const stackLayer: StackLayerState = {
  branch: "feat/stack",
  base: "feat/T-1",
  depth: 1,
  deleted: false,
  pr: stackPr
}

it.each(["stale", "rate_limited"] as const)(
  "keeps matching stack PR details on a %s refresh while accepting topology and lifecycle changes",
  (refreshStatus) => {
    const before: GitStatesResponse = {
      ...previous,
      stacks: { "T-1": [stackLayer] }
    }
    const next: GitStatesResponse = {
      ...before,
      refreshStatus,
      stacks: {
        "T-1": [
          {
            ...stackLayer,
            base: "main",
            pr: {
              ...stackPr,
              title: "",
              checks: null,
              state: "merged",
              landed: true
            }
          }
        ]
      }
    }
    expect(
      mergeStaleGitStateDetails(before, next, false).stacks?.["T-1"]
    ).toEqual([
      {
        ...stackLayer,
        base: "main",
        pr: { ...stackPr, state: "merged", landed: true }
      }
    ])
  }
)

it.each([
  ["fresh", { refreshStatus: "fresh" }, stackLayer],
  ["changed repository", {}, stackLayer],
  ["disconnected repository", { repoStatus: "not_connected" }, stackLayer],
  ["replacement PR", {}, { ...stackLayer, pr: { ...stackPr, number: 82 } }],
  ["different branch", {}, { ...stackLayer, branch: "feat/other" }]
] satisfies ReadonlyArray<
  readonly [string, Partial<GitStatesResponse>, StackLayerState]
>)("does not carry stack details across a %s", (reason, patch, layer) => {
  const before: GitStatesResponse = {
    ...previous,
    stacks: { "T-1": [stackLayer] }
  }
  const next: GitStatesResponse = {
    ...before,
    refreshStatus: "stale",
    ...patch,
    stacks: {
      "T-1": [
        {
          ...layer,
          pr:
            layer.pr === null
              ? null
              : { ...layer.pr, title: "", checks: "none" }
        }
      ]
    }
  }
  expect(
    mergeStaleGitStateDetails(before, next, reason === "changed repository")
  ).toEqual(next)
})
