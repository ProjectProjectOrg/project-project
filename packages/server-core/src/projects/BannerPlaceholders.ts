import type { ProjectBanner } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export interface BannerPlaceholdersShape {
  readonly ensure: (
    orgSlug: string,
    projectSlug: string,
    banner: ProjectBanner | null
  ) => Effect.Effect<ProjectBanner | null>
}

export class BannerPlaceholders extends Context.Service<
  BannerPlaceholders,
  BannerPlaceholdersShape
>()("@pp/server-core/projects/BannerPlaceholders") {}
