import { EPIC_TYPE } from "@pp/shared"

import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import { resolveType } from "@/features/tickets/lib/ticketTypes"

// Marks a ticket as an epic where nothing else would (a cmd+k result), in its
// project's own epic glyph and name.
export function EpicTag({
  orgSlug,
  slug
}: Readonly<{ orgSlug: string; slug: string }>) {
  const type = resolveType(useTicketTypes(orgSlug, slug), EPIC_TYPE)
  if (type === null) return null
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground">
      <TypeGlyph type={type} className="size-3.5" />
      {type.name}
    </span>
  )
}
