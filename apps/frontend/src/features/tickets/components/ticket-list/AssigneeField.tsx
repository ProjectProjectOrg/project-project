import { useAtomValue } from "@effect/atom-react"
import { listEditBetween, type Member, type TicketId } from "@pp/shared"
import { Button, buttonClassName } from "@pp/ui/button"
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
import { UserCheck, UserMinus, UserRound } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { AvatarStack, MemberAvatar } from "@pp/ui/member-avatar"
import { PickerFieldValue } from "@pp/ui/picker-field"
import { Reveal } from "@pp/ui/reveal"
import { ShortcutTooltip } from "@pp/ui/tooltip"
import * as Match from "effect/Match"
import type { ComponentProps } from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
import { toggleAssignee } from "@/features/tickets/lib/assignees"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { appHotkeys, hotkeyKeys } from "@/lib/appHotkeys"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

type AssigneeVariant = "row" | "card" | "chip"

export function resolveAssignees(
  assignees: ReadonlyArray<string>,
  members: ReadonlyArray<Member>
) {
  return assignees
    .map((id) => members.find((member) => member.id === id))
    .filter((member): member is Member => !!member)
}

export function rowLabel(resolved: ReadonlyArray<Member>) {
  if (resolved.length === 0) {
    return m.tickets_assignees_row_unassigned_aria_label()
  }
  return m.tickets_assignees_row_aria_label({
    count: resolved.length,
    name: resolved[0].name
  })
}

function chipLabel(resolved: ReadonlyArray<Member>) {
  return Match.value(resolved.length).pipe(
    Match.when(0, () => m.tickets_assignee_unassigned()),
    Match.when(1, () => resolved[0].name),
    Match.orElse(() => m.tickets_assignee_count({ count: resolved.length }))
  )
}

export function Avatars({
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

function Trigger({
  variant,
  empty,
  label,
  value,
  className,
  resolved
}: {
  variant: AssigneeVariant
  empty: boolean
  label: string
  // The assignees' names, shown with the shortcut like status and priority.
  value: string
  className?: string
  resolved: ReadonlyArray<Member>
}) {
  if (variant === "chip") {
    return (
      <ShortcutTooltip
        hotkey={appHotkeys["tickets.assign"]}
        label={value}
        keyLabels={keyLabels()}
      >
        <DropdownMenuTrigger
          render={
            <PickerFieldValue
              empty={empty}
              label={chipLabel(resolved)}
              iconKey={resolved.map((member) => member.id).join(",")}
              icon={
                resolved.length > 0 ? (
                  <Avatars resolved={resolved} size={18} />
                ) : (
                  <UserRound className="size-3.5" strokeWidth={1.75} />
                )
              }
              aria-label={label}
            />
          }
        />
      </ShortcutTooltip>
    )
  }
  // Unassigned, the outlined button waits for the row's (or card's) hover,
  // focus or open menu, so empty tickets don't fill the column with
  // placeholders.
  const trigger = (
    <ShortcutTooltip
      hotkey={appHotkeys["tickets.assign"]}
      label={value}
      keyLabels={keyLabels()}
    >
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            {...rowButton(empty)}
            onClick={(e) => e.stopPropagation()}
            aria-label={label}
            className={cn(rowButtonClass, className)}
          >
            <RowFace resolved={resolved} />
          </Button>
        }
      />
    </ShortcutTooltip>
  )
  return empty ? <Reveal>{trigger}</Reveal> : trigger
}

const rowButton = (empty: boolean) =>
  ({
    variant: empty ? "outline" : "ghost",
    tone: empty ? "muted" : "strong",
    size: "square-6"
  }) as const

// Square around one face, as wide as a stack of them.
const rowButtonClass = "w-auto min-w-6"

function RowFace({ resolved }: Readonly<{ resolved: ReadonlyArray<Member> }>) {
  return (
    <>
      {resolved.length === 0 && (
        <UserRound className="size-3" strokeWidth={1.75} />
      )}
      <Avatars resolved={resolved} size={20} />
    </>
  )
}

const emptyRowButtonClass = buttonClassName({
  ...rowButton(true),
  className: rowButtonClass
})

const filledRowButtonClass = buttonClassName({
  ...rowButton(false),
  className: rowButtonClass
})

export const assigneeNames = (resolved: ReadonlyArray<Member>) =>
  resolved.length === 0
    ? m.tickets_assignee_unassigned()
    : resolved.map((member) => member.name).join(", ")

export function AssigneeRowButton({
  assignees,
  members,
  ...props
}: Readonly<{
  assignees: ReadonlyArray<string>
  members: ReadonlyArray<Member>
}> &
  Omit<ComponentProps<"button">, "children">) {
  const resolved = resolveAssignees(assignees, members)
  const empty = assignees.length === 0
  const button = (
    <button
      type="button"
      aria-haspopup="menu"
      aria-label={rowLabel(resolved)}
      data-tooltip={assigneeNames(resolved)}
      data-tooltip-keys={hotkeyKeys("tickets.assign")}
      className={empty ? emptyRowButtonClass : filledRowButtonClass}
      {...props}
    >
      <RowFace resolved={resolved} />
    </button>
  )
  return empty ? <Reveal>{button}</Reveal> : button
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
        value={assigneeNames(resolved)}
        className={className}
        resolved={resolved}
      />
      <AssigneeMenuContent
        value={value}
        members={members}
        onChange={onChange}
        onClear={onClear}
      />
    </DropdownMenu>
  )
}

export function AssigneeMenuContent({
  anchor,
  finalFocus = false,
  ...options
}: ComponentProps<typeof AssigneeOptions> &
  Pick<ComponentProps<typeof DropdownMenuContent>, "anchor" | "finalFocus">) {
  return (
    <DropdownMenuContent
      anchor={anchor}
      align="start"
      sideOffset={6}
      className="w-56"
      finalFocus={finalFocus}
      onClick={(e) => e.stopPropagation()}
    >
      <AssigneeOptions {...options} />
    </DropdownMenuContent>
  )
}

function AssigneeOptions({
  value,
  members,
  onChange,
  onClear
}: Pick<
  ComponentProps<typeof AssigneeSelect>,
  "value" | "members" | "onChange" | "onClear"
>) {
  const assigned = new Set(value)
  const toggle = (memberId: string) => onChange(toggleAssignee(value, memberId))
  const clear = () => {
    if (onClear !== undefined) onClear()
    else if (value.length > 0) onChange([])
  }
  return (
    <>
      <DropdownMenuInput
        placeholder={m.tickets_assignee_search_placeholder()}
        aria-label={m.tickets_assignee_search_placeholder()}
      />
      <DropdownMenuList>
        <AssignMeItem assignees={value} members={members} onChange={onChange} />
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
            checked={assigned.has(member.id)}
            onCheckedChange={() => toggle(member.id)}
          >
            <MemberAvatar member={member} size={20} />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-body">{member.name}</div>
              {member.username && (
                <div className="truncate text-micro text-muted-foreground tabular-nums">
                  @{member.username}
                </div>
              )}
            </div>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuList>
      <DropdownMenuEmpty>{m.tickets_assignee_search_empty()}</DropdownMenuEmpty>
    </>
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
