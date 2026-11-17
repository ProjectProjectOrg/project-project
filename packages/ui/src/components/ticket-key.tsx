import { cn } from "../lib/utils"
import { TextSwap } from "./text-swap"

/*
 * A ticket's key ("ATL-23") in mono, muted and with tabular figures, so keys
 * in a column line up. The number after the last dash rolls through TextSwap:
 * a ticket that is still being created shows only its prefix ("ATL-"), and
 * its number rolls in once it's saved.
 *
 *   <TicketKey value={ticket.id} pending={pending} />
 */

const split = (value: string) => {
  const dash = value.lastIndexOf("-")
  return dash >= 0
    ? { prefix: value.slice(0, dash + 1), number: value.slice(dash + 1) }
    : { prefix: value, number: "" }
}

export function TicketKey({
  value,
  pending = false,
  className
}: Readonly<{
  value: string
  // Still being created: the number isn't final yet, so it's left out.
  pending?: boolean
  className?: string
}>) {
  const { prefix, number } = split(value)
  return (
    <span
      data-slot="ticket-key"
      className={cn(
        "inline-flex items-baseline font-mono text-caption text-muted-foreground tabular-nums",
        className
      )}
    >
      <span>{prefix}</span>
      <TextSwap>{pending ? "" : number}</TextSwap>
    </span>
  )
}
