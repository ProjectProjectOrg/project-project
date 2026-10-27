import {
  Conflict,
  Forbidden,
  NotFound,
  SlackAuthInvalid,
  SlackError,
  SlackNotConnected,
  SlackRateLimited,
  Unauthorized
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"

import type {
  cancelInvitation,
  inviteMember,
  leaveOrg,
  removeMember,
  transferOwnership,
  updateMemberRole
} from "@/features/organizations/atoms/orgs"
import { errorMessage, isValidationDetail } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

export const mutationFailure = <E, T>(
  result: AsyncResult.AsyncResult<unknown, E>,
  describe: (error: E) => T,
  defect: () => T
): T | null =>
  AsyncResult.isFailure(result)
    ? AsyncResult.matchWithError(result, {
        onInitial: () => null,
        onSuccess: () => null,
        onError: (error) => describe(error),
        onDefect: () => defect()
      })
    : null

export const mutationErrorText = <E>(
  result: AsyncResult.AsyncResult<unknown, E>,
  describe: (error: E) => string = errorMessage,
  defect: () => string = m.error_unknown
): string | null => mutationFailure(result, describe, defect)

type Tagged = Readonly<{ _tag: string }>

export const isUnknownTemplate = (error: Tagged): boolean =>
  isValidationDetail(error) && error.reason.startsWith("unknown_template")

export const failedOnUnknownTemplate = (
  exit: Exit.Exit<unknown, Tagged>
): boolean =>
  Exit.isFailure(exit) &&
  Option.exists(Cause.findErrorOption(exit.cause), isUnknownTemplate)

export const ticketCreateErrorMessage = (error: Tagged): string =>
  Predicate.isTagged(error, "MentionInvalid") || isUnknownTemplate(error)
    ? errorMessage(error)
    : m.tickets_create_error_fallback()

const isExpectedSlackError = Schema.is(
  Schema.Union([
    Conflict,
    Forbidden,
    NotFound,
    Unauthorized,
    SlackAuthInvalid,
    SlackError,
    SlackNotConnected,
    SlackRateLimited
  ])
)

export const slackActionErrorMessage = (error: Tagged): string =>
  isExpectedSlackError(error) ? errorMessage(error) : m.slack_error_generic()

export type OrgActionError = Readonly<{
  message: string
  projectSlugs?: ReadonlyArray<string>
}>

type OrgMutationFailure = Atom.Failure<
  ReturnType<
    | typeof cancelInvitation
    | typeof inviteMember
    | typeof leaveOrg
    | typeof removeMember
    | typeof transferOwnership
    | typeof updateMemberRole
  >
>

export const orgActionError = (error: OrgMutationFailure): OrgActionError =>
  Match.value(error).pipe(
    Match.tag("LastProjectPmBlocked", ({ projectSlugs }) => ({
      message: m.org_members_last_project_pm_blocked(),
      projectSlugs
    })),
    Match.when({ _tag: "Conflict", reason: "already_member" }, () => ({
      message: m.org_members_error_already_member()
    })),
    Match.when({ _tag: "Conflict", reason: "already_invited" }, () => ({
      message: m.org_members_error_already_invited()
    })),
    Match.when({ _tag: "Conflict", reason: "last_owner_removal" }, () => ({
      message: m.org_members_error_last_owner()
    })),
    Match.when({ _tag: "Conflict", reason: "last_owner" }, () => ({
      message: m.org_members_error_only_owner_leave()
    })),
    Match.when({ _tag: "Validation", reason: "role_not_found" }, () => ({
      message: m.org_members_error_role_not_allowed()
    })),
    Match.orElse(() => orgActionDefect())
  )

export const orgActionDefect = (): OrgActionError => ({
  message: m.org_members_action_error()
})
