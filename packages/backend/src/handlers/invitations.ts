import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import {
  AppApi,
  Conflict,
  CurrentUser,
  Forbidden,
  NotFound
} from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { BetterAuth, BetterAuthError } from "../Services/BetterAuth"
import { memberErrorToFailure } from "./orgMembers"

const webRequest = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  return yield* HttpServerRequest.toWeb(req).pipe(Effect.orDie)
})

const withMemberErrors = <A, R>(
  effect: Effect.Effect<A, BetterAuthError | NotFound, R>
): Effect.Effect<A, Forbidden | NotFound | Conflict, R> =>
  effect.pipe(
    Effect.catchTag("BetterAuthError", memberErrorToFailure)
  ) as Effect.Effect<A, Forbidden | NotFound | Conflict, R>

export const InvitationsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "invitations",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.gen(function* () {
          const ba = yield* BetterAuth
          const request = yield* webRequest
          return yield* withMemberErrors(ba.listInvitations(request))
        })
      )
      .handle("get", ({ params }) =>
        Effect.gen(function* () {
          const ba = yield* BetterAuth
          const request = yield* webRequest
          return yield* withMemberErrors(
            ba.getInvitation(request, params.invitationId)
          )
        })
      )
      .handle("accept", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const ba = yield* BetterAuth
          const request = yield* webRequest
          return yield* withMemberErrors(
            ba.acceptInvitation(request, params.invitationId, user.id)
          )
        })
      )
      .handle("reject", ({ params }) =>
        Effect.gen(function* () {
          const ba = yield* BetterAuth
          const request = yield* webRequest
          yield* withMemberErrors(
            ba.rejectInvitation(request, params.invitationId)
          )
        })
      )
)
