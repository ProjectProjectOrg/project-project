import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as RcMap from "effect/RcMap"
import * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"

export const LockKey = {
  groupFiles: (orgSlug: string, projectSlug: string) =>
    JSON.stringify(["group-files", orgSlug, projectSlug]),
  libraryLayer: (orgSlug: string, projectSlug: string | null) =>
    JSON.stringify(["library-layer", orgSlug, projectSlug]),
  ticketDocument: (orgSlug: string, projectSlug: string, ticketId: string) =>
    JSON.stringify(["ticket-document", orgSlug, projectSlug, ticketId]),
  ticketRelations: (orgSlug: string, projectSlug: string) =>
    JSON.stringify(["ticket-relations", orgSlug, projectSlug]),
  ticketWrite: (orgSlug: string, projectSlug: string, ticketId: string) =>
    JSON.stringify(["ticket-write", orgSlug, projectSlug, ticketId]),
  repositoryBranch: (repoId: string) =>
    JSON.stringify(["repository-branch", repoId])
}

export class KeyedLock extends Context.Service<
  KeyedLock,
  Readonly<{
    withLock: <A, E, R>(
      key: string,
      effect: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E, R>
  }>
>()("@pp/server-core/locks/KeyedLock") {}

const make = Effect.gen(function* () {
  const locks = yield* RcMap.make({
    lookup: (_key: string) => Semaphore.make(1)
  })

  const withLock = Effect.fn("KeyedLock.withLock")(function* <A, E, R>(
    key: string,
    effect: Effect.Effect<A, E, R>
  ) {
    return yield* Effect.scopedWith((scope) =>
      RcMap.get(locks, key).pipe(
        Scope.provide(scope),
        Effect.flatMap((lock) => lock.withPermit(effect))
      )
    )
  })

  return KeyedLock.of({ withLock })
})

export const layer = Layer.effect(KeyedLock, make)
