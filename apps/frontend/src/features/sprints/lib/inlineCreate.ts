import {
  GroupId,
  matchesTicketQuery,
  TicketId,
  TicketStatus,
  type TicketListQuery
} from "@pp/shared"
import * as Schema from "effect/Schema"

import {
  predictedTicket,
  type QuickCreateInput
} from "@/features/tickets/lib/ticketRows"

export const createdTicketShows = (
  query: TicketListQuery,
  input: QuickCreateInput,
  now: Date
) =>
  matchesTicketQuery(
    predictedTicket(
      input,
      TicketId.make("T-1"),
      input.payload.status ?? TicketStatus.make("todo"),
      now
    ),
    { ...query, status: undefined },
    undefined,
    input.prediction.estimation
  )

export const filtersBySprint = (query: TicketListQuery) =>
  (query.groupId?.length ?? 0) > 0 && !query.groupId?.includes("ungrouped")

export const placesInManualOrder = (query: TicketListQuery) =>
  query.sort.key === "manual" && query.sort.dir === "asc"

export const createdRowInPlace = (
  query: TicketListQuery,
  input: QuickCreateInput,
  now: Date
) =>
  placesInManualOrder(query) &&
  !filtersBySprint(query) &&
  createdTicketShows(query, input, now)

const isGroupId = Schema.is(GroupId)

export const onlySprint = (query: TicketListQuery) =>
  query.groupId?.length === 1 && isGroupId(query.groupId[0])
    ? query.groupId[0]
    : undefined
