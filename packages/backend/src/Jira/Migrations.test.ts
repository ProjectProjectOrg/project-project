import { randomUUID } from "node:crypto"
import { PgClient } from "@effect/sql-pg"
import { JiraMigrationRequirements } from "@projectproject/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Deferred, Fiber, Option } from "effect"
import { WorkflowEngine } from "effect/unstable/workflow"
import { JiraMigrationProjection, fenceFor } from "./MigrationProjection"
import {
  JiraMigrationWorkflow,
  makeJiraMigrationWorkflow,
  makeProjectionMigrationActivities
} from "./MigrationWorkflow"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { DbLive } from "../Layers/Db"
import {
  isCompleteJiraConfiguration,
  JiraMigrations,
  JiraMigrationsWorkflowLive
} from "./Migrations"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const readyPublication = {
  projectId: "project-1",
  planRef: {
    key: "migrations/jira/test/publication/plan.json",
    contentType: "application/json",
    byteSize: 1,
    sha256: "a".repeat(64)
  },
  verified: {
    planSha256: "a".repeat(64),
    documentCount: 0,
    attachmentCount: 0,
    unresolvedReferenceCount: 0 as const
  }
}

describe.skipIf(!databaseUrl)("JiraMigrations Postgres", () => {
  let pool: Pool
  let projectionLayer: Layer.Layer<JiraMigrationProjection>
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
    projectionLayer = JiraMigrationProjection.layer.pipe(
      Layer.provide(database),
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

  it("uses only the engine-accepted source when concurrent handlers arrive before start", async () => {
    const owner = await createOwner()
    const requestId = randomUUID()
    await Effect.runPromise(
      Effect.gen(function* () {
        const projection = yield* JiraMigrationProjection
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const activities = makeProjectionMigrationActivities(
          projection,
          () => Effect.void,
          () => Effect.void,
          () => Effect.succeed(readyPublication),
          () => Effect.void
        )
        const workflow = makeJiraMigrationWorkflow({
          ...activities,
          start: (input) =>
            Effect.gen(function* () {
              yield* Deferred.succeed(entered, undefined)
              yield* Deferred.await(release)
              yield* activities.start(input)
            })
        })
        const service = JiraMigrationsWorkflowLive({
          run: () => Effect.die("Task 7 command not exercised"),
          cancel: () => Effect.die("Task 7 command not exercised"),
          discard: () => Effect.die("Task 7 command not exercised")
        }).pipe(
          Layer.provideMerge(workflow),
          Layer.provide(WorkflowEngine.layerMemory)
        )
        yield* Effect.gen(function* () {
          const migrations = yield* JiraMigrations
          const first = yield* migrations
            .create(owner.organizationId, owner.userId, requestId, source)
            .pipe(Effect.forkChild)
          yield* Deferred.await(entered)
          const otherSource = {
            ...source,
            projectName: "Different project name"
          }
          const conflicting = yield* migrations
            .create(owner.organizationId, owner.userId, requestId, otherSource)
            .pipe(Effect.result, Effect.forkChild)
          yield* Effect.sleep("50 millis")
          expect(yield* projection.listOwned(owner)).toHaveLength(0)
          yield* Deferred.succeed(release, undefined)
          const created = yield* Fiber.join(first)
          const conflict = yield* Fiber.join(conflicting)
          expect(created.sourceProjectName).toBe("Application")
          expect(created.id).toBe(
            yield* JiraMigrationWorkflow.executionId({
              command: { _tag: "Create", ...owner, requestId, source }
            })
          )
          expect(conflict).toMatchObject({
            _tag: "Failure",
            failure: {
              _tag: "Conflict",
              reason: "jira_migration_request_conflict"
            }
          })
          const repeated = yield* Effect.all(
            Array.from({ length: 4 }, () =>
              migrations.create(
                owner.organizationId,
                owner.userId,
                requestId,
                source
              )
            ),
            { concurrency: "unbounded" }
          )
          expect(repeated.map((row) => row.id)).toEqual(
            Array(4).fill(created.id)
          )
          expect(yield* projection.listOwned(owner)).toHaveLength(1)
        }).pipe(Effect.provide(service))
      }).pipe(Effect.provide(projectionLayer), Effect.scoped)
    )
  })

  it("installs rescan before the delayed start and rejects a real old-workflow finalizer", async () => {
    const owner = await createOwner()
    await Effect.runPromise(
      Effect.gen(function* () {
        const projection = yield* JiraMigrationProjection
        const release = yield* Deferred.make<void>()
        const finalized = yield* Deferred.make<boolean>()
        const activities = makeProjectionMigrationActivities(
          projection,
          () => Effect.void,
          () => Effect.void,
          () => Effect.succeed(readyPublication),
          () => Effect.void
        )
        const workflow = makeJiraMigrationWorkflow({
          ...activities,
          start: (input) =>
            Effect.gen(function* () {
              if (input.payload.command._tag === "Rescan")
                yield* Deferred.await(release)
              yield* activities.start(input)
            }),
          finalize: ({ executionId }) =>
            projection
              .recordFailure(
                {
                  migrationId: executionId,
                  workflowExecutionId: executionId,
                  workflowAttempt: 1
                },
                { reason: "old-finalizer", retryable: false }
              )
              .pipe(
                Effect.orDie,
                Effect.flatMap((changed) =>
                  Deferred.succeed(finalized, changed)
                ),
                Effect.asVoid
              )
        })
        const service = JiraMigrationsWorkflowLive({
          run: () => Effect.die("unused"),
          cancel: () => Effect.die("unused"),
          discard: () => Effect.die("unused")
        }).pipe(
          Layer.provideMerge(workflow),
          Layer.provideMerge(WorkflowEngine.layerMemory)
        )
        yield* Effect.gen(function* () {
          const migrations = yield* JiraMigrations
          const created = yield* migrations.create(
            owner.organizationId,
            owner.userId,
            randomUUID(),
            source
          )
          while (true) {
            const result = yield* JiraMigrationWorkflow.poll(created.id)
            if (Option.isSome(result) && result.value._tag === "Suspended")
              break
            yield* Effect.yieldNow
          }
          const original = yield* projection.owned(owner, created.id)
          yield* projection.advance(fenceFor(original)!, {
            status: "needs_configuration",
            phase: "configuration"
          })
          const scanned = yield* projection.owned(owner, created.id)
          const rescanned = yield* migrations.rescan(
            owner.organizationId,
            owner.userId,
            created.id,
            scanned.revision
          )
          expect(rescanned.id).toBe(created.id)
          expect(rescanned.status).toBe("scanning")
          expect(yield* Deferred.await(finalized)).toBe(false)
          const current = yield* projection.owned(owner, created.id)
          expect(current).toMatchObject({
            workflowAttempt: 2,
            scanRevision: 2,
            failureReason: null
          })
          expect(current.workflowExecutionId).not.toBe(created.id)
          yield* Deferred.succeed(release, undefined)
          while (true) {
            const result = yield* JiraMigrationWorkflow.poll(
              current.workflowExecutionId!
            )
            if (Option.isSome(result) && result.value._tag === "Suspended")
              break
            yield* Effect.yieldNow
          }
          expect((yield* projection.owned(owner, created.id)).revision).toBe(
            current.revision
          )
        }).pipe(Effect.provide(service))
      }).pipe(Effect.provide(projectionLayer), Effect.scoped)
    )
  })

  it("replays rescan start after installation and interrupts the persisted predecessor", async () => {
    const owner = await createOwner()
    await Effect.runPromise(
      Effect.gen(function* () {
        const projection = yield* JiraMigrationProjection
        const activities = makeProjectionMigrationActivities(
          projection,
          () => Effect.void,
          () => Effect.void,
          () => Effect.succeed(readyPublication),
          () => Effect.void
        )
        const workflow = makeJiraMigrationWorkflow({
          ...activities,
          start: (input) =>
            Effect.gen(function* () {
              if (input.payload.command._tag === "Rescan") {
                yield* projection
                  .beginRescan({
                    ...input.payload.command,
                    executionId: input.executionId
                  })
                  .pipe(Effect.orDie)
              }
              yield* activities.start(input)
            })
        }).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))
        yield* Effect.gen(function* () {
          const originalExecutionId = yield* JiraMigrationWorkflow.execute(
            {
              command: {
                _tag: "Create",
                ...owner,
                requestId: randomUUID(),
                source
              }
            },
            { discard: true }
          )
          while (true) {
            const result =
              yield* JiraMigrationWorkflow.poll(originalExecutionId)
            if (Option.isSome(result) && result.value._tag === "Suspended")
              break
            yield* Effect.yieldNow
          }
          const original = yield* projection.owned(owner, originalExecutionId)
          yield* projection.advance(fenceFor(original)!, {
            status: "needs_configuration",
            phase: "configuration"
          })
          const scanned = yield* projection.owned(owner, originalExecutionId)
          const command = {
            _tag: "Rescan" as const,
            migrationId: originalExecutionId,
            supersededExecutionId: originalExecutionId,
            expectedRevision: scanned.revision,
            workflowAttempt: 2,
            scanRevision: 2
          }
          const nextExecutionId = yield* JiraMigrationWorkflow.execute(
            { command },
            { discard: true }
          )
          while (true) {
            const result = yield* JiraMigrationWorkflow.poll(nextExecutionId)
            if (Option.isSome(result) && result.value._tag === "Suspended")
              break
            yield* Effect.yieldNow
          }
          const predecessor = yield* JiraMigrationWorkflow.poll(
            originalExecutionId
          ).pipe(Effect.repeat({ while: Option.isNone }))
          expect(predecessor).toMatchObject({
            _tag: "Some",
            value: { _tag: "Complete", exit: { _tag: "Failure" } }
          })
          expect(
            yield* projection.owned(owner, originalExecutionId)
          ).toMatchObject({
            workflowAttempt: 2,
            workflowExecutionId: nextExecutionId,
            status: "scanning"
          })
        }).pipe(Effect.provide(workflow))
      }).pipe(Effect.provide(projectionLayer), Effect.scoped)
    )
  })

  it("can rescan after an earlier execution lost its projection revision race", async () => {
    const owner = await createOwner()
    await Effect.runPromise(
      Effect.gen(function* () {
        const projection = yield* JiraMigrationProjection
        const release = yield* Deferred.make<void>()
        const entered = yield* Deferred.make<void>()
        const activities = makeProjectionMigrationActivities(
          projection,
          () => Effect.void,
          () => Effect.void,
          () => Effect.succeed(readyPublication),
          () => Effect.void
        )
        const workflow = makeJiraMigrationWorkflow({
          ...activities,
          start: (input) =>
            Effect.gen(function* () {
              if (input.payload.command._tag === "Rescan") {
                yield* Deferred.succeed(entered, undefined)
                yield* Deferred.await(release)
              }
              yield* activities.start(input)
            })
        })
        const service = JiraMigrationsWorkflowLive({
          run: () => Effect.die("unused"),
          cancel: () => Effect.die("unused"),
          discard: () => Effect.die("unused")
        }).pipe(
          Layer.provideMerge(workflow),
          Layer.provideMerge(WorkflowEngine.layerMemory)
        )
        yield* Effect.gen(function* () {
          const migrations = yield* JiraMigrations
          const created = yield* migrations.create(
            owner.organizationId,
            owner.userId,
            randomUUID(),
            source
          )
          const original = yield* projection.owned(owner, created.id)
          yield* projection.advance(fenceFor(original)!, {
            status: "needs_configuration",
            phase: "configuration"
          })
          const scanned = yield* projection.owned(owner, created.id)
          const abandonedExecutionId = yield* JiraMigrationWorkflow.execute(
            {
              command: {
                _tag: "Rescan",
                migrationId: created.id,
                supersededExecutionId: original.workflowExecutionId!,
                expectedRevision: scanned.revision,
                workflowAttempt: 2,
                scanRevision: 2
              }
            },
            { discard: true }
          )
          yield* Deferred.await(entered)
          yield* projection.advance(fenceFor(original)!, { progressDone: 1 })
          yield* Deferred.succeed(release, undefined)
          while (true) {
            const result =
              yield* JiraMigrationWorkflow.poll(abandonedExecutionId)
            if (Option.isSome(result) && result.value._tag === "Complete") break
            yield* Effect.yieldNow
          }
          const latest = yield* projection.owned(owner, created.id)
          yield* migrations.rescan(
            owner.organizationId,
            owner.userId,
            created.id,
            latest.revision
          )
          const accepted = yield* projection.owned(owner, created.id)
          const execution = yield* JiraMigrationWorkflow.poll(
            accepted.workflowExecutionId!
          ).pipe(Effect.repeat({ while: Option.isNone }))
          expect(execution).toMatchObject({
            _tag: "Some",
            value: { _tag: "Suspended" }
          })
        }).pipe(Effect.provide(service))
      }).pipe(Effect.provide(projectionLayer), Effect.scoped)
    )
  })

  it("returns timeout without cancelling a delayed durable start", async () => {
    const owner = await createOwner()
    await Effect.runPromise(
      Effect.gen(function* () {
        const projection = yield* JiraMigrationProjection
        const release = yield* Deferred.make<void>()
        const started = yield* Deferred.make<void>()
        const activities = makeProjectionMigrationActivities(
          projection,
          () => Effect.void,
          () => Effect.void,
          () => Effect.succeed(readyPublication),
          () => Effect.void
        )
        const workflow = makeJiraMigrationWorkflow({
          ...activities,
          start: (input) =>
            Effect.gen(function* () {
              yield* Deferred.await(release)
              yield* activities.start(input)
              yield* Deferred.succeed(started, undefined)
            })
        })
        const service = JiraMigrationsWorkflowLive({
          run: () => Effect.die("Task 7 command not exercised"),
          cancel: () => Effect.die("Task 7 command not exercised"),
          discard: () => Effect.die("Task 7 command not exercised")
        }).pipe(
          Layer.provideMerge(workflow),
          Layer.provide(WorkflowEngine.layerMemory)
        )
        yield* Effect.gen(function* () {
          const migrations = yield* JiraMigrations
          const requestId = randomUUID()
          expect(
            yield* Effect.result(
              migrations.create(
                owner.organizationId,
                owner.userId,
                requestId,
                source
              )
            )
          ).toMatchObject({
            _tag: "Failure",
            failure: { _tag: "JiraError", reason: "timeout" }
          })
          expect(yield* projection.listOwned(owner)).toHaveLength(0)
          yield* Deferred.succeed(release, undefined)
          yield* Deferred.await(started)
          const created = yield* migrations.create(
            owner.organizationId,
            owner.userId,
            requestId,
            source
          )
          expect(created.sourceProjectId).toBe("10000")
        }).pipe(Effect.provide(service))
      }).pipe(Effect.provide(projectionLayer), Effect.scoped)
    )
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
              projectStatusSlug: "in_progress" as never
            }
          ],
          restrictedContent: null
        },
        requirements
      )
    ).toBe(false)
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
