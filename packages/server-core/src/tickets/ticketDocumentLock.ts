import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import * as KeyedLock from "../locks/KeyedLock"

export class TicketDocumentLock extends Context.Service<
  TicketDocumentLock,
  {
    readonly withTicketDocumentLock: <A, E, R>(
      orgSlug: string,
      projectSlug: string,
      ticketId: string,
      effect: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E, R>
    readonly withRepositoryBranchLock: <A, E, R>(
      repoId: string,
      effect: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E, R>
  }
>()("@pp/server-core/tickets/ticketDocumentLock") {}

export const make = (
  lock: KeyedLock.KeyedLock["Service"]
): TicketDocumentLock["Service"] =>
  TicketDocumentLock.of({
    withTicketDocumentLock: (orgSlug, projectSlug, ticketId, effect) =>
      lock.withLock(
        KeyedLock.LockKey.ticketDocument(orgSlug, projectSlug, ticketId),
        effect
      ),
    withRepositoryBranchLock: (repoId, effect) =>
      lock.withLock(KeyedLock.LockKey.repositoryBranch(repoId), effect)
  })

export const layer = Layer.effect(
  TicketDocumentLock,
  Effect.map(KeyedLock.KeyedLock, make)
).pipe(Layer.provide(KeyedLock.layer))
