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

import * as Access from "../access/Access"
import { testUser } from "../access/testing"
import { asUser } from "../activity/testing"
import * as ProjectDocs from "../projects/ProjectDocs"
import { projectsOnPostgres } from "../projects/projectsOnPostgres"
import { makeFakeTicketDocs, makeTicketDocument } from "../tickets/testing"
import * as ProjectGithub from "./ProjectGithub"

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
  const restrictedIntegrationId = randomUUID()
  const restrictedInstallationId = `installation-${restrictedIntegrationId}`
  const ticketDocs = makeFakeTicketDocs([])
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
        Effect.flatMap(Access.Access, (access) =>
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

    const projectDocs = Layer.succeed(ProjectDocs.ProjectDocs, {
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
          githubRepos: [],
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
    layer = projectsOnPostgres(
      databaseUrl,
      [userId],
      ticketDocs.service,
      projectDocs,
      {
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
      }
    )
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
      yield* run((github) => github.repos(undefined, "web", 2))
      expect(repoCalls).toEqual([[installationId, "web", 2]])
    })
  )

  it.effect("has no branches before a repository is connected", () =>
    Effect.gen(function* () {
      const branches = yield* run((github) =>
        github.branches(undefined, undefined, 20, undefined)
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
        github.branches(undefined, "feat", 20, "cursor")
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

  it.effect("adds a second repository and keeps the first as the default", () =>
    Effect.gen(function* () {
      ticketDocs.documents.set(
        "GH-1",
        makeTicketDocument("GH-1", { branch: "feat/GH-1" })
      )
      ticketDocs.documents.set("GH-2", makeTicketDocument("GH-2"))

      const detail = yield* run((github) => github.connect(repo("api")))

      expect(detail.github?.repoId).toBe("app-repo")
      expect(detail.githubRepos.map((connected) => connected.repoId)).toEqual([
        "app-repo",
        "api-repo"
      ])
      expect(
        (yield* run((github) => github.integrations())).map((integration) => [
          integration.repoId,
          integration.isDefault
        ])
      ).toEqual([
        ["app-repo", true],
        ["api-repo", false]
      ])
      expect(ticketDocs.documents.get("GH-1")?.repo).toBe("app-repo")
      expect(ticketDocs.documents.get("GH-2")?.repo).toBeUndefined()
      const indexed = yield* Effect.promise(() =>
        pool.query(
          "SELECT ticket_id, repo_id FROM ticket_index WHERE project_id=$1",
          [projectId]
        )
      )
      expect(indexed.rows).toEqual([{ ticket_id: "GH-1", repo_id: "app-repo" }])
    })
  )

  it.effect("lists branches of the repository that was asked for", () =>
    Effect.gen(function* () {
      branchCalls.length = 0
      yield* run((github) => github.branches("api-repo", "feat", 20, undefined))
      expect(branchCalls).toEqual([
        [installationId, "acme", "api", "feat", 20, undefined]
      ])
    })
  )

  it.effect(
    "preserves a legacy ticket's broken repository before connecting another",
    () =>
      Effect.gen(function* () {
        ticketDocs.documents.set(
          "GH-9",
          makeTicketDocument("GH-9", { branch: "feat/GH-9" })
        )
        yield* Effect.promise(async () => {
          await pool.query(
            "UPDATE project_integration_link SET status='broken' WHERE project_id=$1 AND id IN (SELECT project_integration_link_id FROM project_github_repository WHERE repo_id='app-repo')",
            [projectId]
          )
          await pool.query(
            "UPDATE project_github_repository SET status='broken' WHERE organization_id=$1 AND repo_id='app-repo'",
            [organizationId]
          )
        })
        yield* run((github) => github.connect(repo("temporary")))
        expect(ticketDocs.documents.get("GH-9")?.repo).toBe("app-repo")
      }).pipe(
        Effect.ensuring(
          Effect.promise(async () => {
            await pool.query(
              "UPDATE project_integration_link SET status=CASE WHEN id IN (SELECT project_integration_link_id FROM project_github_repository WHERE repo_id='app-repo') THEN 'active' ELSE 'disconnected' END WHERE project_id=$1 AND id IN (SELECT project_integration_link_id FROM project_github_repository WHERE repo_id IN ('app-repo','temporary-repo'))",
              [projectId]
            )
            await pool.query(
              "UPDATE project_github_repository SET status=CASE WHEN repo_id='app-repo' THEN 'active' ELSE 'disconnected' END WHERE organization_id=$1 AND repo_id IN ('app-repo','temporary-repo')",
              [organizationId]
            )
          })
        )
      )
  )

  it.effect("disconnects one repository and leaves the other connected", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.flip(
        run((github) => github.disconnect("missing-repo"))
      )
      expect(missing._tag).toBe("NotFound")

      const detail = yield* run((github) => github.disconnect("app-repo"))

      expect(detail.githubRepos.map((connected) => connected.repoId)).toEqual([
        "api-repo"
      ])
      expect(yield* run((github) => github.integration())).toMatchObject({
        repoId: "api-repo",
        isDefault: true
      })
    })
  )

  it.effect("disconnects and clears the project file's repository", () =>
    Effect.gen(function* () {
      ticketDocs.documents.set(
        "GH-3",
        makeTicketDocument("GH-3", { branch: "feat/GH-3" })
      )
      writtenConnections.length = 0
      const detail = yield* run((github) => github.disconnect("api-repo"))
      expect(detail.github).toBeNull()
      expect(writtenConnections).toEqual([null])
      expect(yield* run((github) => github.integration())).toBeNull()
      yield* run((github) => github.connect(repo("replacement")))
      expect(ticketDocs.documents.get("GH-3")?.repo).toBe("api-repo")
      const indexed = yield* Effect.promise(() =>
        pool.query(
          "SELECT repo_id FROM ticket_index WHERE project_id=$1 AND ticket_id='GH-3'",
          [projectId]
        )
      )
      expect(indexed.rows).toEqual([{ repo_id: "api-repo" }])
      yield* run((github) => github.disconnect("replacement-repo"))
    })
  )

  it.effect(
    "offers an installation limited to selected projects only to those projects",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          await pool.query(
            "INSERT INTO organization_integration (id,organization_id,provider,status,connected_at) VALUES ($1,$2,'github','active',now() + interval '1 minute')",
            [restrictedIntegrationId, organizationId]
          )
          await pool.query(
            "INSERT INTO organization_github_integration (organization_integration_id,installation_id,github_account_id,github_account_login,github_account_type,project_access) VALUES ($1,$2,'other-account','other','User','selected')",
            [restrictedIntegrationId, restrictedInstallationId]
          )
        })

        expect(yield* run((github) => github.installations())).toEqual([
          {
            id: integrationId,
            accountLogin: "acme",
            accountType: "Organization"
          }
        ])
        const refused = yield* Effect.flip(
          run((github) =>
            github.connect({
              ...repo("private"),
              installationId: restrictedIntegrationId
            })
          )
        )
        expect(refused).toMatchObject({
          _tag: "Conflict",
          reason: "github_installation_not_available"
        })
        const hidden = yield* Effect.flip(
          run((github) => github.repos(restrictedIntegrationId, undefined, 1))
        )
        expect(hidden._tag).toBe("NotFound")

        yield* Effect.promise(() =>
          pool.query(
            "INSERT INTO organization_github_integration_project (organization_integration_id,project_id) VALUES ($1,$2)",
            [restrictedIntegrationId, projectId]
          )
        )

        expect(yield* run((github) => github.installations())).toEqual([
          {
            id: integrationId,
            accountLogin: "acme",
            accountType: "Organization"
          },
          {
            id: restrictedIntegrationId,
            accountLogin: "other",
            accountType: "User"
          }
        ])
        const ambiguous = yield* Effect.flip(
          run((github) => github.connect(repo("private")))
        )
        expect(ambiguous).toMatchObject({
          _tag: "Conflict",
          reason: "github_installation_not_available"
        })
        yield* run((github) =>
          github.connect({
            ...repo("private"),
            installationId: restrictedIntegrationId
          })
        )
        expect(yield* run((github) => github.integration())).toMatchObject({
          repoId: "private-repo",
          installationId: restrictedInstallationId
        })
      })
  )

  it.effect("needs the org's GitHub installation to list or connect", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        pool.query(
          "UPDATE organization_integration SET status='disconnected' WHERE organization_id=$1",
          [organizationId]
        )
      )
      const repos = yield* Effect.flip(
        run((github) => github.repos(undefined, undefined, 1))
      )
      const connect = yield* Effect.flip(
        run((github) => github.connect(repo("app")))
      )
      expect(repos._tag).toBe("NotFound")
      expect(connect._tag).toBe("NotFound")
    })
  )
})
