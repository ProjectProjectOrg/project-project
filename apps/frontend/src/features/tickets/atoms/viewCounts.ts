import {
  matchesTicketQuery,
  type GroupId,
  type Ticket,
  type TicketCounts,
  type TicketListQuery,
  type TicketStatus
} from "@pp/shared"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"

import { me } from "@/features/auth/atoms/auth"
import {
  boardRequest,
  sprintBoard,
  type BoardRequest
} from "@/features/sprints/atoms/sprintBoard"

import { backlog, backlogRequest, type BacklogRequest } from "./backlog"
import { sprintSections, sprintSectionsRequest } from "./sprintSections"

export type ViewCountsSource = Readonly<{
  orgSlug: string
  slug: string
  groupId: GroupId | null
  view: "list" | "board" | "description"
  grouping: "status" | "sprint"
  query: TicketListQuery
}>

const countTickets = (tickets: ReadonlyArray<Ticket>): TicketCounts => {
  const byStatus: Record<TicketStatus, number> = {}
  for (const ticket of tickets) {
    byStatus[ticket.status] = (byStatus[ticket.status] ?? 0) + 1
  }
  return { total: tickets.length, byStatus }
}

const backlogCounts = Atom.family((req: BacklogRequest) =>
  backlog(req).pipe(Atom.mapResult((value) => value.counts))
)

const sprintSectionsCounts = Atom.family((req: BacklogRequest) =>
  sprintSections(req).pipe(Atom.mapResult((value) => value.counts))
)

const sprintBoardCounts = Atom.family(
  ({ req, query }: Readonly<{ req: BoardRequest; query: TicketListQuery }>) => {
    const {
      archived: _archived,
      cursor: _cursor,
      sort: _sort,
      status: _status,
      ...filter
    } = query
    return Atom.make((get) => {
      const viewer = get(me())
      const viewerId = AsyncResult.isSuccess(viewer)
        ? viewer.value.id
        : undefined
      return AsyncResult.map(get(sprintBoard(req)), ({ tickets }) =>
        countTickets(
          tickets.filter((ticket) =>
            matchesTicketQuery(ticket, filter, viewerId)
          )
        )
      )
    })
  }
)

const noCounts = Atom.make(AsyncResult.initial<TicketCounts>())

export const viewCounts = ({
  orgSlug,
  slug,
  groupId,
  view,
  grouping,
  query
}: ViewCountsSource) => {
  if (view === "description") return noCounts
  if (groupId && view === "board")
    return sprintBoardCounts({
      req: boardRequest(orgSlug, slug, groupId),
      query
    })
  if (!groupId && view === "list" && grouping === "sprint")
    return sprintSectionsCounts(sprintSectionsRequest(orgSlug, slug, query))
  return backlogCounts(backlogRequest(orgSlug, slug, query))
}
