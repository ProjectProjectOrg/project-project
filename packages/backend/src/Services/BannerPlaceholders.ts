import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type { ProjectBanner } from "@projectproject/shared"

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
>()("@projectproject/backend/Services/BannerPlaceholders") {}
