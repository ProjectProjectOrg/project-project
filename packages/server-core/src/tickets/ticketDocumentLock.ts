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
    readonly withTicketRelationsLock: <A, E, R>(
      orgSlug: string,
      projectSlug: string,
      effect: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E, R>
    readonly withTicketRanksLock: <A, E, R>(
      orgSlug: string,
      projectSlug: string,
      effect: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E, R>
    readonly withTicketWriteLocks: <A, E, R>(
      orgSlug: string,
      projectSlug: string,
      ticketIds: ReadonlyArray<string>,
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
    withTicketRelationsLock: (orgSlug, projectSlug, effect) =>
      lock.withLock(
        KeyedLock.LockKey.ticketRelations(orgSlug, projectSlug),
        effect
      ),
    withTicketRanksLock: (orgSlug, projectSlug, effect) =>
      lock.withLock(
        KeyedLock.LockKey.ticketRanks(orgSlug, projectSlug),
        effect
      ),
    withTicketWriteLocks: (orgSlug, projectSlug, ticketIds, effect) =>
      [...new Set(ticketIds)]
        .toSorted()
        .reduceRight(
          (inner, ticketId) =>
            lock.withLock(
              KeyedLock.LockKey.ticketWrite(orgSlug, projectSlug, ticketId),
              inner
            ),
          effect
        ),
    withRepositoryBranchLock: (repoId, effect) =>
      lock.withLock(KeyedLock.LockKey.repositoryBranch(repoId), effect)
  })

export const layer = Layer.effect(
  TicketDocumentLock,
  Effect.map(KeyedLock.KeyedLock, make)
).pipe(Layer.provide(KeyedLock.layer))
