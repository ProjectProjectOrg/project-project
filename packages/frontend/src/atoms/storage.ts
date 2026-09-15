import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { ConnectStorageInput } from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"

export type StorageRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
}>

export const storageRequest = (orgSlug: string): StorageRequest => ({
  params: { orgSlug }
})

const storageQuery = (req: StorageRequest) =>
  Api.query("storage", "get", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.storage(req.params.orgSlug)]
  })

export const orgStorage = Atom.family((req: StorageRequest) =>
  Atom.optimistic(storageQuery(req))
)

const maskAccessKeyId = (value: string): string =>
  value.length <= 4
    ? "*".repeat(value.length)
    : `${"*".repeat(value.length - 4)}${value.slice(-4)}`

export const connectStorage = Atom.family((req: StorageRequest) =>
  Atom.optimisticFn(orgStorage(req), {
    reducer: (current, input: ConnectStorageInput) =>
      AsyncResult.map(current, (value) => ({
        ...value,
        status: "active" as const,
        endpoint: input.endpoint,
        bucket: input.bucket,
        region: input.region,
        keyPrefix: input.keyPrefix,
        accessKeyIdMasked: maskAccessKeyId(input.accessKeyId),
        forcePathStyle: input.forcePathStyle,
        lastCheckError: null
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: ConnectStorageInput) {
          const status = yield* Api.use((client) =>
            client.storage.connect({ params: req.params, payload: input })
          )
          set(AsyncResult.success(status))
          return status
        })
      )
  })
)

export const disconnectStorage = Atom.family((req: StorageRequest) =>
  Atom.optimisticFn(orgStorage(req), {
    reducer: (current, _input: void) =>
      AsyncResult.map(current, (value) => ({
        ...value,
        status: "not_connected" as const,
        endpoint: null,
        bucket: null,
        region: null,
        keyPrefix: null,
        accessKeyIdMasked: null,
        connectedAt: null,
        lastCheckedAt: null,
        lastCheckError: null
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (_input: void) {
          const status = yield* Api.use((client) =>
            client.storage.disconnect({ params: req.params })
          )
          set(AsyncResult.success(status))
          return status
        })
      )
  })
)
