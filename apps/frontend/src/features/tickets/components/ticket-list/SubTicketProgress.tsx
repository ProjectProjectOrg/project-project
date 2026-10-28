import type { Ticket } from "@pp/shared"

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
  toggle,
  className
}: Readonly<{
  ticket: Counted
  toggle?: Readonly<{ expanded: boolean; onToggle: () => void }>
  className?: string
}>) {
  const total = ticket.subTicketCount ?? 0
  if (total === 0) return null
  const done = ticket.subTicketDoneCount ?? 0
  const label = m.tickets_sub_tickets_progress({ done, total })
  const content = (
    <>
      <ProgressPie done={done} total={total} />
      <span className="font-mono text-xs tabular-nums">
        {done}/{total}
      </span>
    </>
  )
  const base = "inline-flex shrink-0 items-center gap-1 text-muted-foreground"
  if (toggle === undefined) {
    return (
      <span title={label} className={cn(base, className)}>
        {content}
      </span>
    )
  }
  return (
    <button
      type="button"
      aria-expanded={toggle.expanded}
      aria-label={label}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        toggle.onToggle()
      }}
      className={cn(
        base,
        "-mx-1 rounded-md px-1 py-0.5 transition-[color,background-color,transform] duration-100 hover:bg-hover hover:text-foreground active:scale-[0.97]",
        toggle.expanded && "bg-active text-foreground",
        className
      )}
    >
      {content}
    </button>
  )
}
