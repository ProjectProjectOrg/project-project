import {
  matchesTicketQuery,
  type GroupId,
  type Ticket,
  type TicketCounts,
  type TicketListQuery,
  type TicketStatus
} from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { currentUserId } from "@/features/auth/atoms/auth"
import {
  projectEstimation,
  projectRequest
} from "@/features/projects/atoms/projects"
import {
  boardRequest,
  sprintBoard,
  type BoardRequest
} from "@/features/sprints/atoms/sprintBoard"

import { backlog, backlogRequest, type BacklogRequest } from "./backlog"
import {
  epicSections,
  epicSectionsRequest,
  type EpicSectionsRequest
} from "./epicSections"
import {
  sprintSections,
  sprintSectionsRequest,
  type SprintSectionsRequest
} from "./sprintSections"

export type ViewCountsSource = Readonly<{
  orgSlug: string
  slug: string
  groupId: GroupId | null
  view: "list" | "board" | "description"
  grouping: "status" | "sprint" | "epic"
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

const sprintSectionsCounts = Atom.family((req: SprintSectionsRequest) =>
  sprintSections(req).pipe(Atom.mapResult((value) => value.counts))
)

const epicSectionsCounts = Atom.family((req: EpicSectionsRequest) =>
  epicSections(req).pipe(Atom.mapResult((value) => value.counts))
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
      const viewerId = get(currentUserId)
      const estimation = get(
        projectEstimation(projectRequest(req.params.orgSlug, req.params.slug))
      )
      return AsyncResult.map(get(sprintBoard(req)), ({ tickets }) =>
        countTickets(
          tickets.filter((ticket) =>
            matchesTicketQuery(ticket, filter, viewerId, estimation)
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
  if (!groupId && view === "list" && grouping === "epic")
    return epicSectionsCounts(epicSectionsRequest(orgSlug, slug, query))
  return backlogCounts(backlogRequest(orgSlug, slug, query))
}
