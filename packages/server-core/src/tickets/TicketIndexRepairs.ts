import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type { TicketProject } from "./ticketProject"

export class TicketIndexRepairs extends Context.Service<
  TicketIndexRepairs,
  Readonly<{
    markUnpublished: (project: TicketProject) => Effect.Effect<void>
    pending: Effect.Effect<ReadonlyArray<TicketProject>>
    remove: (projects: ReadonlyArray<TicketProject>) => Effect.Effect<void>
  }>
>()("@pp/server-core/tickets/TicketIndexRepairs") {}

const make = Effect.sync(() => {
  const unpublished = new Map<string, TicketProject>()

  const markUnpublished = Effect.fn("TicketIndexRepairs.markUnpublished")(
    function* (project: TicketProject) {
      yield* Effect.sync(() => {
        unpublished.set(project.projectId, project)
      })
    }
  )

  const pending = Effect.sync(() => [...unpublished.values()])

  const remove = Effect.fn("TicketIndexRepairs.remove")(function* (
    projects: ReadonlyArray<TicketProject>
  ) {
    yield* Effect.sync(() => {
      for (const project of projects) unpublished.delete(project.projectId)
    })
  })

  return TicketIndexRepairs.of({ markUnpublished, pending, remove })
})

export const layer = Layer.effect(TicketIndexRepairs, make)
