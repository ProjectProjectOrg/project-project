// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { migrationsFolder } from "@pp/db"
import { CurrentUser, ProjectScope, type GithubConnection } from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { Access } from "../access/Access"
import { testUser } from "../access/testing"
import { asUser } from "../activity/testing"
import { ProjectDocs } from "./ProjectDocs"
import * as ProjectGithub from "./ProjectGithub"
import { projectsOnPostgres } from "./projectsOnPostgres"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const unused = () => Effect.die(new Error("Unexpected project docs call"))

const repo = (name: string) => ({
  repoId: `${name}-repo`,
  repoOwner: "acme",
  repoName: name
})

describe.skipIf(!databaseUrl)("project GitHub connection", () => {
  const organizationId = randomUUID()
  const userId = randomUUID()
  const projectId = randomUUID()
  const integrationId = randomUUID()
  const installationId = `installation-${integrationId}`
  const slug = `github-${projectId}`
  const repoCalls: Array<[string, string | undefined, number]> = []
  const branchCalls: Array<ReadonlyArray<unknown>> = []
  const writtenConnections: Array<GithubConnection | null> = []
  let pool: Pool
  let layer: ReturnType<typeof projectsOnPostgres>

  const run = <A, E, R>(
    f: (
      github: ProjectGithub.ProjectGithub["Service"]
    ) => Effect.Effect<A, E, R>
  ) =>
    Effect.flatMap(ProjectGithub.ProjectGithub, f).pipe(
      Effect.provideServiceEffect(
        ProjectScope,
        Effect.flatMap(Access, (access) =>
          access.project(organizationId, slug)
        ).pipe(Effect.provideService(CurrentUser, testUser(userId)))
      ),
      asUser(userId),
      Effect.provide(layer)
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
      'INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES ($1,$1,$2,now(),now())',
      [userId, `${userId}@example.test`]
    )
    await pool.query(
      "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$1,$1,now())",
      [organizationId]
    )
    await pool.query(
      "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'member',now())",
      [randomUUID(), organizationId, userId]
    )
    await pool.query(
      "INSERT INTO project_index (id,slug,organization_id,key,name,icon,color,created_by) VALUES ($1,$2,$3,'GH','GitHub','folder','#3b82f6',$4)",
      [projectId, slug, organizationId, userId]
    )
    await pool.query(
      "INSERT INTO project_member (project_id,organization_id,user_id,role_id) VALUES ($1,$2,$3,'pm')",
      [projectId, organizationId, userId]
    )
    await pool.query(
      "INSERT INTO organization_integration (id,organization_id,provider,status) VALUES ($1,$2,'github','active')",
      [integrationId, organizationId]
    )
    await pool.query(
      "INSERT INTO organization_github_integration (organization_integration_id,installation_id,github_account_id,github_account_login,github_account_type) VALUES ($1,$2,'account','acme','Organization')",
      [integrationId, installationId]
    )

    const projectDocs = Layer.succeed(ProjectDocs, {
      read: () =>
        Effect.succeed({
          slug,
          name: "GitHub",
          icon: "folder",
          color: "#3b82f6",
          createdAt: DateTime.toDateUtc(
            DateTime.makeUnsafe("2026-09-24T00:00:00Z")
          ),
          github: null,
          estimation: "off",
          setup: {
            workflowReviewedAt: null,
            invitePeopleDismissedAt: null,
            connectGithubDismissedAt: null
          },
          templateDefaults: {},
          body: "Project body"
        }),
      write: (_org, _slug, file) =>
        Effect.sync(() => {
          writtenConnections.push(file.github)
        }),
      writeTemplateDefaults: unused,
      markSystem: unused,
      systemRole: unused,
      removeDir: unused,
      readRaw: unused
    })
    layer = projectsOnPostgres(databaseUrl, [userId], {}, projectDocs, {
      verifyInstallationRepo: (_installation, owner, name) =>
        Effect.succeed({
          repoId: `${name}-repo`,
          owner,
          name,
          defaultBranch: "main"
        }),
      listInstallationRepos: (installation, query, page) =>
        Effect.sync(() => {
          repoCalls.push([installation, query, page])
          return { repos: [], hasMore: false }
        }),
      listInstallationBranches: (...args) =>
        Effect.sync(() => {
          branchCalls.push(args)
          return { items: [], nextCursor: "next", totalCount: 3 }
        })
    })
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM organization WHERE id=$1", [organizationId])
      await pool.query('DELETE FROM "user" WHERE id=$1', [userId])
      await pool.end()
    }
  })

  it.effect("lists repositories from the org's GitHub installation", () =>
    Effect.gen(function* () {
      yield* run((github) => github.repos("web", 2))
      expect(repoCalls).toEqual([[installationId, "web", 2]])
    })
  )

  it.effect("has no branches before a repository is connected", () =>
    Effect.gen(function* () {
      const branches = yield* run((github) =>
        github.branches(undefined, 20, undefined)
      )
      expect(branches).toEqual({ items: [], nextCursor: null, totalCount: 0 })
      expect(branchCalls).toEqual([])
      expect(yield* run((github) => github.integration())).toBeNull()
    })
  )

  it.effect("connects a repository and writes it into the project file", () =>
    Effect.gen(function* () {
      writtenConnections.length = 0
      const detail = yield* run((github) => github.connect(repo("app")))
      const connection = {
        repoId: "app-repo",
        repoOwner: "acme",
        repoName: "app",
        defaultBaseBranch: "main"
      }
      expect(detail.github).toEqual(connection)
      expect(writtenConnections).toEqual([connection])
      expect(yield* run((github) => github.integration())).toMatchObject({
        organizationId,
        projectId,
        projectSlug: slug,
        installationId,
        ...connection
      })
    })
  )

  it.effect("lists branches of the connected repository", () =>
    Effect.gen(function* () {
      const branches = yield* run((github) =>
        github.branches("feat", 20, "cursor")
      )
      expect(branches).toEqual({ items: [], nextCursor: "next", totalCount: 3 })
      expect(branchCalls).toEqual([
        [installationId, "acme", "app", "feat", 20, "cursor"]
      ])
    })
  )

  it.effect("refuses a repository whose id no longer matches", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        run((github) =>
          github.connect({ ...repo("other"), repoId: "stale-repo" })
        )
      )
      expect(error._tag).toBe("RepoGone")
      expect((yield* run((github) => github.integration()))?.repoName).toBe(
        "app"
      )
    })
  )

  it.effect("changes the base branch of the connected repository", () =>
    Effect.gen(function* () {
      const detail = yield* run((github) =>
        github.connect({ ...repo("app"), defaultBaseBranch: "develop" })
      )
      expect(detail.github?.defaultBaseBranch).toBe("develop")
    })
  )

  it.effect("disconnects and clears the project file's repository", () =>
    Effect.gen(function* () {
      writtenConnections.length = 0
      const detail = yield* run((github) => github.disconnect())
      expect(detail.github).toBeNull()
      expect(writtenConnections).toEqual([null])
      expect(yield* run((github) => github.integration())).toBeNull()
    })
  )

  it.effect("needs the org's GitHub installation to list or connect", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        pool.query(
          "UPDATE organization_integration SET status='disconnected' WHERE id=$1",
          [integrationId]
        )
      )
      const repos = yield* Effect.flip(
        run((github) => github.repos(undefined, 1))
      )
      const connect = yield* Effect.flip(
        run((github) => github.connect(repo("app")))
      )
      expect(repos._tag).toBe("NotFound")
      expect(connect._tag).toBe("NotFound")
    })
  )
})
