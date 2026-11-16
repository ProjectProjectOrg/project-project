import * as DateTime from "effect/DateTime"

import { formatCompact, formatRelative } from "@/lib/relativeTime"
import { cn } from "@/lib/utils"
import { getLocale } from "@/paraglide/runtime"

export function TimelineTime({
  at,
  compact = false,
  className
}: Readonly<{ at: Date; compact?: boolean; className?: string }>) {
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
      {compact
        ? formatCompact(at, DateTime.toDate(DateTime.nowUnsafe()))
        : formatRelative(at)}
    </time>
  )
}
