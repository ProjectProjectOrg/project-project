import {
  Conflict,
  Forbidden,
  LastProjectPmBlocked,
  MentionInvalid,
  SlackRateLimited,
  Validation
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { describe, expect, it } from "vitest"

import { errorMessage } from "./errorMessage"
import {
  mutationErrorText,
  mutationFailure,
  orgActionDefect,
  orgActionError,
  slackActionErrorMessage,
  ticketCreateErrorMessage
} from "./mutationError"

describe("mutationErrorText", () => {
  it("is null until the mutation fails", () => {
    expect(mutationErrorText(AsyncResult.initial())).toBeNull()
    expect(mutationErrorText(AsyncResult.success(1))).toBeNull()
  })

  it("maps a typed failure through errorMessage by default", () => {
    expect(mutationErrorText(AsyncResult.fail(new Forbidden()))).toBe(
      errorMessage(new Forbidden())
    )
  })

  it("uses the given mappers for typed errors and defects", () => {
    expect(
      mutationErrorText(
        AsyncResult.fail(new Forbidden()),
        () => "typed",
        () => "defect"
      )
    ).toBe("typed")
    expect(
      mutationErrorText(
        AsyncResult.failure(Cause.die(new Error("private"))),
        () => "typed",
        () => "defect"
      )
    ).toBe("defect")
  })

  it("never shows a defect's own message", () => {
    expect(
      mutationErrorText(AsyncResult.failure(Cause.die(new Error("private"))))
    ).toBe("Something went wrong.")
  })
})

describe("ticketCreateErrorMessage", () => {
  it("explains mention and unknown-template failures", () => {
    expect(
      ticketCreateErrorMessage(
        new MentionInvalid({ kind: "unknown_user", href: "x" })
      )
    ).toBe(
      errorMessage(new MentionInvalid({ kind: "unknown_user", href: "x" }))
    )
    expect(
      ticketCreateErrorMessage(
        new Validation({ reason: "unknown_template:bug-report" })
      )
    ).toBe('The template "bug-report" doesn\'t exist anymore.')
  })

  it("falls back for other failures", () => {
    expect(ticketCreateErrorMessage(new Forbidden())).toBe(
      ticketCreateErrorMessage(new Conflict({ reason: "x" }))
    )
  })
})

describe("slackActionErrorMessage", () => {
  it("explains the Slack errors and falls back for anything else", () => {
    expect(
      slackActionErrorMessage(new SlackRateLimited({ retryAfterSeconds: 5 }))
    ).toBe(errorMessage(new SlackRateLimited({ retryAfterSeconds: 5 })))
    const mention = new MentionInvalid({ kind: "unknown_user", href: "x" })
    expect(slackActionErrorMessage(mention)).not.toBe(errorMessage(mention))
  })
})

describe("orgActionError", () => {
  it("maps the tagged errors the org endpoints return", () => {
    const generic = orgActionError(new Forbidden()).message
    const messages = [
      orgActionError(new Conflict({ reason: "already_member" })).message,
      orgActionError(new Conflict({ reason: "already_invited" })).message,
      orgActionError(new Conflict({ reason: "last_owner" })).message,
      orgActionError(new Conflict({ reason: "last_owner_removal" })).message,
      orgActionError(new Validation({ reason: "role_not_found" })).message
    ]
    expect(new Set(messages).size).toBe(messages.length)
    for (const message of messages) expect(message).not.toBe(generic)
  })

  it("surfaces project slugs from the tagged removal block", () => {
    const result = mutationFailure(
      AsyncResult.fail(new LastProjectPmBlocked({ projectSlugs: ["alpha"] })),
      orgActionError,
      orgActionDefect
    )
    expect(result?.projectSlugs).toEqual(["alpha"])
    expect(result?.message).not.toBe(orgActionDefect().message)
  })

  it("uses the generic message for defects", () => {
    expect(
      mutationFailure(
        AsyncResult.failure(Cause.die(new Error("private failure"))),
        orgActionError,
        orgActionDefect
      )
    ).toEqual(orgActionError(new Forbidden()))
  })
})
