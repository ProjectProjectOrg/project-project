import { useAtomValue } from "@effect/atom-react"
import { matchesTicketQuery } from "@pp/shared"
import type { Ticket, TicketListQuery } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { useMemo } from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
import {
  projectEstimation,
  projectRequest
} from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"

import { boardStatusesFor } from "../lib/boardUtils"

export type BoardTickets = {
  readonly matchingTickets: ReadonlyArray<Ticket>
  readonly counts: Record<string, number>
}

export function useBoardTickets(
  orgSlug: string,
  slug: string,
  tickets: ReadonlyArray<Ticket>,
  query: TicketListQuery
): BoardTickets {
  const statusReq = statusesRequest(orgSlug, slug)
  const statusesResult = useAtomValue(statusesFor(statusReq))
  const viewerId = useAtomValue(currentUserId)
  const estimation = useAtomValue(
    projectEstimation(projectRequest(orgSlug, slug))
  )

  const boardQuery = useMemo(() => {
    const {
      archived: _archived,
      cursor: _cursor,
      sort: _sort,
      ...filter
    } = query
    return filter
  }, [query])

  const matchingTickets = useMemo(
    () =>
      tickets.filter((ticket) =>
        matchesTicketQuery(ticket, boardQuery, viewerId, estimation)
      ),
    [tickets, boardQuery, viewerId, estimation]
  )

  const statusSlugs = useMemo(
    () =>
      boardStatusesFor(
        Result.isSuccess(statusesResult) ? statusesResult.value : []
      ),
    [statusesResult]
  )

  const counts = useMemo(() => {
    const next: Record<string, number> = { all: 0 }
    for (const status of statusSlugs) next[status] = 0
    for (const ticket of matchingTickets) {
      next.all += 1
      if (ticket.status in next) next[ticket.status] += 1
    }
    return next
  }, [matchingTickets, statusSlugs])

  return { matchingTickets, counts }
}
