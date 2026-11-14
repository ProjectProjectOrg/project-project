import { Ticket, TicketId } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { afterEach, expect, it } from "vitest"

import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"

import { commandContext } from "./commandContext"
import { pointedTicket } from "./commandMenu"

const row = Schema.decodeSync(Ticket)({
  id: "T-3",
  title: "Hovered",
  status: "todo",
  type: null,
  priority: "med",
  rank: "a0",
  tags: [],
  branch: "feat/T-3",
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch" },
  assignees: ["user-1"],
  parent: null,
  archivedAt: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
})

const ticket = {
  orgSlug: "acme",
  slug: "app",
  ticketId: Schema.decodeSync(TicketId)("T-3")
}

let registry: Registry.AtomRegistry | undefined

afterEach(() => registry?.dispose())

it("reads the hovered row's fields while the ticket's detail isn't loaded", () => {
  registry = Registry.make({
    initialValues: [
      [
        ticketDetail(ticketRequest("acme", "app", ticket.ticketId)),
        AsyncResult.initial()
      ],
      [pointedTicket, { ...ticket, row, patch: () => {} }]
    ]
  })

  const context = registry.get(
    commandContext({ orgSlug: "acme", projectSlug: "app", ticket })
  )

  expect(context.ticketDetail).toBeNull()
  expect(context.ticketData).toBe(row)
})
