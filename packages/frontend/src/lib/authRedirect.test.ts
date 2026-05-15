import { describe, expect, test } from "vitest"
import { authedRootRedirect } from "./authRedirect"

describe("authedRootRedirect", () => {
  test("sends signed-in users with no active org to welcome", () => {
    expect(authedRootRedirect("/", null)).toEqual({ to: "/welcome" })
  })

  test("sends signed-in users with an active org to that org dashboard", () => {
    expect(authedRootRedirect("/", "demo")).toEqual({
      to: "/orgs/$orgSlug",
      params: { orgSlug: "demo" }
    })
  })

  test("does not redirect non-root paths", () => {
    expect(authedRootRedirect("/profile", null)).toBeNull()
  })
})
