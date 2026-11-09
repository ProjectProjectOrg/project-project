// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import { ActivityActor } from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import {
  parseCommentsRegion,
  serializeCommentsRegion
} from "../comments/comments-region"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import {
  isoDate,
  makeFakeTicketDocs,
  makeFakeTicketIndex,
  makeTicketDocument,
  ticketIndexProject
} from "./testing"
import * as TicketDocs from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import * as TicketRewrites from "./TicketRewrites"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("claiming an invited Jira identity", () => {
  const id = randomUUID()
  const invitee = `${id}-invitee`
  let pool: Pool

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error("Test requires an isolated local database")
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), { migrationsFolder })
    for (const user of [id, invitee]) {
      await pool.query(
        'INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES ($1,$1,$2,now(),now())',
        [user, `${user}@example.test`]
      )
    }
    await pool.query(
      "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$1,$1,now())",
      [id]
    )
    await pool.query(
      "INSERT INTO project_index (id,organization_id,slug,key,name,icon,color,created_by) VALUES ($1,$2,'project','T','Project','folder','#3b82f6',$3)",
      [id, id, id]
    )
    await pool.query(
      `INSERT INTO comment_index (id,project_id,ticket_id,origin,author_kind,author_id,jira_display_name,jira_account_id)
       VALUES ('c_old',$1,'T-2','jira','jira',NULL,'Jan (old)','jira-old'),
              ('c_other',$1,'T-2','jira','jira',NULL,'Piet','jira-other')`,
      [id]
    )
  })

  afterAll(async () => {
    if (!pool) return
    await pool.query("DELETE FROM organization WHERE id = $1", [id])
    await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [[id, invitee]])
    await pool.end()
  })

  const jiraComment = (commentId: string, accountId: string) => ({
    id: commentId,
    author: { kind: "jira" as const, displayName: accountId, accountId },
    origin: "jira" as const,
    createdAt: isoDate("2026-09-01T10:00:00.000Z"),
    editedAt: null,
    body: `From ${accountId}`
  })

  it.effect(
    "assigns their tickets, credits their reports and takes over their comments",
    () => {
      const docs = makeFakeTicketDocs([])
      for (const document of [
        makeTicketDocument("T-1", { assignees: [] }),
        makeTicketDocument("T-2", {
          commentsRegion: serializeCommentsRegion([
            jiraComment("c_old", "jira-old"),
            jiraComment("c_other", "jira-other")
          ])
        }),
        makeTicketDocument("T-3")
      ])
        docs.documents.set(document.id, document)
      const index = makeFakeTicketIndex(new Map(docs.documents), {
        projectFor: () =>
          Effect.succeed({ ...ticketIndexProject, projectId: id })
      })
      const layer = TicketRewrites.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(TicketDocs.TicketDocs, docs.service),
            index,
            FinishedStatuses.baseline,
            TicketDocumentLock.layer,
            DbLive.pipe(
              Layer.provide(
                PgClient.layer({ url: Redacted.make(databaseUrl ?? "") })
              )
            )
          )
        ),
        Layer.orDie
      )
      return Effect.gen(function* () {
        const rewrites = yield* TicketRewrites.TicketRewrites
        yield* rewrites.claimJiraIdentity("org", "p", {
          userId: invitee,
          jiraAccountIds: ["jira-new", "jira-old"],
          assigneeTicketIds: ["T-1"],
          reporterTicketIds: ["T-3"]
        })

        expect(docs.documents.get("T-1")?.assignees).toEqual([invitee])
        expect(docs.documents.get("T-3")?.createdBy).toBe(invitee)
        expect(
          parseCommentsRegion(
            docs.documents.get("T-2")?.commentsRegion ?? ""
          ).map(({ id: commentId, author }) => [commentId, author])
        ).toEqual([
          ["c_old", { kind: "user", userId: invitee }],
          [
            "c_other",
            { kind: "jira", displayName: "jira-other", accountId: "jira-other" }
          ]
        ])
        const { rows } = yield* Effect.promise(() =>
          pool.query(
            "SELECT id, author_kind, author_id FROM comment_index WHERE project_id = $1 ORDER BY id",
            [id]
          )
        )
        expect(rows).toEqual([
          { id: "c_old", author_kind: "user", author_id: invitee },
          { id: "c_other", author_kind: "jira", author_id: null }
        ])
      }).pipe(
        Effect.provideService(ActivityActor, ActivityActor.system("import")),
        Effect.provide(layer)
      )
    }
  )
})
