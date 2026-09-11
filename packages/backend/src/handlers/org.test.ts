import { expect, it } from "vite-plus/test"
import { Effect } from "effect"
import { APIError } from "better-auth/api"
import { BetterAuthError } from "../Services/BetterAuth"
import { collapseRole, memberErrorToFailure } from "./orgMembers"

it("collapses better-auth's comma-separated roles to the highest one", () => {
  expect(collapseRole("member")).toBe("member")
  expect(collapseRole("admin,member")).toBe("admin")
  expect(collapseRole("owner,admin")).toBe("owner")
})

it("maps forbidden member errors", async () => {
  const error = new BetterAuthError({
    cause: new APIError("FORBIDDEN", { message: "not allowed" })
  })
  const result = await Effect.runPromise(
    memberErrorToFailure(error).pipe(Effect.flip)
  )
  expect(result._tag).toBe("Forbidden")
})
