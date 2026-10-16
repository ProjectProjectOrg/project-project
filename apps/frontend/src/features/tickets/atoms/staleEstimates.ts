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

const staleCountQuery = Atom.family((req: ProjectRequest) => {
  const sources = [false, true].map((archived) =>
    ticketCounts(
      countsRequest(req.params.orgSlug, req.params.slug, {
        estimate: ["stale"],
        archived
      })
    )
  )
  return Atom.readable(
    (get) =>
      AsyncResult.map(
        AsyncResult.all(sources.map((source) => get(source))),
        (counts) => counts.reduce((total, count) => total + count.total, 0)
      ),
    (refresh) => sources.forEach((source) => refresh(source))
  )
})

export const staleEstimateCount = Atom.family((req: ProjectRequest) =>
  Atom.optimistic(staleCountQuery(req))
)

export const staleEstimateCountWaiting = Atom.family((req: ProjectRequest) =>
  Atom.readable((get) => get(staleCountQuery(req)).waiting)
)

export const clearStaleEstimates = Atom.family((req: ProjectRequest) =>
  Atom.optimisticFn(staleEstimateCount(req), {
    reducer: (current, _input: void) => AsyncResult.map(current, () => 0),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("clearStaleEstimates")(
          function* (_input: void, get) {
            const result = yield* Api.use((client) =>
              client.tickets.clearStaleEstimates({ params: req.params })
            )
            set(AsyncResult.map(get(staleEstimateCount(req)), () => 0))
            return result
          },
          Effect.ensuring(
            Reactivity.invalidate([
              Keys.ticketsIn(scopeOf(req)),
              Keys.ticketLists(scopeOf(req)),
              Keys.ticketPages(scopeOf(req))
            ])
          )
        )
      )
  })
)
