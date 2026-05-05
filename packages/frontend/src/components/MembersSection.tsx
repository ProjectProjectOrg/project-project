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

import { useAtomSet } from "@effect-atom/atom-react"
import { type FormEvent, useState } from "react"
import { motion } from "framer-motion"
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
import { MemberAvatar } from "@/components/MemberAvatar"
import { cn } from "@/lib/utils"
import type { AssignableRole, Member, Role } from "@projectproject/shared"

const ROLE_META: Record<
  Role,
  { label: string; icon: typeof Crown; tint: string }
> = {
  owner: {
    label: "Owner",
    icon: Crown,
    tint: "bg-amber-500/10 text-amber-700 dark:text-amber-400"
  },
  admin: {
    label: "Admin",
    icon: ShieldCheck,
    tint: "bg-blue-500/10 text-blue-700 dark:text-blue-400"
  },
  member: {
    label: "Member",
    icon: UserRound,
    tint: "bg-muted text-muted-foreground"
  }
}

export function MembersSection({
  slug,
  members,
  callerRole,
  callerId
}: {
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
        <h2 className="text-lg font-semibold tracking-tight">Members</h2>
        <p className="text-xs text-muted-foreground">
          DB-backed; mirrored to frontmatter as usernames.
        </p>
      </div>

      {canManage && <AddMemberRow slug={slug} onFocusChange={setAdding} />}

      {
        /* Same intent-driven dim used elsewhere — when the user is composing
          a new member, the existing list quiets down to pull focus to the
          add row. Pure visual hint, clicks below stay enabled. */
      }
      <motion.ul
        animate={{ opacity: adding ? 0.35 : 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="divide-y divide-border rounded-xl border border-border bg-background"
      >
        {members.map((m) => (
          <li key={m.id}>
            <MemberRow
              slug={slug}
              member={m}
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
  slug,
  onFocusChange
}: {
  slug: string
  onFocusChange?: (focused: boolean) => void
}) {
  const add = useAtomSet(addMemberAtom)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<AssignableRole>("member")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = email.trim()

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await add({ slug, email: trimmed, role })
      setEmail("")
    } catch (err) {
      // The server returns NotFound for both "no project" and "no user with
      // that email" — phrase generically since the project's already loaded.
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't add member — make sure they've signed in at least once."
      )
    } finally {
      setSubmitting(false)
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
          placeholder="Email of an existing user…"
          aria-label="Email to add as member"
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
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent",
            meta.tint
          )}
          aria-label={`Role: ${meta.label}. Click to change.`}
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
          {meta.label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-32">
        {(["admin", "member"] as AssignableRole[]).map((r) => {
          const m = ROLE_META[r]
          const RIcon = m.icon
          return (
            <DropdownMenuItem
              key={r}
              onSelect={() => onChange(r)}
              className="cursor-pointer"
            >
              <RIcon className="size-4" strokeWidth={1.75} />
              {m.label}
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
  slug,
  member,
  callerRole,
  callerId
}: {
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
            <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              you
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {member.username
            ? (
              <>
                <span className="font-mono">@{member.username}</span>
                <span className="mx-1.5">·</span>
              </>
            )
            : null}
          {member.email}
        </div>
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs",
          meta.tint
        )}
      >
        <Icon className="size-3.5" strokeWidth={1.75} />
        {meta.label}
      </span>
      <MemberMenu slug={slug} member={member} callerRole={callerRole} />
    </div>
  )
}

function MemberMenu({
  slug,
  member,
  callerRole
}: {
  slug: string
  member: Member
  callerRole: Role
}) {
  const update = useAtomSet(updateMemberAtom)
  const remove = useAtomSet(removeMemberAtom)

  // Only owner can change roles. Admins can remove non-admin members.
  // Owner row has no actionable menu — ownership transfer isn't modeled.
  const canChangeRole = callerRole === "owner" && member.role !== "owner"
  const canRemove = member.role !== "owner"
    && (callerRole === "owner"
      || (callerRole === "admin" && member.role !== "admin"))

  if (!canChangeRole && !canRemove) return <span className="size-8 shrink-0" />

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Member actions"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none"
        >
          <MoreHorizontal className="size-4" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-44">
        {canChangeRole && (
          <>
            {(["admin", "member"] as AssignableRole[])
              .filter((r) => r !== member.role)
              .map((r) => {
                const m = ROLE_META[r]
                const RIcon = m.icon
                return (
                  <DropdownMenuItem
                    key={r}
                    onSelect={() =>
                      update({ slug, userId: member.id, role: r })}
                    className="cursor-pointer"
                  >
                    <RIcon className="size-4" strokeWidth={1.75} />
                    Make {m.label.toLowerCase()}
                  </DropdownMenuItem>
                )
              })}
          </>
        )}
        {canChangeRole && canRemove && <DropdownMenuSeparator />}
        {canRemove && (
          <DropdownMenuItem
            onSelect={() => remove({ slug, userId: member.id })}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            Remove
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
