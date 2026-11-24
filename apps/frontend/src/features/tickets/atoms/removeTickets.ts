import type { ArchiveTicketInput, BulkDeleteTicketsInput } from "@pp/shared"
import * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Keys, projectScope } from "@/api/keys"
import {
  fireMutation,
  keepPredicted,
  viewMutation,
  type OptimisticView
} from "@/api/viewMutation"

import {
  bulkBatches,
  bulkChangedKeys,
  type BulkTicketsRequest
} from "./bulkTickets"
import { runTicketAction } from "./ticketActionFailures"

export type TicketRemoval =
  | (Readonly<{ kind: "delete" }> & BulkDeleteTicketsInput)
  | (Readonly<{ kind: "archive"; tickets: BulkDeleteTicketsInput["tickets"] }> &
      ArchiveTicketInput)
  | Readonly<{ kind: "unarchive"; tickets: BulkDeleteTicketsInput["tickets"] }>

export type RemoveTickets = (
  registry: AtomRegistry,
  input: TicketRemoval
) => Promise<Exit.Exit<void, unknown>>

export const removeFromView = <V, E>(
  view: OptimisticView<V, E>,
  path: BulkTicketsRequest,
  predict: (value: V, input: TicketRemoval) => V
) => {
  const keys = (input: TicketRemoval) => [
    ...bulkChangedKeys(path, input.tickets, input.kind === "delete"),
    Keys.projectResync(projectScope(path.orgSlug, path.slug))
  ]
  const mutation = () =>
    viewMutation(view, {
      name: "removeTicketsFromView",
      predict,
      call: (client, input) =>
        Effect.gen(function* () {
          if (input.kind === "unarchive") {
            yield* Effect.forEach(
              input.tickets,
              (id) =>
                client.tickets
                  .unarchive({ params: { ...path, id } })
                  .pipe(
                    Effect.catchTag("TicketArchiveConflict", (error) =>
                      error.kind === "not_archived"
                        ? Effect.void
                        : Effect.fail(error)
                    )
                  ),
              { discard: true }
            )
          } else if (
            input.kind === "archive" &&
            input.duplicateOf !== undefined
          ) {
            const { reason, duplicateOf } = input
            yield* Effect.forEach(
              input.tickets,
              (id) =>
                client.tickets.archive({
                  params: { ...path, id },
                  payload: { reason, duplicateOf }
                }),
              { discard: true }
            )
          } else {
            for (const tickets of bulkBatches(input.tickets)) {
              if (input.kind === "archive")
                yield* client.tickets.bulkArchive({
                  params: path,
                  payload: { tickets, reason: input.reason }
                })
              else
                yield* client.tickets.bulkDelete({
                  params: path,
                  payload: {
                    tickets,
                    cascadeSubTickets: input.cascadeSubTickets
                  }
                })
            }
          }
        }).pipe(Effect.onError(() => Reactivity.invalidate(keys(input)))),
      confirm: keepPredicted,
      publish: (_, input) => keys(input)
    })
  const run: RemoveTickets = (registry, input) =>
    runTicketAction(registry, path, input, () => {
      const unmount = registry.mount(view)
      return fireMutation(registry, mutation(), input)
        .then(Result.toExit)
        .finally(unmount)
    })
  return run
}
