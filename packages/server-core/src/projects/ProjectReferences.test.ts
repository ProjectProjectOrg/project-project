// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { Db, DbLive, migrationsFolder } from "@pp/db"
import {
  projectImport,
  projectImportReference,
  projectIndex
} from "@pp/db/schema"
import {
  ActivityActor,
  FixReferenceAction,
  NotFound,
  ProjectScope
} from "@pp/shared"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { projectScope } from "../access/testing"
import {
  entryFromDocument,
  makeTicketDocument,
  ticketId
} from "../tickets/testing"
import * as TicketCommands from "../tickets/TicketCommands"
import * as TicketDocs from "../tickets/TicketDocs"
import * as TicketIndex from "../tickets/TicketIndex"
import * as Users from "../users/Users"
import * as ProjectReferences from "./ProjectReferences"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("ProjectReferences", () => {
  const orgId = randomUUID()
  let pool: Pool
  const dbLayer = DbLive.pipe(
    Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl ?? "") })),
    Layer.orDie
  )

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
    await pool.query(
      'INSERT INTO "user" (id, name, email) VALUES ($1, $1, $2)',
      [orgId, `${orgId}@example.test`]
    )
    await pool.query(
      "INSERT INTO organization (id, name, slug, created_at) VALUES ($1, $1, $1, now())",
      [orgId]
    )
  })

  afterAll(async () => {
    if (!pool) return
    await pool.query("DELETE FROM organization WHERE id = $1", [orgId])
    await pool.query('DELETE FROM "user" WHERE id = $1', [orgId])
    await pool.end()
  })

  const fixture = Effect.fnUntraced(function* (
    status: "native" | "older-import" | "scanned-import",
    documents: ReadonlyArray<readonly [string, string]>,
    stored: ReadonlyArray<
      Pick<
        typeof projectImportReference.$inferInsert,
        "ticketId" | "kind" | "target"
      >
    > = []
  ) {
    const db = yield* Db
    const projectId = randomUUID()
    const scope = projectScope("member", "pm", {
      projectId,
      orgSlug: orgId,
      organizationId: orgId,
      userId: orgId,
      slug: projectId
    })
    yield* db.insert(projectIndex).values({
      id: projectId,
      organizationId: orgId,
      createdBy: orgId,
      slug: scope.slug,
      key: `PP${projectId.slice(0, 8).toUpperCase()}`,
      name: "Project",
      icon: "folder",
      color: "#000000"
    })
    if (status !== "native") {
      yield* db.insert(projectImport).values({
        id: projectId,
        organizationId: orgId,
        createdBy: orgId,
        status: "succeeded",
        destinationProjectId: projectId,
        referencesScanned: status === "scanned-import"
      })
    }
    if (stored.length > 0) {
      yield* db
        .insert(projectImportReference)
        .values(stored.map((row) => ({ ...row, projectId })))
    }
    const bodies = new Map(documents)
    const reads: Array<string> = []
    let listings = 0
    const layer = ProjectReferences.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(Db, db),
          Layer.mock(TicketDocs.TicketDocs, {
            listIds: () =>
              Effect.sync(() => {
                listings++
                return [...bodies.keys()].map((id) => ticketId(id))
              }),
            read: (_org, _slug, id) =>
              Effect.suspend(() => {
                reads.push(id)
                const body = bodies.get(id)
                return body === undefined
                  ? Effect.fail(new NotFound())
                  : Effect.succeed(makeTicketDocument(id, { body }))
              })
          }),
          Layer.mock(TicketIndex.TicketIndex, {
            mentionableIds: (_project, ids) =>
              Effect.succeed(new Set(ids.filter((id) => id === "other/PP-3"))),
            existingIds: (_project, ids) =>
              Effect.succeed(new Set(ids.filter((id) => bodies.has(id))))
          }),
          Users.layer.pipe(Layer.provide(Layer.succeed(Db, db))),
          Layer.mock(TicketCommands.TicketCommands, {
            update: (id, input) =>
              Effect.sync(() => {
                const body = input.body ?? ""
                bodies.set(id, body)
                return {
                  ticket: {
                    ...entryFromDocument(makeTicketDocument(id, { body })),
                    sprint: null,
                    parentState: null,
                    relations: {
                      blockedBy: [],
                      blocking: [],
                      related: [],
                      duplicateOf: null,
                      duplicates: []
                    },
                    creator: null,
                    updater: null,
                    gitState: { tag: "no_branch", baseBranch: "main" },
                    stack: [],
                    body
                  },
                  orderKey: null
                }
              })
          })
        )
      ),
      Layer.provideMerge(Layer.succeed(ProjectScope, scope)),
      Layer.provideMerge(
        Layer.succeed(ActivityActor, ActivityActor.user(orgId))
      )
    )
    return { projectId, bodies, reads, listings: () => listings, layer }
  })

  it.live(
    "revalidates tracked descriptions without reading other ticket files",
    () =>
      Effect.gen(function* () {
        const { reads, listings, layer } = yield* fixture(
          "scanned-import",
          [
            [
              "PP-1",
              "Ask [Robert](mention:user/old-bob). Also [Bob](mention:user/old-bob)."
            ],
            ["PP-2", "This description removed its broken mention."],
            ["PP-3", "[Untracked](mention:ticket/OLD-99)"]
          ],
          [
            { ticketId: "PP-1", kind: "user", target: "old-bob" },
            { ticketId: "PP-2", kind: "ticket", target: "OLD-2" }
          ]
        )
        yield* Effect.gen(function* () {
          const references = yield* ProjectReferences.ProjectReferences
          const { items } = yield* references.list()
          expect(reads.toSorted()).toEqual(["PP-1", "PP-2"])
          expect(listings()).toBe(0)
          expect(items.map(({ ticketId, label }) => [ticketId, label])).toEqual(
            [
              ["PP-1", "Robert"],
              ["PP-1", "Bob"]
            ]
          )
          reads.length = 0
          yield* references.list()
          expect(reads).toEqual(["PP-1"])
        }).pipe(Effect.provide(layer))
      }).pipe(Effect.provide(dbLayer))
  )

  it.live("prunes targets that now resolve", () =>
    Effect.gen(function* () {
      const { projectId, layer } = yield* fixture(
        "scanned-import",
        [
          [
            "PP-1",
            `[User](mention:user/${orgId}) [Local](mention:ticket/PP-1) [Moved](mention:ticket/other/PP-3)`
          ]
        ],
        [
          { ticketId: "PP-1", kind: "user", target: orgId },
          { ticketId: "PP-1", kind: "ticket", target: "PP-1" },
          { ticketId: "PP-1", kind: "ticket", target: "other/PP-3" }
        ]
      )
      yield* Effect.gen(function* () {
        const references = yield* ProjectReferences.ProjectReferences
        expect((yield* references.list()).items).toEqual([])
      }).pipe(Effect.provide(layer))
      const db = yield* Db
      expect(
        yield* db
          .select()
          .from(projectImportReference)
          .where(eq(projectImportReference.projectId, projectId))
      ).toEqual([])
    }).pipe(Effect.provide(dbLayer))
  )

  it.live(
    "does no ticket file work for a project that was never imported",
    () =>
      Effect.gen(function* () {
        const { reads, listings, layer } = yield* fixture("native", [
          ["PP-1", "[Untracked](mention:ticket/OLD-99)"]
        ])
        yield* Effect.gen(function* () {
          const references = yield* ProjectReferences.ProjectReferences
          expect((yield* references.list()).items).toEqual([])
          expect(listings()).toBe(0)
          expect(reads).toEqual([])
        }).pipe(Effect.provide(layer))
      }).pipe(Effect.provide(dbLayer))
  )

  it.live(
    "backfills a previously imported project once when there are no findings",
    () =>
      Effect.gen(function* () {
        const { reads, listings, layer } = yield* fixture("older-import", [
          ["PP-1", "[Self](mention:ticket/PP-1)"]
        ])
        yield* Effect.gen(function* () {
          const references = yield* ProjectReferences.ProjectReferences
          const results = yield* Effect.all(
            [references.list(), references.list()],
            { concurrency: 2 }
          )
          expect(results.map(({ items }) => items)).toEqual([[], []])
          expect(listings()).toBe(1)
          expect(reads).toEqual(["PP-1"])
        }).pipe(Effect.provide(layer))
      }).pipe(Effect.provide(dbLayer))
  )

  it.live("fixes every occurrence and removes its stored rows", () =>
    Effect.gen(function* () {
      const { bodies, reads, layer } = yield* fixture(
        "scanned-import",
        [
          [
            "PP-1",
            "[Bob](mention:user/old-bob) and [Bob](mention:user/old-bob)."
          ],
          ["PP-2", "Again [Bob](mention:user/old-bob)."]
        ],
        [
          { ticketId: "PP-1", kind: "user", target: "old-bob" },
          { ticketId: "PP-2", kind: "user", target: "old-bob" }
        ]
      )
      yield* Effect.gen(function* () {
        const references = yield* ProjectReferences.ProjectReferences
        const { items } = yield* references.fix({
          kind: "user",
          target: "old-bob",
          ticketId: null,
          action: FixReferenceAction.cases.plain.make({})
        })
        expect(items).toEqual([])
        expect(bodies.get("PP-1")).toBe("Bob and Bob.")
        expect(bodies.get("PP-2")).toBe("Again Bob.")
        reads.length = 0
        expect((yield* references.list()).items).toEqual([])
        expect(reads).toEqual([])
      }).pipe(Effect.provide(layer))
    }).pipe(Effect.provide(dbLayer))
  )
})
