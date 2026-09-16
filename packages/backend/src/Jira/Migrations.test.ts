import { randomUUID } from "node:crypto"
import { PgClient } from "@effect/sql-pg"
import { JiraMigrationRequirements } from "@projectproject/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { DbLive } from "../Layers/Db"
import { StorageNotConnected } from "@projectproject/shared"
import { OrgStorage } from "../Services/OrgStorage"
import { ProjectDocs } from "../Services/ProjectDocs"
import { S3Storage } from "../Services/S3Storage"
import {
  isCompleteJiraConfiguration,
  JiraMigrations,
  JiraMigrationsLive
} from "./Migrations"

const unreachableStorage = Layer.mergeAll(
  Layer.succeed(OrgStorage)({
    getStatus: () => Effect.die("unused"),
    connect: () => Effect.die("unused"),
    disconnect: () => Effect.die("unused"),
    requireConnection: () => Effect.fail(new StorageNotConnected())
  }),
  Layer.succeed(S3Storage)({
    putObject: () => Effect.die("unused"),
    getObject: () => Effect.die("unused"),
    presignPut: () => Effect.die("unused"),
    presignGet: () => Effect.die("unused"),
    headObject: () => Effect.die("unused"),
    deleteObject: () => Effect.die("unused"),
    checkConnection: () => Effect.die("unused")
  }),
  Layer.succeed(ProjectDocs)({
    read: () => Effect.die("unused"),
    write: () => Effect.die("unused"),
    removeDir: () => Effect.die("unused"),
    readRaw: () => Effect.die("unused")
  })
)

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("JiraMigrations Postgres", () => {
  let pool: Pool
  let layer: Layer.Layer<JiraMigrations>
  const userIds: Array<string> = []
  const organizationIds: Array<string> = []

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error("Jira tests require an isolated local test database")
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: `${import.meta.dirname}/../db/migrations`
    })
    const database = DbLive.pipe(
      Layer.provideMerge(
        PgClient.layer({ url: Redacted.make(databaseUrl as string) })
      )
    )
    layer = JiraMigrationsLive.pipe(
      Layer.provide(Layer.mergeAll(database, unreachableStorage)),
      Layer.orDie
    )
  })

  afterAll(async () => {
    for (const organizationId of organizationIds) {
      await pool.query('delete from "organization" where id = $1', [
        organizationId
      ])
    }
    for (const userId of userIds) {
      await pool.query('delete from "user" where id = $1', [userId])
    }
    await pool.end()
  })

  const createOwner = async () => {
    const userId = randomUUID()
    const organizationId = randomUUID()
    userIds.push(userId)
    organizationIds.push(organizationId)
    await pool.query(
      'insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, false, now(), now())',
      [userId, "Jira migration test", `${userId}@example.test`]
    )
    await pool.query(
      'insert into "organization" (id, name, slug, created_at) values ($1, $2, $3, now())',
      [organizationId, "Jira org", `jira-${organizationId}`]
    )
    return { userId, organizationId }
  }

  const source = {
    cloudId: "cloud-1",
    siteName: "Example",
    siteUrl: "https://example.atlassian.net",
    projectId: "10000",
    projectKey: "APP",
    projectName: "Application"
  }

  it("creates idempotently and rejects request id reuse for another source", async () => {
    const owner = await createOwner()
    const requestId = randomUUID()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const migrations = yield* JiraMigrations
        const first = yield* migrations.create(
          owner.organizationId,
          owner.userId,
          requestId,
          source
        )
        const replay = yield* migrations.create(
          owner.organizationId,
          owner.userId,
          requestId,
          source
        )
        const conflict = yield* Effect.result(
          migrations.create(owner.organizationId, owner.userId, requestId, {
            ...source,
            projectId: "20000"
          })
        )
        return { first, replay, conflict }
      }).pipe(Effect.provide(layer))
    )

    expect(result.replay.id).toBe(result.first.id)
    expect(result.first.status).toBe("scanning")
    expect(result.conflict).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "Conflict",
        reason: "jira_migration_request_conflict"
      }
    })
  })

  it("coalesces concurrent creation retries to one job", async () => {
    const owner = await createOwner()
    const requestId = randomUUID()
    const jobs = await Effect.runPromise(
      Effect.gen(function* () {
        const migrations = yield* JiraMigrations
        return yield* Effect.all(
          Array.from({ length: 6 }, () =>
            migrations.create(
              owner.organizationId,
              owner.userId,
              requestId,
              source
            )
          ),
          { concurrency: "unbounded" }
        )
      }).pipe(Effect.provide(layer))
    )

    expect(new Set(jobs.map(({ id }) => id))).toHaveLength(1)
  })

  it("uses expected revisions for lifecycle mutations", async () => {
    const owner = await createOwner()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const migrations = yield* JiraMigrations
        const created = yield* migrations.create(
          owner.organizationId,
          owner.userId,
          randomUUID(),
          source
        )
        const cancelling = yield* migrations.cancel(
          owner.organizationId,
          owner.userId,
          created.id,
          created.revision
        )
        const stale = yield* Effect.result(
          migrations.cancel(
            owner.organizationId,
            owner.userId,
            created.id,
            created.revision
          )
        )
        return { cancelling, stale }
      }).pipe(Effect.provide(layer))
    )

    expect(result.cancelling).toMatchObject({
      status: "cancelling",
      revision: 1
    })
    expect(result.stale).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "Conflict",
        reason: "jira_migration_revision_conflict"
      }
    })
  })

  it("decodes a persisted successful scan checkpoint when getting details", async () => {
    const owner = await createOwner()
    const created = await Effect.runPromise(
      Effect.gen(function* () {
        const migrations = yield* JiraMigrations
        return yield* migrations.create(
          owner.organizationId,
          owner.userId,
          randomUUID(),
          source
        )
      }).pipe(Effect.provide(layer))
    )
    const legacyConfiguration = {
      destination: { name: "Application", slug: "application", key: "APP" },
      identities: [],
      statuses: [{ jiraStatusId: "status-1", projectStatusSlug: "done" }],
      issueTypes: [],
      priorities: [],
      tags: [],
      activeFutureSprintChoices: [],
      restrictedContent: { policy: "exclude" },
      skippedAttachmentIds: [],
      attachmentSkipsAccepted: false
    }
    await pool.query(
      "update jira_migration set status = $1, phase = $2, checkpoint = $3::jsonb, configuration = $4::jsonb where id = $5",
      [
        "needs_configuration",
        "configuration",
        JSON.stringify({
          scan: {
            summary: {
              siteName: source.siteName,
              siteUrl: source.siteUrl,
              projectName: source.projectName,
              projectKey: source.projectKey,
              scannedAt: "2026-09-15T12:00:00.000Z",
              counts: {
                identities: 0,
                statuses: 0,
                issueTypes: 0,
                priorities: 0,
                tags: 0,
                issues: 0,
                comments: 0,
                attachments: 0,
                groups: 0,
                restrictions: 0
              },
              visibilityWarnings: []
            },
            requirements: {
              destination: {
                suggestedName: source.projectName,
                suggestedSlug: "application",
                suggestedKey: source.projectKey
              },
              identities: [],
              identityOptions: [],
              statuses: [
                {
                  jiraStatusId: "status-1",
                  name: "Done",
                  categoryKey: "done",
                  suggestedProjectStatusSlug: "done"
                }
              ],
              statusOptions: [
                { slug: "done", label: "Done", isTerminal: true }
              ],
              issueTypes: [],
              priorities: [],
              tags: [],
              activeFutureSprintChoices: [],
              restrictedContent: {
                issueCount: 0,
                commentCount: 0,
                worklogCount: 0
              },
              attachments: []
            }
          }
        }),
        JSON.stringify(legacyConfiguration),
        created.id
      ]
    )

    const detail = await Effect.runPromise(
      Effect.gen(function* () {
        const migrations = yield* JiraMigrations
        return yield* migrations.get(
          owner.organizationId,
          owner.userId,
          created.id
        )
      }).pipe(Effect.provide(layer))
    )

    expect(detail.status).toBe("needs_configuration")
    expect(detail.requirements?.destination.suggestedSlug).toBe("application")
    expect(detail.requirements?.statuses[0]?.createOption).toMatchObject({
      slug: "done_eb9ac9db",
      icon: "CircleCheck",
      color: "#22c55e",
      isTerminal: false
    })
    expect(detail.requirements?.statusOptions[0]).toEqual({
      slug: "done",
      label: "Done",
      icon: "CircleCheck",
      color: "#22c55e",
      isTerminal: true
    })
    expect(detail.configuration?.statuses[0]).toEqual({
      jiraStatusId: "status-1",
      projectStatusSlug: "done"
    })
    expect(detail.scanSummary).not.toBeNull()
    expect(DateTime.isUtc(detail.scanSummary!.scannedAt)).toBe(true)
  })

  it("validates legacy status mappings separately from exact create candidates", () => {
    const requirements = Schema.decodeUnknownSync(JiraMigrationRequirements)({
      destination: {
        suggestedName: "Application",
        suggestedSlug: "application" as never,
        suggestedKey: "APP" as never
      },
      identities: [],
      identityOptions: [],
      statuses: [
        {
          jiraStatusId: "status-1",
          name: "Ready for review",
          categoryKey: "indeterminate",
          suggestedProjectStatusSlug: "in_progress" as never,
          createOption: {
            slug: "ready_for_review" as never,
            label: "Ready for review",
            icon: "CircleDot" as const,
            color: "#3b82f6" as never,
            isTerminal: false as const
          }
        }
      ],
      statusOptions: [
        {
          slug: "in_progress" as never,
          label: "In progress",
          icon: "CircleDot" as const,
          color: "#3b82f6" as never,
          isTerminal: false
        }
      ],
      issueTypes: [],
      priorities: [],
      tags: [],
      activeFutureSprintChoices: [],
      restrictedContent: { issueCount: 0, commentCount: 0, worklogCount: 0 },
      attachments: []
    })
    const base = {
      destination: {
        name: "Application",
        slug: "application" as never,
        key: "APP" as never
      },
      identities: [],
      issueTypes: [],
      priorities: [],
      tags: [],
      activeFutureSprintChoices: [],
      restrictedContent: { policy: "exclude" as const },
      skippedAttachmentIds: [],
      attachmentSkipsAccepted: false
    }

    expect(
      isCompleteJiraConfiguration(
        {
          ...base,
          statuses: [
            {
              jiraStatusId: "status-1",
              projectStatusSlug: "in_progress" as never
            }
          ]
        },
        requirements
      )
    ).toBe(true)
    expect(
      isCompleteJiraConfiguration(
        {
          ...base,
          statuses: [
            {
              jiraStatusId: "status-1",
              projectStatusSlug: "ready_for_review" as never,
              createStatus: true
            }
          ]
        },
        requirements
      )
    ).toBe(true)
    expect(
      isCompleteJiraConfiguration(
        {
          ...base,
          statuses: [
            {
              jiraStatusId: "status-1",
              projectStatusSlug: "tampered" as never,
              createStatus: true
            }
          ]
        },
        requirements
      )
    ).toBe(false)
  })
})
