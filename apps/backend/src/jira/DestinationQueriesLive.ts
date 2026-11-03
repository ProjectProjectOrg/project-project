import { Db } from "@pp/db"
import { projectIndex, ticketIndex } from "@pp/db/schema"
import * as Migrations from "@pp/integration-jira/Migrations"
import { JiraError } from "@pp/shared"
import { and, eq, inArray } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

const make = Effect.gen(function* () {
  const db = yield* Db

  const read = Effect.fn("JiraDestinationQueries.read")(
    function* (
      organizationId: string,
      destinationTicketIds: ReadonlyArray<string>
    ) {
      const projects = yield* db
        .select({
          id: projectIndex.id,
          organizationId: projectIndex.organizationId,
          slug: projectIndex.slug,
          key: projectIndex.key
        })
        .from(projectIndex)
      const batches = Array.from(
        { length: Math.ceil(destinationTicketIds.length / 1000) },
        (_, index) =>
          destinationTicketIds.slice(index * 1000, (index + 1) * 1000)
      )
      const tickets = (yield* Effect.forEach(batches, (batch) =>
        db
          .select({
            projectId: ticketIndex.projectId,
            ticketId: ticketIndex.ticketId
          })
          .from(ticketIndex)
          .where(
            and(
              eq(ticketIndex.organizationId, organizationId),
              inArray(ticketIndex.ticketId, batch)
            )
          )
      )).flat()
      return { projects, tickets }
    },
    Effect.mapError(() => new JiraError({ reason: "server_error" }))
  )

  return Migrations.JiraDestinationQueries.of({ read })
})

export const JiraDestinationQueriesLive = Layer.effect(
  Migrations.JiraDestinationQueries,
  make
)
