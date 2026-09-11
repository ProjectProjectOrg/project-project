import { expect, it } from "vite-plus/test"
import { APIError } from "better-auth/api"
import { Effect } from "effect"
import * as DateTime from "effect/DateTime"
import { BetterAuthError } from "../Services/BetterAuth"
import { acceptErrorToFailure, invitationErrorToFailure } from "./invitations"

const inviteError = (code: string) =>
  new BetterAuthError({
    cause: new APIError("BAD_REQUEST", { code, message: code })
  })

const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))

const now = at("2026-09-11T12:00:00.000Z")
const live = { status: "pending", expiresAt: at("2026-09-12T12:00:00.000Z") }
const lapsed = { status: "pending", expiresAt: at("2026-09-10T12:00:00.000Z") }

const failureOf = <E>(effect: Effect.Effect<never, E>) =>
  Effect.runPromise(effect.pipe(Effect.flip))

it("reports an invitation addressed to someone else as not_recipient", async () => {
  const result = await failureOf(
    acceptErrorToFailure(
      inviteError("YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION"),
      live,
      now
    )
  )
  expect(result).toMatchObject({
    _tag: "InvitationNotAcceptable",
    reason: "not_recipient"
  })
})

it("reports an unverified email as email_verification_required", async () => {
  for (const code of [
    "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION",
    "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION"
  ]) {
    const result = await failureOf(
      acceptErrorToFailure(inviteError(code), live, now)
    )
    expect(result, code).toMatchObject({
      _tag: "InvitationNotAcceptable",
      reason: "email_verification_required"
    })
  }
})

it("separates an expired invitation from a missing one, which better-auth does not", async () => {
  const expired = await failureOf(
    acceptErrorToFailure(inviteError("INVITATION_NOT_FOUND"), lapsed, now)
  )
  expect(expired).toMatchObject({
    _tag: "InvitationNotAcceptable",
    reason: "expired"
  })

  const missing = await failureOf(
    acceptErrorToFailure(inviteError("INVITATION_NOT_FOUND"), null, now)
  )
  expect(missing).toMatchObject({ _tag: "NotFound" })
})

it("reports an already-answered invitation as NotFound, not expired", async () => {
  const result = await failureOf(
    acceptErrorToFailure(
      inviteError("INVITATION_NOT_FOUND"),
      { status: "accepted", expiresAt: live.expiresAt },
      now
    )
  )
  expect(result).toMatchObject({ _tag: "NotFound" })
})

it("treats an invitation expiring exactly now as expired", async () => {
  const result = await failureOf(
    acceptErrorToFailure(
      inviteError("INVITATION_NOT_FOUND"),
      { status: "pending", expiresAt: now },
      now
    )
  )
  expect(result).toMatchObject({
    _tag: "InvitationNotAcceptable",
    reason: "expired"
  })
})

it("dies rather than forcing a membership-limit refusal into one of the three reasons", async () => {
  const exit = await Effect.runPromiseExit(
    acceptErrorToFailure(
      inviteError("ORGANIZATION_MEMBERSHIP_LIMIT_REACHED"),
      live,
      now
    )
  )
  expect(exit._tag).toBe("Failure")
  expect(JSON.stringify(exit)).not.toContain("InvitationNotAcceptable")
})

it("hides another user's invitation behind NotFound on read and reject", async () => {
  for (const code of [
    "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
    "INVITATION_NOT_FOUND",
    "INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION"
  ]) {
    const result = await failureOf(invitationErrorToFailure(inviteError(code)))
    expect(result, code).toMatchObject({ _tag: "NotFound" })
  }
})

it("dies on an unrecognised invitation code rather than guessing", async () => {
  const exit = await Effect.runPromiseExit(
    invitationErrorToFailure(inviteError("SOME_FUTURE_BETTER_AUTH_CODE"))
  )
  expect(exit._tag).toBe("Failure")
  expect(JSON.stringify(exit)).not.toContain("NotFound")
})
