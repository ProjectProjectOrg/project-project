import { Db } from "@pp/db"
import { projectIndex, ticketIndex } from "@pp/db/schema"
import { JiraDestinationQueries } from "@pp/integration-jira/Migrations"
import { JiraError } from "@pp/shared"
import { and, eq, inArray } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export const JiraDestinationQueriesLive = Layer.effect(
  JiraDestinationQueries,
  Effect.gen(function* () {
    const db = yield* Db
    return JiraDestinationQueries.of({
      read: (organizationId, destinationTicketIds) =>
        Effect.gen(function* () {
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
        }).pipe(
          Effect.mapError(() => new JiraError({ reason: "server_error" }))
        )
    })
  })
)
