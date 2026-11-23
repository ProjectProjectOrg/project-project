import { cn } from "@pp/ui/lib/utils"

import { formatRelative, useNow } from "@/lib/relativeTime"
import { getLocale } from "@/paraglide/runtime"

export function TimelineTime({
  at,
  className
}: Readonly<{ at: Date; className?: string }>) {
  const now = useNow()
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
      {formatRelative(at, now)}
    </time>
  )
}
