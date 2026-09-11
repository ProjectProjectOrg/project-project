import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { AppApi, Conflict, CurrentUser, Forbidden, NotFound } from "@projectproject/shared"
import { BetterAuthError } from "../Services/BetterAuth"
import * as Effect from "effect/Effect"
import { Org } from "../Services/Org"
import { BetterAuth } from "../Services/BetterAuth"
import { memberErrorToFailure } from "./orgMembers"

export { collapseRole, memberErrorToFailure } from "./orgMembers"

const withMemberErrors = <A, R>(
  effect: Effect.Effect<A, BetterAuthError | NotFound, R>
): Effect.Effect<A, Forbidden | NotFound | Conflict, R> =>
  effect.pipe(
    Effect.catchTag("BetterAuthError", memberErrorToFailure)
  ) as Effect.Effect<A, Forbidden | NotFound | Conflict, R>

const webRequest = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  return yield* HttpServerRequest.toWeb(req).pipe(Effect.orDie)
})

export const OrgHandlerLive = HttpApiBuilder.group(AppApi, "org", (handlers) =>
  handlers
    .handle("myOrgs", () =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        const org = yield* Org
        return yield* org.myOrgs(user.id)
      })
    )
    .handle("get", ({ params }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        const org = yield* Org
        return yield* org.get(params.orgSlug, user.id)
      })
    )
    .handle("softDelete", ({ params }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        const org = yield* Org
        return yield* org.softDelete(params.orgSlug, user.id)
      })
    )
    .handle("restore", ({ params }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        const org = yield* Org
        return yield* org.restore(params.orgSlug, user.id)
      })
    )
    .handle("members", ({ params }) =>
      Effect.gen(function* () {
        const ba = yield* BetterAuth
        const request = yield* webRequest
        return yield* withMemberErrors(
          ba.getMembers(request, params.orgSlug)
        )
      })
    )
    .handle("rename", ({ params, payload }) =>
      Effect.gen(function* () {
        const ba = yield* BetterAuth
        const request = yield* webRequest
        return yield* withMemberErrors(
          ba.renameOrg(request, params.orgSlug, payload.name)
        )
      })
    )
    .handle("inviteMember", ({ params, payload }) =>
      Effect.gen(function* () {
        const ba = yield* BetterAuth
        const request = yield* webRequest
        return yield* withMemberErrors(
          ba.inviteMember(request, params.orgSlug, payload)
        )
      })
    )
    .handle("updateMemberRole", ({ params, payload }) =>
      Effect.gen(function* () {
        const ba = yield* BetterAuth
        const request = yield* webRequest
        return yield* withMemberErrors(
          ba.updateMemberRole(
            request,
            params.orgSlug,
            params.userId,
            payload.role
          )
        )
      })
    )
    .handle("removeMember", ({ params }) =>
      Effect.gen(function* () {
        const ba = yield* BetterAuth
        const request = yield* webRequest
        yield* withMemberErrors(
          ba.removeMember(request, params.orgSlug, params.userId)
        )
      })
    )
    .handle("cancelInvitation", ({ params }) =>
      Effect.gen(function* () {
        const ba = yield* BetterAuth
        const request = yield* webRequest
        yield* withMemberErrors(
          ba.cancelInvitation(
            request,
            params.orgSlug,
            params.invitationId
          )
        )
      })
    )
    .handle("transferOwnership", ({ params, payload }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        const ba = yield* BetterAuth
        const request = yield* webRequest
        return yield* withMemberErrors(
          ba.transferOwnership(
            request,
            params.orgSlug,
            payload.toUserId,
            user.id
          )
        )
      })
    )
    .handle("leave", ({ params }) =>
      Effect.gen(function* () {
        const ba = yield* BetterAuth
        const request = yield* webRequest
        yield* withMemberErrors(ba.leaveOrg(request, params.orgSlug))
      })
    )
)
