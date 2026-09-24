import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import {
  CommentId,
  UserId,
  encodeCursor,
  padNumericIdSort,
  TagName,
  TicketId,
  TicketStatus,
  type TicketFilter,
  type TicketSort
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import pg from "pg"
import { describe, expect } from "vitest"

import { Comments } from "../comments/Comments"
import { serializeCommentsRegion } from "../comments/comments-region"
import { CommentsLive } from "../comments/CommentsLive"
import { Projects } from "../projects/Projects"
import { Users } from "../users/Users"
import {
  TicketDocs,
  type TicketDocsShape,
  type TicketDocument
} from "./TicketDocs"
import { TicketIndex } from "./TicketIndex"
import { TICKET_ORDER_KEY_SEPARATOR, TicketIndexLive } from "./TicketIndexLive"

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

const commentId = Schema.decodeUnknownSync(CommentId)
const userIdSchema = Schema.decodeUnknownSync(UserId)
const ticketId = Schema.decodeUnknownSync(TicketId)
const ticketStatus = Schema.decodeUnknownSync(TicketStatus)
const tagName = Schema.decodeUnknownSync(TagName)

const unexpected = (method: string): Effect.Effect<never> =>
  Effect.die(new Error(`unexpected ${method} call`))

const FakeTicketDocs = Layer.succeed(TicketDocs, {
  listIds: () => unexpected("TicketDocs.listIds"),
  read: () => unexpected("TicketDocs.read"),
  create: () => unexpected("TicketDocs.create"),
  write: () => unexpected("TicketDocs.write"),
  update: () => unexpected("TicketDocs.update"),
  remove: () => unexpected("TicketDocs.remove"),
  readRaw: () => unexpected("TicketDocs.readRaw")
} satisfies TicketDocsShape)

const DatabaseLive = DbLive.pipe(Layer.provideMerge(PgLive))
const TestLayer = TicketIndexLive.pipe(
  Layer.provide(FakeTicketDocs),
  Layer.provide(DatabaseLive)
)

const rebuiltDocument: TicketDocument = {
  id: ticketId("T-41"),
  title: "Restored ticket",
  status: ticketStatus("todo"),
  type: "other",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  assignees: [],
  archivedAt: null,
  createdBy: "test-user",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedBy: "test-user",
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  body: "# Restored ticket\n",
  commentsRegion: ""
}

const indexedDocument = (
  id: string,
  overrides: Partial<TicketDocument> = {}
): TicketDocument => ({
  ...rebuiltDocument,
  id: ticketId(id),
  title: id,
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  ...overrides
})

const RebuildTicketDocs = Layer.succeed(TicketDocs, {
  listIds: () => Effect.succeed([rebuiltDocument.id]),
  read: () => Effect.succeed(rebuiltDocument),
  create: () => unexpected("TicketDocs.create"),
  write: () => unexpected("TicketDocs.write"),
  update: () => unexpected("TicketDocs.update"),
  remove: () => unexpected("TicketDocs.remove"),
  readRaw: () => unexpected("TicketDocs.readRaw")
} satisfies TicketDocsShape)

const RebuildTestLayer = TicketIndexLive.pipe(
  Layer.provide(RebuildTicketDocs),
  Layer.provide(DatabaseLive)
)

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

describe.skipIf(!databaseUrl)("TicketIndex Postgres", () => {
  it.effect("reserves unique ticket numbers under concurrency", () =>
    Effect.gen(function* () {
      const suffix = randomUUID()
      const organizationId = `ticket-index-test-${suffix}`
      const orgSlug = `ticket-index-test-${suffix}`
      const projectSlug = `ticket-index-test-${suffix}`
      const projectId = randomUUID()
      yield* withClient(async (client) => {
        await client.query(
          `insert into organization (id, name, slug, created_at)
             values ($1, 'Ticket index test', $2, now())`,
          [organizationId, orgSlug]
        )
        await client.query(
          `insert into project_index
               (id, slug, organization_id, key, name, icon, color, created_by, created_at)
             values ($1, $2, $3, 'T', 'Ticket index test', 'folder', 'blue', 'test-user', now())`,
          [projectId, projectSlug, organizationId]
        )
      })
      yield* Effect.addFinalizer(() =>
        withClient((client) =>
          client.query("delete from organization where id = $1", [
            organizationId
          ])
        )
      )

      const index = yield* TicketIndex
      const project = yield* index.projectFor(orgSlug, projectSlug)
      const numbers = yield* Effect.forEach(
        Array.from({ length: 32 }),
        () => index.reserveTicketNumber(project),
        { concurrency: "unbounded" }
      )

      expect(numbers.toSorted((left, right) => left - right)).toEqual(
        Array.from({ length: 32 }, (_, value) => value + 1)
      )
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("advances the counter when rebuilding from ticket files", () =>
    Effect.gen(function* () {
      const suffix = randomUUID()
      const organizationId = `ticket-index-rebuild-${suffix}`
      const orgSlug = `ticket-index-rebuild-${suffix}`
      const projectSlug = `ticket-index-rebuild-${suffix}`
      const projectId = randomUUID()
      yield* withClient(async (client) => {
        await client.query(
          `insert into organization (id, name, slug, created_at)
             values ($1, 'Ticket index rebuild', $2, now())`,
          [organizationId, orgSlug]
        )
        await client.query(
          `insert into project_index
               (id, slug, organization_id, key, name, icon, color, created_by, created_at)
             values ($1, $2, $3, 'T', 'Ticket index rebuild', 'folder', 'blue', 'test-user', now())`,
          [projectId, projectSlug, organizationId]
        )
      })
      yield* Effect.addFinalizer(() =>
        withClient((client) =>
          client.query("delete from organization where id = $1", [
            organizationId
          ])
        )
      )

      const index = yield* TicketIndex
      const project = yield* index.projectFor(orgSlug, projectSlug)
      yield* index.rebuildProject(project)

      expect(yield* index.reserveTicketNumber(project)).toBe(42)
    }).pipe(Effect.provide(RebuildTestLayer))
  )

  it.effect("restores canonical comments as listable index rows", () => {
    const suffix = randomUUID()
    const organizationId = `ticket-index-comments-${suffix}`
    const orgSlug = `ticket-index-comments-${suffix}`
    const projectSlug = `ticket-index-comments-${suffix}`
    const projectId = randomUUID()
    const userId = `ticket-index-comments-user-${suffix}`
    const nativeId = commentId(`c_${randomUUID()}`)
    const linkedId = commentId(`c_${randomUUID()}`)
    const snapshotId = commentId(`c_${randomUUID()}`)
    const nativeCreatedAt = DateTime.toDate(
      DateTime.makeUnsafe("2021-04-01T01:02:03.456Z")
    )
    const linkedCreatedAt = DateTime.toDate(
      DateTime.makeUnsafe("2021-04-02T02:03:04.567Z")
    )
    const linkedEditedAt = DateTime.toDate(
      DateTime.makeUnsafe("2021-04-03T03:04:05.678Z")
    )
    const snapshotCreatedAt = DateTime.toDate(
      DateTime.makeUnsafe("2021-04-04T04:05:06.789Z")
    )
    const snapshotEditedAt = DateTime.toDate(
      DateTime.makeUnsafe("2021-04-05T05:06:07.890Z")
    )
    const largeBody = `Historical Jira body\n\n${"x".repeat(20_001)}`
    const rebuildDocument: TicketDocument = {
      ...rebuiltDocument,
      id: ticketId("T-42"),
      createdBy: userId,
      commentsRegion: serializeCommentsRegion([
        {
          id: nativeId,
          author: { kind: "user", userId },
          origin: "native",
          createdAt: nativeCreatedAt,
          editedAt: null,
          body: "Native body"
        },
        {
          id: linkedId,
          author: { kind: "user", userId },
          origin: "jira",
          createdAt: linkedCreatedAt,
          editedAt: linkedEditedAt,
          body: largeBody
        },
        {
          id: snapshotId,
          author: {
            kind: "jira",
            displayName: "Former Jira User",
            accountId: "jira-account-1"
          },
          origin: "jira",
          createdAt: snapshotCreatedAt,
          editedAt: snapshotEditedAt,
          body: "Snapshot body"
        }
      ])
    }
    const ticketDocs = Layer.succeed(TicketDocs, {
      listIds: () => Effect.succeed([rebuildDocument.id]),
      read: () => Effect.succeed(rebuildDocument),
      create: () => unexpected("TicketDocs.create"),
      write: () => unexpected("TicketDocs.write"),
      update: () => unexpected("TicketDocs.update"),
      remove: () => unexpected("TicketDocs.remove"),
      readRaw: () => unexpected("TicketDocs.readRaw")
    } satisfies TicketDocsShape)
    const indexLayer = TicketIndexLive.pipe(
      Layer.provide(ticketDocs),
      Layer.provide(DatabaseLive)
    )
    const author = {
      id: userIdSchema(userId),
      email: `${userId}@example.com`,
      name: "Linked User",
      username: "linked-user",
      image: null,
      createdAt: nativeCreatedAt,
      activeOrgSlug: orgSlug,
      personalGithub: { connected: false as const },
      editorPreference: "github" as const,
      personalEverhour: {
        connected: false as const,
        everhourUserId: null,
        name: null,
        email: null,
        lastVerifiedAt: null,
        lastCheckError: null
      }
    }
    const commentsLayer = CommentsLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ticketDocs,
          Layer.mock(Projects, {
            requireMember: () =>
              Effect.succeed({ role: "developer" as const, projectId })
          }),
          Layer.mock(TicketIndex, {}),
          Layer.mock(Users, {
            fullByIds: () => Effect.succeed([author])
          }),
          DatabaseLive
        )
      )
    )

    return Effect.gen(function* () {
      yield* withClient(async (client) => {
        await client.query(
          `insert into "user" (id, name, email, created_at, updated_at)
             values ($1, 'Linked User', $2, now(), now())`,
          [userId, `${userId}@example.com`]
        )
        await client.query(
          `insert into organization (id, name, slug, created_at)
             values ($1, 'Ticket index comments', $2, now())`,
          [organizationId, orgSlug]
        )
        await client.query(
          `insert into project_index
               (id, slug, organization_id, key, name, icon, color, created_by, created_at)
             values ($1, $2, $3, 'T', 'Ticket index comments', 'folder', 'blue', $4, now())`,
          [projectId, projectSlug, organizationId, userId]
        )
      })
      yield* Effect.addFinalizer(() =>
        withClient(async (client) => {
          await client.query(
            "delete from comment_index where project_id = $1",
            [projectId]
          )
          await client.query("delete from organization where id = $1", [
            organizationId
          ])
          await client.query('delete from "user" where id = $1', [userId])
        })
      )

      const index = yield* TicketIndex
      const project = yield* index.projectFor(orgSlug, projectSlug)
      yield* index.rebuildProject(project)

      const rows = yield* withClient((client) =>
        client.query<{
          id: string
          origin: string
          author_kind: string
          author_id: string | null
          jira_display_name: string | null
          jira_account_id: string | null
          created_at: Date
          edited_at: Date | null
        }>(
          `select id, origin, author_kind, author_id, jira_display_name,
                    jira_account_id, created_at, edited_at
             from comment_index
             where project_id = $1 and ticket_id = $2
             order by created_at`,
          [projectId, rebuildDocument.id]
        )
      )
      expect(rows.rows).toEqual([
        {
          id: nativeId,
          origin: "native",
          author_kind: "user",
          author_id: userId,
          jira_display_name: null,
          jira_account_id: null,
          created_at: nativeCreatedAt,
          edited_at: null
        },
        {
          id: linkedId,
          origin: "jira",
          author_kind: "user",
          author_id: userId,
          jira_display_name: null,
          jira_account_id: null,
          created_at: linkedCreatedAt,
          edited_at: linkedEditedAt
        },
        {
          id: snapshotId,
          origin: "jira",
          author_kind: "jira",
          author_id: null,
          jira_display_name: "Former Jira User",
          jira_account_id: "jira-account-1",
          created_at: snapshotCreatedAt,
          edited_at: snapshotEditedAt
        }
      ])

      const listed = yield* Effect.gen(function* () {
        const comments = yield* Comments
        return yield* comments.list(
          orgSlug,
          userId,
          projectSlug,
          rebuildDocument.id
        )
      }).pipe(Effect.provide(commentsLayer))
      expect(listed).toEqual([
        {
          id: nativeId,
          ticketId: rebuildDocument.id,
          projectSlug,
          author: { kind: "user", user: author },
          origin: "native",
          body: "Native body",
          createdAt: nativeCreatedAt,
          editedAt: null
        },
        {
          id: linkedId,
          ticketId: rebuildDocument.id,
          projectSlug,
          author: { kind: "user", user: author },
          origin: "jira",
          body: largeBody,
          createdAt: linkedCreatedAt,
          editedAt: linkedEditedAt
        },
        {
          id: snapshotId,
          ticketId: rebuildDocument.id,
          projectSlug,
          author: {
            kind: "jira",
            displayName: "Former Jira User",
            accountId: "jira-account-1"
          },
          origin: "jira",
          body: "Snapshot body",
          createdAt: snapshotCreatedAt,
          editedAt: snapshotEditedAt
        }
      ])
    }).pipe(Effect.provide(indexLayer))
  })

  it.effect("queries, filters, paginates, and counts indexed tickets", () =>
    Effect.gen(function* () {
      const suffix = randomUUID()
      const organizationId = `ticket-index-query-${suffix}`
      const orgSlug = `ticket-index-query-${suffix}`
      const projectSlug = `ticket-index-query-${suffix}`
      const projectId = randomUUID()
      yield* withClient(async (client) => {
        await client.query(
          `insert into organization (id, name, slug, created_at)
             values ($1, 'Ticket index query', $2, now())`,
          [organizationId, orgSlug]
        )
        await client.query(
          `insert into project_index
               (id, slug, organization_id, key, name, icon, color, created_by, created_at)
             values ($1, $2, $3, 'T', 'Ticket index query', 'folder', 'blue', 'test-user', now())`,
          [projectId, projectSlug, organizationId]
        )
      })
      yield* Effect.addFinalizer(() =>
        withClient((client) =>
          client.query("delete from organization where id = $1", [
            organizationId
          ])
        )
      )

      const index = yield* TicketIndex
      const project = yield* index.projectFor(orgSlug, projectSlug)
      const januaryTenth = DateTime.toDate(
        DateTime.makeUnsafe("2026-01-10T00:00:00.000Z")
      )
      const januaryEleventh = DateTime.toDate(
        DateTime.makeUnsafe("2026-01-11T00:00:00.000Z")
      )
      const januaryTwelfth = DateTime.toDate(
        DateTime.makeUnsafe("2026-01-12T00:00:00.000Z")
      )
      const documents = [
        indexedDocument("T-2", {
          status: ticketStatus("todo"),
          priority: "low",
          tags: [tagName("backend")],
          assignees: ["viewer"],
          branch: "feat/T-2",
          updatedAt: januaryTenth
        }),
        indexedDocument("T-10", {
          title: "Alpha %_ literal",
          status: ticketStatus("in_progress"),
          type: "feat",
          priority: "high",
          updatedAt: januaryEleventh
        }),
        indexedDocument("T-11", {
          title: "Beta",
          status: ticketStatus("in_progress"),
          type: "bug",
          priority: "med",
          tags: [tagName("backend")],
          assignees: ["viewer"],
          branch: "feat/T-11",
          pr: 11,
          updatedAt: januaryTwelfth
        }),
        indexedDocument("T-12", {
          archivedAt: januaryTwelfth,
          updatedAt: januaryTwelfth
        }),
        indexedDocument("T-13", {
          title: "İstanbul",
          updatedAt: januaryTwelfth
        }),
        indexedDocument("T-14", {
          title: "istanbul",
          updatedAt: januaryTwelfth
        })
      ]
      yield* Effect.forEach(documents, (document) =>
        index.upsertTicket(project, document)
      )

      yield* index.markBranchStale(projectId, "feat/T-2", januaryTwelfth)
      expect(
        yield* index.getBranchDeletedAt(orgSlug, projectSlug, "T-2")
      ).toEqual(januaryTwelfth)
      expect(
        yield* index.getBranchDeletedAt(orgSlug, projectSlug, "T-10")
      ).toBeNull()
      expect(
        yield* index.getBranchDeletedAt("wrong-org", projectSlug, "T-2")
      ).toBeNull()
      expect(
        yield* index.getBranchDeletedAt(orgSlug, "wrong-project", "T-2")
      ).toBeNull()
      expect(
        yield* index.getBranchDeletedAt(orgSlug, projectSlug, "T-missing")
      ).toBeNull()

      const firstPage = yield* index.query(
        project,
        { sort: { key: "id", dir: "asc" } },
        { viewerId: "viewer", limit: 2 }
      )
      expect(firstPage.map(({ entry }) => entry.id)).toEqual(["T-2", "T-10"])

      const secondPage = yield* index.query(
        project,
        {
          sort: { key: "id", dir: "asc" },
          cursor: encodeCursor({
            id: "T-10",
            sort: padNumericIdSort("T-10")!
          })
        },
        { viewerId: "viewer", limit: 2 }
      )
      expect(secondPage.map(({ entry }) => entry.id)).toEqual(["T-11", "T-13"])

      const included = yield* index.query(
        project,
        { sort: { key: "id", dir: "asc" } },
        {
          viewerId: "viewer",
          ticketIds: ["T-11", "T-2"],
          limit: 10
        }
      )
      expect(included.map(({ entry }) => entry.id)).toEqual(["T-2", "T-11"])

      const excluded = yield* index.query(
        project,
        { sort: { key: "id", dir: "asc" } },
        {
          viewerId: "viewer",
          excludeTicketIds: ["T-2", "T-10", "T-11", "T-13"],
          limit: 10
        }
      )
      expect(excluded.map(({ entry }) => entry.id)).toEqual(["T-14"])

      const filtered = yield* index.query(
        project,
        {
          sort: { key: "updated", dir: "desc" },
          status: [ticketStatus("in_progress")],
          assignee: ["mine"],
          tags: [tagName("backend")],
          hasBranch: true,
          hasPr: true,
          updatedAfter: januaryEleventh
        },
        { viewerId: "viewer", limit: 10 }
      )
      expect(filtered.map(({ entry }) => entry.id)).toEqual(["T-11"])

      const filterCases: ReadonlyArray<{
        filter: TicketFilter
        expected: ReadonlyArray<string>
      }> = [
        {
          filter: { status: [ticketStatus("in_progress")] },
          expected: ["T-10", "T-11"]
        },
        { filter: { type: ["bug"] }, expected: ["T-11"] },
        {
          filter: { assignee: ["unassigned"] },
          expected: ["T-10", "T-13", "T-14"]
        },
        {
          filter: { assignee: ["mine"] },
          expected: ["T-2", "T-11"]
        },
        { filter: { tags: [tagName("backend")] }, expected: ["T-2", "T-11"] },
        {
          filter: { hasBranch: false },
          expected: ["T-10", "T-13", "T-14"]
        },
        {
          filter: { hasPr: false },
          expected: ["T-2", "T-10", "T-13", "T-14"]
        },
        {
          filter: { updatedAfter: januaryEleventh },
          expected: ["T-11", "T-13", "T-14"]
        },
        { filter: { status: [] }, expected: [] },
        { filter: { tags: [] }, expected: [] }
      ]
      yield* Effect.forEach(filterCases, ({ filter, expected }) =>
        Effect.gen(function* () {
          const rows = yield* index.query(
            project,
            { ...filter, sort: { key: "id", dir: "asc" } },
            { viewerId: "viewer", limit: 10 }
          )
          expect(rows.map(({ entry }) => entry.id)).toEqual(expected)
        })
      )

      const literalSearch = yield* index.query(
        project,
        { q: "%_", sort: { key: "created", dir: "desc" } },
        { viewerId: "viewer", limit: 10 }
      )
      expect(literalSearch.map(({ entry }) => entry.id)).toEqual(["T-10"])

      const unicodeSearch = yield* index.query(
        project,
        { q: "İstanbul", sort: { key: "created", dir: "desc" } },
        { viewerId: "viewer", limit: 10 }
      )
      expect(unicodeSearch.map(({ entry }) => entry.id)).toEqual([
        "T-14",
        "T-13"
      ])

      const firstTitlePage = yield* index.query(
        project,
        { sort: { key: "title", dir: "asc" } },
        { viewerId: "viewer", limit: 3 }
      )
      expect(firstTitlePage.map(({ entry }) => entry.id)).toEqual([
        "T-10",
        "T-11",
        "T-13"
      ])

      const lastTitle = firstTitlePage.at(-1)!
      const secondTitlePage = yield* index.query(
        project,
        {
          sort: { key: "title", dir: "asc" },
          cursor: encodeCursor({
            id: lastTitle.entry.id,
            sort: lastTitle.sortValue
          })
        },
        { viewerId: "viewer", limit: 3 }
      )
      expect(secondTitlePage.map(({ entry }) => entry.id)).toEqual([
        "T-14",
        "T-2"
      ])

      const counts = yield* index.count(
        project,
        { tags: [tagName("backend")] },
        { viewerId: "viewer" }
      )
      expect(counts).toEqual({
        total: 2,
        byStatus: { todo: 1, in_progress: 1 }
      })

      const archived = yield* index.query(
        project,
        {
          archived: true,
          sort: { key: "id", dir: "asc" }
        },
        { viewerId: "viewer", limit: 10 }
      )
      expect(archived.map(({ entry }) => entry.id)).toEqual(["T-12"])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("orders rows exactly as a string compare of the order key", () =>
    Effect.gen(function* () {
      const suffix = randomUUID()
      const organizationId = `ticket-index-order-${suffix}`
      const orgSlug = `ticket-index-order-${suffix}`
      const projectSlug = `ticket-index-order-${suffix}`
      const projectId = randomUUID()
      yield* withClient(async (client) => {
        await client.query(
          `insert into organization (id, name, slug, created_at)
             values ($1, 'Ticket index order', $2, now())`,
          [organizationId, orgSlug]
        )
        await client.query(
          `insert into project_index
               (id, slug, organization_id, key, name, icon, color, created_by, created_at)
             values ($1, $2, $3, 'T', 'Ticket index order', 'folder', 'blue', 'test-user', now())`,
          [projectId, projectSlug, organizationId]
        )
      })
      yield* Effect.addFinalizer(() =>
        withClient((client) =>
          client.query("delete from organization where id = $1", [
            organizationId
          ])
        )
      )

      const earlier = DateTime.toDate(
        DateTime.makeUnsafe("2026-02-01T00:00:00.000Z")
      )
      const later = DateTime.toDate(
        DateTime.makeUnsafe("2026-02-02T00:00:00.000Z")
      )
      const documents = [
        indexedDocument("T-1", {
          title: "ab 1",
          priority: "med",
          createdAt: earlier,
          updatedAt: later
        }),
        indexedDocument("T-2", {
          title: "ab",
          priority: "med",
          createdAt: earlier,
          updatedAt: later
        }),
        indexedDocument("T-3", {
          title: "dup",
          priority: "high",
          createdAt: earlier,
          updatedAt: earlier
        }),
        indexedDocument("T-4", {
          title: "dup",
          priority: "high",
          createdAt: later,
          updatedAt: earlier
        }),
        indexedDocument("T-5", {
          title: "Dup",
          priority: "low",
          createdAt: later,
          updatedAt: earlier
        }),
        indexedDocument("T-6", {
          title: "zz",
          priority: "low",
          createdAt: later,
          updatedAt: later
        })
      ]
      const index = yield* TicketIndex
      const project = yield* index.projectFor(orgSlug, projectSlug)
      yield* Effect.forEach(documents, (document) =>
        index.upsertTicket(project, document)
      )

      const sorts: ReadonlyArray<TicketSort> = [
        { key: "id", dir: "asc" },
        { key: "id", dir: "desc" },
        { key: "created", dir: "asc" },
        { key: "created", dir: "desc" },
        { key: "updated", dir: "asc" },
        { key: "updated", dir: "desc" },
        { key: "title", dir: "asc" },
        { key: "title", dir: "desc" },
        { key: "priority", dir: "asc" },
        { key: "priority", dir: "desc" }
      ]

      yield* Effect.forEach(sorts, (sort) =>
        Effect.gen(function* () {
          const rows = yield* index.query(
            project,
            { sort },
            { viewerId: "viewer", limit: documents.length }
          )
          expect(rows).toHaveLength(documents.length)

          const orderKeys = rows.map((row) => row.orderKey)
          expect(new Set(orderKeys).size).toBe(orderKeys.length)
          for (const row of rows) {
            expect(row.orderKey).toBe(
              `${row.sortValue}${TICKET_ORDER_KEY_SEPARATOR}${row.entry.id}`
            )
          }

          const byOrderKey = [...orderKeys].sort((a, b) =>
            a < b ? -1 : a > b ? 1 : 0
          )
          expect(orderKeys).toEqual(
            sort.dir === "asc" ? byOrderKey : byOrderKey.toReversed()
          )

          const walked: Array<string> = []
          let cursor: string | undefined
          for (let attempt = 0; attempt < documents.length; attempt++) {
            const page = yield* index.query(
              project,
              { sort, cursor },
              { viewerId: "viewer", limit: 2 }
            )
            if (page.length === 0) break
            walked.push(...page.map((row) => row.entry.id))
            const last = page[page.length - 1]
            cursor = encodeCursor({
              id: last.entry.id,
              sort: last.sortValue
            })
          }
          expect(walked).toEqual(rows.map((row) => row.entry.id))
        })
      )
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("sorts titles by code point, not by the server's locale", () =>
    Effect.gen(function* () {
      const suffix = randomUUID()
      const organizationId = `ticket-index-collate-${suffix}`
      const orgSlug = `ticket-index-collate-${suffix}`
      const projectSlug = `ticket-index-collate-${suffix}`
      const projectId = randomUUID()
      yield* withClient(async (client) => {
        await client.query(
          `insert into organization (id, name, slug, created_at)
             values ($1, 'Ticket index collate', $2, now())`,
          [organizationId, orgSlug]
        )
        await client.query(
          `insert into project_index
               (id, slug, organization_id, key, name, icon, color, created_by, created_at)
             values ($1, $2, $3, 'T', 'Ticket index collate', 'folder', 'blue', 'test-user', now())`,
          [projectId, projectSlug, organizationId]
        )
      })
      yield* Effect.addFinalizer(() =>
        withClient((client) =>
          client.query("delete from organization where id = $1", [
            organizationId
          ])
        )
      )

      const documents = [
        indexedDocument("T-1", { title: "Ecole" }),
        indexedDocument("T-2", { title: "École" }),
        indexedDocument("T-3", { title: "Edgar" }),
        indexedDocument("T-4", { title: "a b" }),
        indexedDocument("T-5", { title: "ab" }),
        indexedDocument("T-6", { title: "Z zz" })
      ]
      const index = yield* TicketIndex
      const project = yield* index.projectFor(orgSlug, projectSlug)
      yield* Effect.forEach(documents, (document) =>
        index.upsertTicket(project, document)
      )

      const ascending = yield* index.query(
        project,
        { sort: { key: "title", dir: "asc" } },
        { viewerId: "viewer", limit: documents.length }
      )
      expect(ascending.map(({ entry }) => entry.id)).toEqual([
        "T-4",
        "T-5",
        "T-1",
        "T-3",
        "T-6",
        "T-2"
      ])

      const byCodePoint = [...documents]
        .sort((a, b) => {
          const left = a.title.toLowerCase()
          const right = b.title.toLowerCase()
          return left < right ? -1 : left > right ? 1 : 0
        })
        .map((document) => document.id)
      expect(ascending.map(({ entry }) => entry.id)).toEqual(byCodePoint)

      const descending = yield* index.query(
        project,
        { sort: { key: "title", dir: "desc" } },
        { viewerId: "viewer", limit: documents.length }
      )
      expect(descending.map(({ entry }) => entry.id)).toEqual(
        byCodePoint.toReversed()
      )

      const localeOrder = yield* withClient(async (client) => {
        const available = await client.query(
          "select 1 from pg_collation where collname = 'en-US-x-icu'"
        )
        if (available.rowCount === 0) return null
        const rows = await client.query<{ ticket_id: string }>(
          `select ticket_id from ticket_index
             where project_id = $1
             order by lower(title) collate "en-US-x-icu", ticket_id`,
          [projectId]
        )
        return rows.rows.map((row) => row.ticket_id)
      })
      if (localeOrder !== null) {
        expect(localeOrder).not.toEqual(byCodePoint)
      }

      const walked: Array<string> = []
      let cursor: string | undefined
      for (let attempt = 0; attempt < documents.length; attempt++) {
        const page = yield* index.query(
          project,
          { sort: { key: "title", dir: "asc" }, cursor },
          { viewerId: "viewer", limit: 2 }
        )
        if (page.length === 0) break
        walked.push(...page.map((row) => row.entry.id))
        const last = page[page.length - 1]
        cursor = encodeCursor({ id: last.entry.id, sort: last.sortValue })
      }
      expect(walked).toEqual(byCodePoint)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect(
    "reads a single row's order key from the list query's own key",
    () =>
      Effect.gen(function* () {
        const suffix = randomUUID()
        const organizationId = `ticket-index-single-${suffix}`
        const orgSlug = `ticket-index-single-${suffix}`
        const projectSlug = `ticket-index-single-${suffix}`
        const projectId = randomUUID()
        yield* withClient(async (client) => {
          await client.query(
            `insert into organization (id, name, slug, created_at)
             values ($1, 'Ticket index single', $2, now())`,
            [organizationId, orgSlug]
          )
          await client.query(
            `insert into project_index
               (id, slug, organization_id, key, name, icon, color, created_by, created_at)
             values ($1, $2, $3, 'T', 'Ticket index single', 'folder', 'blue', 'test-user', now())`,
            [projectId, projectSlug, organizationId]
          )
        })
        yield* Effect.addFinalizer(() =>
          withClient((client) =>
            client.query("delete from organization where id = $1", [
              organizationId
            ])
          )
        )

        const documents = [
          indexedDocument("T-1", { title: "École", priority: "high" }),
          indexedDocument("T-2", { title: "ab 1", priority: "low" }),
          indexedDocument("T-30", { title: "dup", priority: "med" })
        ]
        const index = yield* TicketIndex
        const project = yield* index.projectFor(orgSlug, projectSlug)
        yield* Effect.forEach(documents, (document) =>
          index.upsertTicket(project, document)
        )

        const sorts: ReadonlyArray<TicketSort> = [
          { key: "id", dir: "asc" },
          { key: "id", dir: "desc" },
          { key: "created", dir: "asc" },
          { key: "updated", dir: "desc" },
          { key: "title", dir: "asc" },
          { key: "title", dir: "desc" },
          { key: "priority", dir: "asc" },
          { key: "priority", dir: "desc" }
        ]

        yield* Effect.forEach(sorts, (sort) =>
          Effect.gen(function* () {
            const rows = yield* index.query(
              project,
              { sort },
              { viewerId: "viewer", limit: documents.length }
            )
            yield* Effect.forEach(rows, (row) =>
              Effect.gen(function* () {
                const single = yield* index.orderKeyFor(
                  project,
                  row.entry.id,
                  sort
                )
                expect(single).toBe(row.orderKey)
              })
            )
          })
        )

        expect(
          yield* index.orderKeyFor(project, "T-nope", {
            key: "title",
            dir: "asc"
          })
        ).toBeNull()
      }).pipe(Effect.provide(TestLayer))
  )
})

describe.skipIf(!databaseUrl)("TicketIndex Postgres across projects", () => {
  it.effect(
    "finds a viewer's assigned and touched tickets across projects",
    () =>
      Effect.gen(function* () {
        const suffix = randomUUID()
        const organizationId = `ticket-index-org-${suffix}`
        const orgSlug = `ticket-index-org-${suffix}`
        const alphaSlug = `ticket-index-alpha-${suffix}`
        const betaSlug = `ticket-index-beta-${suffix}`
        const hiddenSlug = `ticket-index-hidden-${suffix}`
        const viewerId = `viewer-${suffix}`
        yield* withClient(async (client) => {
          await client.query(
            `insert into organization (id, name, slug, created_at)
               values ($1, 'Ticket index org', $2, now())`,
            [organizationId, orgSlug]
          )
          for (const [slug, key] of [
            [alphaSlug, "AL"],
            [betaSlug, "BE"],
            [hiddenSlug, "HI"]
          ] as const) {
            await client.query(
              `insert into project_index
                   (id, slug, organization_id, key, name, icon, color, created_by, created_at)
                 values ($1, $2, $3, $4, $2, 'folder', 'blue', 'test-user', now())`,
              [randomUUID(), slug, organizationId, key]
            )
          }
          await client.query(
            `insert into "user" (id, name, email, created_at, updated_at)
               values ($1, 'Viewer', $2, now(), now())`,
            [viewerId, `${viewerId}@example.com`]
          )
        })
        yield* Effect.addFinalizer(() =>
          withClient(async (client) => {
            await client.query(
              "delete from comment_index where author_id = $1",
              [viewerId]
            )
            await client.query('delete from "user" where id = $1', [viewerId])
            await client.query("delete from organization where id = $1", [
              organizationId
            ])
          })
        )

        const index = yield* TicketIndex
        const [alpha, beta, hidden] = yield* Effect.forEach(
          [alphaSlug, betaSlug, hiddenSlug],
          (slug) => index.projectFor(orgSlug, slug)
        )
        const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))
        yield* Effect.forEach(
          [
            [
              alpha,
              indexedDocument("AL-1", {
                assignees: [viewerId],
                updatedAt: at("2026-03-05T00:00:00.000Z")
              })
            ],
            [
              alpha,
              indexedDocument("AL-2", {
                status: ticketStatus("done"),
                assignees: [viewerId],
                updatedAt: at("2026-02-01T00:00:00.000Z")
              })
            ],
            [
              alpha,
              indexedDocument("AL-3", {
                createdBy: viewerId,
                updatedAt: at("2026-03-02T00:00:00.000Z")
              })
            ],
            [
              alpha,
              indexedDocument("AL-4", {
                assignees: [viewerId],
                archivedAt: at("2026-03-01T00:00:00.000Z"),
                updatedAt: at("2026-03-06T00:00:00.000Z")
              })
            ],
            [
              beta,
              indexedDocument("BE-1", {
                status: ticketStatus("done"),
                assignees: ["someone-else", viewerId],
                updatedAt: at("2026-03-04T00:00:00.000Z")
              })
            ],
            [
              beta,
              indexedDocument("BE-2", {
                updatedAt: at("2026-03-03T00:00:00.000Z")
              })
            ],
            [
              beta,
              indexedDocument("BE-3", {
                updatedAt: at("2026-03-07T00:00:00.000Z")
              })
            ],
            [
              hidden,
              indexedDocument("HI-1", {
                assignees: [viewerId],
                updatedAt: at("2026-03-08T00:00:00.000Z")
              })
            ]
          ] as const,
          ([project, document]) => index.upsertTicket(project, document)
        )
        yield* withClient((client) =>
          client.query(
            `insert into comment_index (id, project_id, ticket_id, origin, author_kind, author_id)
               values ($1, $2, 'BE-2', 'native', 'user', $3)`,
            [`comment-${suffix}`, beta.projectId, viewerId]
          )
        )

        const visible = yield* index.projectsFor(orgSlug, [
          alphaSlug,
          betaSlug,
          "not-a-project"
        ])
        expect(visible.map((project) => project.projectSlug).sort()).toEqual(
          [alphaSlug, betaSlug].sort()
        )

        const idsOf = (
          rows: ReadonlyArray<{
            entry: { id: string }
            project: { projectSlug: string }
          }>
        ) =>
          rows.map(({ project, entry }) => `${project.projectSlug}:${entry.id}`)

        const assigned = yield* index.assignedTo(visible, {
          viewerId,
          doneAfter: at("2026-03-01T00:00:00.000Z"),
          limit: 10
        })
        expect(idsOf(assigned)).toEqual([
          `${alphaSlug}:AL-1`,
          `${betaSlug}:BE-1`
        ])

        const firstPage = yield* index.assignedTo(visible, {
          viewerId,
          doneAfter: at("2026-01-01T00:00:00.000Z"),
          limit: 1
        })
        expect(idsOf(firstPage)).toEqual([`${alphaSlug}:AL-1`])
        const rest = yield* index.assignedTo(visible, {
          viewerId,
          doneAfter: at("2026-01-01T00:00:00.000Z"),
          cursor: encodeCursor({
            id: firstPage[0]!.entry.id,
            sort: firstPage[0]!.sortValue
          }),
          limit: 10
        })
        expect(idsOf(rest)).toEqual([`${betaSlug}:BE-1`, `${alphaSlug}:AL-2`])

        const touched = yield* index.touchedBy(visible, {
          viewerId,
          limit: 10
        })
        expect(idsOf(touched)).toEqual([
          `${betaSlug}:BE-2`,
          `${alphaSlug}:AL-3`,
          `${alphaSlug}:AL-1`,
          `${betaSlug}:BE-1`,
          `${alphaSlug}:AL-2`
        ])

        const allTime = {
          viewerId,
          doneAfter: at("2026-01-01T00:00:00.000Z")
        }
        const statusCounts = yield* index.countAssignedByStatus(
          visible,
          allTime
        )
        expect(
          statusCounts
            .map(
              ({ project, status, count }) =>
                `${project.projectSlug}:${status}=${count}`
            )
            .toSorted()
        ).toEqual(
          [
            `${alphaSlug}:done=1`,
            `${alphaSlug}:todo=1`,
            `${betaSlug}:done=1`
          ].toSorted()
        )
        const previews = yield* index.assignedPerProject(visible, {
          ...allTime,
          perProject: 1
        })
        expect(
          previews
            .map(({ project, total, entries }) => [
              project.projectSlug,
              total,
              entries.map((entry) => entry.id)
            ])
            .toSorted((a, b) => String(a[0]).localeCompare(String(b[0])))
        ).toEqual(
          [
            [alphaSlug, 2, ["AL-1"]],
            [betaSlug, 1, ["BE-1"]]
          ].toSorted((a, b) => String(a[0]).localeCompare(String(b[0])))
        )

        const hasComment = new Map(
          touched.map(({ entry, lastCommentAt }) => [
            entry.id,
            lastCommentAt !== null
          ])
        )
        expect(hasComment.get(ticketId("BE-2"))).toBe(true)
        expect(hasComment.get(ticketId("AL-1"))).toBe(false)

        expect(
          yield* index.assignedTo([], {
            viewerId,
            doneAfter: at("2026-01-01T00:00:00.000Z"),
            limit: 10
          })
        ).toEqual([])
      }).pipe(Effect.provide(TestLayer))
  )
})
