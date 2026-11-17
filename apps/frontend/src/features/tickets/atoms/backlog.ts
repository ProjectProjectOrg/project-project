import { TicketCounts, type TicketId, TicketListQuery } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"

import { persisted } from "@/api/bootCache"
import { projectScope } from "@/api/keys"
import { bindRowMutation } from "@/api/viewMutation"
import { localBacklog } from "@/features/local/atoms/localBacklog"
import { localValue } from "@/features/local/atoms/readLocal"
import {
  type QueryWithView,
  firstScreenSections,
  TicketRowPage,
  viewQuery
} from "@/features/tickets/lib/ticketRows"

import { backlogLoadedPages } from "./backlogPages"
import {
  loadMorePages,
  localBulkUpdate,
  localTicketMove,
  localTicketUpdate
} from "./ticketRows"

export const encodeTicketListQuery = Schema.encodeSync(
  Schema.fromJsonString(TicketListQuery)
)

export type BacklogRequest = Readonly<{
  _view: "backlog"
  params: Readonly<{ orgSlug: string; slug: string }>
  query: TicketListQuery
}>

export const backlogRequest = (
  orgSlug: string,
  slug: string,
  query: QueryWithView
): BacklogRequest => ({
  _view: "backlog",
  params: { orgSlug, slug },
  query: {
    ...viewQuery(query),
    status: undefined,
    cursor: undefined
  }
})

const scopeOf = (req: BacklogRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export const BacklogValue = Schema.Struct({
  counts: TicketCounts,
  sections: Schema.Record(Schema.String, TicketRowPage)
})
export type BacklogValue = typeof BacklogValue.Type

const firstScreen = (value: BacklogValue): BacklogValue => ({
  counts: value.counts,
  sections: firstScreenSections(value.sections)
})

const backlogView = (req: BacklogRequest) =>
  Atom.make((get) => localValue(get(localBacklog(req))))

export const backlog = Atom.family((req: BacklogRequest) =>
  Atom.optimistic(
    backlogView(req).pipe(
      persisted(
        `view/${scopeOf(req)}/status/${encodeTicketListQuery(req.query)}`,
        BacklogValue,
        firstScreen
      )
    )
  )
)

export const loadMoreBacklog = Atom.family(
  ({
    req,
    status
  }: Readonly<{
    req: BacklogRequest
    status: string
  }>) => loadMorePages(backlogLoadedPages(req), status)
)

export const updateBacklogTicket = Atom.family(
  ({ req, id }: Readonly<{ req: BacklogRequest; id: TicketId }>) =>
    localTicketUpdate({ ...req.params, id })
)

export const backlogTicketUpdates = bindRowMutation(updateBacklogTicket)

export const bulkUpdateBacklogTickets = Atom.family((req: BacklogRequest) =>
  localBulkUpdate(req.params)
)

export const bulkMoveBacklogTickets = Atom.family((req: BacklogRequest) =>
  localTicketMove(req.params)
)
