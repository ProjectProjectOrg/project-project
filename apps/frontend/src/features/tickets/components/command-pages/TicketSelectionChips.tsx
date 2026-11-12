import type { TicketId } from "@pp/shared"
import { X } from "lucide-react"

import type { SelectedTicket } from "@/features/command-menu/lib/commandMenu"
import { m } from "@/paraglide/messages"

const SHOWN = 3

export function TicketSelectionChips({
  tickets,
  onDeselect
}: Readonly<{
  tickets: ReadonlyArray<SelectedTicket>
  onDeselect: (ticketId: TicketId) => void
}>) {
  const rest = tickets.length - SHOWN
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {tickets.slice(0, SHOWN).map((ticket) => (
        <span
          key={ticket.id}
          className="inline-flex h-6 max-w-48 min-w-0 items-center gap-1.5 overflow-hidden rounded-[7px] bg-hover pl-2 text-body"
        >
          <span className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
            {ticket.id}
          </span>
          <span className="min-w-0 truncate font-semibold text-foreground">
            {ticket.title}
          </span>
          <button
            type="button"
            onClick={() => onDeselect(ticket.id)}
            aria-label={m.tickets_selection_remove_aria_label({
              id: ticket.id
            })}
            className="grid h-full shrink-0 cursor-pointer place-items-center px-1.5 text-muted-foreground transition-[color,background-color,scale] duration-100 hover:bg-hover hover:text-foreground active:scale-[0.97]"
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        </span>
      ))}
      {rest > 0 && (
        <span className="inline-flex h-6 shrink-0 items-center rounded-[7px] bg-hover px-2 text-caption text-muted-foreground tabular-nums">
          {m.tickets_selection_more({ count: rest })}
        </span>
      )}
    </div>
  )
}
