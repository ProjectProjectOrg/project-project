import { createHash, randomUUID } from "node:crypto"
import * as BunServices from "@effect/platform-bun/BunServices"
import { PgClient } from "@effect/sql-pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import {
  ConfigProvider,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Redacted,
  Schema,
  Stream
} from "effect"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import {
  JiraMigrationManifestV2,
  canonicalJiraJson,
  type JiraConvertedText,
  type JiraMigrationManifest
} from "./Manifest"
import {
  aliasJiraMediaReferences,
  buildJiraImportPlan,
  copyJiraPreparedAttachment,
  ensureHiddenJiraProject,
  groupColors,
  loadJiraPublicationPlan,
  loadJiraPreparedPublication,
  makeJiraMaterializationDependencies,
  nextTicketNumberFor,
  prepareJiraPublicationFromSnapshot,
  publishJiraMigrationAtomically,
  verifyJiraHiddenMaterialization,
  writeJiraHiddenDocuments
} from "./Import"
import type { JiraPreflightEnvironment } from "./Preflight"
import {
  JiraMigrationConfiguration,
  TAG_DEFAULT_PALETTE
} from "@projectproject/shared"
import type { JiraPublicationPlan } from "./PublicationPlan"
import {
  JiraPublicationPlanV1,
  jiraAttachmentId,
  prepareJiraPublication
} from "./PublicationPlan"
import { DbLive } from "../Layers/Db"
import { MarkdownLive } from "../Layers/Markdown"
import { attachmentObjectKey, type S3Connection } from "../Services/S3Storage"
import { attachmentUrl, TicketId } from "@projectproject/shared"
import { JiraMigrationProjection } from "./MigrationProjection"
import {
  finalizeJiraMigrationAttempt,
  JiraMigrationWorkflowFailure
} from "./MigrationWorkflow"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("hidden Jira destination", () => {
  let pool: Pool
  const owners: Array<Readonly<{ organizationId: string; userId: string }>> = []

  beforeAll(async () => {
    const url = new URL(databaseUrl!)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    )
      throw new Error("Isolated database required")
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: `${import.meta.dirname}/../db/migrations`
    })
  })

  afterAll(async () => {
    for (const owner of owners) {
      await pool.query('delete from "organization" where id = $1', [
        owner.organizationId
      ])
      await pool.query('delete from "user" where id = $1', [owner.userId])
    }
    await pool.end()
  })

  it("creates one hidden row for the current attempt and rejects a stale retry", async () => {
    const organizationId = randomUUID()
    const userId = randomUUID()
    const migrationId = randomUUID()
    const projectId = randomUUID()
    const slug = `jira-${randomUUID()}`
    owners.push({ organizationId, userId })
    await pool.query(
      'insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,false,now(),now())',
      [userId, `${userId}@example.test`]
    )
    await pool.query(
      'insert into "organization" (id,name,slug,created_at) values ($1,$1,$1,now())',
      [organizationId]
    )
    await pool.query(
      `insert into jira_migration (id,request_id,organization_id,initiated_by,source_cloud_id,source_site_name,source_site_url,source_project_id,source_project_key,source_project_name,staging_prefix,workflow_execution_id,workflow_attempt,status,phase,checkpoint) values ($1,$2,$3,$4,'cloud','Site','https://example.test','10000','APP','Application',$5,$1,1,'migrating','migrate',$6)`,
      [
        migrationId,
        randomUUID(),
        organizationId,
        userId,
        `migrations/jira/${migrationId}`,
        JSON.stringify({
          remoteWritesMayStillCommit: {
            workflowExecutionId: migrationId,
            workflowAttempt: 1
          }
        })
      ]
    )
    const input = {
      fence: {
        migrationId,
        workflowExecutionId: migrationId,
        workflowAttempt: 1
      },
      project: {
        id: projectId,
        organizationId,
        slug,
        key: "APP",
        name: "Application",
        icon: "📦",
        color: "#123456",
        nextTicketNumber: 2,
        createdBy: userId,
        createdAt: "2026-09-22T10:00:00.000Z"
      }
    }
    const layer = DbLive.pipe(
      Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl!) }))
    )
    await Effect.runPromise(
      ensureHiddenJiraProject(input).pipe(Effect.provide(layer))
    )
    await Effect.runPromise(
      ensureHiddenJiraProject(input).pipe(Effect.provide(layer))
    )
    const rows = await pool.query(
      "select id,published_at from project_index where slug = $1",
      [slug]
    )
    expect(rows.rows).toEqual([{ id: projectId, published_at: null }])
    const content = "---\nname: Application\n---\n# Application\n"
    const archive = '{"version":1}'
    const documents = [
      {
        path: "project.md",
        content,
        sha256: createHash("sha256").update(content).digest("hex")
      }
    ]
    const archiveDocument = {
      path: `imports/jira/${migrationId}/archive.json`,
      content: archive,
      sha256: createHash("sha256").update(archive).digest("hex")
    }
    const reportContent = "Import report"
    const reportDocument = {
      path: `imports/jira/${migrationId}/report.md`,
      content: reportContent,
      sha256: createHash("sha256").update(reportContent).digest("hex")
    }
    const writeDocuments = Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "jira-hidden-"
        })
        const markdownLayer = MarkdownLive.pipe(
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ PROJECTS_DIR: root })
            )
          )
        )
        const write = writeJiraHiddenDocuments({
          fence: input.fence,
          projectId,
          orgSlug: organizationId,
          projectSlug: slug,
          documents: [...documents, archiveDocument, reportDocument]
        }).pipe(Effect.provide(markdownLayer))
        expect(yield* write).toBe(3)
        expect(yield* write).toBe(3)
        const stored = yield* fs.readFileString(
          `${root}/orgs/${organizationId}/projects/${slug}/project.md`
        )
        expect(stored).toBe(content)
        expect(
          yield* fs.readFileString(
            `${root}/orgs/${organizationId}/projects/${slug}/imports/jira/${migrationId}/archive.json`
          )
        ).toBe(archive)
        const verify = verifyJiraHiddenMaterialization(
          {
            getObject: () => Effect.succeed(null),
            headObject: () => Effect.succeed(null)
          },
          {
            fence: input.fence,
            projectId,
            orgSlug: organizationId,
            projectSlug: slug,
            planSha256: "a".repeat(64),
            documents,
            archiveDocument,
            reportDocument,
            attachments: [],
            connection: {
              endpoint: "http://127.0.0.1:59000",
              bucket: "projectproject-t172-local-test",
              region: "us-east-1",
              keyPrefix: null,
              forcePathStyle: true,
              accessKeyId: "test",
              secretAccessKey: "test"
            }
          }
        ).pipe(Effect.provide(markdownLayer))
        expect(yield* verify).toEqual({
          planSha256: "a".repeat(64),
          documentCount: 3,
          attachmentCount: 0,
          unresolvedReferenceCount: 0
        })
        yield* fs.remove(
          `${root}/orgs/${organizationId}/projects/${slug}/project.md`
        )
        expect((yield* Effect.result(verify))._tag).toBe("Failure")
        const unsafe = yield* Effect.result(
          writeJiraHiddenDocuments({
            fence: input.fence,
            projectId,
            orgSlug: organizationId,
            projectSlug: slug,
            documents: [{ ...documents[0]!, path: "../escape.md" }]
          }).pipe(Effect.provide(markdownLayer))
        )
        expect(unsafe._tag).toBe("Failure")
      })
    ).pipe(Effect.provide(Layer.mergeAll(layer, BunServices.layer)))
    await Effect.runPromise(writeDocuments)
    const conflicting = await Effect.runPromise(
      Effect.result(
        ensureHiddenJiraProject({
          ...input,
          project: { ...input.project, name: "Different" }
        })
      ).pipe(Effect.provide(layer))
    )
    expect(conflicting._tag).toBe("Failure")
    await pool.query(
      "update jira_migration set workflow_attempt = 2 where id = $1",
      [migrationId]
    )
    const stale = await Effect.runPromise(
      Effect.result(ensureHiddenJiraProject(input)).pipe(Effect.provide(layer))
    )
    expect(stale._tag).toBe("Failure")
    expect(
      (
        await pool.query(
          "select count(*)::int as count from project_index where slug = $1",
          [slug]
        )
      ).rows[0]?.count
    ).toBe(1)
  })

  it("adopts a completed attachment upload after result loss without downloading again", async () => {
    const organizationId = randomUUID()
    const userId = randomUUID()
    const migrationId = randomUUID()
    const projectId = randomUUID()
    const slug = `jira-${randomUUID()}`
    owners.push({ organizationId, userId })
    await pool.query(
      'insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,false,now(),now())',
      [userId, `${userId}@example.test`]
    )
    await pool.query(
      'insert into "organization" (id,name,slug,created_at) values ($1,$1,$1,now())',
      [organizationId]
    )
    await pool.query(
      `insert into jira_migration (id,request_id,organization_id,initiated_by,source_cloud_id,source_site_name,source_site_url,source_project_id,source_project_key,source_project_name,staging_prefix,workflow_execution_id,workflow_attempt,status,phase,checkpoint) values ($1,$2,$3,$4,'cloud','Site','https://example.test','10000','APP','Application',$5,$1,1,'migrating','migrate',$6)`,
      [
        migrationId,
        randomUUID(),
        organizationId,
        userId,
        `migrations/jira/${migrationId}`,
        JSON.stringify({
          remoteWritesMayStillCommit: {
            workflowExecutionId: migrationId,
            workflowAttempt: 1
          }
        })
      ]
    )
    const fence = {
      migrationId,
      workflowExecutionId: migrationId,
      workflowAttempt: 1
    }
    const dbLayer = DbLive.pipe(
      Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl!) }))
    )
    await Effect.runPromise(
      ensureHiddenJiraProject({
        fence,
        project: {
          id: projectId,
          organizationId,
          slug,
          key: "APP",
          name: "Application",
          icon: "📦",
          color: "#123456",
          nextTicketNumber: 2,
          createdBy: userId,
          createdAt: "2026-09-22T10:00:00.000Z"
        }
      }).pipe(Effect.provide(dbLayer))
    )
    const attachmentId = jiraAttachmentId(
      migrationId,
      "jira-attachment-1",
      "2026-09-22T10:00:00.000Z"
    )
    const connection: S3Connection = {
      endpoint: "http://127.0.0.1:59000",
      bucket: "projectproject-t172-local-test",
      region: "us-east-1",
      keyPrefix: null,
      forcePathStyle: true,
      accessKeyId: "test",
      secretAccessKey: "test"
    }
    const bytes = new TextEncoder().encode("Jira attachment")
    const objectKey = attachmentObjectKey({
      keyPrefix: null,
      orgSlug: organizationId,
      projectSlug: slug,
      ticketId: "APP-1",
      attachmentId,
      filename: "note.txt"
    })
    const stored = new Map<string, Uint8Array>([[objectKey, bytes]])
    let downloads = 0
    const jira = {
      attachmentContent: () => {
        downloads += 1
        return Stream.fromIterable([bytes])
      }
    }
    const s3 = {
      getObject: (_connection: S3Connection, key: string) =>
        Effect.succeed(stored.get(key) ?? null),
      headObject: (_connection: S3Connection, key: string) =>
        Effect.succeed(
          stored.has(key)
            ? {
                byteSize: stored.get(key)!.length,
                contentType: "text/plain",
                contentHash: null
              }
            : null
        ),
      putObject: (
        _connection: S3Connection,
        key: string,
        _contentType: string,
        value: Uint8Array
      ) => Effect.sync(() => void stored.set(key, value))
    }
    const input = {
      fence,
      projectId,
      organizationId,
      orgSlug: organizationId,
      projectSlug: slug,
      uploadedBy: userId,
      cloudId: "cloud",
      connection,
      attachment: {
        sourceAttachmentId: "jira-attachment-1",
        id: attachmentId,
        issueId: "issue-1",
        ticketId: Schema.decodeSync(TicketId)("APP-1"),
        objectKey,
        url: attachmentUrl(organizationId, attachmentId),
        filename: "note.txt",
        contentType: "text/plain",
        byteSize: bytes.length,
        decision: "copy" as const
      }
    }
    const copy = copyJiraPreparedAttachment(jira, s3, input).pipe(
      Effect.provide(dbLayer)
    )
    const first = await Effect.runPromise(copy)
    expect(await Effect.runPromise(copy)).toEqual(first)
    expect(first).toMatchObject({
      kind: "copied",
      attachmentId,
      contentSha256: createHash("sha256").update(bytes).digest("hex")
    })
    expect(downloads).toBe(0)
    stored.delete(objectKey)
    expect(await Effect.runPromise(copy)).toEqual(first)
    expect(downloads).toBe(1)
    expect(stored.get(objectKey)).toEqual(bytes)
    expect(
      (
        await pool.query(
          "select id,status,object_key from attachment_index where id = $1",
          [attachmentId]
        )
      ).rows
    ).toEqual([{ id: attachmentId, status: "pending", object_key: objectKey }])
    const migrationCreatedAt = (
      await pool.query("select created_at from jira_migration where id = $1", [
        migrationId
      ])
    ).rows[0]?.created_at
    const attachmentCreatedAt = (
      await pool.query(
        "select created_at from attachment_index where id = $1",
        [attachmentId]
      )
    ).rows[0]?.created_at
    expect(attachmentCreatedAt).toEqual(migrationCreatedAt)
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          const root = yield* fs.makeTempDirectoryScoped({
            prefix: "jira-verify-"
          })
          const markdownLayer = MarkdownLive.pipe(
            Layer.provide(
              ConfigProvider.layer(
                ConfigProvider.fromUnknown({ PROJECTS_DIR: root })
              )
            )
          )
          const archiveContent = "{}"
          const reportContent = "Report"
          const archiveDocument = {
            path: `imports/jira/${migrationId}/archive.json`,
            content: archiveContent,
            sha256: createHash("sha256").update(archiveContent).digest("hex")
          }
          const reportDocument = {
            path: `imports/jira/${migrationId}/report.md`,
            content: reportContent,
            sha256: createHash("sha256").update(reportContent).digest("hex")
          }
          const verify = verifyJiraHiddenMaterialization(s3, {
            fence,
            projectId,
            orgSlug: organizationId,
            projectSlug: slug,
            planSha256: "b".repeat(64),
            documents: [],
            archiveDocument,
            reportDocument,
            attachments: [first],
            connection
          }).pipe(Effect.provide(markdownLayer))
          expect((yield* Effect.result(verify))._tag).toBe("Failure")
          const reports = `${root}/orgs/${organizationId}/projects/${slug}/imports/jira/${migrationId}`
          yield* fs.makeDirectory(reports, { recursive: true })
          yield* fs.writeFileString(`${reports}/archive.json`, archiveContent)
          yield* fs.writeFileString(`${reports}/report.md`, reportContent)
          expect(yield* verify).toMatchObject({
            attachmentCount: 1,
            unresolvedReferenceCount: 0
          })
          stored.set(objectKey, new TextEncoder().encode("Corrupt blob!!!!"))
          expect((yield* Effect.result(verify))._tag).toBe("Failure")
        })
      ).pipe(Effect.provide(Layer.mergeAll(dbLayer, BunServices.layer)))
    )
  })

  it("materializes a prepared plan through the real hidden project and document callbacks", async () => {
    const organizationId = randomUUID()
    const userId = randomUUID()
    const migrationId = randomUUID()
    const slug = `jira-${randomUUID()}`
    owners.push({ organizationId, userId })
    await pool.query(
      'insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,false,now(),now())',
      [userId, `${userId}@example.test`]
    )
    await pool.query(
      'insert into "organization" (id,name,slug,created_at) values ($1,$1,$1,now())',
      [organizationId]
    )
    await pool.query(
      `insert into jira_migration (id,request_id,organization_id,initiated_by,source_cloud_id,source_site_name,source_site_url,source_project_id,source_project_key,source_project_name,staging_prefix,workflow_execution_id,workflow_attempt,status,phase,checkpoint) values ($1,$2,$3,$4,'cloud','Site','https://example.test','10000','APP','Application',$5,$1,1,'migrating','migrate',$6)`,
      [
        migrationId,
        randomUUID(),
        organizationId,
        userId,
        `migrations/jira/${migrationId}`,
        JSON.stringify({
          remoteWritesMayStillCommit: {
            workflowExecutionId: migrationId,
            workflowAttempt: 1
          }
        })
      ]
    )
    const migrationCreatedAt = (
      await pool.query("select created_at from jira_migration where id = $1", [
        migrationId
      ])
    ).rows[0]!.created_at.toISOString()
    const attachmentBytes = new TextEncoder().encode("Imported Jira file")
    const metadata = {
      ref: {
        key: `migrations/jira/${migrationId}/scan-1/raw/attachments/file.json`,
        sha256: "b".repeat(64),
        byteSize: 1,
        contentType: "application/json"
      },
      value: { id: "jira-file" }
    }
    const sourceManifest = manifestV2(migrationId)
    const migrationManifest = {
      ...sourceManifest,
      attachments: [
        {
          id: "jira-file",
          issueId: "issue-1",
          filename: "file.png",
          mimeType: "image/png",
          byteSize: attachmentBytes.length,
          metadataArtifact: metadata.ref,
          downloadUrl: "https://example.test/file",
          jiraUrl: null,
          downloadAllowed: true
        }
      ]
    }
    const acceptedConfiguration = Schema.decodeUnknownSync(
      JiraMigrationConfiguration
    )({
      ...configuration,
      destination: { name: "Application", slug, key: "APP" },
      identities: configuration.identities.map((identity) =>
        identity.projectProjectUserId === null
          ? identity
          : { ...identity, projectProjectUserId: userId }
      )
    })
    const prepared = await Effect.runPromise(
      prepareJiraPublication({
        manifest: migrationManifest,
        manifestSha256: "a".repeat(64),
        configurationRevision: 1,
        configuration: acceptedConfiguration,
        migrationCreatedAt,
        organizationId,
        orgSlug: organizationId,
        ownerId: userId,
        storageKeyPrefix: "",
        users: [{ userId, username: "owner" }],
        environment: {
          existingProjectSlugs: [],
          existingProjectKeys: [],
          existingTicketIds: [],
          existingUserIds: [userId],
          existingStatusSlugs: ["todo", "in_progress", "done"]
        },
        source: { projectDescription: null, artifacts: [metadata] }
      })
    )
    const connection: S3Connection = {
      endpoint: "http://127.0.0.1:59000",
      bucket: "projectproject-t172-local-test",
      region: "us-east-1",
      keyPrefix: null,
      forcePathStyle: true,
      accessKeyId: "test",
      secretAccessKey: "test"
    }
    const stored = new Map<string, unknown>()
    const manifestRef = {
      key: `migrations/jira/${migrationId}/scan-1/manifest/current.json`,
      contentType: "application/json",
      byteSize: 1,
      sha256: "a".repeat(64)
    }
    stored.set(manifestRef.key, migrationManifest)
    stored.set(metadata.ref.key, metadata.value)
    const storedAttachments = new Map<string, Uint8Array>()
    const callbacks = makeJiraMaterializationDependencies(
      prepared,
      { migrationId, workflowExecutionId: migrationId, workflowAttempt: 1 },
      {
        connection,
        jira: {
          attachmentContent: () => Stream.fromIterable([attachmentBytes])
        },
        s3: {
          getObject: (_connection, key) =>
            Effect.succeed(storedAttachments.get(key) ?? null),
          putObject: (_connection, key, _contentType, bytes) =>
            Effect.sync(() => void storedAttachments.set(key, bytes)),
          headObject: (_connection, key) =>
            Effect.succeed(
              storedAttachments.has(key)
                ? {
                    byteSize: storedAttachments.get(key)!.length,
                    contentType: "image/png",
                    contentHash: null
                  }
                : null
            )
        },
        artifacts: {
          writeJson: (_orgSlug, coordinates, value) =>
            Effect.gen(function* () {
              const key = `migrations/jira/${coordinates.migrationId}/scan-${coordinates.scanRevision}/${coordinates.area}/${coordinates.kind}/${coordinates.identity}.json`
              stored.set(key, value)
              const bytes = new TextEncoder().encode(
                yield* Schema.encodeEffect(
                  Schema.fromJsonString(Schema.Unknown)
                )(value).pipe(Effect.orDie)
              )
              return {
                key,
                contentType: "application/json",
                byteSize: bytes.length,
                sha256: createHash("sha256").update(bytes).digest("hex")
              }
            }),
          verify: () => Effect.void,
          readJson: (_orgSlug, ref, schema) =>
            Schema.decodeUnknownEffect(schema)(stored.get(ref.key)).pipe(
              Effect.orDie
            )
        }
      }
    )
    const dbLayer = DbLive.pipe(
      Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl!) }))
    )
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          const root = yield* fs.makeTempDirectoryScoped({
            prefix: "jira-plan-"
          })
          const markdownLayer = MarkdownLive.pipe(
            Layer.provide(
              ConfigProvider.layer(
                ConfigProvider.fromUnknown({ PROJECTS_DIR: root })
              )
            )
          )
          const run = Effect.gen(function* () {
            const preparation = prepareJiraPublicationFromSnapshot(
              {
                fence: {
                  migrationId,
                  workflowExecutionId: migrationId,
                  workflowAttempt: 1
                },
                manifestRef,
                configurationRevision: 1,
                configuration: acceptedConfiguration,
                migrationCreatedAt,
                organizationId,
                orgSlug: organizationId,
                ownerId: userId,
                connection
              },
              {
                readJson: (_orgSlug, ref, schema) =>
                  Schema.decodeUnknownEffect(schema)(stored.get(ref.key)).pipe(
                    Effect.orDie
                  ),
                writeJson: (_orgSlug, coordinates, value) =>
                  Effect.sync(() => {
                    const ref = {
                      key: `migrations/jira/${coordinates.migrationId}/scan-${coordinates.scanRevision}/${coordinates.area}/${coordinates.kind}/${coordinates.identity}.json`,
                      contentType: "application/json",
                      byteSize: 1,
                      sha256: "b".repeat(64)
                    }
                    stored.set(ref.key, value)
                    return ref
                  })
              }
            )
            const preparedRef = yield* preparation
            const reloaded = yield* loadJiraPreparedPublication(
              organizationId,
              preparedRef,
              {
                verify: () => Effect.void,
                readJson: (_orgSlug, ref, schema) =>
                  Schema.decodeUnknownEffect(schema)(stored.get(ref.key)).pipe(
                    Effect.orDie
                  )
              }
            )
            expect(reloaded.projectId).toBe(prepared.projectId)
            expect(reloaded.attachments).toEqual(prepared.attachments)
            expect(yield* callbacks.createHidden).toBe(prepared.projectId)
            expect(yield* preparation).toEqual(preparedRef)
            const attachmentOutcome = yield* callbacks.copyAttachment(
              prepared.attachments[0]!
            )
            expect(attachmentOutcome.kind).toBe("copied")
            const finalized = yield* callbacks.finalizePlan([attachmentOutcome])
            for (
              let ordinal = 0;
              ordinal < finalized.documentBatchCount;
              ordinal++
            )
              yield* callbacks.writeDocumentBatch(finalized.planRef, ordinal)
            yield* callbacks.writeArchive(finalized.planRef)
            yield* callbacks.writeReport(finalized.planRef)
            const verified = yield* callbacks.verify(finalized.planRef)
            expect(verified.planSha256).toBe(finalized.publicationRevision)
            expect(verified.documentCount).toBeGreaterThanOrEqual(3)
            expect(verified.attachmentCount).toBe(1)
            const [before] = (yield* Effect.promise(() =>
              pool.query(
                "select published_at from project_index where id = $1",
                [prepared.projectId]
              )
            )).rows
            expect(before?.published_at).toBeNull()
            const projection = yield* JiraMigrationProjection
            expect(
              yield* projection.settleRemoteWrites({
                migrationId,
                workflowExecutionId: migrationId,
                workflowAttempt: 1
              })
            ).toBe(true)
            const loaded = yield* loadJiraPublicationPlan(
              prepared.orgSlug,
              finalized.planRef,
              {
                verify: () => Effect.void,
                readJson: (_orgSlug, ref, schema) =>
                  Schema.decodeUnknownEffect(schema)(stored.get(ref.key)).pipe(
                    Effect.orDie
                  )
              }
            )
            const publishInput = {
              fence: {
                migrationId,
                workflowExecutionId: migrationId,
                workflowAttempt: 1
              },
              plan: loaded.plan,
              publicationRevision: loaded.publicationRevision,
              verified
            }
            const missingAttachmentId = jiraAttachmentId(
              migrationId,
              "missing-attachment",
              migrationCreatedAt
            )
            const invalidPlan = {
              ...loaded.plan,
              indexes: {
                ...loaded.plan.indexes,
                attachmentReferences: [
                  {
                    attachmentId: missingAttachmentId,
                    orgSlug: prepared.orgSlug,
                    projectSlug: prepared.configuration.destination.slug,
                    ticketId: loaded.plan.tickets[0]!.id,
                    createdAt: migrationCreatedAt
                  }
                ]
              }
            }
            const invalidRevision = createHash("sha256")
              .update(
                canonicalJiraJson(
                  yield* Schema.encodeEffect(JiraPublicationPlanV1)(invalidPlan)
                )
              )
              .digest("hex")
            expect(
              (yield* Effect.result(
                publishJiraMigrationAtomically({
                  ...publishInput,
                  plan: invalidPlan,
                  publicationRevision: invalidRevision,
                  verified: { ...verified, planSha256: invalidRevision }
                })
              ))._tag
            ).toBe("Failure")
            const [afterRollback] = (yield* Effect.promise(() =>
              pool.query(
                "select published_at from project_index where id = $1",
                [prepared.projectId]
              )
            )).rows
            expect(afterRollback?.published_at).toBeNull()
            const [statusCount] = (yield* Effect.promise(() =>
              pool.query(
                "select count(*)::int as count from project_status where project_id = $1",
                [prepared.projectId]
              )
            )).rows
            expect(statusCount?.count).toBe(0)
            yield* Effect.promise(() =>
              pool.query(
                "update jira_migration set status = 'cancelling' where id = $1",
                [migrationId]
              )
            )
            expect(
              (yield* Effect.result(
                publishJiraMigrationAtomically(publishInput)
              ))._tag
            ).toBe("Failure")
            yield* finalizeJiraMigrationAttempt(
              projection,
              publishInput.fence,
              Exit.fail(
                JiraMigrationWorkflowFailure.make({
                  reason: "cancelled-before-publish",
                  retryable: false
                })
              )
            )
            const [cancelled] = (yield* Effect.promise(() =>
              pool.query("select status from jira_migration where id = $1", [
                migrationId
              ])
            )).rows
            expect(cancelled?.status).toBe("cancelled")
            yield* Effect.promise(() =>
              pool.query(
                "update jira_migration set status = 'migrating' where id = $1",
                [migrationId]
              )
            )
            expect(yield* callbacks.publish(finalized.planRef, verified)).toBe(
              true
            )
            expect(yield* publishJiraMigrationAtomically(publishInput)).toBe(
              true
            )
            const [liveAttachment] = (yield* Effect.promise(() =>
              pool.query("select status from attachment_index where id = $1", [
                prepared.attachments[0]!.id
              ])
            )).rows
            expect(liveAttachment?.status).toBe("live")
            const foreignPlan = {
              ...publishInput.plan,
              reportDocument: {
                ...publishInput.plan.reportDocument,
                path: `imports/jira/${migrationId}/foreign-report.md`
              }
            }
            const foreignRevision = createHash("sha256")
              .update(
                canonicalJiraJson(
                  yield* Schema.encodeEffect(JiraPublicationPlanV1)(foreignPlan)
                )
              )
              .digest("hex")
            expect(
              (yield* Effect.result(
                publishJiraMigrationAtomically({
                  ...publishInput,
                  plan: foreignPlan,
                  publicationRevision: foreignRevision,
                  verified: { ...verified, planSha256: foreignRevision }
                })
              ))._tag
            ).toBe("Failure")
            expect(
              yield* projection.finalizeInterrupted({
                migrationId,
                workflowExecutionId: migrationId,
                workflowAttempt: 1
              })
            ).toBe(false)
            yield* finalizeJiraMigrationAttempt(
              projection,
              {
                migrationId,
                workflowExecutionId: migrationId,
                workflowAttempt: 1
              },
              Exit.fail(
                JiraMigrationWorkflowFailure.make({
                  reason: "late-failure",
                  retryable: true
                })
              )
            )
          }).pipe(Effect.provide(markdownLayer))
          yield* run
        })
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            dbLayer,
            BunServices.layer,
            JiraMigrationProjection.layer.pipe(Layer.provide(dbLayer))
          )
        )
      )
    )
    const [project] = (
      await pool.query("select published_at from project_index where id = $1", [
        prepared.projectId
      ])
    ).rows
    expect(project?.published_at).not.toBeNull()
    const [migration] = (
      await pool.query(
        "select status,destination_project_id from jira_migration where id = $1",
        [migrationId]
      )
    ).rows
    expect(migration).toEqual({
      status: "succeeded",
      destination_project_id: prepared.projectId
    })
  })
})

const convertedText = (markdown: string): JiraConvertedText => ({
  markdown,
  references: [],
  warnings: [],
  adf: {}
})

const manifest = (): JiraMigrationManifest => ({
  version: 1,
  migrationId: "migration-1",
  source: {
    cloudId: "cloud-1",
    siteUrl: "https://example.atlassian.net",
    projectId: "10000",
    projectKey: "APP",
    projectName: "Application",
    productType: "software",
    scannedAt: "2026-09-14T12:00:00Z"
  },
  identities: [
    {
      accountId: "account-linked",
      displayName: "Linked User",
      emailAddress: null,
      active: true,
      accountType: "atlassian",
      raw: {}
    },
    {
      accountId: "account-unlinked",
      displayName: "Former User",
      emailAddress: null,
      active: false,
      accountType: "atlassian",
      raw: {}
    }
  ],
  statuses: [
    { id: "status-open", name: "Open", categoryKey: "new", raw: {} },
    {
      id: "status-hold",
      name: "On hold",
      categoryKey: "indeterminate",
      raw: {}
    }
  ],
  issueTypes: [{ id: "type-1", name: "Bug", subtask: false, raw: {} }],
  priorities: [{ id: "priority-1", name: "High", raw: {} }],
  components: [{ id: "component-1", name: "API", description: null, raw: {} }],
  issues: [
    {
      id: "issue-1",
      key: "APP-1",
      issueNumber: 1,
      summary: "First",
      description: convertedText("Body one"),
      statusId: "status-open",
      issueTypeId: "type-1",
      priorityId: "priority-1",
      assigneeAccountId: "account-linked",
      labels: ["Urgent"],
      componentIds: ["component-1"],
      groupIds: [],
      parentIssueId: null,
      attachmentIds: [],
      restricted: false,
      createdAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-02T10:00:00Z",
      raw: {}
    },
    {
      id: "issue-7",
      key: "APP-7",
      issueNumber: 7,
      summary: "Seventh",
      description: null,
      statusId: "status-hold",
      issueTypeId: "type-1",
      priorityId: "priority-1",
      assigneeAccountId: "account-unlinked",
      labels: [],
      componentIds: [],
      groupIds: [],
      parentIssueId: null,
      attachmentIds: [],
      restricted: false,
      createdAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-02T10:00:00Z",
      raw: {}
    }
  ],
  comments: [
    {
      id: "comment-1",
      issueId: "issue-1",
      authorAccountId: "account-unlinked",
      authorDisplayName: "Former User",
      body: convertedText("Historical note"),
      createdAt: "2026-09-01T11:00:00Z",
      updatedAt: null,
      restricted: false,
      raw: {}
    }
  ],
  attachments: [],
  groups: [],
  restrictions: [],
  coverage: [],
  rawPages: []
})

const manifestV2 = (migrationId: string) => {
  const source = manifest()
  return Schema.decodeUnknownSync(JiraMigrationManifestV2)({
    ...source,
    version: 2,
    migrationId,
    scanRevision: 1,
    source: {
      ...source.source,
      visibleAccount: {
        accountId: "account-linked",
        displayName: "Linked User",
        caveat: "Visible account only"
      }
    },
    workflow: { executionId: migrationId, attempt: 1 },
    issues: source.issues.map(({ description, labels, ...issue }) => ({
      ...issue,
      descriptionArtifact: null,
      reporterAccountId: null,
      labelIds: labels
    })),
    comments: [],
    attachments: [],
    fieldDefinitions: [],
    workflows: [],
    changelogs: [],
    worklogs: [],
    watchers: [],
    votes: [],
    parentsSubtasks: [],
    epics: [],
    sprints: [],
    versionsReleases: [],
    ranks: [],
    links: [],
    productApps: [],
    customFields: [],
    warnings: [],
    rawArtifacts: [],
    schemaVersions: [{ id: "manifest", version: "2" }],
    converterVersions: [{ id: "adf", version: "1" }]
  })
}

const configuration = {
  destination: { name: "Application", slug: "application", key: "APP" },
  identities: [
    { jiraAccountId: "account-linked", projectProjectUserId: "user-1" },
    { jiraAccountId: "account-unlinked", projectProjectUserId: null }
  ],
  statuses: [
    { jiraStatusId: "status-open", projectStatusSlug: "todo" },
    {
      jiraStatusId: "status-hold",
      projectStatusSlug: "on_hold",
      createStatus: true
    }
  ],
  issueTypes: [{ jiraIssueTypeId: "type-1", projectType: "bug" }],
  priorities: [{ jiraPriorityId: "priority-1", projectPriority: "high" }],
  tags: [],
  activeFutureSprintChoices: [],
  restrictedContent: { policy: "exclude" },
  skippedAttachmentIds: [],
  attachmentSkipsAccepted: true
}

const environment: JiraPreflightEnvironment = {
  existingProjectSlugs: [],
  existingProjectKeys: [],
  existingTicketIds: [],
  existingUserIds: ["user-1"],
  existingStatusSlugs: ["todo", "in_progress", "done"]
}

describe("buildJiraImportPlan", () => {
  it("turns a wizard configuration into a ready publication plan", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      environment,
      {}
    )

    expect(result.kind).toBe("ready")
    if (result.kind !== "ready") return
    expect(result.plan.project.slug).toBe("application")
    expect(result.plan.tickets.map(({ id }) => id)).toEqual(["APP-1", "APP-7"])
    expect(result.plan.tickets[0]?.status).toBe("todo")
    expect(result.plan.tickets[0]?.type).toBe("bug")
    expect(result.plan.tickets[0]?.priority).toBe("high")
  })

  it("plans the source-named status only for the create-status row", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      environment,
      {}
    )

    if (result.kind !== "ready") throw new Error("expected a ready plan")
    expect(result.plan.createdStatuses.map(({ slug }) => slug)).toEqual([
      "on_hold"
    ])
    expect(result.plan.createdStatuses[0]?.isTerminal).toBe(false)
    expect(result.plan.tickets[1]?.status).toBe("on_hold")
  })

  it("keeps an unlinked Jira author on the comment instead of inventing a user", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      environment,
      {}
    )

    if (result.kind !== "ready") throw new Error("expected a ready plan")
    expect(result.plan.comments).toHaveLength(1)
    expect(result.plan.comments[0]?.author).toEqual({
      kind: "jira",
      displayName: "Former User",
      accountId: "account-unlinked"
    })
  })

  it("assigns only linked identities", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      environment,
      {}
    )

    if (result.kind !== "ready") throw new Error("expected a ready plan")
    expect(result.plan.tickets[0]?.assignees).toEqual(["user-1"])
    expect(result.plan.tickets[1]?.assignees).toEqual([])
  })

  it("blocks instead of publishing when the destination slug is taken", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      { ...environment, existingProjectSlugs: ["application"] },
      {}
    )

    expect(result.kind).toBe("blocked")
    if (result.kind !== "blocked") return
    expect(result.blockers.map(({ code }) => code)).toContain(
      "project-slug-collision"
    )
  })
})

describe("nextTicketNumberFor", () => {
  it("continues past the highest imported Jira number, preserving gaps", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      environment,
      {}
    )

    if (result.kind !== "ready") throw new Error("expected a ready plan")
    expect(nextTicketNumberFor(result.plan)).toBe(8)
  })
})

describe("tag renaming", () => {
  it("uses the name chosen in the wizard instead of the suggestion", () => {
    const withRename = {
      ...configuration,
      tags: [
        { source: { kind: "label", value: "Urgent" }, destinationTagName: "p0" }
      ]
    }
    const result = buildJiraImportPlan(manifest(), withRename, environment, {})

    if (result.kind !== "ready") throw new Error("expected a ready plan")
    const names = result.plan.tags.map(({ name }) => name)
    expect(names).toContain("p0")
    expect(names).not.toContain("urgent")
    expect(result.plan.tickets[0]?.tags).toContain("p0")
  })

  it("falls back to the derived tag when the wizard left it alone", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      environment,
      {}
    )

    if (result.kind !== "ready") throw new Error("expected a ready plan")
    expect(result.plan.tags.map(({ name }) => name)).toContain("urgent")
  })
})

describe("groupColors", () => {
  const group = (
    kind: JiraPublicationPlan["groups"][number]["kind"],
    id: string
  ) =>
    ({
      sourceGroupId: id,
      kind,
      name: id,
      body: "",
      ticketIds: [],
      startsAt: null,
      endsAt: null,
      completedAt: null
    }) satisfies JiraPublicationPlan["groups"][number]

  it("gives every sprint the flat sprint colour", () => {
    const colors = groupColors([
      group("sprint", "s1"),
      group("sprint", "s2"),
      group("sprint", "s3")
    ])

    expect(new Set(colors)).toEqual(new Set(["#777777"]))
  })

  it("gives non-sprint groups distinct palette colours", () => {
    const colors = groupColors([
      group("epic", "e1"),
      group("sprint", "s1"),
      group("milestone", "m1"),
      group("epic", "e2")
    ])

    expect(colors[1]).toBe("#777777")
    const nonSprint = [colors[0], colors[2], colors[3]]
    expect(new Set(nonSprint).size).toBe(3)
    for (const color of nonSprint) {
      expect(TAG_DEFAULT_PALETTE).toContain(color)
    }
  })

  it("only ever produces valid hex colours", () => {
    const colors = groupColors(
      Array.from({ length: 20 }, (_, i) => group("epic", `e${i}`))
    )

    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe("aliasJiraMediaReferences", () => {
  const mediaManifest = (): JiraMigrationManifest => {
    const base = manifest()
    return {
      ...base,
      attachments: [
        {
          id: "10348",
          issueId: "issue-1",
          filename: "Screenshot.png",
          mimeType: "image/png",
          byteSize: 100,
          downloadUrl: null,
          jiraUrl: null,
          downloadAllowed: true,
          raw: {}
        }
      ],
      comments: [
        {
          ...base.comments[0]!,
          body: {
            markdown: "see jira-reference:000000",
            references: [
              {
                kind: "jira-attachment",
                sourceId: "573670c8-28f0-460c-93bc-5d0992659b8d",
                placeholder: "jira-reference:000000",
                originalUrl: null,
                fallbackText: "Screenshot.png"
              }
            ],
            warnings: [],
            adf: {}
          }
        }
      ]
    }
  }

  it("maps the ADF media uuid onto the copied attachment url", () => {
    const aliased = aliasJiraMediaReferences(mediaManifest(), {
      "10348": "/api/attachments/example/ATT1"
    })

    expect(aliased["573670c8-28f0-460c-93bc-5d0992659b8d"]).toBe(
      "/api/attachments/example/ATT1"
    )
    expect(aliased["10348"]).toBe("/api/attachments/example/ATT1")
  })

  it("leaves a media reference alone when its attachment was not copied", () => {
    const aliased = aliasJiraMediaReferences(mediaManifest(), {})

    expect(aliased["573670c8-28f0-460c-93bc-5d0992659b8d"]).toBeUndefined()
  })

  it("does not guess when the filename is ambiguous across issues", () => {
    const base = mediaManifest()
    const ambiguous: JiraMigrationManifest = {
      ...base,
      attachments: [
        ...base.attachments,
        { ...base.attachments[0]!, id: "10999", issueId: "issue-other" }
      ],
      comments: [
        {
          ...base.comments[0]!,
          issueId: "issue-unrelated"
        }
      ]
    }

    const aliased = aliasJiraMediaReferences(ambiguous, {
      "10348": "/api/attachments/example/ATT1",
      "10999": "/api/attachments/example/ATT2"
    })

    expect(aliased["573670c8-28f0-460c-93bc-5d0992659b8d"]).toBeUndefined()
  })
})

describe("embedded image references", () => {
  it("renders an imported screenshot as an inline image, not a file chip", () => {
    const base = manifest()
    const withMedia: JiraMigrationManifest = {
      ...base,
      attachments: [
        {
          id: "10348",
          issueId: "issue-1",
          filename: "Screenshot.png",
          mimeType: "image/png",
          byteSize: 100,
          downloadUrl: "https://example.atlassian.net/a/10348",
          jiraUrl: null,
          downloadAllowed: true,
          raw: {}
        },
        {
          id: "10349",
          issueId: "issue-1",
          filename: "spec.pdf",
          mimeType: "application/pdf",
          byteSize: 100,
          downloadUrl: "https://example.atlassian.net/a/10349",
          jiraUrl: null,
          downloadAllowed: true,
          raw: {}
        }
      ],
      comments: [
        {
          ...base.comments[0]!,
          body: {
            markdown: "shot jira-reference:000000 doc jira-reference:000001",
            references: [
              {
                kind: "jira-attachment",
                sourceId: "media-uuid-1",
                placeholder: "jira-reference:000000",
                originalUrl: null,
                fallbackText: "Screenshot.png"
              },
              {
                kind: "jira-attachment",
                sourceId: "media-uuid-2",
                placeholder: "jira-reference:000001",
                originalUrl: null,
                fallbackText: "spec.pdf"
              }
            ],
            warnings: [],
            adf: {}
          }
        }
      ]
    }

    const urls = aliasJiraMediaReferences(withMedia, {
      "10348": "/api/attachments/example/IMG",
      "10349": "/api/attachments/example/DOC"
    })
    const result = buildJiraImportPlan(
      withMedia,
      configuration,
      environment,
      urls
    )

    if (result.kind !== "ready")
      throw new Error(`blocked: ${JSON.stringify(result.blockers)}`)
    const body = result.plan.comments[0]!.body
    expect(body).toContain("![Screenshot.png](/api/attachments/example/IMG)")
    expect(body).toContain("[spec.pdf](/api/attachments/example/DOC)")
    expect(body).not.toContain("![spec.pdf]")
  })
})
