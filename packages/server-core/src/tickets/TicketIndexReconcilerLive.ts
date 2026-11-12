import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { backfillRepositories } from "../github/repositoryBackfill"
import * as TicketIndexMaintenance from "./TicketIndexMaintenance"

export const reconcileTicketIndexOnBoot = Effect.gen(function* () {
  const maintenance = yield* TicketIndexMaintenance.TicketIndexMaintenance
  yield* backfillRepositories().pipe(
    Effect.tap((projects) =>
      Effect.logInfo("GitHub ticket repository backfill complete", {
        projects: projects.length,
        stamped: projects.reduce(
          (total, project) => total + project.stamped,
          0
        ),
        withoutRepository: projects.flatMap((project) =>
          project.repoId === null ? [`${project.orgSlug}/${project.slug}`] : []
        )
      })
    ),
    Effect.catchCause((cause) =>
      Effect.logError("GitHub ticket repository backfill failed", cause)
    )
  )
  const summary = yield* maintenance.reconcileAllProjects()
  yield* Effect.logInfo("ticket index reconciliation complete", {
    projects: summary.projects.length,
    reconciled: summary.reconciled
  })
}).pipe(
  Effect.catchCause((cause) =>
    Effect.logError("ticket index reconciliation failed", cause)
  )
)

export const TicketIndexReconcilerLive = Layer.effectDiscard(
  Effect.forkScoped(reconcileTicketIndexOnBoot)
)
