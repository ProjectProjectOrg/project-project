import type { MarkTicketInput, TicketId } from "@pp/shared"
import type * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Atom from "effect/reactivity/Atom"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"

import type { BulkTicketsRequest } from "./bulkTickets"
import type { TicketRemoval } from "./removeTickets"

export type TicketAction =
  | TicketRemoval
  | Readonly<{
      kind: "mark"
      relation: MarkTicketInput["kind"]
      source: TicketId
      target: TicketId
    }>

type ActionFailure = Readonly<{
  key: string
  slug: string
  input: TicketAction
  cause: Cause.Cause<unknown>
  retry: () => void
}>

export const ticketActionFailures = Atom.family((_orgSlug: string) =>
  Atom.make<ReadonlyArray<ActionFailure>>([]).pipe(Atom.keepAlive)
)

export const runTicketAction = <A, E>(
  registry: AtomRegistry,
  path: BulkTicketsRequest,
  input: TicketAction,
  save: () => Promise<Exit.Exit<A, E>>
) => {
  const key = JSON.stringify([
    path.slug,
    input.kind === "mark"
      ? input
      : { ...input, tickets: input.tickets.toSorted() }
  ])
  const failures = ticketActionFailures(path.orgSlug)
  const run = async () => {
    registry.update(failures, (items) =>
      items.filter((item) => item.key !== key)
    )
    const result = await save()
    if (Exit.isFailure(result)) {
      registry.update(failures, (items) => [
        ...items.filter((item) => item.key !== key),
        {
          key,
          slug: path.slug,
          input,
          cause: result.cause,
          retry: () => {
            void run()
          }
        }
      ])
    }
    return result
  }
  return run()
}
