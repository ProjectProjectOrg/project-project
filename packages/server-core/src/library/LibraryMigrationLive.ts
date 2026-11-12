import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import * as LibraryMigration from "./LibraryMigration"

export const migrateLibraryOnBoot = Effect.gen(function* () {
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

export const LibraryMigrationLive = Layer.effectDiscard(migrateLibraryOnBoot)
