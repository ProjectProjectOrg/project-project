import { describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { expect } from "vitest"

import {
  validateBodyMentions,
  validateBodyMentionsWithLookups
} from "./BodyMentions"

it.effect("checks a comment mention against the ticket it points at", () =>
  Effect.gen(function* () {
    const tickets = new Set(["T-12"])

    yield* validateBodyMentions(
      "Said in [T-12](mention:comment/T-12/c_01ABC).",
      new Set(),
      tickets
    )
    const unknown = yield* Effect.flip(
      validateBodyMentions(
        "Said in [T-99](mention:comment/T-99/c_01ABC).",
        new Set(),
        tickets
      )
    )

    expect(unknown).toMatchObject({
      _tag: "MentionInvalid",
      kind: "unknown_ticket"
    })
  })
)

const nobody = {
  existingTicketIds: () => Effect.succeed(new Set<string>()),
  memberIds: () => Effect.succeed(new Set<string>())
}
const previous = "Ask [Bob](mention:user/old-bob)."

describe("validateBodyMentionsWithLookups", () => {
  it.effect(
    "keeps mentions the body already had, even if they no longer resolve",
    () =>
      validateBodyMentionsWithLookups(`${previous} Updated.`, nobody, previous)
  )

  it.effect("refuses a new mention that doesn't resolve", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        validateBodyMentionsWithLookups(
          `${previous} And [Eve](mention:user/eve).`,
          nobody,
          previous
        )
      )
      expect(error).toMatchObject({
        _tag: "MentionInvalid",
        kind: "unknown_user"
      })
    })
  )
})
