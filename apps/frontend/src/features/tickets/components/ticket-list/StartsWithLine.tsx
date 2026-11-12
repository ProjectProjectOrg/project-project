import type { TypeStart } from "@/features/tickets/lib/creatorType"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

const startText = (start: TypeStart): string => {
  if (start.kind === "sections")
    return m.tickets_create_starts_with({
      sections: new Intl.ListFormat(getLocale(), {
        style: "short",
        type: "unit"
      }).format(start.names)
    })
  if (start.kind === "text") return m.tickets_create_starts_with_text()
  return m.tickets_create_starts_with_empty()
}

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
