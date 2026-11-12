import { DEFAULT_TICKET_SORT, type TicketId, type TypeKey } from "@pp/shared"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Keys, projectScope } from "@/api/keys"
import { viewMutation, type ApiClient } from "@/api/viewMutation"

import { applyTypeRemove } from "../lib/libraryPatch"
import { projectLibraryFor, type ProjectLibraryRequest } from "./library"

const scopeOf = (req: ProjectLibraryRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export type MoveTicketsInput = Readonly<{ type: TypeKey | null }>

export class TicketMoveFailed extends Data.TaggedError("TicketMoveFailed")<{
  moved: number
  error: unknown
}> {}

const moveTicketsOfType = (
  client: ApiClient,
  req: ProjectLibraryRequest,
  key: TypeKey,
  input: MoveTicketsInput
) => {
  let moved = 0
  const seen = new Set<TicketId>()
  const moveAll = (archived: boolean) =>
    Effect.gen(function* () {
      while (true) {
        const page = yield* client.tickets.list({
          params: req.params,
          query: {
            type: [key],
            archived: archived ? true : undefined,
            sort: DEFAULT_TICKET_SORT
          }
        })
        const tickets = page.items
          .map((row) => row.ticket.id)
          .filter((id) => !seen.has(id))
        if (tickets.length === 0) return
        for (const id of tickets) seen.add(id)
        yield* client.tickets.bulkUpdate({
          params: req.params,
          payload: { tickets, patch: input }
        })
        moved += tickets.length
      }
    })
  return moveAll(false).pipe(
    Effect.andThen(moveAll(true)),
    Effect.tapError(() =>
      moved === 0
        ? Effect.void
        : Reactivity.invalidate(Keys.ticketsChanged(scopeOf(req)))
    ),
    Effect.mapError((error) => new TicketMoveFailed({ moved, error }))
  )
}

export const deleteProjectTypeMovingTickets = Atom.family(
  ({ req, key }: Readonly<{ req: ProjectLibraryRequest; key: TypeKey }>) =>
    viewMutation(projectLibraryFor(req), {
      name: "deleteProjectTypeMovingTickets",
      predict: (library, _input: MoveTicketsInput) => library,
      call: (client, input) =>
        moveTicketsOfType(client, req, key, input).pipe(
          Effect.andThen(
            client.library.removeProjectType({ params: { ...req.params, key } })
          )
        ),
      confirm: (library) => applyTypeRemove(library, key, "project"),
      publish: () => [
        Keys.projectLibrary(scopeOf(req)),
        ...Keys.ticketsChanged(scopeOf(req))
      ]
    })
)
