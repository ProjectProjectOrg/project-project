import { describe, expect, it } from "vitest"
import {
  buildClosePullRequestPayload,
  buildMergePullRequestPayload,
  buildResolveThreadVariables,
  buildSubmitReviewPayload,
  combineReviewChecks,
  reviewChecksFromCommitStatuses,
  reviewChecksFromRuns
} from "./reviews"

describe("GitHub review request mapping", () => {
  it("maps pending comments into GitHub's create review payload", () => {
    expect(
      buildSubmitReviewPayload({
        event: "request_changes",
        body: "Please tighten this up",
        comments: [
          {
            path: "src/app.ts",
            body: "This condition is inverted",
            side: "right",
            line: 42,
            startLine: 40
          }
        ]
      })
    ).toEqual({
      event: "REQUEST_CHANGES",
      body: "Please tighten this up",
      comments: [
        {
          path: "src/app.ts",
          body: "This condition is inverted",
          side: "RIGHT",
          line: 42,
          start_side: "RIGHT",
          start_line: 40
        }
      ]
    })
  })

  it("omits optional merge commit fields when they are not provided", () => {
    expect(buildMergePullRequestPayload({ method: "squash" })).toEqual({
      merge_method: "squash"
    })
  })

  it("maps close and reopen through the pull request state payload", () => {
    expect(buildClosePullRequestPayload()).toEqual({ state: "closed" })
  })

  it("uses the review thread node id as the GraphQL mutation variable", () => {
    expect(buildResolveThreadVariables("PRRT_kwDOA123")).toEqual({
      threadId: "PRRT_kwDOA123"
    })
  })

  it("maps GitHub check runs into review checks", () => {
    expect(
      reviewChecksFromRuns([
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "neutral" }
      ])
    ).toEqual({
      status: "passing",
      totalCount: 2,
      completedCount: 2
    })

    expect(
      reviewChecksFromRuns([
        { status: "completed", conclusion: "success" },
        { status: "in_progress", conclusion: null }
      ])
    ).toEqual({
      status: "pending",
      totalCount: 2,
      completedCount: 1
    })

    expect(
      reviewChecksFromRuns([{ status: "completed", conclusion: "failure" }])
    ).toEqual({
      status: "failing",
      totalCount: 1,
      completedCount: 1
    })
  })

  it("maps GitHub commit statuses into review checks", () => {
    expect(reviewChecksFromCommitStatuses([{ state: "success" }])).toEqual({
      status: "passing",
      totalCount: 1,
      completedCount: 1
    })

    expect(
      reviewChecksFromCommitStatuses([{ state: "success" }, { state: "pending" }])
    ).toEqual({
      status: "pending",
      totalCount: 2,
      completedCount: 1
    })
  })

  it("combines check runs and commit statuses for the GitHub PR summary", () => {
    expect(
      combineReviewChecks(
        { status: "none", totalCount: 0, completedCount: 0 },
        { status: "passing", totalCount: 1, completedCount: 1 }
      )
    ).toEqual({
      status: "passing",
      totalCount: 1,
      completedCount: 1
    })
  })
})
