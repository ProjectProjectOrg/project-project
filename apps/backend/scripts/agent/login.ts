import * as Effect from "effect/Effect"

import { AuthInstance, AuthInstanceLive } from "../../src/auth/config"
import { fixtureEmail, fixturePath } from "./fixture"

await Effect.runPromise(
  Effect.gen(function* () {
    const { auth } = yield* AuthInstance
    yield* Effect.promise(() =>
      auth.api.signInMagicLink({
        body: { email: fixtureEmail, callbackURL: fixturePath },
        headers: new Headers({ origin: process.env.BETTER_AUTH_URL! })
      })
    )
  }).pipe(Effect.provide(AuthInstanceLive))
)
process.exit(0)
