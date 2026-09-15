import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useMemo } from "react"
import { meAtom } from "@/atoms/auth"
import { statusesFor, statusesRequest } from "@/atoms/projectStatuses"
import { matchesTicketQuery } from "@projectproject/shared"
import type { Ticket, TicketListQuery } from "@projectproject/shared"
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
  const me = useAtomValue(meAtom)
  const viewerId = Result.isSuccess(me) ? me.value.id : undefined

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
