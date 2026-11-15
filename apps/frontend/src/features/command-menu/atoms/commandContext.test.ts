import { Ticket, TicketDetail, TicketId } from "@pp/shared"
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

const detail = Schema.decodeUnknownSync(TicketDetail)({
  ...Schema.encodeSync(Ticket)(row),
  title: "Cached",
  repoId: null,
  creator: null,
  updater: null,
  body: ""
})

const ticket = {
  orgSlug: "acme",
  slug: "app",
  ticketId: Schema.decodeSync(TicketId)("T-3")
}

let registry: Registry.AtomRegistry | undefined

afterEach(() => registry?.dispose())

it("reads the hovered row, which shortcuts edit, over the cached detail", () => {
  registry = Registry.make({
    initialValues: [
      [
        ticketDetail(ticketRequest("acme", "app", ticket.ticketId)),
        AsyncResult.success(detail)
      ],
      [pointedTicket, { ...ticket, row, patch: () => {}, search: undefined }]
    ]
  })

  const context = registry.get(
    commandContext({ orgSlug: "acme", projectSlug: "app", ticket })
  )

  expect(context.ticketDetail).toBe(detail)
  expect(context.ticketData).toBe(row)
})
