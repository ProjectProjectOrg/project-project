import { hasSubTickets, type Ticket } from "@pp/shared"
import { Flag, Link2, OctagonMinus, SquareEqual } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SubTicketCount } from "@/features/tickets/components/ticket-list/SubTicketProgress"
import { SquareOctagonMinus } from "@/features/tickets/components/ticket-marks/blockingIcon"
import type { RelationPreviewKind } from "@/features/tickets/lib/relationGroups"
import type { IconComponent } from "@/lib/icon"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { RELATION_PREVIEW_LABELS, TicketPreviewTrigger } from "./TicketPreview"

type RelationCounts = Pick<
  Ticket,
  | "id"
  | "openBlockerCount"
  | "openBlockingCount"
  | "relatedCount"
  | "duplicateCount"
>

const RELATION_CHIPS = [
  {
    relation: "blockedBy",
    field: "openBlockerCount",
    icon: OctagonMinus,
    tone: "text-state-warning hover:text-state-warning data-[popup-open]:text-state-warning"
  },
  {
    relation: "blocking",
    field: "openBlockingCount",
    icon: SquareOctagonMinus
  },
  { relation: "related", field: "relatedCount", icon: Link2 },
  { relation: "duplicates", field: "duplicateCount", icon: SquareEqual }
] satisfies ReadonlyArray<
  Readonly<{
    relation: RelationPreviewKind
    field: Exclude<keyof RelationCounts, "id">
    icon: IconComponent
    tone?: string
  }>
>

export function RelationChips({
  ticket,
  className
}: Readonly<{ ticket: RelationCounts; className?: string }>) {
  return RELATION_CHIPS.map((chip) => {
    const { relation, field, icon: Icon } = chip
    const n = ticket[field] ?? 0
    if (n === 0) return null
    return (
      <TicketPreviewTrigger
        key={relation}
        preview={{ kind: "relations", id: ticket.id, relation }}
        aria-label={RELATION_PREVIEW_LABELS[relation]()}
        render={
          <Button
            type="button"
            variant="ghost"
            size="compact"
            className={cn(
              "relative z-20",
              className,
              "tone" in chip && chip.tone
            )}
          />
        }
      >
        <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
        {n > 1 && <span className="tabular-nums">{n}</span>}
      </TicketPreviewTrigger>
    )
  })
}

export function SubTicketsChip({
  ticket,
  className
}: Readonly<{
  ticket: Pick<Ticket, "id" | "subTicketCount" | "subTicketDoneCount">
  className?: string
}>) {
  if (!hasSubTickets(ticket)) return null
  const done = ticket.subTicketDoneCount ?? 0
  const total = ticket.subTicketCount ?? 0
  const label = m.tickets_sub_tickets_progress({ done, total })
  return (
    <TicketPreviewTrigger
      preview={{ kind: "subTickets", id: ticket.id, label }}
      aria-label={label}
      render={
        <Button
          type="button"
          variant="ghost"
          size="compact"
          className={cn("relative z-20", className)}
        />
      }
    >
      <SubTicketCount done={done} total={total} className="text-inherit" />
    </TicketPreviewTrigger>
  )
}

export function FlagChip({
  ticket,
  className
}: Readonly<{ ticket: Pick<Ticket, "id" | "flag">; className?: string }>) {
  if (ticket.flag === null) return null
  return (
    <TicketPreviewTrigger
      preview={{ kind: "flag", id: ticket.id, flag: ticket.flag }}
      aria-label={m.tickets_flag_indicator_aria_label()}
      render={
        <Button
          type="button"
          variant="ghost"
          size="compact"
          className={cn(
            "relative z-20",
            className,
            "text-state-danger hover:text-state-danger data-[popup-open]:text-state-danger"
          )}
        />
      }
    >
      <Flag className="size-3.5 shrink-0" strokeWidth={1.75} />
    </TicketPreviewTrigger>
  )
}
