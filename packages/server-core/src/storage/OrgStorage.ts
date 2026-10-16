import type {
  ConnectStorageInput,
  OrgScope,
  OrgStorageStatus,
  StorageAuthInvalid,
  StorageConfigMissing,
  StorageError,
  StorageNotConnected
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { S3Connection } from "./S3Storage"

export const maskAccessKeyId = (value: string): string => {
  if (value.length <= 4) return "*".repeat(value.length)
  return `${"*".repeat(value.length - 4)}${value.slice(-4)}`
}

export type OrgStorageConnectError =
  | StorageAuthInvalid
  | StorageConfigMissing
  | StorageError

export type OrgStorageShape = Readonly<{
  getStatus: () => Effect.Effect<OrgStorageStatus, never, OrgScope>
  connect: (
    input: ConnectStorageInput
  ) => Effect.Effect<OrgStorageStatus, OrgStorageConnectError, OrgScope>
  disconnect: () => Effect.Effect<OrgStorageStatus, never, OrgScope>
  requireConnection: (
    orgSlug: string
  ) => Effect.Effect<S3Connection, StorageNotConnected | StorageConfigMissing>
}>

export class OrgStorage extends Context.Service<OrgStorage, OrgStorageShape>()(
  "@pp/server-core/storage/OrgStorage"
) {}
