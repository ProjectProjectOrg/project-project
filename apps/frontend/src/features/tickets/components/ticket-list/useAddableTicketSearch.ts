import { useAtomValue } from "@effect/atom-react"
import { finishedStatusSlugs, type Ticket, type TicketStatus } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import { useMemo } from "react"

import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  recentTickets,
  recentTicketsRequest
} from "@/features/tickets/atoms/myTickets"
import {
  ticketPage,
  ticketPageRequest
} from "@/features/tickets/atoms/ticketPages"
import { usePagedSearch, type PagedSearchResults } from "@/hooks/usePagedSearch"

const RECENT_LIMIT = 5
const NO_TICKETS: ReadonlyArray<Ticket> = []

const openTicketSource = (
  orgSlug: string,
  slug: string,
  status: ReadonlyArray<TicketStatus>
) => ({
  key: `${orgSlug}/${slug}`,
  search: (q: string, cursor: string | null) =>
    Atom.getResult(
      ticketPage(
        ticketPageRequest(orgSlug, slug, q, cursor, {
          status,
          parent: q === "" ? ["none"] : undefined
        })
      )
    ).pipe(
      Effect.map((page) => ({
        items: page.items.map((row) => row.ticket),
        nextCursor: page.nextCursor
      }))
    )
})

export type AddableTickets = Readonly<{
  recent: ReadonlyArray<Ticket>
  results: PagedSearchResults<Ticket>
}>

export function useAddableTicketSearch(query: string | null): AddableTickets {
  const { orgSlug, slug } = useProjectRoute()
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(orgSlug, slug))
  )
  const recentResult = useAtomValue(
    recentTickets(recentTicketsRequest(orgSlug))
  )
  const open = useMemo(() => {
    if (!Result.isSuccess(statusesResult)) return null
    const finished = finishedStatusSlugs(statusesResult.value)
    return statusesResult.value
      .map((s) => s.slug)
      .filter((s) => !finished.has(s))
  }, [statusesResult])
  const source = useMemo(
    () => (open === null ? null : openTicketSource(orgSlug, slug, open)),
    [open, orgSlug, slug]
  )
  const results = usePagedSearch(source, query)
  const recent = useMemo(() => {
    if (query !== "" || open === null || !Result.isSuccess(recentResult)) {
      return NO_TICKETS
    }
    const openSet = new Set<string>(open)
    return recentResult.value.tickets
      .flatMap((row) =>
        row.project.slug === slug &&
        openSet.has(row.ticket.status) &&
        !row.ticket.parent
          ? [row.ticket]
          : []
      )
      .slice(0, RECENT_LIMIT)
  }, [query, open, recentResult, slug])
  return { recent, results }
}
