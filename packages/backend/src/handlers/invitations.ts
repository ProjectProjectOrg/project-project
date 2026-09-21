import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import {
  AppApi,
  CurrentUser,
  InvitationNotAcceptable,
  NotFound
} from "@projectproject/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import {
  BetterAuth,
  type BetterAuthError,
  type InvitationState
} from "../Services/BetterAuth"
import {
  betterAuthErrorCode,
  betterAuthErrorStatus,
  isClientRefusal
} from "./org"

const NOT_RECIPIENT = "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION"
const VERIFICATION_REQUIRED = new Set([
  "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION",
  "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION"
])
const MEMBERSHIP_LIMIT = "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED"
const UNUSABLE_CODES = new Set([
  "INVITATION_NOT_FOUND",
  "ORGANIZATION_NOT_FOUND",
  "INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION"
])

const addressedTo = (state: InvitationState, recipientEmail: string) =>
  state.email.toLowerCase() === recipientEmail.toLowerCase()

const UNNAMED_REFUSAL_STATUS = 400

const namesAKnownRefusal = (code: string) =>
  code === NOT_RECIPIENT ||
  code === MEMBERSHIP_LIMIT ||
  VERIFICATION_REQUIRED.has(code) ||
  UNUSABLE_CODES.has(code)

export const acceptErrorToFailure = (
  error: BetterAuthError,
  state: InvitationState | null,
  now: Date,
  recipientEmail: string
): Effect.Effect<never, NotFound | InvitationNotAcceptable> => {
  if (!isClientRefusal(error)) return Effect.die(error)
  const code = betterAuthErrorCode(error)
  if (code === null) {
    if (betterAuthErrorStatus(error) !== UNNAMED_REFUSAL_STATUS) {
      return Effect.die(error)
    }
  } else if (!namesAKnownRefusal(code)) {
    return Effect.die(error)
  }
  if (state === null || !addressedTo(state, recipientEmail)) {
    return Effect.fail(new NotFound())
  }
  if (code !== null && VERIFICATION_REQUIRED.has(code)) {
    return Effect.fail(
      new InvitationNotAcceptable({ reason: "email_verification_required" })
    )
  }
  if (code === MEMBERSHIP_LIMIT) {
    return Effect.fail(
      new InvitationNotAcceptable({ reason: "membership_limit_reached" })
    )
  }
  if (state.expiresAt.getTime() <= now.getTime()) {
    return Effect.fail(new InvitationNotAcceptable({ reason: "expired" }))
  }
  return Effect.fail(new NotFound())
}

export const invitationErrorToFailure = (
  error: BetterAuthError
): Effect.Effect<never, NotFound> => {
  if (!isClientRefusal(error)) return Effect.die(error)
  const code = betterAuthErrorCode(error)
  if (code === null) {
    return betterAuthErrorStatus(error) === UNNAMED_REFUSAL_STATUS
      ? Effect.fail(new NotFound())
      : Effect.die(error)
  }
  if (namesAKnownRefusal(code)) return Effect.fail(new NotFound())
  return Effect.die(error)
}

export const listInvitationsErrorToFailure = (
  error: BetterAuthError
): Effect.Effect<never, InvitationNotAcceptable> => {
  if (!isClientRefusal(error)) return Effect.die(error)
  const code = betterAuthErrorCode(error)
  if (code !== null && VERIFICATION_REQUIRED.has(code)) {
    return Effect.fail(
      new InvitationNotAcceptable({ reason: "email_verification_required" })
    )
  }
  return Effect.die(error)
}

const webRequest = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  return yield* HttpServerRequest.toWeb(req).pipe(Effect.orDie)
})

export const InvitationsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "invitations",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.gen(function* () {
          yield* CurrentUser
          const ba = yield* BetterAuth
          const request = yield* webRequest
          return yield* ba
            .listInvitations(request)
            .pipe(
              Effect.catchTag("BetterAuthError", listInvitationsErrorToFailure)
            )
        })
      )
      .handle("get", ({ params }) =>
        Effect.gen(function* () {
          yield* CurrentUser
          const ba = yield* BetterAuth
          const request = yield* webRequest
          return yield* ba
            .getInvitation(request, params.invitationId)
            .pipe(Effect.catchTag("BetterAuthError", invitationErrorToFailure))
        })
      )
      .handle("accept", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const ba = yield* BetterAuth
          const request = yield* webRequest
          return yield* ba.acceptInvitation(request, params.invitationId).pipe(
            Effect.catchTag("BetterAuthError", (error) =>
              Effect.gen(function* () {
                const state = yield* ba
                  .getInvitationState(params.invitationId)
                  .pipe(Effect.orDie)
                const now = DateTime.toDate(yield* DateTime.now)
                return yield* acceptErrorToFailure(
                  error,
                  state,
                  now,
                  user.email
                )
              })
            )
          )
        })
      )
      .handle("reject", ({ params }) =>
        Effect.gen(function* () {
          yield* CurrentUser
          const ba = yield* BetterAuth
          const request = yield* webRequest
          yield* ba
            .rejectInvitation(request, params.invitationId)
            .pipe(Effect.catchTag("BetterAuthError", invitationErrorToFailure))
        })
      )
)
