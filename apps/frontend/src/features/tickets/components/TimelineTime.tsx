import { formatRelative } from "@/lib/relativeTime"
import { cn } from "@/lib/utils"
import { getLocale } from "@/paraglide/runtime"

export function TimelineTime({
  at,
  className
}: Readonly<{ at: Date; className?: string }>) {
  return (
    <time
      className={cn("text-muted-foreground tabular-nums", className)}
      dateTime={at.toISOString()}
      title={at.toLocaleString(getLocale(), {
        dateStyle: "medium",
        timeStyle: "short",
        hourCycle: "h23"
      })}
    >
      {formatRelative(at)}
    </time>
  )
}
