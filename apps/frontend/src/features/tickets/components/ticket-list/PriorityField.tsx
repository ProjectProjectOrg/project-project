import type { TicketId, TicketPriority, UpdateTicketInput } from "@pp/shared"

import { Button } from "@/components/ui/button"
import { Select, SelectTrigger } from "@/components/ui/select"
import {
  PRIORITY_LABELS,
  PRIORITY_META,
  PRIORITY_ORDER
} from "@/features/tickets/lib/priorityMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export const priorityOptions = () =>
  PRIORITY_ORDER.map((p) => {
    const pMeta = PRIORITY_META[p]
    const PIcon = pMeta.icon
    return {
      value: p,
      textValue: PRIORITY_LABELS[p](),
      label: (
        <>
          <PIcon className={cn("size-4", pMeta.className)} strokeWidth={1.75} />
          {PRIORITY_LABELS[p]()}
        </>
      )
    }
  })

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
    <Select
      items={priorityOptions()}
      value={value}
      onValueChange={(next) => {
        if (next !== value) onChange(next)
      }}
      contentProps={{ align: "start", className: "w-44" }}
    >
      <SelectTrigger
        render={
          <Button
            type="button"
            variant="chip"
            size={showLabel ? undefined : "icon-sm"}
            onClick={(e) => stopPropagation && e.stopPropagation()}
            aria-label={m.tickets_priority_aria_label({ label: priorityLabel })}
            title={priorityLabel}
            className={meta.className}
          />
        }
      >
        <Icon className="size-3.5" strokeWidth={1.75} />
        {showLabel && <span className="text-foreground">{priorityLabel}</span>}
      </SelectTrigger>
    </Select>
  )
}

export function PriorityButton({
  ticket,
  stopPropagation,
  onPatch
}: {
  ticket: { id: TicketId; priority: TicketPriority }
  stopPropagation?: boolean
  onPatch: (patch: UpdateTicketInput) => void
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
  onPatch: (patch: UpdateTicketInput) => void
  className?: string
}) {
  const meta = PRIORITY_META[ticket.priority]
  const Icon = meta.icon
  const priorityLabel = PRIORITY_LABELS[ticket.priority]()
  return (
    <Select
      items={priorityOptions()}
      value={ticket.priority}
      onValueChange={(priority) => {
        if (priority !== ticket.priority) onPatch({ priority })
      }}
      contentProps={{ align: "start", className: "w-40", finalFocus: false }}
    >
      <SelectTrigger
        render={
          <Button
            type="button"
            variant="chip"
            onClick={(e) => e.stopPropagation()}
            aria-label={m.tickets_priority_aria_label({ label: priorityLabel })}
            className={className}
          />
        }
      >
        <Icon className={cn("size-3.5", meta.className)} strokeWidth={1.75} />
        <span>{priorityLabel}</span>
      </SelectTrigger>
    </Select>
  )
}
