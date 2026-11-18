import { TicketId } from "@pp/shared"
import { makeTicket, makeTicketDetail } from "@pp/shared/tickets/testing"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Registry from "effect/reactivity/AtomRegistry"
import { afterEach, expect, it } from "vitest"

import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"

import { commandContext } from "./commandContext"
import { pointedTicket } from "./commandMenu"

const overrides = {
  id: TicketId.make("T-3"),
  title: "Hovered",
  branch: "feat/T-3",
  assignees: ["user-1"]
}

const row = makeTicket(overrides)

const detail = makeTicketDetail({ ...overrides, title: "Cached" })

const ticket = {
  orgSlug: "acme",
  slug: "app",
  ticketId: TicketId.make("T-3")
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
