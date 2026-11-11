import type { TicketId, TicketPriority } from "@pp/shared"
import type { ReactElement } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  PRIORITY_LABELS,
  PRIORITY_META,
  PRIORITY_ORDER
} from "@/features/tickets/lib/priorityMeta"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export const priorityOptions = () =>
  PRIORITY_ORDER.map((p) => {
    const pMeta = PRIORITY_META[p]
    const PIcon = pMeta.icon
    return {
      value: p,
      textValue: PRIORITY_LABELS[p](),
      closeOnClick: true,
      label: (
        <>
          <PIcon className={cn("size-4", pMeta.className)} strokeWidth={1.75} />
          {PRIORITY_LABELS[p]()}
        </>
      )
    }
  })

export function PriorityMenu({
  value,
  onChange,
  trigger,
  disabled = false,
  className = "w-44"
}: Readonly<{
  value: TicketPriority
  onChange: (priority: TicketPriority) => void
  trigger: ReactElement
  disabled?: boolean
  className?: string
}>) {
  return (
    <DropdownMenu disabled={disabled}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className={className}
        finalFocus={false}
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (next !== value) onChange(next)
          }}
          items={priorityOptions()}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PrioritySelect({
  value,
  onChange,
  stopPropagation,
  showLabel = false
}: {
  value: TicketPriority
  onChange: (priority: TicketPriority) => void
  stopPropagation?: boolean
  showLabel?: boolean
}) {
  const meta = PRIORITY_META[value]
  const Icon = meta.icon
  const priorityLabel = PRIORITY_LABELS[value]()
  return (
    <PriorityMenu
      value={value}
      onChange={onChange}
      trigger={
        <Button
          type="button"
          variant="chip"
          size={showLabel ? undefined : "icon-sm"}
          onClick={(e) => stopPropagation && e.stopPropagation()}
          aria-label={m.tickets_priority_aria_label({ label: priorityLabel })}
          title={priorityLabel}
          className={meta.className}
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
          {showLabel && (
            <span className="text-foreground">{priorityLabel}</span>
          )}
        </Button>
      }
    />
  )
}

export function PriorityButton({
  ticket,
  stopPropagation,
  onPatch
}: {
  ticket: { id: TicketId; priority: TicketPriority }
  stopPropagation?: boolean
  onPatch: (patch: TicketEdit) => void
}) {
  return (
    <PrioritySelect
      value={ticket.priority}
      stopPropagation={stopPropagation}
      onChange={(priority) => onPatch({ priority })}
    />
  )
}

export function PriorityBadgeTrigger({
  ticket,
  onPatch,
  className
}: {
  ticket: { id: TicketId; priority: TicketPriority }
  onPatch: (patch: TicketEdit) => void
  className?: string
}) {
  const meta = PRIORITY_META[ticket.priority]
  const Icon = meta.icon
  const priorityLabel = PRIORITY_LABELS[ticket.priority]()
  return (
    <PriorityMenu
      value={ticket.priority}
      onChange={(priority) => onPatch({ priority })}
      className="w-40"
      trigger={
        <Button
          type="button"
          variant="chip"
          onClick={(e) => e.stopPropagation()}
          aria-label={m.tickets_priority_aria_label({ label: priorityLabel })}
          className={className}
        >
          <Icon className={cn("size-3.5", meta.className)} strokeWidth={1.75} />
          <span>{priorityLabel}</span>
        </Button>
      }
    />
  )
}
