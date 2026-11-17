import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { expect } from "vitest"

import { validateBodyMentions } from "./BodyMentions"

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
