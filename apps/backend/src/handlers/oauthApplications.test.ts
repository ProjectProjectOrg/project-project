import { it } from "@effect/vitest"
import { BetterAuthError } from "@pp/server-core/auth/BetterAuth"
import { APIError } from "better-auth/api"
import { Effect } from "effect"
import { expect } from "vitest"

import { consentErrorToFailure } from "./oauthApplications"

it.effect(
  "preserves the OAuth error code for invalid or expired consent queries",
  () =>
    Effect.gen(function* () {
      const error = new BetterAuthError({
        cause: new APIError("BAD_REQUEST", { error: "invalid_signature" })
      })
      const result = yield* consentErrorToFailure(error).pipe(Effect.flip)
      expect(result).toMatchObject({
        _tag: "Validation",
        reason: "invalid_signature"
      })
    })
)
