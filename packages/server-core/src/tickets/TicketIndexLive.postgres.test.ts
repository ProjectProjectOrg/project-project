// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import {
  CommentId,
  UserId,
  encodeCursor,
  padNumericIdSort,
  ProjectScope,
  TagName,
  TicketId,
  TicketStatus,
  type TicketFilter,
  type TicketSort
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import pg from "pg"
import { describe, expect } from "vitest"

import { projectScope } from "../access/testing"
import { Comments } from "../comments/Comments"
import { serializeCommentsRegion } from "../comments/comments-region"
import { CommentsLive } from "../comments/CommentsLive"
import { Projects } from "../projects/Projects"
import { Users } from "../users/Users"
import * as TicketBranchIndex from "./TicketBranchIndex"
import {
  TicketDocs,
  type TicketDocsShape,
  type TicketDocument
} from "./TicketDocs"
import { TicketIndex, type TicketIndexSections } from "./TicketIndex"
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
const TestLayer = Layer.mergeAll(
  TicketIndexLive.pipe(Layer.provide(FakeTicketDocs)),
  TicketBranchIndex.layer
).pipe(Layer.provide(DatabaseLive))

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

const stackedDocument: TicketDocument = {
  ...rebuiltDocument,
  id: ticketId("T-7"),
  branch: "api",
  stack: [{ branch: "ui", base: "api", pr: 8, prState: "open" }]
}

const StackRebuildTestLayer = TicketIndexLive.pipe(
  Layer.provide(
    Layer.succeed(TicketDocs, {
      listIds: () => Effect.succeed([stackedDocument.id]),
      read: () => Effect.succeed(stackedDocument),
      create: () => unexpected("TicketDocs.create"),
      write: () => unexpected("TicketDocs.write"),
      update: () => unexpected("TicketDocs.update"),
      remove: () => unexpected("TicketDocs.remove"),
      readRaw: () => unexpected("TicketDocs.readRaw")
    } satisfies TicketDocsShape)
  ),
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

const seedRebuildProject = Effect.gen(function* () {
  const organizationId = `rebuild-${randomUUID()}`
  yield* withClient(async (client) => {
    await client.query(
      "insert into organization (id, name, slug, created_at) values ($1, $1, $1, now())",
      [organizationId]
    )
    await client.query(
      "insert into project_index (id, slug, organization_id, key, name, icon, color, created_by, created_at) values ($1, $2, $2, 'T', 'Test', 'folder', 'blue', 'test-user', now())",
      [randomUUID(), organizationId]
    )
  })
  yield* Effect.addFinalizer(() =>
    withClient((client) =>
      client.query("delete from organization where id = $1", [organizationId])
    )
  )
  return organizationId
})

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

  it.effect("rebuilds an index row that is ahead of its ticket file", () =>
    Effect.gen(function* () {
      const organizationId = yield* seedRebuildProject
      const docs = Layer.succeed(TicketDocs, {
        listIds: () => Effect.succeed([rebuiltDocument.id]),
        read: () => Effect.succeed(rebuiltDocument),
        create: () => unexpected("create"),
        write: () => unexpected("write"),
        update: () => unexpected("update"),
        remove: () => unexpected("remove"),
        readRaw: () => unexpected("readRaw")
      } satisfies TicketDocsShape)
      yield* Effect.gen(function* () {
        const index = yield* TicketIndex
        const project = yield* index.projectFor(organizationId, organizationId)
        yield* index.upsertTicket(project, {
          ...rebuiltDocument,
          title: "Rolled back",
          updatedAt: DateTime.toDate(
            DateTime.makeUnsafe("2026-02-01T00:00:00.000Z")
          )
        })
        yield* index.rebuildProject(project)
        const rows = yield* index.list(project, ["T-41"])
        expect(rows.map(({ id, title }) => [id, title])).toEqual([
          ["T-41", "Restored ticket"]
        ])
      }).pipe(
        Effect.provide(
          TicketIndexLive.pipe(Layer.provide(docs), Layer.provide(DatabaseLive))
        )
      )
    }).pipe(Effect.provide(DatabaseLive))
  )

  it.effect("clears cached git state when a rebuild changes the branch", () =>
    Effect.gen(function* () {
      const organizationId = yield* seedRebuildProject
      const onDisk: TicketDocument = {
        ...rebuiltDocument,
        branch: "feat/new",
        updatedAt: DateTime.toDate(
          DateTime.makeUnsafe("2026-02-01T00:00:00.000Z")
        )
      }
      const docs = Layer.succeed(TicketDocs, {
        listIds: () => Effect.succeed([onDisk.id]),
        read: () => Effect.succeed(onDisk),
        create: () => unexpected("create"),
        write: () => unexpected("write"),
        update: () => unexpected("update"),
        remove: () => unexpected("remove"),
        readRaw: () => unexpected("readRaw")
      } satisfies TicketDocsShape)
      yield* Effect.gen(function* () {
        const index = yield* TicketIndex
        const project = yield* index.projectFor(organizationId, organizationId)
        yield* index.upsertTicket(project, {
          ...rebuiltDocument,
          branch: "feat/old"
        })
        yield* withClient((client) =>
          client.query(
            "update ticket_index set branch_deleted_at = now(), checks = 'failing', checks_head_sha = 'abc', checks_updated_at = now(), pr_updated_at = now() where project_id = $1",
            [project.projectId]
          )
        )
        yield* index.rebuildProject(project)
        const row = yield* withClient((client) =>
          client.query(
            "select branch, branch_deleted_at, checks, checks_head_sha, checks_updated_at, pr_updated_at from ticket_index where project_id = $1",
            [project.projectId]
          )
        )
        expect(row.rows).toEqual([
          {
            branch: "feat/new",
            branch_deleted_at: null,
            checks: null,
            checks_head_sha: null,
            checks_updated_at: null,
            pr_updated_at: null
          }
        ])
      }).pipe(
        Effect.provide(
          TicketIndexLive.pipe(Layer.provide(docs), Layer.provide(DatabaseLive))
        )
      )
    }).pipe(Effect.provide(DatabaseLive))
  )

  it.effect("preserves edits and creations during a rebuild", () =>
    Effect.gen(function* () {
      const organizationId = yield* seedRebuildProject
      const collected = yield* Deferred.make<void>()
      const resume = yield* Deferred.make<void>()
      const docs = Layer.succeed(TicketDocs, {
        listIds: () => Effect.succeed([rebuiltDocument.id]),
        read: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(collected, undefined)
            yield* Deferred.await(resume)
            return rebuiltDocument
          }),
        create: () => unexpected("create"),
        write: () => unexpected("write"),
        update: () => unexpected("update"),
        remove: () => unexpected("remove"),
        readRaw: () => unexpected("readRaw")
      } satisfies TicketDocsShape)
      yield* Effect.gen(function* () {
        const index = yield* TicketIndex
        const project = yield* index.projectFor(organizationId, organizationId)
        const fiber = yield* Effect.forkChild(index.rebuildProject(project))
        yield* Deferred.await(collected)
        const updatedAt = DateTime.toDate(
          DateTime.makeUnsafe("2026-02-01T00:00:00.000Z")
        )
        yield* index.upsertTicket(project, {
          ...rebuiltDocument,
          title: "Newer",
          updatedAt
        })
        yield* index.upsertTicket(
          project,
          indexedDocument("T-42", { title: "Created", updatedAt })
        )
        yield* Deferred.succeed(resume, undefined)
        yield* Fiber.join(fiber)
        const rows = yield* index.list(project, ["T-41", "T-42"])
        expect(
          rows
            .map(({ id, title }) => [id, title])
            .sort((a, b) => a[0].localeCompare(b[0]))
        ).toEqual([
          ["T-41", "Newer"],
          ["T-42", "Created"]
        ])
      }).pipe(
        Effect.provide(
          TicketIndexLive.pipe(Layer.provide(docs), Layer.provide(DatabaseLive))
        )
      )
    }).pipe(Effect.provide(DatabaseLive))
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

  it.effect("keeps stacked layers in step with the ticket", () =>
    Effect.gen(function* () {
      const suffix = randomUUID()
      const organizationId = `ticket-index-stack-${suffix}`
      const orgSlug = `ticket-index-stack-${suffix}`
      const projectSlug = `ticket-index-stack-${suffix}`
      const projectId = randomUUID()
      yield* withClient(async (client) => {
        await client.query(
          `insert into organization (id, name, slug, created_at)
               values ($1, 'Ticket index stack', $2, now())`,
          [organizationId, orgSlug]
        )
        await client.query(
          `insert into project_index
                 (id, slug, organization_id, key, name, icon, color, created_by, created_at)
               values ($1, $2, $3, 'T', 'Ticket index stack', 'folder', 'blue', 'test-user', now())`,
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
      const layers = () =>
        withClient(async (client) => {
          const result = await client.query(
            `select branch, position, base, pr_state, landed
                 from ticket_branch where project_id = $1 and ticket_id = 'T-1' order by position`,
            [projectId]
          )
          return result.rows
        })

      const index = yield* TicketIndex
      const branchIndex = yield* TicketBranchIndex.TicketBranchIndex
      const project = yield* index.projectFor(orgSlug, projectSlug)
      yield* index.upsertTicket(
        project,
        indexedDocument("T-1", {
          branch: "api",
          prBase: "main",
          stack: [
            {
              branch: "ui",
              base: "api",
              pr: 2,
              prState: "open"
            },
            {
              branch: "polish",
              base: "ui",
              pr: 3,
              prState: "open"
            }
          ]
        })
      )
      yield* index.upsertTicket(
        project,
        indexedDocument("T-1", {
          branch: "api",
          prBase: "main",
          stack: [
            {
              branch: "ui",
              base: "api",
              pr: 2,
              prState: "merged",
              landed: true
            },
            { branch: "docs" }
          ],
          ignoredBranches: ["spike"]
        })
      )

      expect(yield* layers()).toEqual([
        {
          branch: "ui",
          position: 0,
          base: "api",
          pr_state: "merged",
          landed: true
        },
        {
          branch: "docs",
          position: 1,
          base: null,
          pr_state: null,
          landed: false
        }
      ])
      expect((yield* index.list(project))[0]).toMatchObject({
        prBase: "main",
        ignoredBranches: ["spike"]
      })
      expect(yield* branchIndex.findStackLayers(projectId, "ui")).toEqual([
        { ...project, ticketId: "T-1", branch: "ui" }
      ])
      expect(yield* branchIndex.findStackLayers(projectId, "api")).toEqual([])
      expect(yield* branchIndex.stacksFor(project)).toEqual(
        new Map([
          [
            "T-1",
            [
              {
                branch: "ui",
                base: "api",
                pr: 2,
                prState: "merged",
                landed: true
              },
              { branch: "docs" }
            ]
          ]
        ])
      )
      expect(yield* branchIndex.stacksFor(project, [])).toEqual(new Map())

      const repoId = `repo-${suffix}`
      yield* withClient(async (client) => {
        const integrationId = randomUUID()
        const linkId = randomUUID()
        await client.query(
          `insert into organization_integration (id, organization_id, provider, status)
               values ($1, $2, 'github', 'active')`,
          [integrationId, organizationId]
        )
        await client.query(
          `insert into project_integration_link
                 (id, project_id, organization_id, organization_integration_id, provider, status)
               values ($1, $2, $3, $4, 'github', 'active')`,
          [linkId, projectId, organizationId, integrationId]
        )
        await client.query(
          `insert into project_github_repository
                 (project_integration_link_id, organization_id, status, repo_id, repo_owner, repo_name, default_branch)
               values ($1, $2, 'active', $3, 'acme', 'app', 'main')`,
          [linkId, organizationId, repoId]
        )
      })
      expect(
        yield* Effect.forEach(["api", "ui", "spike", "nope"], (branch) =>
          branchIndex.isRepositoryBranchAttached(repoId, branch)
        )
      ).toEqual([true, true, false, false])

      yield* index.upsertTicket(
        project,
        indexedDocument("T-2", {
          branch: "feat/two",
          pr: 5,
          prState: "merged",
          prBase: "api",
          stack: [
            { branch: "two-ui", base: "feat/two", pr: 6, prState: "merged" },
            {
              branch: "two-docs",
              base: "feat/two",
              pr: 7,
              prState: "merged",
              landed: true
            }
          ]
        })
      )
      expect(yield* branchIndex.findMergesAwaiting(projectId, "api")).toEqual([
        { ...project, ticketId: "T-2", branch: "feat/two", stacked: false }
      ])
      expect(
        yield* branchIndex.findMergesAwaiting(projectId, "feat/two")
      ).toEqual([
        { ...project, ticketId: "T-2", branch: "two-ui", stacked: true }
      ])
      expect(yield* branchIndex.findMergesAwaiting(projectId, "main")).toEqual(
        []
      )

      yield* index.deleteTicket(project, "T-1")
      expect(yield* layers()).toEqual([])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("rebuilds stacked layers from ticket files", () =>
    Effect.gen(function* () {
      const suffix = randomUUID()
      const organizationId = `ticket-index-stack-rebuild-${suffix}`
      const projectId = randomUUID()
      yield* withClient(async (client) => {
        await client.query(
          `insert into organization (id, name, slug, created_at)
             values ($1, 'Ticket index stack rebuild', $1, now())`,
          [organizationId]
        )
        await client.query(
          `insert into project_index
               (id, slug, organization_id, key, name, icon, color, created_by, created_at)
             values ($1, $2, $2, 'T', 'Ticket index stack rebuild', 'folder', 'blue', 'test-user', now())`,
          [projectId, organizationId]
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
      const project = yield* index.projectFor(organizationId, organizationId)
      yield* index.rebuildProject(project)
      yield* index.rebuildProject(project)

      const rows = yield* withClient(async (client) => {
        const result = await client.query(
          "select ticket_id, branch, base from ticket_branch where project_id = $1",
          [projectId]
        )
        return result.rows
      })
      expect(rows).toEqual([{ ticket_id: "T-7", branch: "ui", base: "api" }])
    }).pipe(Effect.provide(StackRebuildTestLayer))
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
          Layer.mock(Projects, {}),
          Layer.mock(TicketIndex, {}),
          Layer.mock(Users, {
            fullByIds: () => Effect.succeed([author])
          }),
          DatabaseLive,
          BunCrypto.layer
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
        return yield* comments.list(rebuildDocument.id)
      }).pipe(
        Effect.provide(commentsLayer),
        Effect.provideService(
          ProjectScope,
          projectScope("member", "developer", {
            userId,
            organizationId,
            orgSlug,
            slug: projectSlug,
            projectId
          })
        )
      )
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

  it.effect(
    "rebuilds a project whose tickets keep comments by deleted users",
    () => {
      const suffix = randomUUID()
      const organizationId = `ticket-index-deleted-author-${suffix}`
      const orgSlug = organizationId
      const projectSlug = organizationId
      const projectId = randomUUID()
      const userId = `ticket-index-author-${suffix}`
      const keptId = commentId(`c_${randomUUID()}`)
      const createdAt = DateTime.toDate(
        DateTime.makeUnsafe("2021-04-01T01:02:03.456Z")
      )
      const document: TicketDocument = {
        ...rebuiltDocument,
        id: ticketId("T-43"),
        createdBy: userId,
        commentsRegion: serializeCommentsRegion([
          {
            id: keptId,
            author: { kind: "user", userId },
            origin: "native",
            createdAt,
            editedAt: null,
            body: "Still here"
          },
          {
            id: commentId(`c_${randomUUID()}`),
            author: { kind: "user", userId: `deleted-user-${suffix}` },
            origin: "native",
            createdAt,
            editedAt: null,
            body: "Author was deleted"
          }
        ])
      }
      const indexLayer = TicketIndexLive.pipe(
        Layer.provide(
          Layer.succeed(TicketDocs, {
            listIds: () => Effect.succeed([document.id]),
            read: () => Effect.succeed(document),
            create: () => unexpected("TicketDocs.create"),
            write: () => unexpected("TicketDocs.write"),
            update: () => unexpected("TicketDocs.update"),
            remove: () => unexpected("TicketDocs.remove"),
            readRaw: () => unexpected("TicketDocs.readRaw")
          } satisfies TicketDocsShape)
        ),
        Layer.provide(DatabaseLive)
      )

      return Effect.gen(function* () {
        yield* withClient(async (client) => {
          await client.query(
            `insert into "user" (id, name, email, created_at, updated_at)
             values ($1, 'Author', $2, now(), now())`,
            [userId, `${userId}@example.com`]
          )
          await client.query(
            `insert into organization (id, name, slug, created_at)
             values ($1, 'Deleted author', $2, now())`,
            [organizationId, orgSlug]
          )
          await client.query(
            `insert into project_index
               (id, slug, organization_id, key, name, icon, color, created_by, created_at)
             values ($1, $2, $3, 'T', 'Deleted author', 'folder', 'blue', $4, now())`,
            [projectId, projectSlug, organizationId, userId]
          )
        })
        yield* Effect.addFinalizer(() =>
          withClient(async (client) => {
            await client.query("delete from organization where id = $1", [
              organizationId
            ])
            await client.query('delete from "user" where id = $1', [userId])
          })
        )

        const index = yield* TicketIndex
        const project = yield* index.projectFor(orgSlug, projectSlug)
        const summary = yield* index.rebuildProject(project)
        expect(summary.indexed).toBe(1)

        const rows = yield* withClient((client) =>
          client.query<Readonly<{ id: string }>>(
            "select id from comment_index where project_id = $1",
            [projectId]
          )
        )
        expect(rows.rows).toEqual([{ id: keptId }])
      }).pipe(Effect.provide(indexLayer))
    }
  )

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
      const branchIndex = yield* TicketBranchIndex.TicketBranchIndex
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

      yield* branchIndex.markBranchStale(projectId, "feat/T-2", januaryTwelfth)
      expect(
        yield* branchIndex.getBranchDeletedAt(orgSlug, projectSlug, "T-2")
      ).toEqual(januaryTwelfth)
      expect(
        yield* branchIndex.getBranchDeletedAt(orgSlug, projectSlug, "T-10")
      ).toBeNull()
      expect(
        yield* branchIndex.getBranchDeletedAt("wrong-org", projectSlug, "T-2")
      ).toBeNull()
      expect(
        yield* branchIndex.getBranchDeletedAt(orgSlug, "wrong-project", "T-2")
      ).toBeNull()
      expect(
        yield* branchIndex.getBranchDeletedAt(orgSlug, projectSlug, "T-missing")
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

      const summarize = (sections: TicketIndexSections) =>
        Object.fromEntries(
          [...sections].map(([key, section]) => [
            key,
            {
              ...section.counts,
              ids: section.entries.map(({ entry }) => entry.id)
            }
          ])
        )

      const titleSort = { key: "title", dir: "asc" } as const
      const byStatus = yield* index.querySections(
        project,
        { sort: titleSort, status: [ticketStatus("todo")] },
        { viewerId: "viewer", limit: 2, sections: "status" }
      )
      // Each status is limited on its own; counts ignore the status filter.
      expect(summarize(byStatus)).toEqual({
        todo: { total: 3, byStatus: { todo: 3 }, ids: ["T-13", "T-14"] },
        in_progress: { total: 2, byStatus: { in_progress: 2 }, ids: [] }
      })
      // Same entries as a plain query, so "load more" can continue from them.
      expect(byStatus.get("todo")?.entries).toEqual(
        yield* index.query(
          project,
          { sort: titleSort, status: [ticketStatus("todo")] },
          { viewerId: "viewer", limit: 2 }
        )
      )

      const bySprint = yield* index.querySections(
        project,
        { sort: { key: "id", dir: "asc" } },
        {
          viewerId: "viewer",
          limit: 10,
          sections: [
            { key: "G-1", ticketIds: ["T-11", "T-2", "T-12"] },
            { key: "ungrouped" }
          ]
        }
      )
      expect(summarize(bySprint)).toEqual({
        "G-1": {
          total: 2,
          byStatus: { todo: 1, in_progress: 1 },
          ids: ["T-2", "T-11"]
        },
        ungrouped: {
          total: 3,
          byStatus: { todo: 2, in_progress: 1 },
          ids: ["T-10", "T-13", "T-14"]
        }
      })

      const selectedOnly = yield* index.querySections(
        project,
        { sort: { key: "id", dir: "asc" } },
        {
          viewerId: "viewer",
          limit: 10,
          sections: [{ key: "G-1", ticketIds: ["T-11", "T-2", "T-12"] }]
        }
      )
      expect(summarize(selectedOnly)).toEqual({
        "G-1": {
          total: 2,
          byStatus: { todo: 1, in_progress: 1 },
          ids: ["T-2", "T-11"]
        }
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

  it.effect("groups tickets by epic in one pass", () =>
    Effect.gen(function* () {
      const suffix = randomUUID()
      const organizationId = `ticket-index-parent-${suffix}`
      const orgSlug = `ticket-index-parent-${suffix}`
      const projectSlug = `ticket-index-parent-${suffix}`
      const projectId = randomUUID()
      yield* withClient(async (client) => {
        await client.query(
          `insert into organization (id, name, slug, created_at)
             values ($1, 'Ticket index parent', $2, now())`,
          [organizationId, orgSlug]
        )
        await client.query(
          `insert into project_index
               (id, slug, organization_id, key, name, icon, color, created_by, created_at)
             values ($1, $2, $3, 'T', 'Ticket index parent', 'folder', 'blue', 'test-user', now())`,
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
      const epic = ticketId("T-1")
      yield* Effect.forEach(
        [
          indexedDocument("T-1", { type: "epic" }),
          indexedDocument("T-2", { parent: epic }),
          indexedDocument("T-3", {
            parent: epic,
            status: ticketStatus("in_progress")
          }),
          indexedDocument("T-4", { parent: epic }),
          indexedDocument("T-5", {})
        ],
        (document) => index.upsertTicket(project, document)
      )

      const grouped = yield* index.querySections(
        project,
        {
          type: ["feat", "bug", "chore", "other"],
          parent: [epic, "none"],
          sort: { key: "id", dir: "asc" }
        },
        { viewerId: "viewer", limit: 2, sections: "parent" }
      )

      const idsUnder = (key: string) =>
        grouped.get(key)?.entries.map(({ entry }) => entry.id)
      expect(grouped.get(epic)?.counts).toEqual({
        total: 3,
        byStatus: { in_progress: 1, todo: 2 }
      })
      expect(grouped.get("none")?.counts).toEqual({
        total: 1,
        byStatus: { todo: 1 }
      })
      expect(idsUnder(epic)).toEqual(["T-2", "T-3"])
      expect(idsUnder("none")).toEqual(["T-5"])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("counts sub-tickets and nests them under a matching parent", () =>
    Effect.gen(function* () {
      const suffix = randomUUID()
      const organizationId = `ticket-index-sub-${suffix}`
      const orgSlug = `ticket-index-sub-${suffix}`
      const projectSlug = `ticket-index-sub-${suffix}`
      const projectId = randomUUID()
      yield* withClient(async (client) => {
        await client.query(
          `insert into organization (id, name, slug, created_at)
             values ($1, 'Ticket index sub-tickets', $2, now())`,
          [organizationId, orgSlug]
        )
        await client.query(
          `insert into project_index
               (id, slug, organization_id, key, name, icon, color, created_by, created_at)
             values ($1, $2, $3, 'T', 'Ticket index sub-tickets', 'folder', 'blue', 'test-user', now())`,
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
      const epic = ticketId("T-1")
      const parent = ticketId("T-2")
      yield* Effect.forEach(
        [
          indexedDocument("T-1", { type: "epic" }),
          indexedDocument("T-2", { parent: epic }),
          indexedDocument("T-3", { parent }),
          indexedDocument("T-4", {
            parent,
            archivedAt: DateTime.toDate(DateTime.nowUnsafe())
          }),
          indexedDocument("T-5", { parent, status: ticketStatus("done") })
        ],
        (document) => index.upsertTicket(project, document)
      )

      const ids = (status: string) =>
        index
          .query(
            project,
            {
              status: [ticketStatus(status)],
              subTickets: "nested",
              sort: { key: "id", dir: "asc" }
            },
            { viewerId: "viewer", limit: 10 }
          )
          .pipe(Effect.map((rows) => rows.map(({ entry }) => entry.id)))
      const counts = new Map(
        (yield* index.list(project)).map((entry) => [
          entry.id,
          [entry.subTicketDoneCount, entry.subTicketCount]
        ])
      )

      expect(counts.get(epic)).toEqual([0, 1])
      expect(counts.get(parent)).toEqual([1, 2])
      expect(yield* ids("todo")).toEqual(["T-1", "T-2"])
      expect(yield* ids("done")).toEqual(["T-5"])

      const doneSection = (subTickets: "nested" | "flat") =>
        index
          .query(
            project,
            {
              subTickets,
              section: { status: [ticketStatus("done")] },
              sort: { key: "id", dir: "asc" }
            },
            { viewerId: "viewer", limit: 10 }
          )
          .pipe(Effect.map((rows) => rows.map(({ entry }) => entry.id)))
      expect(yield* doneSection("nested")).toEqual([])
      expect(yield* doneSection("flat")).toEqual(["T-5"])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect(
    "limits attach search to tickets that can move under the parent",
    () =>
      Effect.gen(function* () {
        const suffix = randomUUID()
        const organizationId = `ticket-index-attach-${suffix}`
        const orgSlug = `ticket-index-attach-${suffix}`
        const projectSlug = `ticket-index-attach-${suffix}`
        const projectId = randomUUID()
        yield* withClient(async (client) => {
          await client.query(
            `insert into organization (id, name, slug, created_at)
             values ($1, 'Ticket index attach', $2, now())`,
            [organizationId, orgSlug]
          )
          await client.query(
            `insert into project_index
               (id, slug, organization_id, key, name, icon, color, created_by, created_at)
             values ($1, $2, $3, 'T', 'Ticket index attach', 'folder', 'blue', 'test-user', now())`,
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
        const epic = ticketId("T-1")
        const target = ticketId("T-4")
        yield* Effect.forEach(
          [
            indexedDocument("T-1", { type: "epic" }),
            indexedDocument("T-2", { parent: epic }),
            indexedDocument("T-3", { parent: ticketId("T-2") }),
            indexedDocument("T-4", {}),
            indexedDocument("T-5", { parent: target }),
            indexedDocument("T-6", {})
          ],
          (document) => index.upsertTicket(project, document)
        )

        const attachable = (parent: string, leavesOnly: boolean) =>
          index
            .query(
              project,
              { sort: { key: "id", dir: "asc" } },
              {
                viewerId: "viewer",
                attachableTo: { parent, leavesOnly },
                limit: 10
              }
            )
            .pipe(Effect.map((rows) => rows.map(({ entry }) => entry.id)))

        expect(yield* attachable(target, true)).toEqual(["T-3", "T-6"])
        expect(yield* attachable(epic, false)).toEqual([
          "T-3",
          "T-4",
          "T-5",
          "T-6"
        ])
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
               (id, slug, organization_id, key, name, icon, color, estimation, created_by, created_at)
             values ($1, $2, $3, 'T', 'Ticket index order', 'folder', 'blue', 'points', 'test-user', now())`,
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
          estimate: { unit: "points", value: 13 },
          createdAt: earlier,
          updatedAt: later
        }),
        indexedDocument("T-2", {
          title: "ab",
          priority: "med",
          estimate: { unit: "points", value: 3 },
          createdAt: earlier,
          updatedAt: later
        }),
        indexedDocument("T-3", {
          title: "dup",
          priority: "high",
          estimate: { unit: "tshirt", value: "XL" },
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
        { key: "priority", dir: "desc" },
        { key: "estimate", dir: "asc" },
        { key: "estimate", dir: "desc" }
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

  it.effect("matches estimate filters against the project's current unit", () =>
    Effect.gen(function* () {
      const suffix = randomUUID()
      const organizationId = `ticket-index-estimate-${suffix}`
      const orgSlug = `ticket-index-estimate-${suffix}`
      const projectSlug = `ticket-index-estimate-${suffix}`
      const projectId = randomUUID()
      yield* withClient(async (client) => {
        await client.query(
          `insert into organization (id, name, slug, created_at)
               values ($1, 'Ticket index estimate', $2, now())`,
          [organizationId, orgSlug]
        )
        await client.query(
          `insert into project_index
                 (id, slug, organization_id, key, name, icon, color, estimation, created_by, created_at)
               values ($1, $2, $3, 'T', 'Ticket index estimate', 'folder', 'blue', 'points', 'test-user', now())`,
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
      yield* Effect.forEach(
        [
          indexedDocument("T-1", { estimate: { unit: "points", value: 4 } }),
          indexedDocument("T-2", { estimate: { unit: "tshirt", value: "M" } }),
          indexedDocument("T-3", { estimate: { unit: "time", minutes: 90 } }),
          indexedDocument("T-4")
        ],
        (document) => index.upsertTicket(project, document)
      )

      const matching = (estimate: NonNullable<TicketFilter["estimate"]>) =>
        index
          .query(
            project,
            { sort: { key: "id", dir: "asc" }, estimate },
            { viewerId: "viewer", limit: 10 }
          )
          .pipe(Effect.map((rows) => rows.map((row) => row.entry.id)))

      expect(yield* matching(["any"])).toEqual(["T-1"])
      expect(yield* matching(["none"])).toEqual(["T-2", "T-3", "T-4"])
      expect(yield* matching(["stale"])).toEqual(["T-2", "T-3"])
      expect(yield* matching(["M"])).toEqual([])

      const entries = yield* index.list(project, ["T-2", "T-3"])
      expect(entries.map((entry) => entry.estimate)).toEqual([
        { unit: "tshirt", value: "M" },
        { unit: "time", minutes: 90 }
      ])

      yield* withClient((client) =>
        client.query(
          "update project_index set estimation = 'tshirt' where id = $1",
          [projectId]
        )
      )
      expect(yield* matching(["M"])).toEqual(["T-2"])
      expect(yield* matching(["stale"])).toEqual(["T-1", "T-3"])
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
            await client.query("delete from organization where id = $1", [
              organizationId
            ])
            await client.query('delete from "user" where id = $1', [viewerId])
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
            id: firstPage[0].entry.id,
            sort: firstPage[0].sortValue
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

        yield* withClient((client) =>
          client.query(
            `insert into project_status (project_id, slug, label, icon, color, order_key, created_by)
               values ($1, 'done', 'Done', 'CircleCheck', '#22c55e', 'a2', $2),
                      ($1, 'wont_do', 'Won''t do', 'Ban', '#a3a3a3', 'a3', $2),
                      ($1, 'review', 'Review', 'Eye', '#e0a03b', 'a1V', $2)`,
            [alpha.projectId, viewerId]
          )
        )
        yield* Effect.forEach(
          [
            indexedDocument("AL-5", {
              status: ticketStatus("wont_do"),
              assignees: [viewerId],
              updatedAt: at("2026-02-15T00:00:00.000Z")
            }),
            indexedDocument("AL-6", {
              status: ticketStatus("review"),
              assignees: [viewerId],
              updatedAt: at("2026-02-16T00:00:00.000Z")
            })
          ],
          (document) => index.upsertTicket(alpha, document)
        )
        const withPhases = yield* index.assignedTo(visible, {
          viewerId,
          doneAfter: at("2026-03-01T00:00:00.000Z"),
          limit: 10
        })
        expect(idsOf(withPhases)).toEqual([
          `${alphaSlug}:AL-1`,
          `${betaSlug}:BE-1`,
          `${alphaSlug}:AL-6`
        ])
      }).pipe(Effect.provide(TestLayer))
  )
})
