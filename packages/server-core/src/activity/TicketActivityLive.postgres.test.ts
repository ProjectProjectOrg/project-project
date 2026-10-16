import { randomUUID } from "node:crypto"

import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import { ActivityActor, TicketId, TicketStatus } from "@pp/shared"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import pg from "pg"
import { describe, expect } from "vitest"

import { contentHash, markdownFileContent } from "../markdown/fileContent"
import { Markdown } from "../markdown/Markdown"
import { MarkdownLive } from "../markdown/MarkdownLive"
import type { TicketScopedChange } from "./changes"
import { TicketActivity } from "./TicketActivity"
import { TicketActivityLive } from "./TicketActivityLive"

const { Client } = pg
const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.pathname.startsWith("/projectproject_effect_v4_")
  ) {
    throw new Error("Test requires an isolated local database")
  }
  process.env.DATABASE_URL = databaseUrl
}

const status = Schema.decodeUnknownSync(TicketStatus)
const ticketId = Schema.decodeUnknownSync(TicketId)

const withClient = <A>(use: (client: pg.Client) => Promise<A>) =>
  Effect.tryPromise(async () => {
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      return await use(client)
    } finally {
      await client.end()
    }
  }).pipe(Effect.orDie)

const TestLayer = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({
      prefix: "projectproject-ticket-activity-"
    })
    return TicketActivityLive.pipe(
      Layer.provideMerge(
        MarkdownLive.pipe(
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ PROJECTS_DIR: root })
            )
          )
        )
      ),
      Layer.provide(DbLive.pipe(Layer.provideMerge(PgLive)))
    )
  })
).pipe(Layer.provideMerge(BunServices.layer))

const seedProject = Effect.gen(function* () {
  const suffix = randomUUID().slice(0, 8)
  const fixture = {
    userId: `activity-user-${suffix}`,
    organizationId: `activity-org-${suffix}`,
    orgSlug: `activity-${suffix}`,
    slug: `activity-${suffix}`,
    projectId: randomUUID()
  }
  yield* withClient(async (client) => {
    await client.query(
      `insert into "user" (id, name, email, created_at, updated_at)
         values ($1, 'Activity User', $2, now(), now())`,
      [fixture.userId, `${fixture.userId}@example.com`]
    )
    await client.query(
      `insert into organization (id, name, slug, created_at)
         values ($1, 'Activity', $2, now())`,
      [fixture.organizationId, fixture.orgSlug]
    )
    await client.query(
      `insert into project_index
           (id, slug, organization_id, key, name, icon, color, created_by, created_at)
         values ($1, $2, $3, 'T', 'Activity', 'folder', 'blue', $4, now())`,
      [fixture.projectId, fixture.slug, fixture.organizationId, fixture.userId]
    )
  })
  yield* Effect.addFinalizer(() =>
    withClient(async (client) => {
      await client.query("delete from organization where id = $1", [
        fixture.organizationId
      ])
      await client.query(`delete from "user" where id = $1`, [fixture.userId])
    })
  )
  return fixture
})

const outboxCount = (projectId: string) =>
  withClient((client) =>
    client.query<{ count: string }>(
      "select count(*) from ticket_activity_outbox where project_id = $1",
      [projectId]
    )
  ).pipe(Effect.map((result) => Number(result.rows[0]?.count)))

const statusMove: ReadonlyArray<TicketScopedChange> = [
  {
    ticketId: ticketId("T-1"),
    change: {
      kind: "status_changed",
      from: status("todo"),
      to: status("done")
    }
  }
]

const writeTicketFile = (orgSlug: string, slug: string, title: string) =>
  Effect.gen(function* () {
    const markdown = yield* Markdown
    const frontmatter = { id: "T-1", title }
    const body = "Body\n"
    yield* markdown
      .createTicketFile(orgSlug, slug, "T-1", frontmatter, body)
      .pipe(Effect.catchTag("TicketIdTaken", () => Effect.void))
    yield* markdown.writeTicketFile(orgSlug, slug, "T-1", frontmatter, body)
    return markdownFileContent(frontmatter, body)
  })

const seedPendingBatch = (
  projectId: string,
  userId: string,
  hash: string,
  documentKind: "ticket" | "group" = "ticket",
  documentId = "T-1"
) =>
  withClient((client) =>
    client.query(
      `insert into ticket_activity_outbox
         (batch_id, project_id, document_kind, document_id, content_hash, rows)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        projectId,
        documentKind,
        documentId,
        hash,
        JSON.stringify([
          {
            id: randomUUID(),
            projectId,
            ticketId: "T-1",
            occurredAt: "2026-10-16T09:00:00.000Z",
            actorKind: "user",
            actorUserId: userId,
            actorClientId: null,
            actorClientName: null,
            actorSource: null,
            cause: null,
            change: { kind: "description_edited" }
          }
        ])
      ]
    )
  )

describe.skipIf(!databaseUrl)("TicketActivity outbox", () => {
  it.live("commits the batch once the document write succeeds", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      const activity = yield* TicketActivity
      yield* activity
        .record(
          project.orgSlug,
          project.slug,
          { kind: "ticket", id: "T-1", content: "after" },
          statusMove,
          "status_removed",
          writeTicketFile(project.orgSlug, project.slug, "After")
        )
        .pipe(
          Effect.provideService(
            ActivityActor,
            ActivityActor.agent(project.userId, { id: "c1", name: "Claude" })
          )
        )

      const page = yield* activity.page(
        project.projectId,
        "T-1",
        null,
        10,
        true
      )
      expect(page).toHaveLength(1)
      expect(page[0]).toMatchObject({
        actor: {
          kind: "agent",
          userId: project.userId,
          clientId: "c1",
          clientName: "Claude"
        },
        cause: "status_removed",
        change: { kind: "status_changed", from: "todo", to: "done" }
      })
      expect(yield* outboxCount(project.projectId)).toBe(0)
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("leaves no activity when the document write fails", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      const activity = yield* TicketActivity
      const exit = yield* activity
        .record(
          project.orgSlug,
          project.slug,
          { kind: "ticket", id: "T-1", content: "after" },
          statusMove,
          null,
          Effect.fail("disk full")
        )
        .pipe(
          Effect.provideService(ActivityActor, ActivityActor.system("github")),
          Effect.exit
        )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(
        yield* activity.page(project.projectId, "T-1", null, 10, true)
      ).toEqual([])
      expect(yield* outboxCount(project.projectId)).toBe(0)
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live(
    "recovery commits a batch whose write landed and drops one that did not",
    () =>
      Effect.gen(function* () {
        const project = yield* seedProject
        const activity = yield* TicketActivity
        const landed = yield* writeTicketFile(
          project.orgSlug,
          project.slug,
          "Landed"
        )
        yield* seedPendingBatch(
          project.projectId,
          project.userId,
          contentHash(landed)
        )
        yield* seedPendingBatch(
          project.projectId,
          project.userId,
          contentHash("a write that never reached the disk")
        )

        yield* activity.recover()

        expect(
          yield* activity.page(project.projectId, "T-1", null, 10, true)
        ).toHaveLength(1)
        expect(yield* outboxCount(project.projectId)).toBe(0)
      }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("recovery treats a missing document as a landed deletion", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      const activity = yield* TicketActivity
      yield* activity
        .record(
          project.orgSlug,
          project.slug,
          { kind: "group", id: "G-9", content: null },
          statusMove,
          "group_deleted",
          Effect.void
        )
        .pipe(
          Effect.provideService(
            ActivityActor,
            ActivityActor.user(project.userId)
          )
        )
      yield* seedPendingBatch(
        project.projectId,
        project.userId,
        "absent",
        "group",
        "G-9"
      )

      yield* activity.recover()

      expect(
        yield* activity.page(project.projectId, "T-1", null, 10, true)
      ).toHaveLength(2)
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live(
    "pages newest first, even within one millisecond, and removes a deleted ticket's history",
    () =>
      Effect.gen(function* () {
        const project = yield* seedProject
        const activity = yield* TicketActivity
        for (const title of ["One", "Two", "Three"]) {
          yield* activity
            .record(
              project.orgSlug,
              project.slug,
              { kind: "ticket", id: "T-1", content: title },
              [
                {
                  ticketId: statusMove[0].ticketId,
                  change: { kind: "title_changed", from: "", to: title }
                }
              ],
              null,
              Effect.void
            )
            .pipe(
              Effect.provideService(
                ActivityActor,
                ActivityActor.user(project.userId)
              )
            )
        }

        const first = yield* activity.page(
          project.projectId,
          "T-1",
          null,
          2,
          true
        )
        const second = yield* activity.page(
          project.projectId,
          "T-1",
          { occurredAt: first[1].occurredAt, seq: first[1].seq },
          2,
          true
        )
        expect(
          [...first, ...second].map((entry) =>
            entry.change.kind === "title_changed" ? entry.change.to : null
          )
        ).toEqual(["Three", "Two", "One"])

        yield* activity.removeTicket(project.orgSlug, project.slug, "T-1")
        expect(
          yield* activity.page(project.projectId, "T-1", null, 10, true)
        ).toEqual([])
      }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("a later write settles an earlier batch whose write landed", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      const activity = yield* TicketActivity
      const landed = yield* writeTicketFile(
        project.orgSlug,
        project.slug,
        "Landed"
      )
      yield* seedPendingBatch(
        project.projectId,
        project.userId,
        contentHash(landed)
      )

      yield* activity
        .record(
          project.orgSlug,
          project.slug,
          { kind: "ticket", id: "T-1", content: "after" },
          statusMove,
          null,
          writeTicketFile(project.orgSlug, project.slug, "Overwritten")
        )
        .pipe(
          Effect.provideService(
            ActivityActor,
            ActivityActor.user(project.userId)
          )
        )

      expect(
        (yield* activity.page(project.projectId, "T-1", null, 10, true)).map(
          (entry) => entry.change.kind
        )
      ).toEqual(["status_changed", "description_edited"])
      expect(yield* outboxCount(project.projectId)).toBe(0)
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("can leave git activity out of a page", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      const activity = yield* TicketActivity
      yield* activity
        .record(
          project.orgSlug,
          project.slug,
          { kind: "ticket", id: "T-1", content: "after" },
          [
            ...statusMove,
            {
              ticketId: statusMove[0].ticketId,
              change: { kind: "pr_merged", number: 12 }
            },
            {
              ticketId: statusMove[0].ticketId,
              change: { kind: "branch_linked", branch: "feat/T-1" }
            }
          ],
          null,
          Effect.void
        )
        .pipe(
          Effect.provideService(ActivityActor, ActivityActor.system("github"))
        )

      const kinds = (includeGit: boolean) =>
        activity
          .page(project.projectId, "T-1", null, 10, includeGit)
          .pipe(Effect.map((page) => page.map((entry) => entry.change.kind)))
      expect(yield* kinds(true)).toEqual([
        "branch_linked",
        "pr_merged",
        "status_changed"
      ])
      expect(yield* kinds(false)).toEqual(["status_changed"])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )
})
