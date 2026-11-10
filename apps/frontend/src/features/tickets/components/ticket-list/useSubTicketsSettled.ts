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

// Whether the sub-tickets that open expanded on board cards in `snapshot` have
// loaded, so the board can leave its loading state with them instead of
// before them. List rows don't nest, so there's nothing to wait on there.
export function useSubTicketsSettled(
  snapshot: BacklogValue | null,
  statuses: ReadonlyArray<TicketStatus> | undefined,
  board: boolean
): boolean {
  const { orgSlug, slug } = useProjectRoute()
  const [expandedByDefault] = useSubTicketsExpanded()
  const tickets =
    snapshot === null || !board || !expandedByDefault
      ? []
      : Object.entries(snapshot.sections).flatMap(([key, page]) =>
          statuses !== undefined &&
          statuses.length > 0 &&
          !statuses.includes(TicketStatus.make(key))
            ? []
            : page.items.map((row) => row.ticket)
        )
  return useAtomValue(
    expandedChildrenSettled(boardRequests(orgSlug, slug, tickets))
  )
}

// Whether a board's default-expanded sub-tickets have loaded once. Latches so
// a later refresh that brings in a new parent doesn't send the board back to
// its loading state.
export function useBoardSubTicketsSettled(
  tickets: ReadonlyArray<Ticket> | null
): boolean {
  const { orgSlug, slug } = useProjectRoute()
  const [expandedByDefault] = useSubTicketsExpanded()
  const settled = useAtomValue(
    expandedChildrenSettled(
      tickets === null || !expandedByDefault
        ? []
        : boardRequests(orgSlug, slug, tickets)
    )
  )
  const [settledOnce, setSettledOnce] = useState(false)
  if (tickets !== null && settled && !settledOnce) setSettledOnce(true)
  return settledOnce || (tickets !== null && settled)
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
