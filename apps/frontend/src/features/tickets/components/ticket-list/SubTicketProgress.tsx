import { hasSubTickets, type Ticket } from "@pp/shared"

import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Counted = Pick<Ticket, "subTicketCount" | "subTicketDoneCount">

const RADIUS = 5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function ProgressPie({
  done,
  total
}: Readonly<{ done: number; total: number }>) {
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden
      className="size-3.5 shrink-0 -rotate-90"
    >
      <circle
        cx="7"
        cy="7"
        r={RADIUS}
        fill="none"
        strokeWidth="2"
        className="stroke-border"
      />
      <circle
        cx="7"
        cy="7"
        r={RADIUS}
        fill="none"
        strokeWidth="2"
        strokeDasharray={`${(done / total) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        className="stroke-muted-foreground"
      />
    </svg>
  )
}

export function SubTicketProgress({
  ticket,
  className
}: Readonly<{ ticket: Counted; className?: string }>) {
  if (!hasSubTickets(ticket)) return null
  const total = ticket.subTicketCount ?? 0
  const done = ticket.subTicketDoneCount ?? 0
  return (
    <span
      title={m.tickets_sub_tickets_progress({ done, total })}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-muted-foreground",
        className
      )}
    >
      <ProgressPie done={done} total={total} />
      <span className="font-mono text-xs tabular-nums">
        {done}/{total}
      </span>
    </span>
  )
}
