import { hasSubTickets, type Ticket } from "@pp/shared"
import { ProgressCount } from "@pp/ui/progress-count"

import { m } from "@/paraglide/messages"

type Counted = Pick<Ticket, "subTicketCount" | "subTicketDoneCount">

export function SubTicketProgress({
  ticket,
  className
}: Readonly<{ ticket: Counted; className?: string }>) {
  if (!hasSubTickets(ticket)) return null
  const total = ticket.subTicketCount ?? 0
  const done = ticket.subTicketDoneCount ?? 0
  return (
    <ProgressCount
      done={done}
      total={total}
      label={m.tickets_sub_tickets_progress({ done, total })}
      className={className}
    />
  )
}
