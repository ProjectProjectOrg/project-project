import { cn } from "@pp/ui/lib/utils"

import { startText } from "@/features/tickets/lib/creatorType"
import { TypeStart } from "@/features/tickets/lib/creatorType"

export function StartsWithLine({
  start,
  className
}: Readonly<{ start: TypeStart; className?: string }>) {
  return (
    <p
      aria-live="polite"
      className={cn("text-caption text-muted-foreground", className)}
    >
      {startText(start)}
    </p>
  )
}
