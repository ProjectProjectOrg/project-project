import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import type * as Atom from "effect/reactivity/Atom"

import type {
  cancelInvitation,
  inviteMember,
  leaveOrg,
  removeMember,
  transferOwnership,
  updateMemberRole
} from "@/features/organizations/atoms/orgs"
import { m } from "@/paraglide/messages"

export type OrgActionError = Readonly<{
  message: string
  projectSlugs?: ReadonlyArray<string>
}>

type OrgMutation =
  | typeof cancelInvitation
  | typeof inviteMember
  | typeof leaveOrg
  | typeof removeMember
  | typeof transferOwnership
  | typeof updateMemberRole

type OrgMutationFailure = Atom.Failure<ReturnType<OrgMutation>>

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
    Match.orElse(() => ({ message: m.org_members_action_error() }))
  )

export const orgActionErrorFromExit = <A>(
  exit: Exit.Exit<A, OrgMutationFailure>
): OrgActionError | null => {
  if (!Exit.isFailure(exit)) return null
  return Option.match(Cause.findErrorOption(exit.cause), {
    onNone: () => ({ message: m.org_members_action_error() }),
    onSome: orgActionError
  })
}
