import { CircleDashed } from "lucide-react"

import { BlockIconGlyph } from "@/features/library/components/BlockIconGlyph"
import type { TicketType } from "@/features/tickets/lib/ticketTypes"
import { cn } from "@/lib/utils"

export const NoTypeIcon = CircleDashed

export function TypeGlyph({
  type,
  className
}: Readonly<{ type: TicketType | null; className?: string }>) {
  if (type === null) {
    return (
      <NoTypeIcon
        aria-hidden
        strokeWidth={1.75}
        className={cn("size-4 shrink-0 text-muted-foreground", className)}
      />
    )
  }
  return (
    <BlockIconGlyph icon={type.icon} color={type.color} className={className} />
  )
}
