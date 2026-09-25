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
  ticketWrite: (orgSlug: string, projectSlug: string, ticketId: string) =>
    JSON.stringify(["ticket-write", orgSlug, projectSlug, ticketId]),
  repositoryBranch: (repoId: string) =>
    JSON.stringify(["repository-branch", repoId])
}

export class KeyedLock extends Context.Service<
  KeyedLock,
  {
    readonly withLock: <A, E, R>(
      key: string,
      effect: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E, R>
  }
>()("@pp/server-core/locks/KeyedLock") {}

export const layer = Layer.effect(
  KeyedLock,
  Effect.gen(function* () {
    const locks = yield* RcMap.make({
      lookup: (_key: string) => Semaphore.make(1)
    })
    return KeyedLock.of({
      withLock: (key, effect) =>
        Effect.scopedWith((scope) =>
          RcMap.get(locks, key).pipe(
            Scope.provide(scope),
            Effect.flatMap((lock) => lock.withPermit(effect))
          )
        )
    })
  })
)
