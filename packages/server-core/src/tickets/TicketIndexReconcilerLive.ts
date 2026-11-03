import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import * as TicketIndexMaintenance from "./TicketIndexMaintenance"

export const reconcileTicketIndexOnBoot = Effect.gen(function* () {
  const maintenance = yield* TicketIndexMaintenance.TicketIndexMaintenance
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
