import type { Ticket } from "@pp/shared"
import { ArrowRight } from "lucide-react"

import { PRIORITY_META } from "@/features/tickets/lib/priorityMeta"
import { TYPE_META } from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"

export function RowDragPreview({
  ticket,
  landing
}: Readonly<{
  ticket: Pick<Ticket, "id" | "type" | "title" | "priority">
  landing: string | null
}>) {
  const TypeIcon = TYPE_META[ticket.type].icon
  const priority = PRIORITY_META[ticket.priority]
  const PriorityIcon = priority.icon
  return (
    <div className="w-88 rounded-lg border border-border bg-popover px-3 py-2.5 text-body text-popover-foreground shadow-md">
      <div className="flex items-center gap-2.5">
        <PriorityIcon
          aria-hidden
          strokeWidth={1.75}
          className={cn("size-4 shrink-0", priority.className)}
        />
        <TypeIcon
          aria-hidden
          strokeWidth={1.75}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="shrink-0 font-mono text-caption text-muted-foreground">
          {ticket.id}
        </span>
        <span className="truncate">{ticket.title}</span>
      </div>
      {landing !== null && (
        <div className="mt-2 flex items-center gap-1.5 text-caption text-muted-foreground">
          <ArrowRight aria-hidden strokeWidth={1.75} className="size-3.5" />
          <span className="truncate">{landing}</span>
        </div>
      )}
    </div>
  )
}
