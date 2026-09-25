import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { migrationsFolder } from "@pp/db"
import { DbLive } from "@pp/db"
import { Access } from "@pp/server-core/access/Access"
import { AccessLive } from "@pp/server-core/access/AccessLive"
import { testUser } from "@pp/server-core/access/testing"
import { GitHub } from "@pp/server-core/github/GitHub"
import * as KeyedLock from "@pp/server-core/locks/KeyedLock"
import { MarkdownError } from "@pp/server-core/markdown/Markdown"
import { BannerPlaceholders } from "@pp/server-core/projects/BannerPlaceholders"
import { ProjectDocs } from "@pp/server-core/projects/ProjectDocs"
import { Projects } from "@pp/server-core/projects/Projects"
import { ProjectsLive } from "@pp/server-core/projects/ProjectsLive"
import {
  TicketDocs,
  type TicketDocument
} from "@pp/server-core/tickets/TicketDocs"
import * as TicketDocumentLock from "@pp/server-core/tickets/ticketDocumentLock"
import { TicketIndexLive } from "@pp/server-core/tickets/TicketIndexLive"
import { Users } from "@pp/server-core/users/Users"
import {
  CurrentUser,
  ProjectScope,
  Slug,
  TicketId,
  TicketStatus
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const unused = () =>
  Effect.die(new Error("Unexpected repository switch dependency call"))

describe.skipIf(!databaseUrl)("GitHub repository switch", () => {
  const organizationId = randomUUID()
  const userId = randomUUID()
  const projectId = randomUUID()
  const integrationId = randomUUID()
  const linkId = randomUUID()
  const slug = Schema.decodeSync(Slug)(`switch-${projectId}`)
  const ticketId = Schema.decodeSync(TicketId)("T-1")
  const createdAt = DateTime.toDateUtc(
    DateTime.makeUnsafe("2026-09-08T00:00:00Z")
  )
  const initialTicket: TicketDocument = {
    id: ticketId,
    title: "Keep branch, clear old PR",
    status: Schema.decodeSync(TicketStatus)("todo"),
    type: "feat",
    priority: "med",
    tags: [],
    branch: "feat/T-1",
    pr: 42,
    prState: "open",
    lastTransitionedPr: 41,
    assignees: [],
    archivedAt: null,
    createdBy: userId,
    createdAt,
    updatedBy: userId,
    updatedAt: createdAt,
    commentsRegion: "",
    body: "Ticket body"
  }
  const banner = {
    type: "preset" as const,
    preset: "sunset" as const,
    crop: { x: 0.5, y: 0.65, zoom: 1 },
    placeholder: null
  }
  let ticket = initialTicket
  let failWrite = false
  let lockChecks = 0
  let pool: Pool
  let projectsLayer: Layer.Layer<Projects | Access>

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
    await migrate(drizzle({ client: pool }), {
      migrationsFolder
    })
    await pool.query(
      'INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES ($1,$1,$2,now(),now())',
      [userId, `${userId}@example.test`]
    )
    await pool.query(
      "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$1,$1,now())",
      [organizationId]
    )
    await pool.query(
      "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'owner',now())",
      [randomUUID(), organizationId, userId]
    )
    await pool.query(
      "INSERT INTO project_index (id,slug,organization_id,key,name,icon,color,created_by,banner) VALUES ($1,$2,$3,'T','Switch','folder','#3b82f6',$4,$5)",
      [projectId, slug, organizationId, userId, JSON.stringify(banner)]
    )
    await pool.query(
      "INSERT INTO project_member (project_id,organization_id,user_id,role_id) VALUES ($1,$2,$3,'developer')",
      [projectId, organizationId, userId]
    )
    await pool.query(
      "INSERT INTO organization_integration (id,organization_id,provider,status) VALUES ($1,$2,'github','active')",
      [integrationId, organizationId]
    )
    await pool.query(
      "INSERT INTO organization_github_integration (organization_integration_id,installation_id,github_account_id,github_account_login,github_account_type) VALUES ($1,$2,'account','acme','Organization')",
      [integrationId, `installation-${integrationId}`]
    )
    await pool.query(
      "INSERT INTO project_integration_link (id,project_id,organization_id,organization_integration_id,provider,status) VALUES ($1,$2,$3,$4,'github','active')",
      [linkId, projectId, organizationId, integrationId]
    )
    await pool.query(
      "INSERT INTO project_github_repository (project_integration_link_id,organization_id,status,repo_id,repo_owner,repo_name,default_branch) VALUES ($1,$2,'active','old-repo','acme','old','main')",
      [linkId, organizationId]
    )

    const db = DbLive.pipe(
      Layer.provideMerge(
        PgClient.layer({
          url: Redacted.make(databaseUrl),
          maxConnections: 1
        })
      )
    )
    const docs = Layer.succeed(TicketDocs, {
      listIds: () => Effect.succeed([ticketId]),
      read: () => Effect.sync(() => ticket),
      write: (_org, _slug, _id, next) =>
        Effect.gen(function* () {
          if (failWrite) {
            return yield* new MarkdownError({
              message: "Write failed",
              cause: new Error("Test failure")
            })
          }
          ticket = next
          return yield* Effect.void
        }),
      update: (_org, _slug, _id, transform, onPersist) =>
        Effect.gen(function* () {
          const next = yield* transform(ticket)
          if (failWrite)
            return yield* new MarkdownError({
              message: "Write failed",
              cause: new Error("Test failure")
            })
          ticket = next
          if (onPersist) yield* onPersist(next)
          return next
        }),
      create: unused,
      remove: unused,
      readRaw: unused
    })
    const lock = Layer.effect(
      TicketDocumentLock.TicketDocumentLock,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const delegate = TicketDocumentLock.make(yield* KeyedLock.KeyedLock)
        return TicketDocumentLock.TicketDocumentLock.of({
          withRepositoryBranchLock: delegate.withRepositoryBranchLock,
          withTicketDocumentLock: (org, project, id, effect) =>
            Effect.gen(function* () {
              const transaction = yield* Effect.serviceOption(
                sql.transactionService
              )
              expect(Option.isNone(transaction)).toBe(true)
              lockChecks += 1
              return yield* delegate.withTicketDocumentLock(
                org,
                project,
                id,
                effect
              )
            })
        })
      })
    ).pipe(Layer.provide(db), Layer.provide(KeyedLock.layer))
    projectsLayer = ProjectsLive.pipe(
      Layer.provideMerge(AccessLive.pipe(Layer.provide(db))),
      Layer.provide(
        TicketIndexLive.pipe(Layer.provide(db), Layer.provide(docs))
      ),
      Layer.provide(docs),
      Layer.provide(lock),
      Layer.provide(db),
      Layer.provide(
        Layer.succeed(BannerPlaceholders, {
          ensure: (_org, _slug, current) => Effect.succeed(current)
        })
      ),
      Layer.provide(
        Layer.succeed(ProjectDocs, {
          read: () =>
            Effect.succeed({
              slug,
              name: "Switch",
              icon: "folder",
              color: "#3b82f6",
              createdAt: initialTicket.createdAt,
              github: null,
              setup: {
                workflowReviewedAt: null,
                invitePeopleDismissedAt: null,
                connectGithubDismissedAt: null
              },
              templateDefaults: {},
              body: "Project body"
            }),
          write: () => Effect.void,
          writeTemplateDefaults: unused,
          removeDir: unused,
          readRaw: unused
        })
      ),
      Layer.provide(
        Layer.succeed(Users, {
          findByEmail: unused,
          findManyByIds: unused,
          fullByIds: unused
        })
      ),
      Layer.provide(
        Layer.succeed(GitHub, {
          verifyInstallationRepo: () =>
            Effect.succeed({
              repoId: "new-repo",
              owner: "acme",
              name: "new",
              defaultBranch: "main"
            }),
          getInstallationAccount: unused,
          listInstallationRepos: unused,
          exchangeAppUserCode: unused,
          appUserCanAccessInstallation: unused,
          createBranchAsUser: unused,
          openPullRequestAsUser: unused,
          fetchInstallationProjectStates: unused,
          listInstallationBranches: unused,
          branchExistsInstallation: unused
        })
      ),
      Layer.orDie
    )
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM organization WHERE id=$1", [organizationId])
      await pool.query('DELETE FROM "user" WHERE id=$1', [userId])
      await pool.end()
    }
  })

  const connect = () =>
    Effect.flatMap(Projects, (projects) =>
      projects.connectGithub({
        repoId: "new-repo",
        repoOwner: "acme",
        repoName: "new"
      })
    ).pipe(
      Effect.provideServiceEffect(
        ProjectScope,
        Effect.flatMap(Access, (access) =>
          access.project(organizationId, slug)
        ).pipe(Effect.provideService(CurrentUser, testUser(userId)))
      ),
      Effect.provide(projectsLayer)
    )

  it.effect(
    "keeps the old connection on cleanup failure and retries outside a transaction",
    () =>
      Effect.gen(function* () {
        failWrite = true
        const failedError = yield* Effect.flip(connect())
        expect(failedError).toMatchObject({ _tag: "MarkdownError" })
        const failed = yield* Effect.promise(() =>
          pool.query(
            "SELECT repo_id FROM project_github_repository WHERE organization_id=$1 AND status='active'",
            [organizationId]
          )
        )
        expect(failed.rows).toEqual([{ repo_id: "old-repo" }])

        failWrite = false
        const result = yield* connect()
        expect(result.github?.repoId).toBe("new-repo")
        expect(result.banner).toEqual(banner)
        expect(lockChecks).toBe(2)
        expect(ticket).toMatchObject({
          branch: "feat/T-1",
          pr: null,
          prState: null,
          lastTransitionedPr: null
        })
        const indexed = yield* Effect.promise(() =>
          pool.query(
            "SELECT branch,pr,pr_state,last_transitioned_pr FROM ticket_index WHERE project_id=$1 AND ticket_id=$2",
            [projectId, ticketId]
          )
        )
        expect(indexed.rows).toEqual([
          {
            branch: "feat/T-1",
            pr: null,
            pr_state: null,
            last_transitioned_pr: null
          }
        ])
      })
  )
})
