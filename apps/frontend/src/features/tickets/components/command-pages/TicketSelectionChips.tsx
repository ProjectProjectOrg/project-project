import type { TicketId } from "@pp/shared"
import { CommandMenuChip } from "@pp/ui/command-menu"
import { X } from "@pp/ui/icons"

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
        <CommandMenuChip
          key={ticket.id}
          className="max-w-48 min-w-0 overflow-hidden"
        >
          <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
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
            className="grid h-full shrink-0 cursor-pointer place-items-center px-1.5 text-muted-foreground transition-[color,background-color,scale] duration-100 hover:bg-hover hover:text-foreground active:scale-97"
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        </CommandMenuChip>
      ))}
      {rest > 0 && (
        <CommandMenuChip variant="count" className="shrink-0 tabular-nums">
          {m.tickets_selection_more({ count: rest })}
        </CommandMenuChip>
      )}
    </div>
  )
}
