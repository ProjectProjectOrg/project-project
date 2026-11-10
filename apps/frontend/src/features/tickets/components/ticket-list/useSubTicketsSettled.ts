import { useAtomValue } from "@effect/atom-react"
import { hasSubTickets, TicketStatus, type Ticket } from "@pp/shared"
import { useState } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import type { BacklogValue } from "@/features/tickets/atoms/backlog"
import {
  expandedChildrenRequest,
  expandedChildrenSettled
} from "@/features/tickets/atoms/childTickets"
import { useSubTicketsExpanded } from "@/features/tickets/hooks/useSubTicketsExpanded"

// Loads the sub-tickets of every board card in `snapshot`, so turning
// expansion on later shows them at once. Returns whether they've loaded when
// cards open expanded, so the board can leave its loading state with them
// instead of before them. List rows don't nest, so there's nothing to load.
export function useSubTicketsSettled(
  snapshot: BacklogValue | null,
  statuses: ReadonlyArray<TicketStatus> | undefined,
  board: boolean
): boolean {
  const { orgSlug, slug } = useProjectRoute()
  const [expandedByDefault] = useSubTicketsExpanded()
  const tickets =
    snapshot === null || !board
      ? []
      : Object.entries(snapshot.sections).flatMap(([key, page]) =>
          statuses !== undefined &&
          statuses.length > 0 &&
          !statuses.includes(TicketStatus.make(key))
            ? []
            : page.items.map((row) => row.ticket)
        )
  const settled = useAtomValue(
    expandedChildrenSettled(boardRequests(orgSlug, slug, tickets))
  )
  return !expandedByDefault || settled
}

// Loads the sub-tickets of every card on a board, so turning expansion on
// later shows them at once. Returns whether they've loaded once when cards
// open expanded. Latches so a later refresh that brings in a new parent
// doesn't send the board back to its loading state.
export function useBoardSubTicketsSettled(
  tickets: ReadonlyArray<Ticket> | null
): boolean {
  const { orgSlug, slug } = useProjectRoute()
  const [expandedByDefault] = useSubTicketsExpanded()
  const settled = useAtomValue(
    expandedChildrenSettled(
      tickets === null ? [] : boardRequests(orgSlug, slug, tickets)
    )
  )
  const [settledOnce, setSettledOnce] = useState(false)
  if (tickets !== null && settled && !settledOnce) setSettledOnce(true)
  return !expandedByDefault || settledOnce || (tickets !== null && settled)
}

const boardRequests = (
  orgSlug: string,
  slug: string,
  tickets: ReadonlyArray<Ticket>
) => {
  const parents = new Set(
    tickets.flatMap((ticket) => (hasSubTickets(ticket) ? [ticket.id] : []))
  )
  return parents.size === 0
    ? []
    : [expandedChildrenRequest(orgSlug, slug, parents)]
}
