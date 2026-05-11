// Members + roles, all-inline UX (no modal dialogs).
//
// Layout:
//   - Section header
//   - "Add member" inline row (user-id field + role dropdown + add button)
//   - List of members. Each row shows id, role pill, and a "..." menu for
//     role changes / removal. Owner row has no menu.
//
// Permission UX:
//   - We hide actions the caller can't perform (caller_role passed in).
//     The server still enforces; this just keeps the UI honest.

import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Exit } from "effect"
import { useState, type FormEvent } from "react"
import { motion } from "motion/react"
import {
  Check,
  Crown,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound
} from "lucide-react"
import {
  addMemberAtom,
  memberKey,
  projectKey,
  removeMemberAtom,
  updateMemberAtom
} from "@/atoms/projects"
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
import { Badge, badgeVariants, type BadgeTone } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { MemberAvatar } from "@/components/MemberAvatar"
import { m } from "@/paraglide/messages"
import type { AssignableRole, Member, Role } from "@projectproject/shared"

const ROLE_META: Record<
  Role,
  { label: () => string; icon: typeof Crown; tone: BadgeTone }
> = {
  owner: { label: () => m.members_role_owner(), icon: Crown, tone: "amber" },
  admin: {
    label: () => m.members_role_admin(),
    icon: ShieldCheck,
    tone: "blue"
  },
  member: {
    label: () => m.members_role_member(),
    icon: UserRound,
    tone: "muted"
  }
}
const ASSIGNABLE_ROLES = [
  "admin",
  "member"
] satisfies ReadonlyArray<AssignableRole>

export function MembersSection({
  orgSlug,
  slug,
  members,
  callerRole,
  callerId
}: {
  orgSlug: string
  slug: string
  members: ReadonlyArray<Member>
  callerRole: Role
  callerId: string
}) {
  const canManage = callerRole === "owner" || callerRole === "admin"
  const [adding, setAdding] = useState(false)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          {m.members_section_title()}
        </h2>
        <p className="text-xs text-muted-foreground">
          {m.members_section_subtitle()}
        </p>
      </div>

      {canManage && (
        <AddMemberRow orgSlug={orgSlug} slug={slug} onFocusChange={setAdding} />
      )}

      {/* Same intent-driven dim used elsewhere — when the user is composing
          a new member, the existing list quiets down to pull focus to the
          add row. Pure visual hint, clicks below stay enabled. */}
      <motion.ul
        animate={{ opacity: adding ? 0.35 : 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="divide-y divide-border rounded-xl border border-border bg-background"
      >
        {members.map((member) => (
          <li key={member.id}>
            <MemberRow
              orgSlug={orgSlug}
              slug={slug}
              member={member}
              callerRole={callerRole}
              callerId={callerId}
            />
          </li>
        ))}
      </motion.ul>
    </section>
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
  const pKey = projectKey(orgSlug, slug)
  const add = useAtomSet(addMemberAtom(pKey), { mode: "promiseExit" })
  const addState = useAtomValue(addMemberAtom(pKey))
  const submitting = addState.waiting
  const error = Result.isFailure(addState)
    ? m.members_add_error_fallback()
    : null
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<AssignableRole>("member")
  const trimmed = email.trim()

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    const exit = await add({ email: trimmed, role })
    if (Exit.isSuccess(exit)) {
      setEmail("")
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
          onChange={(e) => setEmail(e.target.value)}
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
      </InputGroup>
    </form>
  )
}

function RoleSelect({
  value,
  onChange
}: {
  value: AssignableRole
  onChange: (r: AssignableRole) => void
}) {
  const meta = ROLE_META[value]
  const Icon = meta.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.members_role_select_aria_label({
              role: meta.label()
            })}
            className={cn(
              badgeVariants({ tone: meta.tone, size: "sm" }),
              "cursor-pointer hover:bg-accent"
            )}
          >
            <Icon strokeWidth={1.75} />
            {meta.label()}
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-32">
        {ASSIGNABLE_ROLES.map((r) => {
          const roleMeta = ROLE_META[r]
          const RIcon = roleMeta.icon
          return (
            <DropdownMenuItem
              key={r}
              onSelect={() => onChange(r)}
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
  callerRole,
  callerId
}: {
  orgSlug: string
  slug: string
  member: Member
  callerRole: Role
  callerId: string
}) {
  const meta = ROLE_META[member.role]
  const Icon = meta.icon
  const isSelf = member.id === callerId
  // Display: name (primary), then `@username` if set, fall back to email.
  // Email shows as the secondary identifier — useful for "remove bob@..".
  return (
    <div className="flex items-center gap-3 pl-3 pr-3 py-2.5">
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
      </div>
      <Badge tone={meta.tone} size="sm">
        <Icon strokeWidth={1.75} />
        {meta.label()}
      </Badge>
      <MemberMenu
        orgSlug={orgSlug}
        slug={slug}
        member={member}
        callerRole={callerRole}
      />
    </div>
  )
}

function MemberMenu({
  orgSlug,
  slug,
  member,
  callerRole
}: {
  orgSlug: string
  slug: string
  member: Member
  callerRole: Role
}) {
  const mKey = memberKey(orgSlug, slug, member.id)
  const update = useAtomSet(updateMemberAtom(mKey))
  const remove = useAtomSet(removeMemberAtom(mKey), { mode: "promiseExit" })
  const removeState = useAtomValue(removeMemberAtom(mKey))
  const removing = removeState.waiting
  const [confirming, setConfirming] = useState(false)

  // Only owner can change roles. Admins can remove non-admin members.
  // Owner row has no actionable menu — ownership transfer isn't modeled.
  const canChangeRole = callerRole === "owner" && member.role !== "owner"
  const canRemove =
    member.role !== "owner" &&
    (callerRole === "owner" ||
      (callerRole === "admin" && member.role !== "admin"))

  if (!canChangeRole && !canRemove) return <span className="size-8 shrink-0" />

  async function onRemove() {
    await remove()
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
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-52">
        {confirming ? (
          <div className="flex flex-col gap-2 p-1">
            <p className="px-2 pt-1 text-xs text-muted-foreground">
              {m.members_remove_confirm_prompt({ name: member.name })}
            </p>
            <div className="flex gap-1 px-1 pb-1">
              <button
                type="button"
                disabled={removing}
                onClick={() => void onRemove()}
                className="flex-1 rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {removing
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
            {canChangeRole && (
              <>
                {ASSIGNABLE_ROLES.filter((r) => r !== member.role).map((r) => {
                  const meta = ROLE_META[r]
                  const RIcon = meta.icon
                  const makeLabel =
                    r === "admin"
                      ? m.members_make_admin()
                      : m.members_make_member()
                  return (
                    <DropdownMenuItem
                      key={r}
                      onSelect={() => update({ role: r })}
                      className="cursor-pointer"
                    >
                      <RIcon className="size-4" strokeWidth={1.75} />
                      {makeLabel}
                    </DropdownMenuItem>
                  )
                })}
              </>
            )}
            {canChangeRole && canRemove && <DropdownMenuSeparator />}
            {canRemove && (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  setConfirming(true)
                }}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" strokeWidth={1.75} />
                {m.members_remove_button()}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
