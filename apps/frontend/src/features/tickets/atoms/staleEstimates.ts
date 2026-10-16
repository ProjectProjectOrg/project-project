import type { TicketCounts } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import type { ProjectRequest } from "@/features/projects/atoms/projects"

import { countsRequest, ticketCounts } from "./ticketCounts"

const scopeOf = (req: ProjectRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const noStaleEstimates: TicketCounts = { total: 0, byStatus: {} }

export const staleEstimateCount = Atom.family((req: ProjectRequest) =>
  Atom.optimistic(
    ticketCounts(
      countsRequest(req.params.orgSlug, req.params.slug, {
        estimate: ["stale"]
      })
    )
  )
)

export const clearStaleEstimates = Atom.family((req: ProjectRequest) =>
  Atom.optimisticFn(staleEstimateCount(req), {
    reducer: (current, _input: void) =>
      AsyncResult.map(current, () => noStaleEstimates),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("clearStaleEstimates")(function* (_input: void, get) {
          const result = yield* Api.use((client) =>
            client.tickets.clearStaleEstimates({ params: req.params })
          )
          set(
            AsyncResult.map(
              get(staleEstimateCount(req)),
              () => noStaleEstimates
            )
          )
          yield* Reactivity.invalidate([
            Keys.ticketsIn(scopeOf(req)),
            Keys.ticketLists(scopeOf(req)),
            Keys.ticketPages(scopeOf(req))
          ])
          return result
        })
      )
  })
)
