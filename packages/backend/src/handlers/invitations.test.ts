import { expect, it } from "vite-plus/test"
import { APIError } from "better-auth/api"
import { Effect } from "effect"
import * as DateTime from "effect/DateTime"
import { BetterAuthError } from "../Services/BetterAuth"
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
  Effect.runPromise(effect.pipe(Effect.flip))

it("hides an invitation the caller has no claim to, however better-auth words it", async () => {
  const other = { ...live, email: "someone.else@example.com" }
  for (const code of [
    "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
    "INVITATION_NOT_FOUND",
    "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
    "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION"
  ]) {
    const result = await failureOf(
      acceptErrorToFailure(inviteError(code), other, now, RECIPIENT)
    )
    expect(result, code).toMatchObject({ _tag: "NotFound" })
  }
})

it("reports an unverified email as email_verification_required", async () => {
  for (const code of [
    "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION",
    "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION"
  ]) {
    const result = await failureOf(
      acceptErrorToFailure(inviteError(code), live, now, RECIPIENT)
    )
    expect(result, code).toMatchObject({
      _tag: "InvitationNotAcceptable",
      reason: "email_verification_required"
    })
  }
})

it("separates an expired invitation from a missing one, which better-auth does not", async () => {
  const expired = await failureOf(
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

  const missing = await failureOf(
    acceptErrorToFailure(
      inviteError("INVITATION_NOT_FOUND"),
      null,
      now,
      RECIPIENT
    )
  )
  expect(missing).toMatchObject({ _tag: "NotFound" })
})

it("does not reveal an expired invitation belonging to another user", async () => {
  const result = await failureOf(
    acceptErrorToFailure(
      inviteError("INVITATION_NOT_FOUND"),
      { ...lapsed, email: "someone.else@example.com" },
      now,
      RECIPIENT
    )
  )
  expect(result).toMatchObject({ _tag: "NotFound" })
})

it("matches the recipient case-insensitively", async () => {
  const result = await failureOf(
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

it("reports an already-answered invitation as NotFound, not expired", async () => {
  const result = await failureOf(
    acceptErrorToFailure(
      inviteError("INVITATION_NOT_FOUND"),
      { ...live, status: "accepted" },
      now,
      RECIPIENT
    )
  )
  expect(result).toMatchObject({ _tag: "NotFound" })
})

it("treats an invitation expiring exactly now as expired", async () => {
  const result = await failureOf(
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

it("reports a full organisation as membership_limit_reached", async () => {
  const result = await failureOf(
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

it("classifies a codeless refusal on accept without dying", async () => {
  const result = await failureOf(
    acceptErrorToFailure(codelessError(), null, now, RECIPIENT)
  )
  expect(result).toMatchObject({ _tag: "NotFound" })
})

it("reads a stale invite link as NotFound, not a 500", async () => {
  const result = await failureOf(invitationErrorToFailure(codelessError()))
  expect(result).toMatchObject({ _tag: "NotFound" })
})

it("hides another user's invitation behind NotFound on read and reject", async () => {
  for (const code of [
    "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
    "INVITATION_NOT_FOUND",
    "INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION",
    "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED"
  ]) {
    const result = await failureOf(invitationErrorToFailure(inviteError(code)))
    expect(result, code).toMatchObject({ _tag: "NotFound" })
  }
})

it("asks an unverified user to verify rather than showing an empty list", async () => {
  const result = await failureOf(
    listInvitationsErrorToFailure(
      inviteError("EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION")
    )
  )
  expect(result).toMatchObject({
    _tag: "InvitationNotAcceptable",
    reason: "email_verification_required"
  })
})

it("keeps a codeless 401 loud instead of reporting a missing invitation", async () => {
  const exit = await Effect.runPromiseExit(
    invitationErrorToFailure(codelessError("UNAUTHORIZED", "Not authenticated"))
  )
  expect(exit._tag).toBe("Failure")
  expect(JSON.stringify(exit)).not.toContain("NotFound")
})

it("keeps a codeless 401 loud on accept too", async () => {
  const exit = await Effect.runPromiseExit(
    acceptErrorToFailure(
      codelessError("UNAUTHORIZED", "Not authenticated"),
      live,
      now,
      RECIPIENT
    )
  )
  expect(exit._tag).toBe("Failure")
  expect(JSON.stringify(exit)).not.toContain("NotFound")
})

it("dies on an unrecognised invitation code rather than guessing", async () => {
  const exit = await Effect.runPromiseExit(
    invitationErrorToFailure(inviteError("SOME_FUTURE_BETTER_AUTH_CODE"))
  )
  expect(exit._tag).toBe("Failure")
  expect(JSON.stringify(exit)).not.toContain("NotFound")
})

const serverError = () =>
  new BetterAuthError({
    cause: new APIError("INTERNAL_SERVER_ERROR", { message: "boom" })
  })

it("dies on a 5xx rather than reporting it as a missing invitation", async () => {
  const exit = await Effect.runPromiseExit(
    invitationErrorToFailure(serverError())
  )
  expect(exit._tag).toBe("Failure")
  expect(JSON.stringify(exit)).not.toContain("NotFound")
})

it("dies on a 5xx rather than asking the user to verify their email", async () => {
  const exit = await Effect.runPromiseExit(
    listInvitationsErrorToFailure(serverError())
  )
  expect(exit._tag).toBe("Failure")
  expect(JSON.stringify(exit)).not.toContain("InvitationNotAcceptable")
})
