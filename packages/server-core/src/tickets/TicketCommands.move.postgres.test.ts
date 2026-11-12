// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import {
  ActivityActor,
  CurrentUser,
  NotFound,
  ProjectScope,
  Slug,
  TagName,
  TypeKey
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { accessLayer, projectScope } from "../access/testing"
import {
  recordingActivityLayer,
  type RecordedActivity
} from "../activity/testing"
import * as Library from "../library/Library"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import * as ProjectDocs from "../projects/ProjectDocs"
import {
  FakeGroups,
  makeFakeGroups,
  FakeUsers,
  PassthroughLibrary,
  isoDate,
  makeFakeAttachments,
  makeFakeFigmaLinks,
  makeFakeProjectGithub,
  makeFakeProjectMembers,
  makeFakeProjects,
  makeFakeTicketDocs,
  makeFakeTicketIndex,
  makeTicketDocument,
  projectKey,
  ticketId,
  ticketStatus
} from "./testing"
import * as TicketCommands from "./TicketCommands"
import * as TicketDocs from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import * as TicketView from "./TicketView"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const tagName = Schema.decodeSync(TagName)
const slug = Schema.decodeSync(Slug)

describe.skipIf(!databaseUrl)("moving a ticket to another project", () => {
  const userId = randomUUID()
  const outsiderId = randomUUID()
  const orgId = randomUUID()
  const sourceId = randomUUID()
  const destinationId = randomUUID()
  const scopeOf = (projectId: string, projectSlug: string, role: "pm" | null) =>
    projectScope(role === null ? "admin" : "member", role, {
      userId,
      organizationId: orgId,
      projectId,
      orgSlug: orgId,
      slug: projectSlug
    })
  const source = scopeOf(sourceId, "inbox", "pm")
  const destination = scopeOf(destinationId, "product", "pm")
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
    for (const id of [userId, outsiderId]) {
      await pool.query(
        'INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES ($1,$1,$2,now(),now())',
        [id, `${id}@example.test`]
      )
    }
    await pool.query(
      "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$1,$1,now())",
      [orgId]
    )
    await pool.query(
      "INSERT INTO project_index (id,organization_id,slug,key,name,icon,color,estimation,created_by) VALUES ($1,$3,'inbox','T','Inbox','folder','#3b82f6','points',$4), ($2,$3,'product','PRD','Product','folder','#3b82f6','tshirt',$4)",
      [sourceId, destinationId, orgId, userId]
    )
    await pool.query(
      "INSERT INTO project_status (project_id,slug,label,icon,color,order_key,created_by) VALUES ($1,'todo','Todo','Circle','#a3a3a3','a1',$3), ($1,'triage','Triage','Circle','#a3a3a3','a0',$3), ($2,'backlog','Backlog','Circle','#a3a3a3','a0',$3), ($2,'todo','Todo','Circle','#a3a3a3','a1',$3), ($2,'doing','Doing','Circle','#a3a3a3','a2',$3)",
      [sourceId, destinationId, userId]
    )
    await pool.query(
      "INSERT INTO project_tag (project_id,name,color,created_by) VALUES ($1,'ui','#22c55e',$3), ($1,'inbox-only','#22c55e',$3), ($2,'ui','#22c55e',$3)",
      [sourceId, destinationId, userId]
    )
  })

  afterAll(async () => {
    if (!pool) return
    await pool.query("DELETE FROM organization WHERE id = $1", [orgId])
    await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [
      [userId, outsiderId]
    ])
    await pool.end()
  })

  const fixture = (
    destinationScope = destination,
    groups = FakeGroups,
    library: Layer.Layer<Library.Library> = PassthroughLibrary
  ) => {
    const docs = makeFakeTicketDocs([])
    const put = (document: TicketDocs.TicketDocument) =>
      docs.documents.set(document.id, document)
    const service: TicketDocs.TicketDocs["Service"] = {
      ...docs.service,
      readRaw: (_org, _slug, id) => {
        const document = docs.documents.get(id)
        return document
          ? Effect.succeed({
              path: `${id}.md`,
              content: TicketDocs.ticketFileContent(document)
            })
          : Effect.fail(new NotFound())
      }
    }
    const recorded: Array<RecordedActivity> = []
    const layer = TicketCommands.layer.pipe(
      Layer.provide(TicketView.layer),
      Layer.provide(
        Layer.mock(ProjectDocs.ProjectDocs, {
          read: (_org, projectSlug) =>
            Effect.succeed({
              slug: slug(projectSlug),
              name: projectSlug,
              icon: "folder",
              color: "#3b82f6",
              createdAt: isoDate("2026-01-01T00:00:00Z"),
              github: null,
              githubRepos: [],
              estimation: projectSlug === "inbox" ? "points" : "tshirt",
              body: "",
              setup: {
                workflowReviewedAt: null,
                invitePeopleDismissedAt: null,
                connectGithubDismissedAt: null
              }
            })
        })
      ),
      Layer.provide(accessLayer({ projects: [source, destinationScope] })),
      Layer.provide(library),
      Layer.provide(Layer.succeed(TicketDocs.TicketDocs, service)),
      Layer.provideMerge(recordingActivityLayer(recorded, userId)),
      Layer.provide(makeFakeAttachments()),
      Layer.provide(makeFakeFigmaLinks()),
      Layer.provide(
        makeFakeProjects("T", {
          key: () =>
            Effect.map(ProjectScope, (scope) =>
              projectKey(scope.slug === "inbox" ? "T" : "PRD")
            )
        })
      ),
      Layer.provide(
        makeFakeProjectMembers({
          memberIds: () =>
            Effect.map(
              ProjectScope,
              (scope) =>
                new Set(
                  scope.slug === "inbox" ? [userId, outsiderId] : [userId]
                )
            )
        })
      ),
      Layer.provide(makeFakeProjectGithub()),
      Layer.provide(groups),
      Layer.provide(FakeUsers),
      Layer.provide(makeFakeTicketIndex(docs.documents)),
      Layer.provide(
        DbLive.pipe(
          Layer.provide(
            PgClient.layer({ url: Redacted.make(databaseUrl ?? "") })
          )
        )
      ),
      Layer.provide(TicketDocumentLock.layer),
      Layer.provide(FinishedStatuses.baseline),
      Layer.orDie
    )
    return { documents: docs.documents, put, recorded, layer }
  }

  const run = <A, E>(
    layer: ReturnType<typeof fixture>["layer"],
    effect: Effect.Effect<
      A,
      E,
      TicketCommands.TicketCommands | ProjectScope | ActivityActor | CurrentUser
    >
  ) =>
    effect.pipe(
      Effect.provideService(ProjectScope, source),
      Effect.provideService(CurrentUser, { id: userId } as never),
      Effect.provide(layer)
    )

  it.effect(
    "gives the ticket and its sub-tickets new ids, maps their fields and keeps mentions pointing at the right tickets",
    () => {
      const { documents, put, recorded, layer } = fixture()
      put(
        makeTicketDocument("T-1", {
          status: ticketStatus("triage"),
          tags: [tagName("ui"), tagName("inbox-only")],
          assignees: [userId, outsiderId],
          estimate: { unit: "points", value: 3 },
          branch: "feat/T-1-thing",
          body: "See [T-2](mention:ticket/T-2) and [T-3](mention:ticket/T-3)",
          commentsRegion: "about [the other](mention:ticket/T-3)"
        })
      )
      put(
        makeTicketDocument("T-2", {
          parent: ticketId("T-1"),
          status: ticketStatus("todo")
        })
      )
      put(
        makeTicketDocument("T-3", {
          body: "Blocked by [T-1](mention:ticket/T-1)"
        })
      )
      return run(
        layer,
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            pool.query(
              "INSERT INTO ticket_activity (id,project_id,ticket_id,occurred_at,actor_kind,actor_user_id,change) VALUES ($1,$2,'T-1',now(),'user',$3,$4)",
              [randomUUID(), sourceId, userId, '{"kind":"description_edited"}']
            )
          )
          const commands = yield* TicketCommands.TicketCommands
          const result = yield* commands.move("T-1", {
            toProject: slug("product"),
            status: ticketStatus("doing")
          })

          expect(result.projectSlug).toBe("product")
          expect(result.moved.map(({ from }) => from)).toEqual(["T-1", "T-2"])
          const [root, child] = result.moved.map(({ to }) => to)
          expect(result.id).toBe(root)
          expect(root.startsWith("PRD-")).toBe(true)
          expect(documents.has("T-1")).toBe(false)
          expect(documents.has("T-2")).toBe(false)

          const moved = documents.get(root)
          expect(moved).toMatchObject({
            status: "doing",
            tags: ["ui"],
            assignees: [userId],
            branch: null,
            movedFrom: ["inbox/T-1"],
            body: `See [${child}](mention:ticket/${child}) and [T-3](mention:ticket/inbox/T-3)`,
            commentsRegion: "about [the other](mention:ticket/inbox/T-3)"
          })
          expect(moved?.estimate).toBeUndefined()
          expect(documents.get(child)).toMatchObject({
            parent: root,
            status: "todo",
            movedFrom: ["inbox/T-2"]
          })
          expect(documents.get("T-3")?.body).toBe(
            `Blocked by [${root}](mention:ticket/product/${root})`
          )

          const activity = yield* Effect.promise(() =>
            pool.query(
              "SELECT project_id, ticket_id FROM ticket_activity WHERE project_id = ANY($1)",
              [[sourceId, destinationId]]
            )
          )
          expect(activity.rows).toEqual([
            { project_id: destinationId, ticket_id: root }
          ])
          expect(
            recorded.flatMap(({ changes }) =>
              changes.map(({ ticketId, change }) => [ticketId, change])
            )
          ).toEqual([
            [root, { kind: "moved", fromProject: "inbox", fromId: "T-1" }],
            [child, { kind: "moved", fromProject: "inbox", fromId: "T-2" }]
          ])
        })
      )
    }
  )

  it.effect("keeps the status when the destination has it", () => {
    const { documents, put, layer } = fixture()
    put(makeTicketDocument("T-1", { status: ticketStatus("todo") }))
    return run(
      layer,
      Effect.gen(function* () {
        const commands = yield* TicketCommands.TicketCommands
        const result = yield* commands.move("T-1", {
          toProject: slug("product")
        })
        expect(documents.get(result.id)?.status).toBe("todo")
      })
    )
  })

  const destinationTypes = Layer.mock(Library.Library, {
    resolveSynced: (_orgSlug, _slug, body) => Effect.succeed(body),
    typeKeys: (_orgSlug, projectSlug) =>
      Effect.succeed(
        new Set<string>(
          projectSlug === "product"
            ? ["feat", "bug", "spike"]
            : ["feat", "bug", "epic", "spike", "research"]
        )
      )
  })

  it.effect(
    "keeps a type the destination has, drops one it doesn't, for sub-tickets too, and reports it",
    () => {
      const { documents, put, layer } = fixture(
        destination,
        FakeGroups,
        destinationTypes
      )
      put(
        makeTicketDocument("T-1", {
          type: TypeKey.make("spike"),
          tags: [tagName("inbox-only")]
        })
      )
      put(
        makeTicketDocument("T-2", {
          parent: ticketId("T-1"),
          type: TypeKey.make("research")
        })
      )
      put(makeTicketDocument("T-3", { parent: ticketId("T-1"), type: null }))
      return run(
        layer,
        Effect.gen(function* () {
          const commands = yield* TicketCommands.TicketCommands
          const result = yield* commands.move("T-1", {
            toProject: slug("product")
          })
          const movedFrom = new Map(
            result.moved.map((entry) => [entry.from, entry])
          )
          const typeOf = (id: string) =>
            documents.get(movedFrom.get(ticketId(id))?.to ?? ticketId(id))?.type
          expect(typeOf("T-1")).toBe("spike")
          expect(typeOf("T-2")).toBeNull()
          expect(typeOf("T-3")).toBeNull()
          expect(movedFrom.get(ticketId("T-1"))?.dropped).toEqual({
            type: null,
            tags: ["inbox-only"],
            assignees: [],
            estimate: false
          })
          expect(movedFrom.get(ticketId("T-2"))?.dropped.type).toBe("research")
          expect(movedFrom.get(ticketId("T-3"))?.dropped.type).toBeNull()
        })
      )
    }
  )

  it.effect("an epic stays an epic when the destination hides epics", () => {
    const { documents, put, layer } = fixture(
      destination,
      FakeGroups,
      destinationTypes
    )
    put(makeTicketDocument("T-1", { type: TypeKey.make("epic") }))
    return run(
      layer,
      Effect.gen(function* () {
        const commands = yield* TicketCommands.TicketCommands
        const result = yield* commands.move("T-1", {
          toProject: slug("product")
        })
        expect(documents.get(result.id)?.type).toBe("epic")
        expect(result.moved[0].dropped.type).toBeNull()
      })
    )
  })

  it.effect("refuses an epic that still has tickets", () => {
    const { documents, put, layer } = fixture()
    put(makeTicketDocument("T-1", { type: TypeKey.make("epic") }))
    put(makeTicketDocument("T-2", { parent: ticketId("T-1") }))
    return run(
      layer,
      Effect.gen(function* () {
        const commands = yield* TicketCommands.TicketCommands
        const error = yield* Effect.flip(
          commands.move("T-1", { toProject: slug("product") })
        )
        expect(error).toMatchObject({
          _tag: "Validation",
          reason: "move_epic_has_tickets"
        })
        expect([...documents.keys()]).toEqual(["T-1", "T-2"])
      })
    )
  })

  it.effect(
    "leaves the ticket where it was when it can't be taken out of its sprint",
    () => {
      const { documents, put, layer } = fixture(
        destination,
        makeFakeGroups({
          removeTicketFromAllGroups: () => Effect.die(new Error("disk full"))
        })
      )
      put(makeTicketDocument("T-1"))
      return run(
        layer,
        Effect.gen(function* () {
          const commands = yield* TicketCommands.TicketCommands
          const exit = yield* Effect.exit(
            commands.move("T-1", { toProject: slug("product") })
          )
          expect(Exit.isFailure(exit)).toBe(true)
          expect([...documents.keys()]).toEqual(["T-1"])
        })
      )
    }
  )

  it.effect(
    "is forbidden for someone who can't create tickets in the destination",
    () => {
      const { documents, put, layer } = fixture(
        scopeOf(destinationId, "product", null)
      )
      put(makeTicketDocument("T-1"))
      return run(
        layer,
        Effect.gen(function* () {
          const commands = yield* TicketCommands.TicketCommands
          const error = yield* Effect.flip(
            commands.move("T-1", { toProject: slug("product") })
          )
          expect(error._tag).toBe("Forbidden")
          expect([...documents.keys()]).toEqual(["T-1"])
        })
      )
    }
  )
})
