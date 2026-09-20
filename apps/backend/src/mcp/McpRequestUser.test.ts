import { describe, expect, test } from "vite-plus/test"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import type { User } from "@projectproject/shared"
import { McpCurrentUser, McpRequestUser } from "./McpRequestUser"

const user = { id: "u-1" } as User

describe("McpCurrentUser", () => {
  test("dies when no user was set for the request", async () => {
    const exit = await Effect.runPromiseExit(McpCurrentUser)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.hasDies(exit.cause)).toBe(true)
      expect(String(exit.cause)).toContain("McpAuthMiddlewareLive")
    }
  })

  test("returns the user set on the request", async () => {
    const result = await Effect.runPromise(
      McpCurrentUser.pipe(
        Effect.provideService(McpRequestUser, Option.some(user))
      )
    )
    expect(result.id).toBe("u-1")
  })
})
