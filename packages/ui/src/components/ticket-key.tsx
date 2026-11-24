import { cn } from "../lib/utils"

export function TicketKey({
  value,
  pending = false,
  className
}: Readonly<{
  value: string
  pending?: boolean
  className?: string
}>) {
  return (
    <span
      data-slot="ticket-key"
      className={cn(
        "inline-flex items-baseline text-caption text-muted-foreground tabular-nums",
        className
      )}
    >
      {pending ? null : value}
    </span>
  )
}
