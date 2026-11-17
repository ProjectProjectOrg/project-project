import type { TicketId } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

export const createdKeys = Atom.family((_scope: string) =>
  Atom.make<ReadonlyMap<TicketId, string>>(new Map()).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

export const recordCreatedKey = (
  get: Atom.FnContext,
  scope: string,
  id: TicketId,
  clientId: string
) => {
  const index = createdKeys(scope)
  get.set(index, new Map(get(index)).set(id, clientId))
}
