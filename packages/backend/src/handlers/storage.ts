import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { OrgStorage } from "../Services/OrgStorage"

export const StorageHandlerLive = HttpApiBuilder.group(
  AppApi,
  "storage",
  (handlers) =>
    handlers
      .handle("get", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const storage = yield* OrgStorage
          return yield* storage.getStatus(path.orgSlug, user.id)
        })
      )
      .handle("connect", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const storage = yield* OrgStorage
          return yield* storage.connect(path.orgSlug, user.id, payload)
        })
      )
      .handle("disconnect", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const storage = yield* OrgStorage
          return yield* storage.disconnect(path.orgSlug, user.id)
        })
      )
)
