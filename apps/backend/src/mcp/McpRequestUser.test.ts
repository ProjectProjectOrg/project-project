import { describe, expect, it } from "@effect/vitest"
import { testUser } from "@pp/server-core/access/testing"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"

import { McpCurrentUser, McpRequestUser } from "./McpRequestUser"

const user = testUser("u-1")

describe("McpCurrentUser", () => {
  it.effect("dies when no user was set for the request", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(McpCurrentUser)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBe(true)
        expect(String(exit.cause)).toContain("McpAuthMiddlewareLive")
      }
    })
  )

  it.effect("returns the user set on the request", () =>
    Effect.gen(function* () {
      const result = yield* McpCurrentUser.pipe(
        Effect.provideService(McpRequestUser, Option.some(user))
      )
      expect(result.id).toBe("u-1")
    })
  )
})
