import { useAtomSet } from "@effect-atom/atom-react"
import { Check, UserRound } from "lucide-react"
import { Hitbox } from "@/components/ui/hitbox"
import { AvatarStack, MemberAvatar } from "@/components/MemberAvatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  ticketKey,
  updateTicketAtom,
  type TicketConflict
} from "@/atoms/tickets"
import type { Member, TicketId } from "@projectproject/shared"

function AssigneeMenuContent({
  orgSlug,
  slug,
  ticket,
  members,
  onConflict
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; version: string; assignees: ReadonlyArray<string> }
  members: ReadonlyArray<Member>
  onConflict?: (info: TicketConflict) => void
}) {
  const update = useAtomSet(
    updateTicketAtom(ticketKey(orgSlug, slug, ticket.id)),
    { mode: "promise" }
  )
  const assignees = ticket.assignees
  const setAssignees = async (next: ReadonlyArray<string>) => {
    const result = await update({
      baseVersion: ticket.version,
      assignees: next
    })
    if (result._tag === "Conflict") onConflict?.(result.conflict)
  }
  const toggle = (id: string) => {
    void setAssignees(
      assignees.includes(id)
        ? assignees.filter((a) => a !== id)
        : [...assignees, id]
    )
  }
  return (
    <DropdownMenuContent
      align="start"
      sideOffset={6}
      className="w-56"
      onClick={(e) => e.stopPropagation()}
      onCloseAutoFocus={(e) => e.preventDefault()}
    >
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault()
          if (assignees.length > 0) void setAssignees([])
        }}
        className="cursor-pointer"
      >
        <UserRound className="size-4" strokeWidth={1.75} />
        Unassigned
        {assignees.length === 0 && (
          <Check className="ml-auto size-3.5 text-muted-foreground" />
        )}
      </DropdownMenuItem>
      {members.length > 0 && <div className="my-1 h-px bg-border" />}
      {members.map((m) => {
        const selected = assignees.includes(m.id)
        return (
          <DropdownMenuItem
            key={m.id}
            onSelect={(e) => {
              e.preventDefault()
              toggle(m.id)
            }}
            className="cursor-pointer"
          >
            <MemberAvatar member={m} size={20} />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm">{m.name}</div>
              {m.username && (
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  @{m.username}
                </div>
              )}
            </div>
            {selected && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        )
      })}
    </DropdownMenuContent>
  )
}

export function AssigneePicker({
  orgSlug,
  slug,
  ticket,
  members,
  onConflict
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; version: string; assignees: ReadonlyArray<string> }
  members: ReadonlyArray<Member>
  onConflict?: (info: TicketConflict) => void
}) {
  const resolved = ticket.assignees
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is Member => !!m)
  const label =
    resolved.length === 0
      ? "Unassigned"
      : resolved.length === 1
        ? resolved[0].name
        : `${resolved.length} people`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Assignees: ${label}. Click to change.`}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
        >
          {resolved.length === 0 ? (
            <UserRound className="size-3.5" strokeWidth={1.75} />
          ) : resolved.length === 1 ? (
            <MemberAvatar member={resolved[0]} size={18} />
          ) : (
            <AvatarStack subjects={resolved} size={18} max={3} />
          )}
          <span>{label}</span>
        </button>
      </DropdownMenuTrigger>
      <AssigneeMenuContent
        orgSlug={orgSlug}
        slug={slug}
        ticket={ticket}
        members={members}
        onConflict={onConflict}
      />
    </DropdownMenu>
  )
}

export function AssigneeRowTrigger({
  orgSlug,
  slug,
  ticket,
  members,
  className,
  onConflict
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; version: string; assignees: ReadonlyArray<string> }
  members: ReadonlyArray<Member>
  className?: string
  onConflict?: (info: TicketConflict) => void
}) {
  const resolved = ticket.assignees
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is Member => !!m)
  const label =
    resolved.length === 0
      ? "Unassigned. Click to assign."
      : resolved.length === 1
        ? `Assigned to ${resolved[0].name}. Click to change.`
        : `${resolved.length} people assigned. Click to change.`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => e.stopPropagation()}
          aria-label={label}
          className={className}
        >
          <span className="inline-flex items-center text-muted-foreground transition-colors group-hover/hitbox:text-foreground">
            {resolved.length === 0 ? (
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted">
                <UserRound className="size-3" strokeWidth={1.75} />
              </span>
            ) : resolved.length === 1 ? (
              <MemberAvatar member={resolved[0]} size={20} />
            ) : (
              <AvatarStack subjects={resolved} size={20} max={3} />
            )}
          </span>
        </Hitbox>
      </DropdownMenuTrigger>
      <AssigneeMenuContent
        orgSlug={orgSlug}
        slug={slug}
        ticket={ticket}
        members={members}
        onConflict={onConflict}
      />
    </DropdownMenu>
  )
}
