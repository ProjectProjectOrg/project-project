import * as ProjectFacts from "@pp/server-core/sync/ProjectFacts"
import { AppApi, ProjectScope } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

export const SyncHandlerLive = HttpApiBuilder.group(
  AppApi,
  "sync",
  (handlers) =>
    handlers.handle("project", ({ query }) =>
      Effect.gen(function* () {
        const facts = yield* ProjectFacts.ProjectFacts
        const scope = yield* ProjectScope
        return yield* facts.pull(scope, query.after)
      })
    )
)
