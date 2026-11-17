import { useAtomValue } from "@effect/atom-react"
import { listEditBetween, type Member, type TicketId } from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { Hitbox } from "@pp/ui/hitbox"
import { UserCheck, UserMinus, UserRound } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { AvatarStack, MemberAvatar } from "@pp/ui/member-avatar"
import { ShortcutTooltip } from "@pp/ui/tooltip"
import * as Match from "effect/Match"
import type { ReactNode } from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
import { toggleAssignee } from "@/features/tickets/lib/assignees"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { appHotkeys } from "@/lib/appHotkeys"
import { keyLabels } from "@/lib/keyLabels"
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
    // Like the row's: the empty face waits for the card's hover, focus or
    // open menu.
    return (
      <>
        {empty && (
          <span className="grid size-5 place-items-center rounded-full text-muted-foreground opacity-0 shadow-[inset_0_0_0_1px_var(--border)] transition-[opacity,color,background-color] duration-150 group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 group-has-[[data-popup-open]]/card:opacity-100 hitbox-hover:bg-hover hitbox-hover:text-foreground">
            <UserRound className="size-3" strokeWidth={1.75} />
          </span>
        )}
        <Avatars resolved={resolved} size={20} />
      </>
    )
  }
  // In a row the empty face waits for the row's hover (or focus, or its
  // open menu), so unassigned rows don't fill the column with placeholders.
  return (
    <span className="inline-flex items-center text-muted-foreground transition-colors hitbox-hover:text-foreground">
      {empty && (
        <span className="grid size-5 shrink-0 place-items-center rounded-full opacity-0 shadow-[inset_0_0_0_1px_var(--border)] transition-opacity duration-150 group-hover/reveal:opacity-100 group-has-[:focus-visible]/reveal:opacity-100 group-has-[[data-popup-open]]/reveal:opacity-100">
          <UserRound className="size-3" strokeWidth={1.75} />
        </span>
      )}
      <Avatars resolved={resolved} size={20} />
    </span>
  )
}

function Trigger({
  variant,
  empty,
  label,
  className,
  children
}: {
  variant: AssigneeVariant
  empty: boolean
  label: string
  className?: string
  children: ReactNode
}) {
  if (variant === "chip") {
    return (
      <ShortcutTooltip
        hotkey={appHotkeys["tickets.assign"]}
        keyLabels={keyLabels()}
      >
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              tone={empty ? "muted" : "strong"}
              aria-label={label}
            >
              {children}
            </Button>
          }
        />
      </ShortcutTooltip>
    )
  }
  return (
    <ShortcutTooltip
      hotkey={appHotkeys["tickets.assign"]}
      keyLabels={keyLabels()}
    >
      <DropdownMenuTrigger
        render={
          <Hitbox
            mode="inline"
            margin="2"
            onClick={(e) => e.stopPropagation()}
            aria-label={label}
            // A 24px target around the 20px face in rows.
            className={cn("min-h-6 min-w-6 justify-center", className)}
          >
            {children}
          </Hitbox>
        }
      />
    </ShortcutTooltip>
  )
}

export function AssignMeItem({
  assignees,
  members,
  onChange
}: Readonly<{
  assignees: ReadonlyArray<string>
  members: ReadonlyArray<Member>
  onChange: (assignees: ReadonlyArray<string>) => void
}>) {
  const viewerId = useAtomValue(currentUserId)
  if (
    viewerId === undefined ||
    !members.some((member) => member.id === viewerId)
  ) {
    return null
  }
  const assigned = assignees.includes(viewerId)
  const label = assigned
    ? m.tickets_command_unassign_me()
    : m.tickets_command_assign_me()
  const Icon = assigned ? UserMinus : UserCheck
  return (
    <>
      <DropdownMenuItem
        label={label}
        onClick={() => onChange(toggleAssignee(assignees, viewerId))}
        className="cursor-pointer"
      >
        <Icon className="size-4" strokeWidth={1.75} />
        {label}
        <DropdownMenuShortcut
          keys={appHotkeys["tickets.assign-me"].defaultHotkey}
          keyLabels={keyLabels()}
        />
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  )
}

export function AssigneeSelect({
  value,
  onChange,
  onClear,
  members,
  variant = "row",
  className
}: Readonly<{
  value: ReadonlyArray<string>
  onChange: (assignees: ReadonlyArray<string>) => void
  onClear?: () => void
  members: ReadonlyArray<Member>
  variant?: AssigneeVariant
  className?: string
}>) {
  const resolved = resolveAssignees(value, members)
  const toggle = (memberId: string) => onChange(toggleAssignee(value, memberId))
  const clear = () => {
    if (onClear !== undefined) onClear()
    else if (value.length > 0) onChange([])
  }

  const label =
    variant === "chip"
      ? m.tickets_assignees_aria_label({ label: chipLabel(resolved) })
      : rowLabel(resolved)

  return (
    <DropdownMenu filterable>
      <Trigger
        variant={variant}
        empty={value.length === 0}
        label={label}
        className={className}
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
          <AssignMeItem
            assignees={value}
            members={members}
            onChange={onChange}
          />
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
                <div className="truncate text-body">{member.name}</div>
                {member.username && (
                  <div className="truncate font-mono text-micro text-muted-foreground">
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
  onPatch: (patch: TicketEdit) => void
  variant?: AssigneeVariant
  className?: string
}) {
  return (
    <AssigneeSelect
      value={ticket.assignees}
      onChange={(assignees) =>
        onPatch({ assignees: listEditBetween(ticket.assignees, assignees) })
      }
      onClear={() => onPatch({ assignees: [] })}
      members={members}
      variant={variant}
      className={className}
    />
  )
}

export function AssigneePicker(props: {
  ticket: { id: TicketId; assignees: ReadonlyArray<string> }
  members: ReadonlyArray<Member>
  onPatch: (patch: TicketEdit) => void
}) {
  return <AssigneeField {...props} variant="chip" />
}
