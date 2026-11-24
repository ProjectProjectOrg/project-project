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
        pending && "h-[1lh] items-center",
        className
      )}
    >
      {pending ? (
        <span
          aria-hidden="true"
          className="pp-loader h-[0.6em] w-[4ch] rounded-full bg-foreground/30"
        />
      ) : (
        value
      )}
    </span>
  )
}
