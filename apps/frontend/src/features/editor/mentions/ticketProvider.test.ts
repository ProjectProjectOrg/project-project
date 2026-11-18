import { it } from "@effect/vitest"
import { TicketId, TicketListPage } from "@pp/shared"
import { makeTicket } from "@pp/shared/tickets/testing"
import * as Effect from "effect/Effect"
import * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { expect, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import { ticketProvider } from "./ticketProvider"

const fetchStub = stubFetch()

it.effect("deduplicates identical ticket mention searches", () =>
  Effect.acquireUseRelease(
    Effect.sync(() => Registry.make()),
    (registry) => {
      const fetch = vi.fn(() =>
        Promise.resolve(
          Response.json(
            Schema.encodeSync(TicketListPage)({
              items: [
                {
                  orderKey: "a0",
                  ticket: makeTicket({
                    id: TicketId.make("WEB-1"),
                    title: "Native atom search"
                  })
                }
              ],
              nextCursor: "next"
            })
          )
        )
      )
      fetchStub.set(fetch)
      const provider = ticketProvider({ orgSlug: "acme", slug: "web" })
      const search = () =>
        provider
          .search("native", null)
          .pipe(Effect.provideService(Registry.AtomRegistry, registry))

      return Effect.gen(function* () {
        const [first, second] = yield* Effect.all([search(), search()], {
          concurrency: "unbounded"
        })
        expect(first).toEqual({
          items: [{ id: "WEB-1", label: "Native atom search" }],
          nextCursor: "next"
        })
        expect(second).toEqual(first)
        expect(fetch).toHaveBeenCalledOnce()
      })
    },
    (registry) => Effect.sync(() => registry.dispose())
  )
)
