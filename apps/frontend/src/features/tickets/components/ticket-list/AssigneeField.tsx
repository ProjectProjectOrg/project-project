import type { Member, TicketId, UpdateTicketInput } from "@pp/shared"
import * as Match from "effect/Match"
import { UserRound } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuList,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Hitbox } from "@/components/ui/hitbox"
import {
  AvatarStack,
  MemberAvatar
} from "@/features/members/components/MemberAvatar"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type AssigneeVariant = "row" | "card" | "chip"

function resolveAssignees(
  assignees: ReadonlyArray<string>,
  members: ReadonlyArray<Member>
): ReadonlyArray<Member> {
  return assignees
    .map((id) => members.find((member) => member.id === id))
    .filter((member): member is Member => !!member)
}

function rowLabel(resolved: ReadonlyArray<Member>): string {
  if (resolved.length === 0) {
    return m.tickets_assignees_row_unassigned_aria_label()
  }
  return m.tickets_assignees_row_aria_label({
    count: resolved.length,
    name: resolved[0].name
  })
}

function chipLabel(resolved: ReadonlyArray<Member>): string {
  return Match.value(resolved.length).pipe(
    Match.when(0, () => m.tickets_assignee_unassigned()),
    Match.when(1, () => resolved[0].name),
    Match.orElse(() => m.tickets_assignee_count({ count: resolved.length }))
  )
}

function Avatars({
  resolved,
  size,
  className
}: {
  resolved: ReadonlyArray<Member>
  size: number
  className?: string
}) {
  if (resolved.length === 0) return null
  if (resolved.length === 1) {
    return (
      <MemberAvatar member={resolved[0]} size={size} className={className} />
    )
  }
  return (
    <AvatarStack
      subjects={resolved}
      size={size}
      max={3}
      className={className}
    />
  )
}

function TriggerVisual({
  variant,
  resolved
}: {
  variant: AssigneeVariant
  resolved: ReadonlyArray<Member>
}) {
  const empty = resolved.length === 0
  if (variant === "chip") {
    return (
      <>
        {empty && <UserRound className="size-3.5" strokeWidth={1.75} />}
        <Avatars resolved={resolved} size={18} />
        <span>{chipLabel(resolved)}</span>
      </>
    )
  }
  if (variant === "card") {
    return (
      <>
        {empty && (
          <span className="grid size-6 place-items-center rounded-full text-muted-foreground transition-colors group-hover/hitbox:bg-foreground/5 group-hover/hitbox:text-foreground">
            <UserRound className="size-4" strokeWidth={1.75} />
          </span>
        )}
        <Avatars resolved={resolved} size={20} />
      </>
    )
  }
  return (
    <span className="inline-flex items-center text-muted-foreground transition-colors group-hover/hitbox:text-foreground">
      {empty && (
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-foreground/15">
          <UserRound className="size-3" strokeWidth={1.75} />
        </span>
      )}
      <Avatars resolved={resolved} size={20} />
    </span>
  )
}

function Trigger({
  variant,
  label,
  className,
  children
}: {
  variant: AssigneeVariant
  label: string
  className?: string
  children: ReactNode
}) {
  if (variant === "chip") {
    return (
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="chip" aria-label={label}>
            {children}
          </Button>
        }
      />
    )
  }
  return (
    <DropdownMenuTrigger
      render={
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => e.stopPropagation()}
          aria-label={label}
          className={className}
        >
          {children}
        </Hitbox>
      }
    />
  )
}

export function AssigneeSelect({
  value,
  onChange,
  members,
  variant = "row",
  className
}: {
  value: ReadonlyArray<string>
  onChange: (assignees: ReadonlyArray<string>) => void
  members: ReadonlyArray<Member>
  variant?: AssigneeVariant
  className?: string
}) {
  const resolved = resolveAssignees(value, members)
  const toggle = (memberId: string) =>
    onChange(
      value.includes(memberId)
        ? value.filter((a) => a !== memberId)
        : [...value, memberId]
    )
  const clear = () => {
    if (value.length > 0) onChange([])
  }

  const label =
    variant === "chip"
      ? m.tickets_assignees_aria_label({ label: chipLabel(resolved) })
      : rowLabel(resolved)

  return (
    <DropdownMenu filterable>
      <Trigger
        variant={variant}
        label={label}
        className={cn(
          variant === "card" &&
            resolved.length === 0 &&
            "opacity-0 group-focus-within/reveal:opacity-100 group-hover/reveal:opacity-100 group-has-[[data-popup-open]]/reveal:opacity-100",
          className
        )}
      >
        <TriggerVisual variant={variant} resolved={resolved} />
      </Trigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-56"
        finalFocus={false}
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuInput
          placeholder={m.tickets_assignee_search_placeholder()}
          aria-label={m.tickets_assignee_search_placeholder()}
        />
        <DropdownMenuList>
          <DropdownMenuCheckboxItem
            label={m.tickets_assignee_unassigned()}
            checked={value.length === 0}
            onCheckedChange={clear}
          >
            <UserRound className="size-4" strokeWidth={1.75} />
            {m.tickets_assignee_unassigned()}
          </DropdownMenuCheckboxItem>
          {members.map((member) => (
            <DropdownMenuCheckboxItem
              key={member.id}
              label={
                member.username
                  ? `${member.name} ${member.username}`
                  : member.name
              }
              checked={value.includes(member.id)}
              onCheckedChange={() => toggle(member.id)}
            >
              <MemberAvatar member={member} size={20} />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm">{member.name}</div>
                {member.username && (
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    @{member.username}
                  </div>
                )}
              </div>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuList>
        <DropdownMenuEmpty>
          {m.tickets_assignee_search_empty()}
        </DropdownMenuEmpty>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AssigneeField({
  ticket,
  members,
  onPatch,
  variant = "row",
  className
}: {
  ticket: { id: TicketId; assignees: ReadonlyArray<string> }
  members: ReadonlyArray<Member>
  onPatch: (patch: UpdateTicketInput) => void
  variant?: AssigneeVariant
  className?: string
}) {
  return (
    <AssigneeSelect
      value={ticket.assignees}
      onChange={(assignees) => onPatch({ assignees })}
      members={members}
      variant={variant}
      className={className}
    />
  )
}

export function AssigneePicker(props: {
  ticket: { id: TicketId; assignees: ReadonlyArray<string> }
  members: ReadonlyArray<Member>
  onPatch: (patch: UpdateTicketInput) => void
}) {
  return <AssigneeField {...props} variant="chip" />
}
