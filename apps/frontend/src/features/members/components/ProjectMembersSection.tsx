import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { LastProjectPmBlocked } from "@pp/shared"
import type {
  AssignableRole,
  Member,
  PendingProjectMember,
  Role
} from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { Briefcase, ShieldCheck, UserRound } from "lucide-react"
import { useState } from "react"

import type { RoleMeta } from "@/features/members/components/MemberList"
import {
  AddMemberRow,
  MemberRowView,
  MembersSection,
  PendingRowView
} from "@/features/members/components/MembersSection"
import {
  addMember,
  cancelPendingMember,
  forgetProject,
  leaveProject,
  projectRequest,
  removeMember,
  updateMember
} from "@/features/projects/atoms/projects"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

const ROLE_META: Readonly<Record<Role, RoleMeta>> = {
  pm: {
    label: () => m.members_role_pm(),
    icon: ShieldCheck,
    tone: "muted"
  },
  developer: {
    label: () => m.members_role_developer(),
    icon: UserRound,
    tone: "muted"
  },
  client: {
    label: () => m.members_role_client(),
    icon: Briefcase,
    tone: "muted"
  }
}

const ASSIGN_LABELS: Readonly<Record<AssignableRole, () => string>> = {
  pm: () => m.members_make_pm(),
  developer: () => m.members_make_developer(),
  client: () => m.members_make_client()
}

const ASSIGNABLE_ROLES = [
  "pm",
  "developer",
  "client"
] satisfies ReadonlyArray<AssignableRole>

const isLastProjectPmBlocked = Schema.is(LastProjectPmBlocked)

const memberActionError = <A, E>(state: Result.AsyncResult<A, E>) =>
  Result.isFailure(state)
    ? Option.match(Cause.findErrorOption(state.cause), {
        onNone: () => m.members_action_error(),
        onSome: (failure) =>
          isLastProjectPmBlocked(failure)
            ? errorMessage(failure)
            : m.members_action_error()
      })
    : null

type ProjectScope = Readonly<{
  orgSlug: string
  slug: string
  waiting: boolean
  canManage: boolean
  callerId: string
}>

export function ProjectMembersSection({
  orgSlug,
  slug,
  members,
  pendingMembers,
  waiting,
  canManage,
  callerId
}: ProjectScope &
  Readonly<{
    members: ReadonlyArray<Member>
    pendingMembers: ReadonlyArray<PendingProjectMember>
  }>) {
  const scope = { orgSlug, slug, waiting, canManage, callerId }
  const pmCount = members.filter((member) => member.role === "pm").length
  return (
    <MembersSection
      renderAdd={
        canManage
          ? (onFocusChange) => (
              <ProjectAddMember scope={scope} onFocusChange={onFocusChange} />
            )
          : undefined
      }
    >
      {members.map((member) => (
        <ProjectMemberRow
          key={member.id}
          scope={scope}
          member={member}
          onlyPm={member.role === "pm" && pmCount === 1}
        />
      ))}
      {pendingMembers.map((pending) => (
        <ProjectPendingRow
          key={pending.invitationId}
          scope={scope}
          pending={pending}
        />
      ))}
    </MembersSection>
  )
}

function ProjectAddMember({
  scope,
  onFocusChange
}: Readonly<{
  scope: ProjectScope
  onFocusChange: (focused: boolean) => void
}>) {
  const [email, setEmail] = useState("")
  const trimmed = email.trim()
  const mutation = addMember({
    req: projectRequest(scope.orgSlug, scope.slug),
    id: trimmed
  })
  const add = useAtomSet(mutation, { mode: "promiseExit" })
  const state = useAtomValue(mutation)
  return (
    <AddMemberRow
      email={email}
      onEmailChange={setEmail}
      roles={ROLE_META}
      assignable={ASSIGNABLE_ROLES}
      defaultRole="developer"
      placeholder={m.members_add_email_placeholder()}
      onFocusChange={onFocusChange}
      invite={{
        submit: (role) => add({ email: trimmed, role }),
        waiting: state.waiting,
        error: Result.isFailure(state)
          ? Option.match(Cause.findErrorOption(state.cause), {
              onNone: () => m.members_add_error_fallback(),
              onSome: (failure) =>
                Match.value(failure).pipe(
                  Match.tag("Forbidden", () =>
                    m.members_add_error_outsider_client_only()
                  ),
                  Match.orElse(() => m.members_add_error_fallback())
                )
            })
          : null
      }}
    />
  )
}

function ProjectMemberRow({
  scope,
  member,
  onlyPm
}: Readonly<{ scope: ProjectScope; member: Member; onlyPm: boolean }>) {
  const navigate = useNavigate()
  const req = projectRequest(scope.orgSlug, scope.slug)
  const key = { req, id: member.id }
  const update = useAtomSet(updateMember(key))
  const updateState = useAtomValue(updateMember(key))
  const remove = useAtomSet(removeMember(key), { mode: "promiseExit" })
  const removeState = useAtomValue(removeMember(key))
  const leave = useAtomSet(leaveProject(req), { mode: "promiseExit" })
  const leaveState = useAtomValue(leaveProject(req))
  const forget = useAtomSet(forgetProject(req), { mode: "promise" })
  const isSelf = member.id === scope.callerId
  const manage = scope.canManage && !onlyPm
  const canExit = isSelf ? !onlyPm : manage

  return (
    <MemberRowView
      roles={ROLE_META}
      avatar={member}
      title={member.name}
      isSelf={isSelf}
      role={member.role}
      subtitle={
        <>
          {member.username ? (
            <>
              <span className="font-mono">@{member.username}</span>
              <span className="mx-1.5">·</span>
            </>
          ) : null}
          {member.email}
        </>
      }
      error={memberActionError(updateState)}
      pulsing={scope.waiting && updateState.waiting}
      menu={{
        assign: manage
          ? ASSIGNABLE_ROLES.flatMap((role) =>
              role === member.role
                ? []
                : [{ role, label: ASSIGN_LABELS[role]() }]
            )
          : [],
        changeRole: (role) => update({ role }),
        transfer: null,
        exit: !canExit
          ? null
          : isSelf
            ? {
                kind: "leave",
                prompt: m.members_leave_confirm_prompt(),
                label: m.members_leave_button(),
                busyLabel: m.members_leave_in_progress(),
                waiting: leaveState.waiting,
                error: memberActionError(leaveState),
                run: async () => {
                  const exit = await leave()
                  if (Exit.isSuccess(exit)) {
                    await navigate({
                      to: "/orgs/$orgSlug/projects",
                      params: { orgSlug: scope.orgSlug }
                    })
                    await forget()
                  }
                  return exit
                }
              }
            : {
                kind: "remove",
                prompt: m.members_remove_confirm_prompt({ name: member.name }),
                label: m.members_remove_button(),
                busyLabel: m.members_remove_in_progress(),
                waiting: removeState.waiting,
                error: memberActionError(removeState),
                run: () => remove()
              }
      }}
    />
  )
}

function ProjectPendingRow({
  scope,
  pending
}: Readonly<{ scope: ProjectScope; pending: PendingProjectMember }>) {
  const mutation = cancelPendingMember({
    req: projectRequest(scope.orgSlug, scope.slug),
    id: pending.invitationId
  })
  const cancel = useAtomSet(mutation, { mode: "promiseExit" })
  const state = useAtomValue(mutation)
  return (
    <PendingRowView
      roles={ROLE_META}
      email={pending.email}
      role={pending.role}
      pulsing={scope.waiting && pending.invitationId.startsWith("optimistic:")}
      cancel={
        scope.canManage
          ? {
              prompt: m.members_pending_cancel_confirm_prompt({
                email: pending.email
              }),
              label: m.members_pending_cancel_button(),
              busyLabel: m.members_pending_cancel_in_progress(),
              waiting: state.waiting,
              error: null,
              run: () => cancel()
            }
          : null
      }
    />
  )
}
