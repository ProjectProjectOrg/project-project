import { it } from "@effect/vitest"
import { BetterAuthError } from "@pp/server-core/auth/BetterAuth"
import { APIError } from "better-auth/api"
import { Cause, Effect, Exit } from "effect"
import { expect } from "vitest"

import {
  collapseRole,
  leaveErrorToFailure,
  memberAccessErrorToFailure,
  memberChangeErrorToFailure,
  memberErrorToFailure,
  opaqueErrorToFailure,
  pendingInvitations,
  removeMemberErrorToFailure,
  transferErrorToFailure
} from "./org"

const describeExit = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.match(exit, {
    onFailure: Cause.pretty,
    onSuccess: String
  })

const orgError = (
  status: "BAD_REQUEST" | "FORBIDDEN" | "UNAUTHORIZED",
  code: string
) =>
  new BetterAuthError({
    cause: new APIError(status, { code, message: code })
  })

const codelessError = (
  status: "BAD_REQUEST" | "FORBIDDEN" | "UNAUTHORIZED" = "BAD_REQUEST",
  message = "User not found"
) => new BetterAuthError({ cause: new APIError(status, { message }) })

const bodiedError = (
  status: "BAD_REQUEST" | "FORBIDDEN" | "UNAUTHORIZED" | 409,
  code: string,
  body: Record<string, unknown>
) =>
  new BetterAuthError({
    cause: new APIError(status, { code, message: code, ...body })
  })

const failureOf = <E>(effect: Effect.Effect<never, E>) =>
  effect.pipe(Effect.flip)

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

it.effect("hides non-membership behind NotFound on both statuses", () =>
  Effect.gen(function* () {
    for (const status of ["FORBIDDEN", "BAD_REQUEST"] as const) {
      const result = yield* failureOf(
        memberAccessErrorToFailure(
          orgError(status, "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION")
        )
      )
      expect(result, status).toMatchObject({ _tag: "NotFound" })
    }
    const alternate = yield* failureOf(
      memberAccessErrorToFailure(
        orgError("FORBIDDEN", "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION")
      )
    )
    expect(alternate).toMatchObject({ _tag: "NotFound" })
  })
)

it.effect("never lets a members read emit anything but NotFound", () =>
  Effect.gen(function* () {
    for (const [status, code] of [
      ["FORBIDDEN", "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION"],
      ["BAD_REQUEST", "ORGANIZATION_NOT_FOUND"],
      ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION"],
      ["BAD_REQUEST", "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION"],
      ["BAD_REQUEST", "ROLE_NOT_FOUND"]
    ] as const) {
      const result = yield* failureOf(
        opaqueErrorToFailure(orgError(status, code))
      )
      expect(result, code).toMatchObject({ _tag: "NotFound" })
    }
  })
)

it.effect(
  "maps every permission refusal to Forbidden regardless of status",
  () =>
    Effect.gen(function* () {
      const forbidding = [
        ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION"],
        ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER"],
        [
          "FORBIDDEN",
          "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION"
        ],
        ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE"],
        ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION"],
        ["UNAUTHORIZED", "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER"],
        ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION"]
      ] as const
      for (const [status, code] of forbidding) {
        const result = yield* failureOf(
          memberAccessErrorToFailure(orgError(status, code))
        )
        expect(result, `${code} (${status})`).toMatchObject({
          _tag: "Forbidden"
        })
      }
    })
)

it.effect(
  "maps a 401-status permission refusal to Forbidden, never Unauthorized",
  () =>
    Effect.gen(function* () {
      const result = yield* failureOf(
        memberErrorToFailure(
          orgError("UNAUTHORIZED", "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER")
        )
      )
      expect(result).toMatchObject({ _tag: "Forbidden" })
    })
)

it.effect("maps 400-status missing rows to NotFound", () =>
  Effect.gen(function* () {
    for (const code of [
      "ORGANIZATION_NOT_FOUND",
      "MEMBER_NOT_FOUND",
      "INVITATION_NOT_FOUND"
    ]) {
      const result = yield* failureOf(
        memberErrorToFailure(orgError("BAD_REQUEST", code))
      )
      expect(result, code).toMatchObject({ _tag: "NotFound" })
    }
  })
)

it.effect("maps duplicate-member refusals to Conflict", () =>
  Effect.gen(function* () {
    for (const code of [
      "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION",
      "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION"
    ]) {
      const result = yield* failureOf(
        memberErrorToFailure(orgError("BAD_REQUEST", code))
      )
      expect(result, code).toMatchObject({ _tag: "Conflict" })
    }
  })
)

it.effect("maps an unknown role to Validation", () =>
  Effect.gen(function* () {
    const result = yield* failureOf(
      memberErrorToFailure(orgError("BAD_REQUEST", "ROLE_NOT_FOUND"))
    )
    expect(result).toMatchObject({ _tag: "Validation" })
  })
)

it.effect("reports the last-owner refusal as Conflict on leave", () =>
  Effect.gen(function* () {
    const result = yield* failureOf(
      leaveErrorToFailure(
        orgError(
          "BAD_REQUEST",
          "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"
        )
      )
    )
    expect(result).toMatchObject({ _tag: "Conflict", reason: "last_owner" })
  })
)

it.effect(
  "reports the last-owner refusal as Conflict on member changes too",
  () =>
    Effect.gen(function* () {
      for (const code of [
        "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER",
        "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"
      ]) {
        const result = yield* failureOf(
          memberChangeErrorToFailure(orgError("BAD_REQUEST", code))
        )
        expect(result, code).toMatchObject({
          _tag: "Conflict",
          reason: "last_owner"
        })
      }
    })
)

it.effect(
  "separates the last-owner refusal on remove and demote from leaving",
  () =>
    Effect.gen(function* () {
      const removing = yield* failureOf(
        removeMemberErrorToFailure(
          orgError("BAD_REQUEST", "LAST_ORG_OWNER_BLOCKED")
        )
      )
      const demoting = yield* failureOf(
        memberChangeErrorToFailure(
          orgError("BAD_REQUEST", "LAST_ORG_OWNER_BLOCKED")
        )
      )
      const leaving = yield* failureOf(
        leaveErrorToFailure(
          orgError(
            "BAD_REQUEST",
            "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"
          )
        )
      )
      expect(removing).toMatchObject({
        _tag: "Conflict",
        reason: "last_owner_removal"
      })
      expect(demoting).toMatchObject({
        _tag: "Conflict",
        reason: "last_owner_removal"
      })
      expect(leaving).toMatchObject({ _tag: "Conflict", reason: "last_owner" })
    })
)

it.effect(
  "carries the blocking project slugs out of a project-owner removal",
  () =>
    Effect.gen(function* () {
      const result = yield* failureOf(
        removeMemberErrorToFailure(
          bodiedError(409, "LAST_PROJECT_PM_BLOCKED", {
            projectSlugs: ["alpha", "beta"]
          })
        )
      )
      expect(result).toMatchObject({
        _tag: "LastProjectPmBlocked",
        projectSlugs: ["alpha", "beta"]
      })
    })
)

it.effect(
  "still reports a project-owner removal when the body carries no slugs",
  () =>
    Effect.gen(function* () {
      const result = yield* failureOf(
        removeMemberErrorToFailure(
          orgError("BAD_REQUEST", "LAST_PROJECT_PM_BLOCKED")
        )
      )
      expect(result).toMatchObject({
        _tag: "LastProjectPmBlocked",
        projectSlugs: []
      })
    })
)

it.effect("never reports a project-owner removal from a 5xx", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      removeMemberErrorToFailure(
        new BetterAuthError({
          cause: new APIError("INTERNAL_SERVER_ERROR", {
            code: "LAST_PROJECT_PM_BLOCKED",
            message: "boom"
          })
        })
      )
    )
    expect(exit._tag).toBe("Failure")
    expect(describeExit(exit)).not.toContain("LastProjectPmBlocked")
  })
)

it.effect(
  "keeps an insufficient-rights refusal as Forbidden on member changes",
  () =>
    Effect.gen(function* () {
      const result = yield* failureOf(
        memberChangeErrorToFailure(
          orgError("FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER")
        )
      )
      expect(result).toMatchObject({ _tag: "Forbidden" })
    })
)

it.effect("never emits Forbidden from leave, which has no such refusal", () =>
  Effect.gen(function* () {
    for (const [status, code] of [
      ["FORBIDDEN", "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION"],
      ["FORBIDDEN", "YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION"],
      ["BAD_REQUEST", "MEMBER_NOT_FOUND"]
    ] as const) {
      const result = yield* failureOf(
        leaveErrorToFailure(orgError(status, code))
      )
      expect(result, code).toMatchObject({ _tag: "NotFound" })
    }
  })
)

it.effect("keeps transfer-ownership refusals inside its declared surface", () =>
  Effect.gen(function* () {
    const result = yield* failureOf(
      transferErrorToFailure(orgError("BAD_REQUEST", "ROLE_NOT_FOUND"))
    )
    expect(result).toMatchObject({ _tag: "Validation" })
  })
)

it.effect("dies on a non-APIError cause rather than inventing a refusal", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      memberErrorToFailure(
        new BetterAuthError({ cause: new Error("socket hang up") })
      )
    )
    expect(exit._tag).toBe("Failure")
    expect(describeExit(exit)).not.toContain("Forbidden")
  })
)

it.effect(
  "dies on a 5xx from better-auth rather than reporting a client refusal",
  () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        memberErrorToFailure(
          new BetterAuthError({
            cause: new APIError("INTERNAL_SERVER_ERROR", { message: "boom" })
          })
        )
      )
      expect(exit._tag).toBe("Failure")
      expect(describeExit(exit)).not.toContain("NotFound")
    })
)

it.effect("maps a malformed invite email to Validation instead of dying", () =>
  Effect.gen(function* () {
    const result = yield* failureOf(
      memberErrorToFailure(orgError("BAD_REQUEST", "INVALID_EMAIL"))
    )
    expect(result).toMatchObject({
      _tag: "Validation",
      reason: "invalid_email"
    })
  })
)

it.effect(
  "dies on a codeless 4xx on the org surface rather than guessing",
  () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(memberErrorToFailure(codelessError()))
      expect(exit._tag).toBe("Failure")
      expect(describeExit(exit)).not.toContain("Forbidden")
    })
)

it.effect(
  "dies on an unrecognised 4xx code rather than guessing a mapping",
  () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        memberErrorToFailure(
          orgError("BAD_REQUEST", "SOME_FUTURE_BETTER_AUTH_CODE")
        )
      )
      expect(exit._tag).toBe("Failure")
      expect(describeExit(exit)).not.toContain("Forbidden")
    })
)

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
