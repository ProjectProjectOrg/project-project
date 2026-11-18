import { cn } from "@pp/ui/lib/utils"

import { TypeStart } from "@/features/tickets/lib/creatorType"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

export const startText = (start: TypeStart) =>
  TypeStart.$match(start, {
    sections: ({ names }) =>
      m.tickets_create_starts_with({
        sections: new Intl.ListFormat(getLocale(), {
          style: "short",
          type: "unit"
        }).format(names)
      }),
    text: () => m.tickets_create_starts_with_text(),
    empty: () => m.tickets_create_starts_with_empty()
  })

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
