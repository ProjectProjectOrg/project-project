import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type {
  OrgAssignableRole,
  OrgInvitation,
  OrgMember,
  OrgRole
} from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { Crown, ShieldCheck, UserRound } from "lucide-react"
import { useState } from "react"

import type { RoleMeta } from "@/features/members/components/MemberList"
import {
  AddMemberRow,
  MemberRowView,
  MembersSection,
  PendingRowView
} from "@/features/members/components/MembersSection"
import {
  cancelInvitation,
  inviteMember,
  leaveOrg,
  orgRequest,
  removeMember,
  transferOwnership,
  updateMemberRole
} from "@/features/organizations/atoms/orgs"
import {
  orgActionError,
  orgActionErrorFromExit
} from "@/features/organizations/lib/orgErrors"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

const ROLE_META: Readonly<Record<OrgRole, RoleMeta>> = {
  owner: { label: () => m.members_role_owner(), icon: Crown, tone: "muted" },
  admin: {
    label: () => m.members_role_admin(),
    icon: ShieldCheck,
    tone: "muted"
  },
  member: {
    label: () => m.members_role_member(),
    icon: UserRound,
    tone: "muted"
  },
  guest: {
    label: () => m.members_role_guest(),
    icon: UserRound,
    tone: "muted"
  }
}

const ASSIGN_LABELS: Readonly<Record<OrgAssignableRole, () => string>> = {
  admin: () => m.members_make_admin(),
  member: () => m.members_make_member()
}

const ASSIGNABLE_ROLES = [
  "admin",
  "member"
] satisfies ReadonlyArray<OrgAssignableRole>

type OrgFailure = Parameters<typeof orgActionError>[0]

const orgErrorText = <A,>(state: Result.AsyncResult<A, OrgFailure>) => {
  if (!Result.isFailure(state)) return null
  const error = orgActionErrorFromExit(Exit.failCause(state.cause))
  if (!error) return null
  return (
    <>
      {error.message}
      {error.projectSlugs && error.projectSlugs.length > 0 ? (
        <span className="font-mono"> {error.projectSlugs.join(", ")}</span>
      ) : null}
    </>
  )
}

type OrgScope = Readonly<{
  orgSlug: string
  orgName: string
  callerUserId: string
  isLastOwner: boolean
  canManage: boolean
}>

export function OrgMembersSection({
  orgSlug,
  orgName,
  members,
  invitations,
  callerRole,
  callerUserId
}: Readonly<{
  orgSlug: string
  orgName: string
  members: ReadonlyArray<OrgMember>
  invitations: ReadonlyArray<OrgInvitation>
  callerRole: OrgRole
  callerUserId: string
}>) {
  const canManage = useOrgActor(orgSlug).call("org", "inviteMember")
  const ownerCount = members.filter((member) => member.role === "owner").length
  const isLastOwner = callerRole === "owner" && ownerCount <= 1
  const scope = { orgSlug, orgName, callerUserId, isLastOwner, canManage }

  return (
    <MembersSection
      renderAdd={
        canManage
          ? (onFocusChange) => (
              <OrgAddMember orgSlug={orgSlug} onFocusChange={onFocusChange} />
            )
          : undefined
      }
      footer={
        isLastOwner ? (
          <p className="text-xs text-muted-foreground">
            {m.org_members_last_owner_note()}
          </p>
        ) : null
      }
    >
      {members.map((member) => (
        <OrgMemberRow key={member.userId} scope={scope} member={member} />
      ))}
      {invitations.map((invitation) => (
        <OrgInvitationRow
          key={invitation.id}
          scope={scope}
          invitation={invitation}
        />
      ))}
    </MembersSection>
  )
}

function OrgAddMember({
  orgSlug,
  onFocusChange
}: Readonly<{
  orgSlug: string
  onFocusChange: (focused: boolean) => void
}>) {
  const [email, setEmail] = useState("")
  const req = orgRequest(orgSlug)
  const invite = useAtomSet(inviteMember(req), { mode: "promiseExit" })
  const state = useAtomValue(inviteMember(req))
  return (
    <AddMemberRow
      email={email}
      onEmailChange={setEmail}
      roles={ROLE_META}
      assignable={ASSIGNABLE_ROLES}
      defaultRole="member"
      placeholder={m.org_members_invite_placeholder()}
      onFocusChange={onFocusChange}
      invite={{
        submit: (role) => invite({ email: email.trim(), role }),
        waiting: state.waiting,
        error: orgErrorText(state)
      }}
    />
  )
}

function OrgMemberRow({
  scope,
  member
}: Readonly<{ scope: OrgScope; member: OrgMember }>) {
  const navigate = useNavigate()
  const actor = useOrgActor(scope.orgSlug)
  const req = orgRequest(scope.orgSlug)
  const key = { req, userId: member.userId }
  const update = useAtomSet(updateMemberRole(key))
  const updateState = useAtomValue(updateMemberRole(key))
  const remove = useAtomSet(removeMember(key), { mode: "promiseExit" })
  const removeState = useAtomValue(removeMember(key))
  const transferKey = { req, callerUserId: scope.callerUserId }
  const transfer = useAtomSet(transferOwnership(transferKey), {
    mode: "promiseExit"
  })
  const transferState = useAtomValue(transferOwnership(transferKey))
  const leave = useAtomSet(leaveOrg(req), { mode: "promiseExit" })
  const leaveState = useAtomValue(leaveOrg(req))
  const isSelf = member.userId === scope.callerUserId
  const name = member.name || member.email
  const canChangeRole =
    actor.call("org", "updateMemberRole") && member.role !== "owner" && !isSelf
  const canTransfer =
    actor.call("org", "transferOwnership") && member.role === "admin" && !isSelf
  const canRemove =
    actor.call("org", "removeMember") && !isSelf && member.role !== "owner"
  const canLeave = isSelf && !scope.isLastOwner

  return (
    <MemberRowView
      roles={ROLE_META}
      avatar={member}
      title={name}
      subtitle={member.email}
      isSelf={isSelf}
      role={member.role}
      error={orgErrorText(updateState)}
      menu={{
        assign: canChangeRole
          ? ASSIGNABLE_ROLES.flatMap((role) =>
              role === member.role
                ? []
                : [{ role, label: ASSIGN_LABELS[role]() }]
            )
          : [],
        changeRole: (role) => update({ role }),
        transfer: canTransfer
          ? {
              prompt: m.org_members_transfer_confirm_prompt({ name }),
              label: m.org_members_make_owner(),
              busyLabel: m.org_members_transfer_in_progress(),
              waiting: transferState.waiting,
              error: orgErrorText(transferState),
              run: () => transfer({ userId: member.userId })
            }
          : null,
        exit: canRemove
          ? {
              kind: "remove",
              prompt: m.members_remove_confirm_prompt({ name }),
              label: m.members_remove_button(),
              busyLabel: m.members_remove_in_progress(),
              waiting: removeState.waiting,
              error: orgErrorText(removeState),
              run: () => remove(undefined)
            }
          : canLeave
            ? {
                kind: "leave",
                prompt: m.org_members_leave_confirm_prompt({
                  org: scope.orgName
                }),
                label: m.org_members_leave_button(),
                busyLabel: m.org_members_leave_in_progress(),
                waiting: leaveState.waiting,
                error: orgErrorText(leaveState),
                run: async () => {
                  const exit = await leave(undefined)
                  if (Exit.isSuccess(exit)) void navigate({ to: "/" })
                  return exit
                }
              }
            : null
      }}
    />
  )
}

function OrgInvitationRow({
  scope,
  invitation
}: Readonly<{ scope: OrgScope; invitation: OrgInvitation }>) {
  const key = { req: orgRequest(scope.orgSlug), invitationId: invitation.id }
  const cancel = useAtomSet(cancelInvitation(key), { mode: "promiseExit" })
  const state = useAtomValue(cancelInvitation(key))
  return (
    <PendingRowView
      roles={ROLE_META}
      email={invitation.email}
      role={invitation.role}
      cancel={
        scope.canManage
          ? {
              prompt: m.members_pending_cancel_confirm_prompt({
                email: invitation.email
              }),
              label: m.members_pending_cancel_button(),
              busyLabel: m.members_pending_cancel_in_progress(),
              waiting: state.waiting,
              error: orgErrorText(state),
              run: () => cancel(undefined)
            }
          : null
      }
    />
  )
}
