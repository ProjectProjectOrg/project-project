import { Atom, Result } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import type { ConnectStorageInput } from "@projectproject/shared"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"

const orgStorageBaseAtom = Atom.family((orgSlug: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.storage.get({ path: { orgSlug } })
      })
    )
    .pipe(Atom.setIdleTTL("30 seconds"))
)

export const orgStorageAtom = Atom.family((orgSlug: string) =>
  Atom.optimistic(orgStorageBaseAtom(orgSlug))
)

export const connectStorageAtom = Atom.family((orgSlug: string) =>
  Atom.optimisticFn(orgStorageAtom(orgSlug), {
    reducer: (current) =>
      Result.isSuccess(current)
        ? Result.success(current.value, { waiting: true })
        : current,
    fn: runtime.fn(
      Effect.fn(function* (input: ConnectStorageInput, get) {
        const client = yield* ApiClient
        const status = yield* client.storage.connect({
          path: { orgSlug },
          payload: input
        })
        get.refresh(orgStorageBaseAtom(orgSlug))
        return status
      })
    )
  })
)

export const disconnectStorageAtom = Atom.family((orgSlug: string) =>
  Atom.optimisticFn(orgStorageAtom(orgSlug), {
    reducer: (current) =>
      Result.isSuccess(current)
        ? Result.success(
            {
              ...current.value,
              status: "not_connected" as const,
              endpoint: null,
              bucket: null,
              region: null,
              keyPrefix: null,
              accessKeyIdMasked: null,
              connectedAt: null,
              lastCheckedAt: null,
              lastCheckError: null
            },
            { waiting: true }
          )
        : current,
    fn: runtime.fn(
      Effect.fn(function* (_input: void, get) {
        const client = yield* ApiClient
        const status = yield* client.storage.disconnect({ path: { orgSlug } })
        get.refresh(orgStorageBaseAtom(orgSlug))
        return status
      })
    )
  })
)
