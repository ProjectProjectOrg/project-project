import type { ConnectStorageInput } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys } from "@/api/keys"
import { query } from "@/api/query"
import { replaceWith, viewMutation } from "@/api/viewMutation"

export type StorageRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
}>

export const storageRequest = (orgSlug: string): StorageRequest => ({
  params: { orgSlug }
})

const storageQuery = (req: StorageRequest) =>
  query("storage", "get", {
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
  viewMutation(orgStorage(req), {
    name: "connectStorage",
    predict: (value, input: ConnectStorageInput) => ({
      ...value,
      status: "active" as const,
      endpoint: input.endpoint,
      bucket: input.bucket,
      region: input.region,
      keyPrefix: input.keyPrefix,
      accessKeyIdMasked: maskAccessKeyId(input.accessKeyId),
      forcePathStyle: input.forcePathStyle,
      lastCheckError: null
    }),
    call: (client, input) =>
      client.storage.connect({ params: req.params, payload: input }),
    confirm: replaceWith
  })
)

export const disconnectStorage = Atom.family((req: StorageRequest) =>
  viewMutation(orgStorage(req), {
    name: "disconnectStorage",
    predict: (value, _input: void) => ({
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
    }),
    call: (client) => client.storage.disconnect({ params: req.params }),
    confirm: replaceWith
  })
)
