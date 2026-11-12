import type { Ticket, TicketId } from "@pp/shared"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import { PRIORITY_META } from "@/features/tickets/lib/priorityMeta"
import { resolveType } from "@/features/tickets/lib/ticketTypes"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

const SHOWN_IDS = 3

const cardClassName =
  "flex w-88 items-center gap-2.5 rounded-lg border border-border bg-popover px-3 py-2.5 text-body text-popover-foreground"

export function RowDragPreview({
  ticket,
  ids
}: Readonly<{
  ticket: Pick<Ticket, "id" | "type" | "title" | "priority">
  ids: ReadonlyArray<TicketId>
}>) {
  if (ids.length > 1) return <StackPreview ids={ids} />
  return <TicketPreview ticket={ticket} />
}

function TicketPreview({
  ticket
}: Readonly<{ ticket: Pick<Ticket, "id" | "type" | "title" | "priority"> }>) {
  const { orgSlug, slug } = useProjectRoute()
  const type = resolveType(useTicketTypes(orgSlug, slug), ticket.type)
  const priority = PRIORITY_META[ticket.priority]
  const PriorityIcon = priority.icon
  return (
    <div className={cn(cardClassName, "shadow-md")}>
      <PriorityIcon
        aria-hidden
        strokeWidth={1.75}
        className={cn("size-4 shrink-0", priority.className)}
      />
      <TypeGlyph type={type} />
      <span className="shrink-0 font-mono text-caption text-muted-foreground">
        {ticket.id}
      </span>
      <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
    </div>
  )
}

function StackPreview({ ids }: Readonly<{ ids: ReadonlyArray<TicketId> }>) {
  const shown = new Intl.ListFormat(getLocale(), {
    style: "short",
    type: "unit"
  }).format(ids.slice(0, SHOWN_IDS))
  const more = ids.length - SHOWN_IDS
  return (
    <div className="relative pb-2">
      <div
        aria-hidden
        className={cn(
          cardClassName,
          "absolute inset-x-3 top-2 bottom-0 w-auto"
        )}
      />
      <div
        aria-hidden
        className={cn(
          cardClassName,
          "absolute inset-x-1.5 top-1 bottom-1 w-auto"
        )}
      />
      <div className={cn(cardClassName, "relative shadow-md")}>
        <span className="shrink-0">
          {m.tickets_drag_count({ count: ids.length })}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-caption text-muted-foreground">
          {shown}
        </span>
        {more > 0 && (
          <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
            {m.tickets_drag_more({ count: more })}
          </span>
        )}
      </div>
    </div>
  )
}
