import { Db } from "@pp/db"
import { organization, projectIndex, projectStatus } from "@pp/db/schema"
import {
  finishedStatusSlugs,
  statusPhaseLookup,
  type StatusPhaseOf
} from "@pp/shared"
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
    phasesForProject: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<StatusPhaseOf>
  }>
>()("@pp/server-core/projects/FinishedStatuses") {
  static readonly layer = Layer.effect(
    FinishedStatuses,
    Effect.gen(function* () {
      const db = yield* Db
      const statuses = (orgSlug: string, slug: string) =>
        db
          .select({
            slug: projectStatus.slug,
            orderKey: projectStatus.orderKey
          })
          .from(projectStatus)
          .innerJoin(projectIndex, eq(projectIndex.id, projectStatus.projectId))
          .innerJoin(
            organization,
            eq(organization.id, projectIndex.organizationId)
          )
          .where(
            and(eq(organization.slug, orgSlug), eq(projectIndex.slug, slug))
          )
          .pipe(Effect.orDie)
      return {
        forProject: (orgSlug, slug) =>
          statuses(orgSlug, slug).pipe(Effect.map(finishedStatusSlugs)),
        phasesForProject: (orgSlug, slug) =>
          statuses(orgSlug, slug).pipe(Effect.map(statusPhaseLookup))
      }
    })
  )

  static readonly baseline = Layer.succeed(FinishedStatuses, {
    forProject: () => Effect.succeed(BASELINE_FINISHED),
    phasesForProject: () => Effect.succeed(statusPhaseLookup([]))
  })
}
