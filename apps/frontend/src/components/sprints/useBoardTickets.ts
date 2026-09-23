import { useAtomValue } from "@effect/atom-react"
import { matchesTicketQuery } from "@pp/shared"
import type { Ticket, TicketListQuery } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useMemo } from "react"

import { me } from "@/features/auth/atoms/auth"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"

import { boardStatusesFor } from "./board-utils"

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
  const statusReq = useMemo(
    () => statusesRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const statusesResult = useAtomValue(statusesFor(statusReq))
  const viewer = useAtomValue(me())
  const viewerId = Result.isSuccess(viewer) ? viewer.value.id : undefined

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
        matchesTicketQuery(ticket, boardQuery, viewerId)
      ),
    [tickets, boardQuery, viewerId]
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
