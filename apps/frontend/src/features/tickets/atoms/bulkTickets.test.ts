import { BULK_TICKETS_MAX, TicketId } from "@pp/shared"
import * as Schema from "effect/Schema"
import { expect, it } from "vitest"

import { bulkBatches } from "./bulkTickets"

const decodeTicketId = Schema.decodeSync(TicketId)

it("splits a selection into batches the bulk endpoints accept", () => {
  const tickets = Array.from({ length: BULK_TICKETS_MAX + 1 }, (_, i) =>
    decodeTicketId(`T-${i + 1}`)
  )
  expect(bulkBatches(tickets).map((batch) => batch.length)).toEqual([
    BULK_TICKETS_MAX,
    1
  ])
})
