import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import * as LibraryMigration from "./LibraryMigration"

const migrateTemplatesOnBoot = Effect.gen(function* () {
  const migration = yield* LibraryMigration.LibraryMigration
  const summary = yield* migration.migrateTemplates()
  yield* Effect.logInfo("library migration complete", {
    migratedLayers: summary.migrated.length,
    failedLayers: summary.failed.length
  })
}).pipe(
  Effect.catchCause((cause) =>
    Effect.logError("library migration failed", cause)
  )
)

const migrateTicketTypesOnBoot = Effect.gen(function* () {
  const migration = yield* LibraryMigration.LibraryMigration
  const tickets = yield* migration.migrateTicketTypes()
  yield* Effect.logInfo("ticket type migration complete", {
    migratedProjects: tickets.migrated.length,
    rewrittenTickets: tickets.migrated.reduce(
      (total, project) => total + project.rewritten,
      0
    ),
    failedProjects: tickets.failed.length
  })
}).pipe(
  Effect.catchCause((cause) =>
    Effect.logError("ticket type migration failed", cause)
  )
)

export const LibraryMigrationLive = Layer.effectDiscard(
  migrateTemplatesOnBoot.pipe(
    Effect.andThen(Effect.forkScoped(migrateTicketTypesOnBoot))
  )
)
