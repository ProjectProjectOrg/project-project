import { hasSubTickets, type Ticket } from "@pp/shared"
import { Chip } from "@pp/ui/chip"
import { Flag, Link2, OctagonMinus, SquareEqual } from "@pp/ui/icons"
import type { IconComponent } from "@pp/ui/lib/icon"
import { cn } from "@pp/ui/lib/utils"
import { ProgressCount } from "@pp/ui/progress-count"

import { SquareOctagonMinus } from "@/features/tickets/components/ticket-marks/blockingIcon"
import { useDisplayProperties } from "@/features/tickets/hooks/useDisplayProperties"
import type { RelationPreviewKind } from "@/features/tickets/lib/relationGroups"
import type { TicketDetailSearch } from "@/features/tickets/lib/ticketSearch"
import { m } from "@/paraglide/messages"

import {
  RELATION_PREVIEW_LABELS,
  TicketPreview,
  TicketPreviewTrigger
} from "./TicketPreview"

type RelationCounts = Pick<
  Ticket,
  | "id"
  | "openBlockerCount"
  | "openBlockingCount"
  | "relatedCount"
  | "duplicateCount"
>

const warningTone =
  "text-state-warning hover:text-state-warning data-[popup-open]:text-state-warning data-[card-open]:text-state-warning"

const RELATION_CHIPS = [
  {
    relation: "blockedBy",
    field: "openBlockerCount",
    icon: OctagonMinus,
    warning: true
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
    warning?: true
  }>
>

export function RelationChips({
  ticket,
  className
}: Readonly<{ ticket: RelationCounts; className?: string }>) {
  const { shows } = useDisplayProperties()
  return RELATION_CHIPS.map((chip) => {
    const { relation, field, icon: Icon } = chip
    const n = ticket[field] ?? 0
    if (n === 0 || !shows(relation)) return null
    return (
      <TicketPreviewTrigger
        key={relation}
        preview={TicketPreview.relations({ id: ticket.id, relation })}
        aria-label={RELATION_PREVIEW_LABELS[relation]()}
        render={
          <Chip
            interaction="hover"
            shape="count"
            className={cn(
              "relative z-20",
              "warning" in chip && warningTone,
              className
            )}
          />
        }
      >
        <Icon className="shrink-0" strokeWidth={1.75} />
        {n > 1 && <span className="tabular-nums">{n}</span>}
      </TicketPreviewTrigger>
    )
  })
}

export function SubTicketsChip({
  ticket,
  current,
  search,
  className
}: Readonly<{
  ticket: Pick<Ticket, "id" | "subTicketCount" | "subTicketDoneCount">
  current?: Ticket["id"]
  search?: TicketDetailSearch
  className?: string
}>) {
  if (!hasSubTickets(ticket)) return null
  const done = ticket.subTicketDoneCount ?? 0
  const total = ticket.subTicketCount ?? 0
  const label = m.tickets_sub_tickets_progress({ done, total })
  return (
    <TicketPreviewTrigger
      preview={TicketPreview.subTickets({
        id: ticket.id,
        label,
        current,
        search
      })}
      aria-label={label}
      render={
        <Chip
          interaction="hover"
          shape="count"
          className={cn("relative z-20", className)}
        />
      }
    >
      <ProgressCount done={done} total={total} className="text-inherit" />
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
      preview={TicketPreview.flag({ id: ticket.id, flag: ticket.flag })}
      aria-label={m.tickets_flag_indicator_aria_label()}
      render={
        <Chip
          interaction="hover"
          shape="icon"
          className={cn(
            "relative z-20 text-state-danger hover:text-state-danger data-[card-open]:text-state-danger data-[popup-open]:text-state-danger",
            className
          )}
        />
      }
    >
      <Flag className="size-3 shrink-0" strokeWidth={1.75} />
    </TicketPreviewTrigger>
  )
}
