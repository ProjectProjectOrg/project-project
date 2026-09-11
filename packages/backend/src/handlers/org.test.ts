import { expect, it } from "vite-plus/test"
import { APIError } from "better-auth/api"
import { Effect } from "effect"
import { BetterAuthError } from "../Services/BetterAuth"
import {
  collapseRole,
  leaveErrorToFailure,
  memberAccessErrorToFailure,
  memberChangeErrorToFailure,
  memberErrorToFailure,
  opaqueErrorToFailure,
  pendingInvitations,
  transferErrorToFailure
} from "./org"

const orgError = (
  status: "BAD_REQUEST" | "FORBIDDEN" | "UNAUTHORIZED",
  code: string
) =>
  new BetterAuthError({
    cause: new APIError(status, { code, message: code })
  })

const failureOf = <E>(effect: Effect.Effect<never, E>) =>
  Effect.runPromise(effect.pipe(Effect.flip))

it("collapses a single role to itself", () => {
  expect(collapseRole("owner")).toBe("owner")
  expect(collapseRole("admin")).toBe("admin")
  expect(collapseRole("member")).toBe("member")
})

it("collapses comma-separated roles to the highest one", () => {
  expect(collapseRole("admin,member")).toBe("admin")
  expect(collapseRole("owner,admin")).toBe("owner")
  expect(collapseRole("owner,admin,member")).toBe("owner")
  expect(collapseRole("member,owner")).toBe("owner")
})

it("ignores whitespace around comma-separated roles", () => {
  expect(collapseRole("admin, member")).toBe("admin")
  expect(collapseRole(" owner , admin ")).toBe("owner")
})

it("falls back to member for unknown or empty roles", () => {
  expect(collapseRole("")).toBe("member")
  expect(collapseRole("billing")).toBe("member")
  expect(collapseRole("ownerish")).toBe("member")
})

it("hides non-membership behind NotFound on both statuses", async () => {
  for (const status of ["FORBIDDEN", "BAD_REQUEST"] as const) {
    const result = await failureOf(
      memberAccessErrorToFailure(
        orgError(status, "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION")
      )
    )
    expect(result, status).toMatchObject({ _tag: "NotFound" })
  }
  const alternate = await failureOf(
    memberAccessErrorToFailure(
      orgError("FORBIDDEN", "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION")
    )
  )
  expect(alternate).toMatchObject({ _tag: "NotFound" })
})

it("never lets a members read emit anything but NotFound", async () => {
  for (const [status, code] of [
    ["FORBIDDEN", "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION"],
    ["BAD_REQUEST", "ORGANIZATION_NOT_FOUND"],
    ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION"],
    ["BAD_REQUEST", "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION"],
    ["BAD_REQUEST", "ROLE_NOT_FOUND"]
  ] as const) {
    const result = await failureOf(opaqueErrorToFailure(orgError(status, code)))
    expect(result, code).toMatchObject({ _tag: "NotFound" })
  }
})

it("maps every permission refusal to Forbidden regardless of status", async () => {
  const forbidding = [
    ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION"],
    ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER"],
    ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION"],
    ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE"],
    ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION"],
    ["UNAUTHORIZED", "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER"],
    ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION"]
  ] as const
  for (const [status, code] of forbidding) {
    const result = await failureOf(
      memberAccessErrorToFailure(orgError(status, code))
    )
    expect(result, `${code} (${status})`).toMatchObject({ _tag: "Forbidden" })
  }
})

it("maps a 401-status permission refusal to Forbidden, never Unauthorized", async () => {
  const result = await failureOf(
    memberErrorToFailure(
      orgError("UNAUTHORIZED", "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER")
    )
  )
  expect(result).toMatchObject({ _tag: "Forbidden" })
})

it("maps 400-status missing rows to NotFound", async () => {
  for (const code of [
    "ORGANIZATION_NOT_FOUND",
    "MEMBER_NOT_FOUND",
    "INVITATION_NOT_FOUND"
  ]) {
    const result = await failureOf(
      memberErrorToFailure(orgError("BAD_REQUEST", code))
    )
    expect(result, code).toMatchObject({ _tag: "NotFound" })
  }
})

it("maps duplicate-member refusals to Conflict", async () => {
  for (const code of [
    "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION",
    "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION"
  ]) {
    const result = await failureOf(
      memberErrorToFailure(orgError("BAD_REQUEST", code))
    )
    expect(result, code).toMatchObject({ _tag: "Conflict" })
  }
})

it("maps an unknown role to Validation", async () => {
  const result = await failureOf(
    memberErrorToFailure(orgError("BAD_REQUEST", "ROLE_NOT_FOUND"))
  )
  expect(result).toMatchObject({ _tag: "Validation" })
})

it("reports the last-owner refusal as Conflict on leave", async () => {
  const result = await failureOf(
    leaveErrorToFailure(
      orgError(
        "BAD_REQUEST",
        "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"
      )
    )
  )
  expect(result).toMatchObject({ _tag: "Conflict", reason: "last_owner" })
})

it("reports the last-owner refusal as Conflict on member changes too", async () => {
  for (const code of [
    "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER",
    "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"
  ]) {
    const result = await failureOf(
      memberChangeErrorToFailure(orgError("BAD_REQUEST", code))
    )
    expect(result, code).toMatchObject({
      _tag: "Conflict",
      reason: "last_owner"
    })
  }
})

it("keeps an insufficient-rights refusal as Forbidden on member changes", async () => {
  const result = await failureOf(
    memberChangeErrorToFailure(
      orgError("FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER")
    )
  )
  expect(result).toMatchObject({ _tag: "Forbidden" })
})

it("never emits Forbidden from leave, which has no such refusal", async () => {
  for (const [status, code] of [
    ["FORBIDDEN", "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION"],
    ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION"],
    ["BAD_REQUEST", "MEMBER_NOT_FOUND"]
  ] as const) {
    const result = await failureOf(leaveErrorToFailure(orgError(status, code)))
    expect(result, code).toMatchObject({ _tag: "NotFound" })
  }
})

it("keeps transfer-ownership refusals inside its declared surface", async () => {
  const result = await failureOf(
    transferErrorToFailure(orgError("BAD_REQUEST", "ROLE_NOT_FOUND"))
  )
  expect(result).toMatchObject({ _tag: "Validation" })
})

it("dies on a non-APIError cause rather than inventing a refusal", async () => {
  const exit = await Effect.runPromiseExit(
    memberErrorToFailure(
      new BetterAuthError({ cause: new Error("socket hang up") })
    )
  )
  expect(exit._tag).toBe("Failure")
  expect(JSON.stringify(exit)).not.toContain("Forbidden")
})

it("dies on a 5xx from better-auth rather than reporting a client refusal", async () => {
  const exit = await Effect.runPromiseExit(
    memberErrorToFailure(
      new BetterAuthError({
        cause: new APIError("INTERNAL_SERVER_ERROR", { message: "boom" })
      })
    )
  )
  expect(exit._tag).toBe("Failure")
  expect(JSON.stringify(exit)).not.toContain("NotFound")
})

it("dies on an unrecognised 4xx code rather than guessing a mapping", async () => {
  const exit = await Effect.runPromiseExit(
    memberErrorToFailure(
      orgError("BAD_REQUEST", "SOME_FUTURE_BETTER_AUTH_CODE")
    )
  )
  expect(exit._tag).toBe("Failure")
  expect(JSON.stringify(exit)).not.toContain("Forbidden")
})

it("returns only pending invitations to the members view", () => {
  const result = pendingInvitations([
    { id: "a", email: "a@example.com", role: "member", status: "pending" },
    { id: "b", email: "b@example.com", role: "admin", status: "accepted" },
    { id: "c", email: "c@example.com", role: "member", status: "rejected" },
    { id: "d", email: "d@example.com", role: "member", status: "canceled" },
    { id: "e", email: "e@example.com", role: "owner", status: "pending" }
  ])
  expect(result.map((invitation) => invitation.id)).toEqual(["a", "e"])
})

it("collapses invitation roles and drops rows with no role", () => {
  const result = pendingInvitations([
    { id: "a", email: "a@example.com", role: "owner,admin", status: "pending" },
    { id: "b", email: "b@example.com", role: null, status: "pending" }
  ])
  expect(result).toEqual([
    { id: "a", email: "a@example.com", role: "owner", status: "pending" },
    { id: "b", email: "b@example.com", role: "member", status: "pending" }
  ])
})
