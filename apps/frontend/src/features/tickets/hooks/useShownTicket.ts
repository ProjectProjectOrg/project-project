import { RegistryContext } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import { use, useEffect } from "react"

import { showTicketRow } from "@/features/tickets/atoms/ticketContentFill"
import { warmViewSequence } from "@/features/tickets/atoms/ticketSequence"
import type { TicketNavigationSearch } from "@/features/tickets/lib/ticketSearch"

export function useShownTicket(
  orgSlug: string,
  slug: string,
  id: TicketId | null,
  from: TicketNavigationSearch | undefined
) {
  const registry = use(RegistryContext)
  useEffect(() => {
    if (id === null) return undefined
    if (from !== undefined)
      warmViewSequence(registry, { orgSlug, slug }, from, id)
    return showTicketRow(registry, { orgSlug, slug }, id)
  }, [registry, orgSlug, slug, id, from])
}
