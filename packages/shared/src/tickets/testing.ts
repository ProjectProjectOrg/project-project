import * as DateTime from "effect/DateTime"

import {
  EMPTY_TICKET_RELATIONS,
  Ticket,
  TicketDetail,
  TicketId,
  TicketRank,
  TicketStatus
} from "./Ticket"

const created = DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))

export const makeTicket = (overrides: Partial<Ticket> = {}) =>
  Ticket.make({
    id: TicketId.make("T-1"),
    title: "Ticket",
    status: TicketStatus.make("todo"),
    type: null,
    priority: "med",
    rank: TicketRank.make("a0"),
    estimate: null,
    flag: null,
    tags: [],
    branch: null,
    pr: null,
    prState: null,
    lastTransitionedPr: null,
    gitState: { tag: "no_branch", baseBranch: "main" },
    assignees: [],
    parent: null,
    archivedAt: null,
    createdBy: "user-1",
    createdAt: created,
    updatedAt: created,
    ...overrides
  })

export const makeTicketDetail = (overrides: Partial<TicketDetail> = {}) =>
  TicketDetail.make({
    ...makeTicket(),
    parentState: null,
    relations: EMPTY_TICKET_RELATIONS,
    creator: null,
    updater: null,
    body: "",
    ...overrides
  })
