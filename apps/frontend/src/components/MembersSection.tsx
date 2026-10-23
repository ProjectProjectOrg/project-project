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
import { Briefcase, LogOut, ShieldCheck, Trash2, UserRound } from "lucide-react"
import { motion } from "motion/react"
import { useState, type FormEvent } from "react"

import { MemberAvatar } from "@/components/MemberAvatar"
import {
  AddMemberForm,
  MemberMenuConfirm,
  MemberMenuSpacer,
  MemberMenuTrigger,
  MemberRowLayout,
  PendingInviteRow,
  RoleBadge,
  RoleSelect,
  type RoleMeta
} from "@/components/members/MemberList"
import { SettingsGroup } from "@/components/settings/SettingsSection"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu"
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
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

const ROLE_META: Record<Role, RoleMeta & Readonly<{ assign: () => string }>> = {
  pm: {
    label: () => m.members_role_pm(),
    assign: () => m.members_make_pm(),
    icon: ShieldCheck,
    tone: "muted"
  },
  developer: {
    label: () => m.members_role_developer(),
    assign: () => m.members_make_developer(),
    icon: UserRound,
    tone: "muted"
  },
  client: {
    label: () => m.members_role_client(),
    assign: () => m.members_make_client(),
    icon: Briefcase,
    tone: "muted"
  }
}

const isLastProjectPmBlocked = Schema.is(LastProjectPmBlocked)

const memberActionMessage = <E,>(failure: E) =>
  isLastProjectPmBlocked(failure)
    ? errorMessage(failure)
    : m.members_action_error()

const memberActionError = <A, E>(state: Result.AsyncResult<A, E>) =>
  Result.isFailure(state)
    ? Option.match(Cause.findErrorOption(state.cause), {
        onNone: () => m.members_action_error(),
        onSome: memberActionMessage
      })
    : null
const ASSIGNABLE_ROLES = [
  "pm",
  "developer",
  "client"
] satisfies ReadonlyArray<AssignableRole>

export function MembersSection({
  orgSlug,
  slug,
  members,
  pendingMembers,
  waiting,
  canManage,
  callerId
}: {
  orgSlug: string
  slug: string
  members: ReadonlyArray<Member>
  pendingMembers: ReadonlyArray<PendingProjectMember>
  waiting: boolean
  canManage: boolean
  callerId: string
}) {
  const pmCount = members.filter((member) => member.role === "pm").length
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      {canManage && (
        <AddMemberRow orgSlug={orgSlug} slug={slug} onFocusChange={setAdding} />
      )}

      <SettingsGroup
        render={
          <motion.ul
            animate={{ opacity: adding ? 0.35 : 1 }}
            transition={transitions.presence}
          />
        }
      >
        {members.map((member) => (
          <li key={member.id}>
            <MemberRow
              orgSlug={orgSlug}
              slug={slug}
              member={member}
              canManage={canManage}
              onlyPm={member.role === "pm" && pmCount === 1}
              callerId={callerId}
              projectWaiting={waiting}
            />
          </li>
        ))}
        {pendingMembers.map((member) => (
          <li key={member.invitationId}>
            <PendingMemberRow
              orgSlug={orgSlug}
              slug={slug}
              member={member}
              canManage={canManage}
              projectWaiting={waiting}
            />
          </li>
        ))}
      </SettingsGroup>
    </div>
  )
}

function AddMemberRow({
  orgSlug,
  slug,
  onFocusChange
}: {
  orgSlug: string
  slug: string
  onFocusChange?: (focused: boolean) => void
}) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<AssignableRole>("developer")
  const [submitted, setSubmitted] = useState(false)
  const trimmed = email.trim()
  const req = projectRequest(orgSlug, slug)
  const memberMutation = addMember({ req, id: trimmed })
  const add = useAtomSet(memberMutation, { mode: "promiseExit" })
  const addState = useAtomValue(memberMutation)
  const submitting = addState.waiting
  const error = Result.isFailure(addState)
    ? Option.match(Cause.findErrorOption(addState.cause), {
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    onFocusChange?.(false)
    setSubmitted(false)
    const exit = await add({ email: trimmed, role })
    if (Exit.isSuccess(exit)) {
      setEmail("")
      setSubmitted(true)
    }
  }

  return (
    <AddMemberForm
      email={email}
      onEmailChange={(next) => {
        setEmail(next)
        setSubmitted(false)
      }}
      placeholder={m.members_add_email_placeholder()}
      submitting={submitting}
      submitted={submitted}
      error={error}
      roleSelect={
        <RoleSelect
          value={role}
          onChange={setRole}
          roles={ASSIGNABLE_ROLES}
          meta={ROLE_META}
        />
      }
      onSubmit={onSubmit}
      onFocusChange={onFocusChange}
    />
  )
}

function MemberRow({
  orgSlug,
  slug,
  member,
  canManage,
  onlyPm,
  callerId,
  projectWaiting
}: {
  orgSlug: string
  slug: string
  member: Member
  canManage: boolean
  onlyPm: boolean
  callerId: string
  projectWaiting: boolean
}) {
  const isSelf = member.id === callerId
  const updateState = useAtomValue(
    updateMember({ req: projectRequest(orgSlug, slug), id: member.id })
  )
  const updating = projectWaiting && updateState.waiting
  return (
    <MemberRowLayout
      leading={<MemberAvatar member={member} size={32} />}
      title={member.name}
      isSelf={isSelf}
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
      pulsing={updating}
    >
      <RoleBadge meta={ROLE_META[member.role]} />
      <MemberMenu
        orgSlug={orgSlug}
        slug={slug}
        member={member}
        canManage={canManage && !onlyPm}
        isSelf={isSelf}
        canLeave={!onlyPm}
      />
    </MemberRowLayout>
  )
}

function PendingMemberRow({
  orgSlug,
  slug,
  member,
  canManage,
  projectWaiting
}: {
  orgSlug: string
  slug: string
  member: PendingProjectMember
  canManage: boolean
  projectWaiting: boolean
}) {
  return (
    <PendingInviteRow
      email={member.email}
      role={ROLE_META[member.role]}
      pulsing={projectWaiting && member.invitationId.startsWith("optimistic:")}
      menu={
        <PendingMemberMenu
          orgSlug={orgSlug}
          slug={slug}
          member={member}
          canManage={canManage}
        />
      }
    />
  )
}

function PendingMemberMenu({
  orgSlug,
  slug,
  member,
  canManage
}: {
  orgSlug: string
  slug: string
  member: PendingProjectMember
  canManage: boolean
}) {
  const mutation = cancelPendingMember({
    req: projectRequest(orgSlug, slug),
    id: member.invitationId
  })
  const cancel = useAtomSet(mutation, {
    mode: "promiseExit"
  })
  const cancelState = useAtomValue(mutation)
  const canceling = cancelState.waiting
  const [confirming, setConfirming] = useState(false)
  if (!canManage) return <MemberMenuSpacer />

  async function onCancel() {
    await cancel()
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setConfirming(false)
      }}
    >
      <MemberMenuTrigger label={m.members_pending_actions_aria_label()} />
      <DropdownMenuContent align="end" sideOffset={6} className="w-52">
        {confirming ? (
          <MemberMenuConfirm
            prompt={m.members_pending_cancel_confirm_prompt({
              email: member.email
            })}
            confirmLabel={
              canceling
                ? m.members_pending_cancel_in_progress()
                : m.members_pending_cancel_button()
            }
            busy={canceling}
            onConfirm={() => void onCancel()}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => setConfirming(true)}
            variant="destructive"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            {m.members_pending_cancel_button()}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MemberMenu({
  orgSlug,
  slug,
  member,
  canManage,
  isSelf,
  canLeave
}: Readonly<{
  orgSlug: string
  slug: string
  member: Member
  canManage: boolean
  isSelf: boolean
  canLeave: boolean
}>) {
  const navigate = useNavigate()
  const req = projectRequest(orgSlug, slug)
  const mutationKey = { req, id: member.id }
  const updateMutation = updateMember(mutationKey)
  const update = useAtomSet(updateMutation)
  const remove = useAtomSet(removeMember(mutationKey), {
    mode: "promiseExit"
  })
  const removeState = useAtomValue(removeMember(mutationKey))
  const leave = useAtomSet(leaveProject(req), { mode: "promiseExit" })
  const forget = useAtomSet(forgetProject(req), { mode: "promise" })
  const leaveState = useAtomValue(leaveProject(req))
  const removing = isSelf ? leaveState.waiting : removeState.waiting
  const removeError = isSelf
    ? memberActionError(leaveState)
    : memberActionError(removeState)
  const [confirming, setConfirming] = useState(false)
  const canExit = isSelf ? canLeave : canManage

  if (!canManage && !canExit) return <MemberMenuSpacer />

  async function onRemove() {
    if (!isSelf) {
      await remove()
      return
    }
    const exit = await leave()
    if (Exit.isSuccess(exit)) {
      await navigate({ to: "/orgs/$orgSlug/projects", params: { orgSlug } })
      await forget()
    }
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setConfirming(false)
      }}
    >
      <MemberMenuTrigger label={m.members_actions_aria_label()} />
      <DropdownMenuContent align="end" sideOffset={6} className="w-52">
        {confirming ? (
          <MemberMenuConfirm
            prompt={
              isSelf
                ? m.members_leave_confirm_prompt()
                : m.members_remove_confirm_prompt({ name: member.name })
            }
            confirmLabel={
              isSelf
                ? removing
                  ? m.members_leave_in_progress()
                  : m.members_leave_button()
                : removing
                  ? m.members_remove_in_progress()
                  : m.members_remove_button()
            }
            busy={removing}
            error={removeError}
            onConfirm={() => void onRemove()}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <>
            {canManage &&
              ASSIGNABLE_ROLES.filter((r) => r !== member.role).map((r) => {
                const meta = ROLE_META[r]
                const RIcon = meta.icon
                return (
                  <DropdownMenuItem
                    key={r}
                    onClick={() => update({ role: r })}
                    className="cursor-pointer"
                  >
                    <RIcon className="size-4" strokeWidth={1.75} />
                    {meta.assign()}
                  </DropdownMenuItem>
                )
              })}
            {canManage && canExit && <DropdownMenuSeparator />}
            {canExit && (
              <DropdownMenuItem
                closeOnClick={false}
                onClick={() => setConfirming(true)}
                variant="destructive"
              >
                {isSelf ? (
                  <LogOut className="size-4" strokeWidth={1.75} />
                ) : (
                  <Trash2 className="size-4" strokeWidth={1.75} />
                )}
                {isSelf ? m.members_leave_button() : m.members_remove_button()}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
