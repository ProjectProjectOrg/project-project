import { useAtomValue } from "@effect/atom-react"
import { TicketStatus, type TicketId } from "@pp/shared"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import type { BacklogValue } from "@/features/tickets/atoms/backlog"
import {
  expandedChildTickets,
  expandedChildrenRequest
} from "@/features/tickets/atoms/childTickets"
import { useSubTicketsExpanded } from "@/features/tickets/hooks/useSubTicketsExpanded"
import {
  childrenSettled,
  expandedParents
} from "@/features/tickets/lib/nestedRows"

const NO_PARENTS: ReadonlySet<TicketId> = new Set()

// Whether the sub-tickets that open expanded in `snapshot` have loaded, so
// the list can leave its loading state with them instead of before them.
export function useSubTicketsSettled(
  snapshot: BacklogValue | null,
  statuses: ReadonlyArray<TicketStatus> | undefined
): boolean {
  const { orgSlug, slug } = useProjectRoute()
  const [expandedByDefault] = useSubTicketsExpanded()
  const parents =
    snapshot === null || !expandedByDefault
      ? NO_PARENTS
      : expandedParents(
          Object.entries(snapshot.sections).flatMap(([status, page]) =>
            statuses === undefined ||
            statuses.length === 0 ||
            statuses.includes(TicketStatus.make(status))
              ? page.items
              : []
          ),
          () => true
        )
  const children = useAtomValue(
    expandedChildTickets(expandedChildrenRequest(orgSlug, slug, parents))
  )
  return childrenSettled(children)
}
