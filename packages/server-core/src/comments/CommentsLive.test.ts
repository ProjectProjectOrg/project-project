import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { Db } from "@pp/db"
import { DbLive, PgLive } from "@pp/db"
import { CommentId, TicketId, TicketStatus, UserId } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import pg from "pg"
import { describe, expect } from "vitest"

import { MarkdownError } from "../markdown/Markdown"
import { Projects, type ProjectsShape } from "../projects/Projects"
import {
  MalformedTicketDocument,
  TicketDocs,
  type TicketDocsShape,
  type TicketDocument
} from "../tickets/TicketDocs"
import { TicketIndex, type TicketIndexShape } from "../tickets/TicketIndex"
import { Users, type UsersShape } from "../users/Users"
import { Comments } from "./Comments"
import { parseCommentsRegion, serializeCommentsRegion } from "./comments-region"
import { CommentsLive } from "./CommentsLive"

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

const ticketId = Schema.decodeUnknownSync(TicketId)
const ticketStatus = Schema.decodeUnknownSync(TicketStatus)
const userId = Schema.decodeSync(UserId)
const at = (value: string) => DateTime.toDate(DateTime.makeUnsafe(value))

const unexpected = (method: string): Effect.Effect<never> =>
  Effect.die(new Error(`unexpected ${method} call`))

const document: TicketDocument = {
  id: ticketId("T-1"),
  title: "Comments",
  status: ticketStatus("todo"),
  type: "chore",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: at("2026-01-01T00:00:00.000Z"),
  updatedBy: "user-1",
  updatedAt: at("2026-01-01T00:00:00.000Z"),
  body: "# Comments\n",
  commentsRegion: ""
}

const FakeProjects = Layer.succeed(Projects, {
  list: () => unexpected("Projects.list"),
  listPaged: () => unexpected("Projects.listPaged"),
  listMembersPaged: () => unexpected("Projects.listMembersPaged"),
  create: () => unexpected("Projects.create"),
  get: () => unexpected("Projects.get"),
  getKey: () => unexpected("Projects.getKey"),
  getGithubIntegration: () => unexpected("Projects.getGithubIntegration"),
  update: () => unexpected("Projects.update"),
  updateSetup: () => unexpected("Projects.updateSetup"),
  remove: () => unexpected("Projects.remove"),
  requireMember: () => Effect.succeed({ role: "member" as const }),
  requireRole: () => unexpected("Projects.requireRole"),
  addMember: () => unexpected("Projects.addMember"),
  updateMember: () => unexpected("Projects.updateMember"),
  transferOwnership: () => unexpected("Projects.transferOwnership"),
  removeMember: () => unexpected("Projects.removeMember"),
  cancelPendingMember: () => unexpected("Projects.cancelPendingMember"),
  unassignUserFromActiveTickets: () =>
    unexpected("Projects.unassignUserFromActiveTickets"),
  connectGithub: () => unexpected("Projects.connectGithub"),
  disconnectGithub: () => unexpected("Projects.disconnectGithub")
} satisfies ProjectsShape)

const FakeTicketIndex = Layer.succeed(TicketIndex, {
  projectFor: () => unexpected("TicketIndex.projectFor"),
  list: () => unexpected("TicketIndex.list"),
  query: () => unexpected("TicketIndex.query"),
  orderKeyFor: () => unexpected("TicketIndex.orderKeyFor"),
  count: () => unexpected("TicketIndex.count"),
  listIds: () => unexpected("TicketIndex.listIds"),
  existingIds: () => unexpected("TicketIndex.existingIds"),
  reserveTicketNumber: () => unexpected("TicketIndex.reserveTicketNumber"),
  tagUsageCounts: () => unexpected("TicketIndex.tagUsageCounts"),
  findTicketIdsByTag: () => unexpected("TicketIndex.findTicketIdsByTag"),
  findTicketIdsByStatus: () => unexpected("TicketIndex.findTicketIdsByStatus"),
  findTicketsByBranch: () => unexpected("TicketIndex.findTicketsByBranch"),
  isRepositoryBranchAttached: () => Effect.succeed(false),
  getBranchDeletedAt: () => Effect.succeed(null),
  upsertTicket: () => unexpected("TicketIndex.upsertTicket"),
  markBranchStale: () => unexpected("TicketIndex.markBranchStale"),
  clearBranchStale: () => unexpected("TicketIndex.clearBranchStale"),
  updateBranchChecks: () => unexpected("TicketIndex.updateBranchChecks"),
  deleteTicket: () => unexpected("TicketIndex.deleteTicket"),
  rebuildProject: () => unexpected("TicketIndex.rebuildProject"),
  rebuildAllProjects: () => unexpected("TicketIndex.rebuildAllProjects"),
  reconcileProject: () => unexpected("TicketIndex.reconcileProject"),
  reconcileAllProjects: () => unexpected("TicketIndex.reconcileAllProjects")
} satisfies TicketIndexShape)

const author = {
  id: userId("user-1"),
  email: "user@example.com",
  name: "User",
  username: "user",
  image: null,
  createdAt: at("2026-01-01T00:00:00.000Z"),
  activeOrgSlug: "org",
  personalGithub: { connected: false },
  editorPreference: "github" as const,
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
}

const FakeUsers = Layer.succeed(Users, {
  findByEmail: () => unexpected("Users.findByEmail"),
  findManyByIds: () => unexpected("Users.findManyByIds"),
  fullByIds: () => Effect.succeed([author])
} satisfies UsersShape)

const FakeDb = Layer.succeed(Db, {
  insert: () => ({ values: () => Effect.void }),
  delete: () => ({ where: () => Effect.void })
} as never)

const makeLayer = (ticketDocs: TicketDocsShape, database = FakeDb) =>
  CommentsLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(TicketDocs, ticketDocs),
        FakeProjects,
        FakeTicketIndex,
        FakeUsers,
        database
      )
    )
  )

const makeTicketDocs = (
  overrides: Partial<TicketDocsShape> = {}
): TicketDocsShape => {
  const service: TicketDocsShape = {
    listIds: () => unexpected("TicketDocs.listIds"),
    read: () => Effect.succeed(document),
    create: () => unexpected("TicketDocs.create"),
    write: () => unexpected("TicketDocs.write"),
    update: (orgSlug, slug, id, transform, onPersist) =>
      service.read(orgSlug, slug, id).pipe(
        Effect.flatMap(transform),
        Effect.tap((next) => (onPersist ? onPersist(next) : Effect.void))
      ),
    remove: () => unexpected("TicketDocs.remove"),
    readRaw: () => unexpected("TicketDocs.readRaw"),
    ...overrides
  }
  return service
}

it.effect("creates comments through TicketDocs", () => {
  let written: TicketDocument | undefined
  const layer = makeLayer(
    makeTicketDocs({
      update: (_orgSlug, _slug, _ticketId, transform) =>
        transform(document).pipe(
          Effect.tap((next) =>
            Effect.sync(() => {
              written = next
            })
          )
        )
    })
  )

  return Effect.gen(function* () {
    const comments = yield* Comments
    const created = yield* comments.create(
      "org",
      "user-1",
      "project",
      ticketId("T-1"),
      {
        body: "A useful comment"
      }
    )

    expect(created.author).toEqual({ kind: "user", user: author })
    expect(created.origin).toBe("native")
    expect(written?.body).toBe(document.body)
    expect(parseCommentsRegion(written?.commentsRegion ?? "")).toMatchObject([
      {
        author: { kind: "user", userId: "user-1" },
        origin: "native",
        body: "A useful comment"
      }
    ])
  }).pipe(Effect.provide(layer))
})

it.effect(
  "imports Jira history with complete bodies and exact timestamps",
  () => {
    const rows: Array<Record<string, unknown>> = []
    let current = document
    const database = Layer.succeed(Db, {
      query: {
        commentIndex: {
          findMany: () => Effect.sync(() => rows),
          findFirst: () => Effect.sync(() => rows[0])
        }
      },
      insert: () => ({
        values: (values: unknown) =>
          Effect.sync(() => {
            rows.push(...(Array.isArray(values) ? values : [values]))
          })
      }),
      delete: () => ({
        where: () =>
          Effect.sync(() => {
            rows.splice(0)
          })
      }),
      update: () => ({ set: () => ({ where: () => Effect.void }) })
    } as never)
    const docs = makeTicketDocs({
      read: () => Effect.succeed(current),
      write: (_orgSlug, _slug, _ticketId, next) =>
        Effect.sync(() => {
          current = next
        }),
      update: (_orgSlug, _slug, _ticketId, transform, onPersist) =>
        transform(current).pipe(
          Effect.tap((next) =>
            Effect.sync(() => {
              current = next
            })
          ),
          Effect.tap((next) => (onPersist ? onPersist(next) : Effect.void))
        )
    })
    const layer = makeLayer(docs, database)
    const createdAt = at("2021-04-02T03:04:05.678Z")
    const editedAt = at("2021-04-03T04:05:06.789Z")
    const body = `Historical body\n\n${"x".repeat(20_001)}`

    return Effect.gen(function* () {
      const comments = yield* Comments
      const imported = yield* comments.importHistorical(
        "org",
        "user-1",
        "project",
        ticketId("T-1"),
        [
          {
            author: { kind: "user", userId: "user-1" },
            body,
            createdAt,
            editedAt
          },
          {
            author: {
              kind: "jira",
              displayName: "Former Jira User",
              accountId: "jira-account-1"
            },
            body: "Snapshot body",
            createdAt,
            editedAt: null
          }
        ]
      )
      const listed = yield* comments.list(
        "org",
        "user-1",
        "project",
        ticketId("T-1")
      )

      expect(imported).toEqual(listed)
      expect(listed[0]).toMatchObject({
        author: { kind: "user", user: author },
        origin: "jira",
        body,
        createdAt,
        editedAt
      })
      expect(listed[1]).toMatchObject({
        author: {
          kind: "jira",
          displayName: "Former Jira User",
          accountId: "jira-account-1"
        },
        origin: "jira",
        body: "Snapshot body",
        createdAt,
        editedAt: null
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect("rejects reserved markers without writing imported history", () => {
  let updates = 0
  const layer = makeLayer(
    makeTicketDocs({
      update: () =>
        Effect.sync(() => {
          updates++
          return document
        })
    })
  )

  return Effect.gen(function* () {
    const comments = yield* Comments
    const result = yield* Effect.exit(
      comments.importHistorical("org", "user-1", "project", ticketId("T-1"), [
        {
          author: {
            kind: "jira",
            displayName: "Former Jira User",
            accountId: "jira-account-1"
          },
          body: "<!-- comments:end -->",
          createdAt: at("2021-04-02T03:04:05.678Z"),
          editedAt: null
        }
      ])
    )

    expect(result._tag).toBe("Failure")
    expect(updates).toBe(0)
  }).pipe(Effect.provide(layer))
})

it.effect("rejects incomplete Jira snapshot attribution", () => {
  let updates = 0
  const layer = makeLayer(
    makeTicketDocs({
      update: () =>
        Effect.sync(() => {
          updates++
          return document
        })
    })
  )

  return Effect.gen(function* () {
    const comments = yield* Comments
    const result = yield* Effect.exit(
      comments.importHistorical("org", "user-1", "project", ticketId("T-1"), [
        {
          author: {
            kind: "jira",
            displayName: "",
            accountId: "jira-account-1"
          },
          body: "Imported body",
          createdAt: at("2021-04-02T03:04:05.678Z"),
          editedAt: null
        }
      ])
    )

    expect(result._tag).toBe("Failure")
    expect(updates).toBe(0)
  }).pipe(Effect.provide(layer))
})

it.effect("removes imported index rows when the markdown write fails", () => {
  const rows: Array<Record<string, unknown>> = []
  const database = Layer.succeed(Db, {
    insert: () => ({
      values: (values: unknown) =>
        Effect.sync(() => {
          rows.push(...(Array.isArray(values) ? values : [values]))
        })
    }),
    delete: () => ({
      where: () =>
        Effect.sync(() => {
          rows.splice(0)
        })
    })
  } as never)
  const failure = new MarkdownError({
    message: "fixture write failed",
    cause: new Error("write failed")
  })
  const layer = makeLayer(
    makeTicketDocs({ update: () => Effect.fail(failure) }),
    database
  )

  return Effect.gen(function* () {
    const comments = yield* Comments
    const result = yield* Effect.exit(
      comments.importHistorical("org", "user-1", "project", ticketId("T-1"), [
        {
          author: { kind: "user", userId: "user-1" },
          body: "Imported body",
          createdAt: at("2021-04-02T03:04:05.678Z"),
          editedAt: null
        }
      ])
    )

    expect(result._tag).toBe("Failure")
    expect(rows).toEqual([])
  }).pipe(Effect.provide(layer))
})

it.effect("restores markdown when an edit index update fails", () => {
  let current = {
    ...document,
    commentsRegion: ""
  }
  const id = Schema.decodeSync(CommentId)("c_native")
  current = {
    ...current,
    commentsRegion: serializeCommentsRegion([
      {
        id,
        author: { kind: "user", userId: "user-1" },
        origin: "native",
        body: "Original body",
        createdAt: at("2021-04-02T03:04:05.678Z"),
        editedAt: null
      }
    ])
  }
  const original = current.commentsRegion
  const docs = makeTicketDocs({
    read: () => Effect.succeed(current),
    write: (_orgSlug, _slug, _ticketId, next) =>
      Effect.sync(() => {
        current = next
      }),
    update: (_orgSlug, _slug, _ticketId, transform, onPersist) =>
      transform(current).pipe(
        Effect.tap((next) =>
          Effect.sync(() => {
            current = next
          })
        ),
        Effect.tap((next) => (onPersist ? onPersist(next) : Effect.void))
      )
  })
  const database = Layer.succeed(Db, {
    query: {
      commentIndex: {
        findFirst: () =>
          Effect.succeed({
            id,
            projectSlug: "project",
            ticketId: "T-1",
            origin: "native",
            authorKind: "user",
            authorId: "user-1",
            jiraAccountId: null,
            jiraDisplayName: null,
            createdAt: at("2021-04-02T03:04:05.678Z"),
            editedAt: null
          })
      }
    },
    update: () => ({
      set: () => ({
        where: () => Effect.die(new Error("index update failed"))
      })
    })
  } as never)
  const layer = makeLayer(docs, database)

  return Effect.gen(function* () {
    const comments = yield* Comments
    const result = yield* Effect.exit(
      comments.edit("org", "user-1", "project", ticketId("T-1"), id, {
        body: "Changed body"
      })
    )

    expect(result._tag).toBe("Failure")
    expect(current.commentsRegion).toBe(original)
  }).pipe(Effect.provide(layer))
})

it.effect(
  "denies changes to Jira-origin comments without mutating markdown",
  () => {
    let updates = 0
    const database = Layer.succeed(Db, {
      query: {
        commentIndex: {
          findFirst: () =>
            Effect.succeed({
              id: "c_imported",
              projectSlug: "project",
              ticketId: "T-1",
              origin: "jira",
              authorKind: "user",
              authorId: "user-1",
              jiraAccountId: null,
              jiraDisplayName: null,
              createdAt: at("2021-04-02T03:04:05.678Z"),
              editedAt: null
            })
        }
      }
    } as never)
    const layer = makeLayer(
      makeTicketDocs({
        update: () =>
          Effect.sync(() => {
            updates++
            return document
          })
      }),
      database
    )
    const id = Schema.decodeSync(CommentId)("c_imported")

    return Effect.gen(function* () {
      const comments = yield* Comments
      const editResult = yield* Effect.exit(
        comments.edit("org", "user-1", "project", ticketId("T-1"), id, {
          body: "Changed"
        })
      )
      const removeResult = yield* Effect.exit(
        comments.remove("org", "user-1", "project", ticketId("T-1"), id)
      )

      expect(editResult._tag).toBe("Failure")
      expect(removeResult._tag).toBe("Failure")
      expect(updates).toBe(0)
    }).pipe(Effect.provide(layer))
  }
)

it.effect("keeps malformed ticket documents in the typed error channel", () => {
  const malformed = new MalformedTicketDocument({
    orgSlug: "org",
    slug: "project",
    ticketId: "T-1",
    path: "orgs/org/projects/project/tickets/T-1.md",
    reason: "invalid_frontmatter",
    cause: new Error("invalid frontmatter")
  })
  const layer = makeLayer(
    makeTicketDocs({ update: () => Effect.fail(malformed) })
  )

  return Effect.gen(function* () {
    const comments = yield* Comments
    const error = yield* Effect.flip(
      comments.create("org", "user-1", "project", ticketId("T-1"), {
        body: "A useful comment"
      })
    )

    expect(error).toBe(malformed)
  }).pipe(Effect.provide(layer))
})

describe.skipIf(!databaseUrl)("comment persistence failure", () => {
  for (const operation of ["edit", "remove"] as const) {
    it.effect(
      `preserves ${operation} metadata when the markdown write fails`,
      () =>
        Effect.gen(function* () {
          const client = yield* Effect.acquireRelease(
            Effect.promise(async () => {
              const client = new pg.Client({
                connectionString: databaseUrl
              })
              await client.connect()
              return client
            }),
            (client) => Effect.promise(() => client.end())
          )
          const userId = randomUUID()
          const id = yield* Schema.decodeUnknownEffect(CommentId)(
            `c_${randomUUID()}`
          )
          const previousEdit = at("2026-01-01T01:00:00.000Z")
          yield* Effect.promise(() =>
            client.query(
              `insert into "user" (id, name, email, created_at, updated_at) values ($1, 'Test', $2, now(), now())`,
              [userId, `${userId}@example.com`]
            )
          )
          yield* Effect.addFinalizer(() =>
            Effect.promise(async () => {
              await client.query("delete from comment_index where id = $1", [
                id
              ])
              await client.query('delete from "user" where id = $1', [userId])
            })
          )
          yield* Effect.promise(() =>
            client.query(
              "insert into comment_index (id, project_slug, ticket_id, origin, author_kind, author_id, created_at, edited_at) values ($1, 'project', 'T-1', 'native', 'user', $2, now(), $3)",
              [id, userId, previousEdit]
            )
          )
          const failure = new MarkdownError({
            message: "fixture write failed",
            cause: new Error("write failed")
          })
          const layer = makeLayer(
            makeTicketDocs({ update: () => Effect.fail(failure) }),
            DbLive.pipe(Layer.provideMerge(PgLive), Layer.orDie)
          )
          const result = yield* Effect.gen(function* () {
            const comments = yield* Comments
            return yield* Effect.flip(
              operation === "edit"
                ? comments
                    .edit("org", userId, "project", ticketId("T-1"), id, {
                      body: "Changed"
                    })
                    .pipe(Effect.asVoid)
                : comments.remove("org", userId, "project", ticketId("T-1"), id)
            )
          }).pipe(Effect.provide(layer))
          expect(result._tag).toBe("MarkdownError")
          const rows = yield* Effect.promise(() =>
            client.query<{ edited_at: Date }>(
              "select edited_at from comment_index where id = $1",
              [id]
            )
          )
          expect(rows.rows).toEqual([{ edited_at: previousEdit }])
        })
    )
  }
})
