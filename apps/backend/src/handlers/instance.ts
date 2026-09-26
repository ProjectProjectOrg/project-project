import { Instance } from "@pp/server-core/instance/Instance"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

export const InstanceHandlerLive = HttpApiBuilder.group(
  AppApi,
  "instance",
  (handlers) =>
    handlers.handle("get", () =>
      Effect.gen(function* () {
        const instance = yield* Instance
        return yield* instance.describe
      })
    )
)
