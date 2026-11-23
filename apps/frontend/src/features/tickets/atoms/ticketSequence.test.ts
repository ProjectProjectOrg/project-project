import { TicketId, TicketSequence } from "@pp/shared"
import * as Predicate from "effect/Predicate"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { beforeAll, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import { ticketSourceFromSearch } from "../lib/ticketSearch"
import {
  knownViewSequence,
  ticketSequenceRequest,
  warmViewSequence
} from "./ticketSequence"

const ticketId = Schema.decodeSync(TicketId)
const encodeSequence = Schema.encodeSync(TicketSequence)
const fetchStub = stubFetch()

beforeAll(() => {
  vi.stubGlobal("window", new EventTarget())
  vi.stubGlobal("document", { visibilityState: "visible" })
})

it("reuses a view's sequence for any ticket in that view", async () => {
  const requests: Array<string> = []
  fetchStub.set((input) => {
    requests.push(new Request(input).url)
    return Promise.resolve(
      Response.json(
        encodeSequence({
          within: "view",
          tickets: [
            { id: ticketId("T-1"), title: "One" },
            { id: ticketId("T-2"), title: "Two" }
          ]
        })
      )
    )
  })
  const registry = AtomRegistry.make()
  const from = { from: "sections", group: "status" } as const
  const source = ticketSourceFromSearch(from)
  if (source === undefined || Predicate.isTagged(source, "parent"))
    throw new Error("expected a list source")
  const opened = (id: string) =>
    knownViewSequence(
      registry,
      ticketSequenceRequest("acme", "web", ticketId(id), source)
    )

  warmViewSequence(
    registry,
    { orgSlug: "acme", slug: "web" },
    from,
    ticketId("T-1")
  )
  warmViewSequence(
    registry,
    { orgSlug: "acme", slug: "web" },
    from,
    ticketId("T-2")
  )
  await vi.waitFor(() => expect(opened("T-2")).not.toBeNull())

  expect(opened("T-2")?.tickets.map((ticket) => ticket.id)).toEqual([
    "T-1",
    "T-2"
  ])
  expect(opened("T-3")).toBeNull()
  expect(requests).toHaveLength(1)
  registry.dispose()
})
