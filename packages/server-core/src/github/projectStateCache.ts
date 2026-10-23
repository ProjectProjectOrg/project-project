import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export class ProjectStateCache extends Context.Service<
  ProjectStateCache,
  Readonly<{
    invalidateForInstallation: (installationId: string) => Effect.Effect<void>
  }>
>()("@pp/server-core/github/projectStateCache") {}
