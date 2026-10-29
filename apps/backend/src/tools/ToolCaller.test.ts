import { describe, expect, it } from "@effect/vitest"
import { testUser } from "@pp/server-core/access/testing"
import { ActivityActor, CurrentUser } from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"

import { ToolCaller, withToolCaller } from "./ToolCaller"

const user = testUser("u-1")

const whoAndActor = withToolCaller(Effect.all([CurrentUser, ActivityActor]))

describe("withToolCaller", () => {
  it.effect("dies when no caller was set for the request", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(whoAndActor)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true)
    })
  )

  it.effect("runs as the caller and credits their client", () =>
    Effect.gen(function* () {
      const [current, actor] = yield* whoAndActor.pipe(
        Effect.provideService(
          ToolCaller,
          Option.some({
            user,
            client: Option.some({ id: "c-1", name: "PP CLI" })
          })
        )
      )
      expect(current.id).toBe("u-1")
      expect(actor).toEqual(
        ActivityActor.agent("u-1", { id: "c-1", name: "PP CLI" })
      )
    })
  )
})
