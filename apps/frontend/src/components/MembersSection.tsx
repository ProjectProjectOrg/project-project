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
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import {
  Briefcase,
  Check,
  LogOut,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound
} from "lucide-react"
import { motion } from "motion/react"
import { useState, type FormEvent } from "react"

import { MemberAvatar } from "@/components/MemberAvatar"
import { Badge, type BadgeTone } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@/components/ui/input-group"
import {
  addMember,
  cancelPendingMember,
  leaveProject,
  projectRequest,
  removeMember,
  updateMember
} from "@/features/projects/atoms/projects"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const ROLE_META: Record<
  Role,
  Readonly<{
    label: () => string
    assign: () => string
    icon: typeof ShieldCheck
    tone: BadgeTone
  }>
> = {
  pm: {
    label: () => m.members_role_pm(),
    assign: () => m.members_make_pm(),
    icon: ShieldCheck,
    tone: "blue"
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
    tone: "violet"
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

      <motion.ul
        animate={{ opacity: adding ? 0.35 : 1 }}
        transition={transitions.presence}
        className="divide-y divide-border rounded-xl border border-border bg-background"
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
      </motion.ul>
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
    <form onSubmit={onSubmit}>
      <InputGroup>
        <InputGroupAddon>
          <Plus className="size-4" strokeWidth={1.75} />
        </InputGroupAddon>
        <InputGroupInput
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setSubmitted(false)
          }}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          placeholder={m.members_add_email_placeholder()}
          aria-label={m.members_add_email_aria_label()}
          disabled={submitting}
        />
        <RoleSelect value={role} onChange={setRole} />
        {error && (
          <span className="shrink-0 text-xs text-destructive">{error}</span>
        )}
        {!error && submitted ? (
          <span
            className="shrink-0 text-xs text-muted-foreground"
            role="status"
          >
            {m.members_add_success()}
          </span>
        ) : null}
      </InputGroup>
    </form>
  )
}

function RoleSelect({
  value,
  onChange,
  roles = ASSIGNABLE_ROLES
}: {
  value: AssignableRole
  onChange: (r: AssignableRole) => void
  roles?: ReadonlyArray<AssignableRole>
}) {
  const meta = ROLE_META[value]
  const Icon = meta.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Badge
            tone={meta.tone}
            size="sm"
            className="cursor-pointer hover:bg-accent"
            render={
              <button
                type="button"
                aria-label={m.members_role_select_aria_label({
                  role: meta.label()
                })}
              />
            }
          >
            <Icon strokeWidth={1.75} />
            {meta.label()}
          </Badge>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-32">
        {roles.map((r) => {
          const roleMeta = ROLE_META[r]
          const RIcon = roleMeta.icon
          return (
            <DropdownMenuItem
              key={r}
              onClick={() => onChange(r)}
              className="cursor-pointer"
            >
              <RIcon className="size-4" strokeWidth={1.75} />
              {roleMeta.label()}
              {r === value && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const meta = ROLE_META[member.role]
  const Icon = meta.icon
  const isSelf = member.id === callerId
  const updateState = useAtomValue(
    updateMember({ req: projectRequest(orgSlug, slug), id: member.id })
  )
  const updating = projectWaiting && updateState.waiting
  const updateError = memberActionError(updateState)
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2.5 pr-3 pl-3",
        updating && "animate-pulse"
      )}
    >
      <MemberAvatar member={member} size={32} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium">
          {member.name}
          {isSelf && (
            <span className="ml-2 text-[10px] text-muted-foreground">
              {m.members_self_indicator()}
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {member.username ? (
            <>
              <span className="font-mono">@{member.username}</span>
              <span className="mx-1.5">·</span>
            </>
          ) : null}
          {member.email}
        </div>
        {updateError && (
          <div className="text-xs text-destructive" role="alert">
            {updateError}
          </div>
        )}
      </div>
      <Badge tone={meta.tone} size="sm">
        <Icon strokeWidth={1.75} />
        {meta.label()}
      </Badge>
      <MemberMenu
        orgSlug={orgSlug}
        slug={slug}
        member={member}
        canManage={canManage && !onlyPm}
        isSelf={isSelf}
        canLeave={!onlyPm}
      />
    </div>
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
  const meta = ROLE_META[member.role]
  const Icon = meta.icon
  const initial = member.email.trim().charAt(0).toUpperCase() || "?"

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2.5 pr-3 pl-3",
        projectWaiting &&
          member.invitationId.startsWith("optimistic:") &&
          "animate-pulse"
      )}
    >
      <div className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-border font-mono text-xs text-muted-foreground">
        {initial}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium text-muted-foreground">
          {member.email}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {m.members_pending_detail()}
        </div>
      </div>
      <Badge tone="muted" size="sm">
        {m.members_pending_badge()}
      </Badge>
      <Badge tone={meta.tone} size="sm">
        <Icon strokeWidth={1.75} />
        {meta.label()}
      </Badge>
      <PendingMemberMenu
        orgSlug={orgSlug}
        slug={slug}
        member={member}
        canManage={canManage}
      />
    </div>
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
  if (!canManage) return <span className="size-8 shrink-0" />

  async function onCancel() {
    await cancel()
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setConfirming(false)
      }}
    >
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.members_pending_actions_aria_label()}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-52">
        {confirming ? (
          <div className="flex flex-col gap-2 p-1">
            <p className="px-2 pt-1 text-xs text-muted-foreground">
              {m.members_pending_cancel_confirm_prompt({ email: member.email })}
            </p>
            <div className="flex gap-1 px-1 pb-1">
              <button
                type="button"
                disabled={canceling}
                onClick={() => void onCancel()}
                className="flex-1 rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground transition-colors duration-100 hover:bg-destructive/90 active:scale-[0.97] disabled:opacity-50"
              >
                {canceling
                  ? m.members_pending_cancel_in_progress()
                  : m.members_pending_cancel_button()}
              </button>
              <button
                type="button"
                disabled={canceling}
                onClick={() => setConfirming(false)}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground active:scale-[0.97]"
              >
                {m.common_cancel_button()}
              </button>
            </div>
          </div>
        ) : (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => setConfirming(true)}
            className="cursor-pointer text-destructive focus:text-destructive"
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
  const leaveState = useAtomValue(leaveProject(req))
  const removing = isSelf ? leaveState.waiting : removeState.waiting
  const removeError = isSelf
    ? memberActionError(leaveState)
    : memberActionError(removeState)
  const [confirming, setConfirming] = useState(false)
  const canExit = isSelf ? canLeave : canManage

  if (!canManage && !canExit) return <span className="size-8 shrink-0" />

  async function onRemove() {
    if (!isSelf) {
      await remove()
      return
    }
    const exit = await leave()
    if (Exit.isSuccess(exit)) {
      void navigate({ to: "/orgs/$orgSlug/projects", params: { orgSlug } })
    }
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setConfirming(false)
      }}
    >
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.members_actions_aria_label()}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-52">
        {confirming ? (
          <div className="flex flex-col gap-2 p-1">
            <p className="px-2 pt-1 text-xs text-muted-foreground">
              {isSelf
                ? m.members_leave_confirm_prompt()
                : m.members_remove_confirm_prompt({ name: member.name })}
            </p>
            {removeError && (
              <p className="px-2 text-xs text-destructive" role="alert">
                {removeError}
              </p>
            )}
            <div className="flex gap-1 px-1 pb-1">
              <button
                type="button"
                disabled={removing}
                onClick={() => void onRemove()}
                className="flex-1 rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {isSelf
                  ? removing
                    ? m.members_leave_in_progress()
                    : m.members_leave_button()
                  : removing
                    ? m.members_remove_in_progress()
                    : m.members_remove_button()}
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={() => setConfirming(false)}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {m.common_cancel_button()}
              </button>
            </div>
          </div>
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
                className="cursor-pointer text-destructive focus:text-destructive"
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
