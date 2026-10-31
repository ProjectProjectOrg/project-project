import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type { TicketIndexProject } from "./TicketIndex"

export class TicketIndexRepairs extends Context.Service<
  TicketIndexRepairs,
  Readonly<{
    markUnpublished: (project: TicketIndexProject) => Effect.Effect<void>
    pending: Effect.Effect<ReadonlyArray<TicketIndexProject>>
    remove: (projects: ReadonlyArray<TicketIndexProject>) => Effect.Effect<void>
  }>
>()("@pp/server-core/tickets/TicketIndexRepairs") {}

const make = Effect.sync(() => {
  const unpublished = new Map<string, TicketIndexProject>()

  const markUnpublished = Effect.fn("TicketIndexRepairs.markUnpublished")(
    function* (project: TicketIndexProject) {
      yield* Effect.sync(() => {
        unpublished.set(project.projectId, project)
      })
    }
  )

  const pending = Effect.sync(() => [...unpublished.values()])

  const remove = Effect.fn("TicketIndexRepairs.remove")(function* (
    projects: ReadonlyArray<TicketIndexProject>
  ) {
    yield* Effect.sync(() => {
      for (const project of projects) unpublished.delete(project.projectId)
    })
  })

  return TicketIndexRepairs.of({ markUnpublished, pending, remove })
})

export const layer = Layer.effect(TicketIndexRepairs, make)
