import {
  BetterAuth,
  type BetterAuthError
} from "@pp/server-core/auth/BetterAuth"
import { Org } from "@pp/server-core/organizations/Org"
import {
  AppApi,
  Conflict,
  CurrentUser,
  Forbidden,
  NotFound,
  type OrgInvitation,
  type OrgRole,
  LastProjectPmBlocked,
  Validation
} from "@pp/shared"
import { isAPIError } from "better-auth/api"
import * as Effect from "effect/Effect"
import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"

export const collapseRole = (role: string): OrgRole => {
  const roles = new Set(role.split(",").map((entry) => entry.trim()))
  if (roles.has("owner")) return "owner"
  if (roles.has("admin")) return "admin"
  return "member"
}

type RawInvitation = Readonly<{
  id: string
  email: string
  role?: string | null
  status: string
}>

export const pendingInvitations = (
  invitations: ReadonlyArray<RawInvitation>
): ReadonlyArray<OrgInvitation> =>
  invitations.flatMap((invitation) =>
    invitation.status === "pending"
      ? [
          {
            id: invitation.id,
            email: invitation.email,
            role: collapseRole(invitation.role ?? ""),
            status: "pending" as const
          }
        ]
      : []
  )

const FORBIDDING_CODES = new Set([
  "YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION",
  "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION",
  "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION",
  "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER",
  "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER",
  "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION",
  "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE",
  "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION"
])

const MISSING_CODES = new Set([
  "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
  "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION",
  "ORGANIZATION_NOT_FOUND",
  "MEMBER_NOT_FOUND",
  "INVITATION_NOT_FOUND",
  "NO_ACTIVE_ORGANIZATION"
])

const CONFLICTING_CODES = new Map([
  ["USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION", "already_member"],
  ["USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION", "already_invited"],
  ["LAST_ORG_OWNER_BLOCKED", "last_owner_removal"],
  ["YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER", "last_owner"],
  ["YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER", "last_owner"],
  ["ORGANIZATION_MEMBERSHIP_LIMIT_REACHED", "membership_limit"],
  ["INVITATION_LIMIT_REACHED", "invitation_limit"],
  ["ORGANIZATION_SLUG_ALREADY_TAKEN", "slug_taken"],
  ["INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION", "inviter_left"]
])

const INVALID_CODES = new Map([
  ["ROLE_NOT_FOUND", "role_not_found"],
  ["INVALID_EMAIL", "invalid_email"]
])

export const betterAuthErrorStatus = (
  error: BetterAuthError
): number | null => {
  const { cause } = error
  return isAPIError(cause) ? cause.statusCode : null
}

export const isClientRefusal = (error: BetterAuthError): boolean => {
  const status = betterAuthErrorStatus(error)
  return status !== null && status >= 400 && status < 500
}

export const betterAuthErrorCode = (error: BetterAuthError): string | null => {
  const { cause } = error
  if (!isAPIError(cause)) return null
  const code = cause.body?.code
  return typeof code === "string" ? code : null
}

export const memberErrorToFailure = (
  error: BetterAuthError
): Effect.Effect<never, Forbidden | NotFound | Conflict | Validation> => {
  if (!isClientRefusal(error)) return Effect.die(error)
  const code = betterAuthErrorCode(error)
  if (code === null) return Effect.die(error)
  if (FORBIDDING_CODES.has(code)) return Effect.fail(new Forbidden())
  if (MISSING_CODES.has(code)) return Effect.fail(new NotFound())
  const conflict = CONFLICTING_CODES.get(code)
  if (conflict) return Effect.fail(new Conflict({ reason: conflict }))
  const invalid = INVALID_CODES.get(code)
  if (invalid) return Effect.fail(new Validation({ reason: invalid }))
  return Effect.die(error)
}

export const opaqueErrorToFailure = (
  error: BetterAuthError
): Effect.Effect<never, NotFound> =>
  memberErrorToFailure(error).pipe(
    Effect.catchTags({
      Forbidden: () => new NotFound(),
      Conflict: () => new NotFound(),
      Validation: () => new NotFound()
    })
  )

export const memberAccessErrorToFailure = (
  error: BetterAuthError
): Effect.Effect<never, Forbidden | NotFound> =>
  memberErrorToFailure(error).pipe(
    Effect.catchTags({
      Conflict: () => new Forbidden(),
      Validation: () => new Forbidden()
    })
  )

export const memberChangeErrorToFailure = (
  error: BetterAuthError
): Effect.Effect<never, Forbidden | NotFound | Conflict> =>
  memberErrorToFailure(error).pipe(
    Effect.catchTags({ Validation: () => new Forbidden() })
  )

const LAST_PROJECT_PM_BLOCKED = "LAST_PROJECT_PM_BLOCKED"

export const blockingProjectSlugs = (
  error: BetterAuthError
): ReadonlyArray<string> | null => {
  if (!isClientRefusal(error)) return null
  if (betterAuthErrorCode(error) !== LAST_PROJECT_PM_BLOCKED) return null
  const { cause } = error
  const slugs = isAPIError(cause) ? cause.body?.projectSlugs : undefined
  return Array.isArray(slugs)
    ? slugs.filter((slug) => typeof slug === "string")
    : []
}

export const removeMemberErrorToFailure = (
  error: BetterAuthError
): Effect.Effect<
  never,
  Forbidden | NotFound | Conflict | LastProjectPmBlocked
> => {
  const projectSlugs = blockingProjectSlugs(error)
  return projectSlugs === null
    ? memberChangeErrorToFailure(error)
    : Effect.fail(new LastProjectPmBlocked({ projectSlugs }))
}

export const leaveErrorToFailure = (
  error: BetterAuthError
): Effect.Effect<never, NotFound | Conflict> =>
  memberErrorToFailure(error).pipe(
    Effect.catchTags({
      Forbidden: () => new NotFound(),
      Validation: () => new NotFound()
    })
  )

export const transferErrorToFailure = (
  error: BetterAuthError
): Effect.Effect<never, Forbidden | NotFound | Validation> =>
  memberErrorToFailure(error).pipe(
    Effect.catchTags({ Conflict: () => new Forbidden() })
  )

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
        yield* CurrentUser
        const ba = yield* BetterAuth
        const request = yield* webRequest
        return yield* ba
          .getMembers(request, params.orgSlug)
          .pipe(Effect.catchTag("BetterAuthError", opaqueErrorToFailure))
      })
    )
    .handle("rename", ({ params, payload }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        const ba = yield* BetterAuth
        const org = yield* Org
        const request = yield* webRequest
        yield* ba
          .renameOrg(request, params.orgSlug, payload.name)
          .pipe(Effect.catchTag("BetterAuthError", memberAccessErrorToFailure))
        return yield* org.get(params.orgSlug, user.id)
      })
    )
    .handle("inviteMember", ({ params, payload }) =>
      Effect.gen(function* () {
        yield* CurrentUser
        const ba = yield* BetterAuth
        const request = yield* webRequest
        return yield* ba
          .inviteMember(request, params.orgSlug, payload)
          .pipe(Effect.catchTag("BetterAuthError", memberErrorToFailure))
      })
    )
    .handle("updateMemberRole", ({ params, payload }) =>
      Effect.gen(function* () {
        yield* CurrentUser
        const ba = yield* BetterAuth
        const request = yield* webRequest
        return yield* ba
          .updateMemberRole(
            request,
            params.orgSlug,
            params.userId,
            payload.role
          )
          .pipe(Effect.catchTag("BetterAuthError", memberChangeErrorToFailure))
      })
    )
    .handle("removeMember", ({ params }) =>
      Effect.gen(function* () {
        yield* CurrentUser
        const ba = yield* BetterAuth
        const request = yield* webRequest
        yield* ba
          .removeMember(request, params.orgSlug, params.userId)
          .pipe(Effect.catchTag("BetterAuthError", removeMemberErrorToFailure))
      })
    )
    .handle("cancelInvitation", ({ params }) =>
      Effect.gen(function* () {
        yield* CurrentUser
        const ba = yield* BetterAuth
        const request = yield* webRequest
        yield* ba
          .cancelInvitation(request, params.orgSlug, params.invitationId)
          .pipe(Effect.catchTag("BetterAuthError", memberAccessErrorToFailure))
      })
    )
    .handle("transferOwnership", ({ params, payload }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        const ba = yield* BetterAuth
        const request = yield* webRequest
        return yield* ba
          .transferOwnership(request, params.orgSlug, payload.userId, user.id)
          .pipe(Effect.catchTag("BetterAuthError", transferErrorToFailure))
      })
    )
    .handle("leave", ({ params }) =>
      Effect.gen(function* () {
        yield* CurrentUser
        const ba = yield* BetterAuth
        const request = yield* webRequest
        yield* ba
          .leaveOrg(request, params.orgSlug)
          .pipe(Effect.catchTag("BetterAuthError", leaveErrorToFailure))
      })
    )
)
