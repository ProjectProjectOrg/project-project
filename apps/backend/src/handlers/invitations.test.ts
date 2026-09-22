import { it } from "@effect/vitest"
import { BetterAuthError } from "@pp/server-core/auth/BetterAuth"
import { APIError } from "better-auth/api"
import { Cause, Effect, Exit } from "effect"
import * as DateTime from "effect/DateTime"
import { expect } from "vitest"

import {
  acceptErrorToFailure,
  invitationErrorToFailure,
  listInvitationsErrorToFailure
} from "./invitations"

const inviteError = (code: string) =>
  new BetterAuthError({
    cause: new APIError("BAD_REQUEST", { code, message: code })
  })

const codelessError = (
  status: "BAD_REQUEST" | "FORBIDDEN" | "UNAUTHORIZED" = "BAD_REQUEST",
  message = "Invitation not found!"
) => new BetterAuthError({ cause: new APIError(status, { message }) })

const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))

const RECIPIENT = "invitee@example.com"
const now = at("2026-09-11T12:00:00.000Z")
const live = {
  status: "pending",
  email: RECIPIENT,
  expiresAt: at("2026-09-12T12:00:00.000Z")
}
const lapsed = {
  status: "pending",
  email: RECIPIENT,
  expiresAt: at("2026-09-10T12:00:00.000Z")
}

const failureOf = <E>(effect: Effect.Effect<never, E>) =>
  effect.pipe(Effect.flip)

const describeExit = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.match(exit, {
    onFailure: Cause.pretty,
    onSuccess: String
  })

it.effect(
  "hides an invitation the caller has no claim to, however better-auth words it",
  () =>
    Effect.gen(function* () {
      const other = { ...live, email: "someone.else@example.com" }
      for (const code of [
        "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
        "INVITATION_NOT_FOUND",
        "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
        "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION"
      ]) {
        const result = yield* failureOf(
          acceptErrorToFailure(inviteError(code), other, now, RECIPIENT)
        )
        expect(result, code).toMatchObject({ _tag: "NotFound" })
      }
    })
)

it.effect("reports an unverified email as email_verification_required", () =>
  Effect.gen(function* () {
    for (const code of [
      "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION",
      "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION"
    ]) {
      const result = yield* failureOf(
        acceptErrorToFailure(inviteError(code), live, now, RECIPIENT)
      )
      expect(result, code).toMatchObject({
        _tag: "InvitationNotAcceptable",
        reason: "email_verification_required"
      })
    }
  })
)

it.effect(
  "separates an expired invitation from a missing one, which better-auth does not",
  () =>
    Effect.gen(function* () {
      const expired = yield* failureOf(
        acceptErrorToFailure(
          inviteError("INVITATION_NOT_FOUND"),
          lapsed,
          now,
          RECIPIENT
        )
      )
      expect(expired).toMatchObject({
        _tag: "InvitationNotAcceptable",
        reason: "expired"
      })

      const missing = yield* failureOf(
        acceptErrorToFailure(
          inviteError("INVITATION_NOT_FOUND"),
          null,
          now,
          RECIPIENT
        )
      )
      expect(missing).toMatchObject({ _tag: "NotFound" })
    })
)

it.effect(
  "does not reveal an expired invitation belonging to another user",
  () =>
    Effect.gen(function* () {
      const result = yield* failureOf(
        acceptErrorToFailure(
          inviteError("INVITATION_NOT_FOUND"),
          { ...lapsed, email: "someone.else@example.com" },
          now,
          RECIPIENT
        )
      )
      expect(result).toMatchObject({ _tag: "NotFound" })
    })
)

it.effect("matches the recipient case-insensitively", () =>
  Effect.gen(function* () {
    const result = yield* failureOf(
      acceptErrorToFailure(
        inviteError("INVITATION_NOT_FOUND"),
        { ...lapsed, email: "Invitee@Example.COM" },
        now,
        RECIPIENT
      )
    )
    expect(result).toMatchObject({
      _tag: "InvitationNotAcceptable",
      reason: "expired"
    })
  })
)

it.effect(
  "reports an already-answered invitation as NotFound, not expired",
  () =>
    Effect.gen(function* () {
      const result = yield* failureOf(
        acceptErrorToFailure(
          inviteError("INVITATION_NOT_FOUND"),
          { ...live, status: "accepted" },
          now,
          RECIPIENT
        )
      )
      expect(result).toMatchObject({ _tag: "NotFound" })
    })
)

it.effect("treats an invitation expiring exactly now as expired", () =>
  Effect.gen(function* () {
    const result = yield* failureOf(
      acceptErrorToFailure(
        inviteError("INVITATION_NOT_FOUND"),
        { ...live, expiresAt: now },
        now,
        RECIPIENT
      )
    )
    expect(result).toMatchObject({
      _tag: "InvitationNotAcceptable",
      reason: "expired"
    })
  })
)

it.effect("reports a full organisation as membership_limit_reached", () =>
  Effect.gen(function* () {
    const result = yield* failureOf(
      acceptErrorToFailure(
        inviteError("ORGANIZATION_MEMBERSHIP_LIMIT_REACHED"),
        live,
        now,
        RECIPIENT
      )
    )
    expect(result).toMatchObject({
      _tag: "InvitationNotAcceptable",
      reason: "membership_limit_reached"
    })
  })
)

it.effect("classifies a codeless refusal on accept without dying", () =>
  Effect.gen(function* () {
    const result = yield* failureOf(
      acceptErrorToFailure(codelessError(), null, now, RECIPIENT)
    )
    expect(result).toMatchObject({ _tag: "NotFound" })
  })
)

it.effect("reads a stale invite link as NotFound, not a 500", () =>
  Effect.gen(function* () {
    const result = yield* failureOf(invitationErrorToFailure(codelessError()))
    expect(result).toMatchObject({ _tag: "NotFound" })
  })
)

it.effect(
  "hides another user's invitation behind NotFound on read and reject",
  () =>
    Effect.gen(function* () {
      for (const code of [
        "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
        "INVITATION_NOT_FOUND",
        "INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION",
        "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED"
      ]) {
        const result = yield* failureOf(
          invitationErrorToFailure(inviteError(code))
        )
        expect(result, code).toMatchObject({ _tag: "NotFound" })
      }
    })
)

it.effect(
  "asks an unverified user to verify rather than showing an empty list",
  () =>
    Effect.gen(function* () {
      const result = yield* failureOf(
        listInvitationsErrorToFailure(
          inviteError("EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION")
        )
      )
      expect(result).toMatchObject({
        _tag: "InvitationNotAcceptable",
        reason: "email_verification_required"
      })
    })
)

it.effect(
  "keeps a codeless 401 loud instead of reporting a missing invitation",
  () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        invitationErrorToFailure(
          codelessError("UNAUTHORIZED", "Not authenticated")
        )
      )
      expect(exit._tag).toBe("Failure")
      expect(describeExit(exit)).not.toContain("NotFound")
    })
)

it.effect("keeps a codeless 401 loud on accept too", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      acceptErrorToFailure(
        codelessError("UNAUTHORIZED", "Not authenticated"),
        live,
        now,
        RECIPIENT
      )
    )
    expect(exit._tag).toBe("Failure")
    expect(describeExit(exit)).not.toContain("NotFound")
  })
)

it.effect("dies on an unrecognised invitation code rather than guessing", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      invitationErrorToFailure(inviteError("SOME_FUTURE_BETTER_AUTH_CODE"))
    )
    expect(exit._tag).toBe("Failure")
    expect(describeExit(exit)).not.toContain("NotFound")
  })
)

const serverError = () =>
  new BetterAuthError({
    cause: new APIError("INTERNAL_SERVER_ERROR", { message: "boom" })
  })

it.effect(
  "dies on a 5xx rather than reporting it as a missing invitation",
  () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(invitationErrorToFailure(serverError()))
      expect(exit._tag).toBe("Failure")
      expect(describeExit(exit)).not.toContain("NotFound")
    })
)

it.effect(
  "dies on a 5xx rather than asking the user to verify their email",
  () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        listInvitationsErrorToFailure(serverError())
      )
      expect(exit._tag).toBe("Failure")
      expect(describeExit(exit)).not.toContain("InvitationNotAcceptable")
    })
)
