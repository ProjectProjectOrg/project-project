import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { viewMutation } from "@/api/viewMutation"
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
  viewMutation(staleEstimateCount(req), {
    name: "clearStaleEstimates",
    predict: (_count, _input: void) => 0,
    call: () =>
      Api.use((client) =>
        client.tickets.clearStaleEstimates({ params: req.params })
      ).pipe(
        Effect.ensuring(
          Reactivity.invalidate(Keys.ticketsChanged(scopeOf(req)))
        )
      ),
    confirm: () => 0
  })
)
