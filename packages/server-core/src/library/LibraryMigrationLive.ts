import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import * as TicketIndex from "../tickets/TicketIndex"
import * as TicketIndexMaintenance from "../tickets/TicketIndexMaintenance"
import * as LibraryMigration from "./LibraryMigration"

const reindexProject = (project: LibraryMigration.ProjectRef) =>
  Effect.gen(function* () {
    const ticketIndex = yield* TicketIndex.TicketIndex
    const maintenance = yield* TicketIndexMaintenance.TicketIndexMaintenance
    const indexed = yield* ticketIndex.projectFor(
      project.orgSlug,
      project.projectSlug
    )
    yield* maintenance.reconcileProject(indexed, { force: true })
  }).pipe(
    Effect.catchTag("NotFound", () => Effect.void),
    Effect.catchCause((cause) =>
      Effect.logError("library migration: ticket index rebuild failed", cause)
    ),
    Effect.annotateLogs(project)
  )

export const migrateLibraryOnBoot = Effect.gen(function* () {
  const migration = yield* LibraryMigration.LibraryMigration
  const summary = yield* migration.migrateTemplates()
  yield* Effect.logInfo("library migration complete", {
    migratedLayers: summary.migrated.length,
    failedLayers: summary.failed.length
  })
  const tickets = yield* migration.migrateTicketTypes()
  yield* Effect.forEach(tickets.migrated, reindexProject, { discard: true })
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
    Effect.logError("library migration failed", cause)
  )
)

export const LibraryMigrationLive = Layer.effectDiscard(migrateLibraryOnBoot)
