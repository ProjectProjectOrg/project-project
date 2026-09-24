import { OrgStorage } from "@pp/server-core/storage/OrgStorage"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

export const StorageHandlerLive = HttpApiBuilder.group(
  AppApi,
  "storage",
  (handlers) =>
    handlers
      .handle("get", () =>
        Effect.flatMap(OrgStorage, (storage) => storage.getStatus())
      )
      .handle("connect", ({ payload }) =>
        Effect.flatMap(OrgStorage, (storage) => storage.connect(payload))
      )
      .handle("disconnect", () =>
        Effect.flatMap(OrgStorage, (storage) => storage.disconnect())
      )
)
