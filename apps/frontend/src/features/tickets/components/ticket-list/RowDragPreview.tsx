import type { Ticket } from "@pp/shared"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import { PRIORITY_META } from "@/features/tickets/lib/priorityMeta"
import { resolveType } from "@/features/tickets/lib/ticketTypes"
import { cn } from "@/lib/utils"

export function RowDragPreview({
  ticket
}: Readonly<{ ticket: Pick<Ticket, "id" | "type" | "title" | "priority"> }>) {
  const { orgSlug, slug } = useProjectRoute()
  const type = resolveType(useTicketTypes(orgSlug, slug), ticket.type)
  const priority = PRIORITY_META[ticket.priority]
  const PriorityIcon = priority.icon
  return (
    <div className="flex w-88 items-center gap-2.5 rounded-lg border border-border bg-popover px-3 py-2.5 text-body text-popover-foreground shadow-md">
      <PriorityIcon
        aria-hidden
        strokeWidth={1.75}
        className={cn("size-4 shrink-0", priority.className)}
      />
      <TypeGlyph type={type} />
      <span className="shrink-0 font-mono text-caption text-muted-foreground">
        {ticket.id}
      </span>
      <span className="truncate">{ticket.title}</span>
    </div>
  )
}
