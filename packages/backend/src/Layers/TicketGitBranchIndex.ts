import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "@effect/sql/SqlClient"
import { and, eq } from "drizzle-orm"
import { organization, ticketGithubBranchIndex } from "../db/schema"
import { Db } from "../Services/Db"
import {
  TicketGitBranchIndex,
  type TicketGitBranchIndexConnection
} from "../Services/TicketGitBranchIndex"

export const TicketGitBranchIndexLive = Layer.effect(
  TicketGitBranchIndex,
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient

    const rowFor = (
      connection: TicketGitBranchIndexConnection,
      ticketId: string,
      branch: string,
      updatedAt: Date
    ) => ({
      projectIntegrationLinkId: connection.projectIntegrationLinkId,
      organizationId: connection.organizationId,
      projectId: connection.projectId,
      projectSlug: connection.projectSlug,
      ticketId,
      branch,
      updatedAt
    })

    const upsertTicketBranch = Effect.fn(
      "TicketGitBranchIndex.upsertTicketBranch"
    )(function* (
      connection: TicketGitBranchIndexConnection,
      ticketId: string,
      branch: string
    ) {
      const updatedAt = yield* DateTime.nowAsDate
      yield* db
        .insert(ticketGithubBranchIndex)
        .values(rowFor(connection, ticketId, branch, updatedAt))
        .onConflictDoUpdate({
          target: [
            ticketGithubBranchIndex.projectIntegrationLinkId,
            ticketGithubBranchIndex.ticketId
          ],
          set: {
            organizationId: connection.organizationId,
            projectId: connection.projectId,
            projectSlug: connection.projectSlug,
            branch,
            updatedAt
          }
        })
        .pipe(Effect.orDie)
    })

    const clearTicket = Effect.fn("TicketGitBranchIndex.clearTicket")(
      function* (projectIntegrationLinkId: string, ticketId: string) {
        yield* db
          .delete(ticketGithubBranchIndex)
          .where(
            and(
              eq(
                ticketGithubBranchIndex.projectIntegrationLinkId,
                projectIntegrationLinkId
              ),
              eq(ticketGithubBranchIndex.ticketId, ticketId)
            )
          )
          .pipe(Effect.orDie)
      }
    )

    const clearProjectConnection = Effect.fn(
      "TicketGitBranchIndex.clearProjectConnection"
    )(function* (projectIntegrationLinkId: string) {
      yield* db
        .delete(ticketGithubBranchIndex)
        .where(
          eq(
            ticketGithubBranchIndex.projectIntegrationLinkId,
            projectIntegrationLinkId
          )
        )
        .pipe(Effect.orDie)
    })

    const rebuildProjectConnection = Effect.fn(
      "TicketGitBranchIndex.rebuildProjectConnection"
    )(function* (
      connection: TicketGitBranchIndexConnection,
      tickets: ReadonlyArray<{
        readonly ticketId: string
        readonly branch: string
      }>
    ) {
      const updatedAt = yield* DateTime.nowAsDate
      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* clearProjectConnection(connection.projectIntegrationLinkId)
            if (tickets.length === 0) return
            yield* db
              .insert(ticketGithubBranchIndex)
              .values(
                tickets.map((ticket) =>
                  rowFor(connection, ticket.ticketId, ticket.branch, updatedAt)
                )
              )
              .pipe(Effect.orDie)
          })
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
    })

    const findTicketsByBranch = Effect.fn(
      "TicketGitBranchIndex.findTicketsByBranch"
    )(function* (projectIntegrationLinkId: string, branch: string) {
      return yield* db
        .select({
          organizationId: ticketGithubBranchIndex.organizationId,
          organizationSlug: organization.slug,
          projectId: ticketGithubBranchIndex.projectId,
          projectSlug: ticketGithubBranchIndex.projectSlug,
          ticketId: ticketGithubBranchIndex.ticketId,
          branch: ticketGithubBranchIndex.branch
        })
        .from(ticketGithubBranchIndex)
        .innerJoin(
          organization,
          eq(organization.id, ticketGithubBranchIndex.organizationId)
        )
        .where(
          and(
            eq(
              ticketGithubBranchIndex.projectIntegrationLinkId,
              projectIntegrationLinkId
            ),
            eq(ticketGithubBranchIndex.branch, branch)
          )
        )
        .pipe(Effect.orDie)
    })

    return {
      upsertTicketBranch,
      clearTicket,
      clearProjectConnection,
      rebuildProjectConnection,
      findTicketsByBranch
    }
  })
)
