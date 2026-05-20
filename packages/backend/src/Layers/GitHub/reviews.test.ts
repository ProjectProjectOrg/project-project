import { describe, expect, it } from "vitest"
import {
  buildClosePullRequestPayload,
  buildMergePullRequestPayload,
  buildResolveThreadVariables,
  buildSubmitReviewPayload
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
})
