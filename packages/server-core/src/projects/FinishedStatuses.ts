import { Db } from "@pp/db"
import { organization, projectIndex, projectStatus } from "@pp/db/schema"
import { finishedStatusSlugs } from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

const BASELINE_FINISHED: ReadonlySet<string> = new Set(["done"])

export class FinishedStatuses extends Context.Service<
  FinishedStatuses,
  Readonly<{
    forProject: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<ReadonlySet<string>>
  }>
>()("@pp/server-core/projects/FinishedStatuses") {
  static readonly layer = Layer.effect(
    FinishedStatuses,
    Effect.gen(function* () {
      const db = yield* Db
      return {
        forProject: (orgSlug, slug) =>
          db
            .select({
              slug: projectStatus.slug,
              orderKey: projectStatus.orderKey
            })
            .from(projectStatus)
            .innerJoin(
              projectIndex,
              eq(projectIndex.id, projectStatus.projectId)
            )
            .innerJoin(
              organization,
              eq(organization.id, projectIndex.organizationId)
            )
            .where(
              and(eq(organization.slug, orgSlug), eq(projectIndex.slug, slug))
            )
            .pipe(Effect.map(finishedStatusSlugs), Effect.orDie)
      }
    })
  )

  static readonly baseline = Layer.succeed(FinishedStatuses, {
    forProject: () => Effect.succeed(BASELINE_FINISHED)
  })
}
