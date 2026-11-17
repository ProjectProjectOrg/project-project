// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import * as BunServices from "@effect/platform-bun/BunServices"
import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import { orgScope, projectScope } from "@pp/server-core/access/testing"
import { passthroughTicketActivity } from "@pp/server-core/activity/testing"
import * as LibraryDocs from "@pp/server-core/library/LibraryDocs"
import * as KeyedLock from "@pp/server-core/locks/KeyedLock"
import * as Markdown from "@pp/server-core/markdown/Markdown"
import { FinishedStatuses } from "@pp/server-core/projects/FinishedStatuses"
import * as ProjectDocs from "@pp/server-core/projects/ProjectDocs"
import * as ProjectExport from "@pp/server-core/projects/ProjectExport"
import * as ProjectImports from "@pp/server-core/projects/ProjectImports"
import { tarGz } from "@pp/server-core/projects/tarGz"
import * as OrgStorage from "@pp/server-core/storage/OrgStorage"
import * as S3Storage from "@pp/server-core/storage/S3Storage"
import * as TicketIndexServices from "@pp/server-core/tickets/indexLayer"
import * as TicketDocs from "@pp/server-core/tickets/TicketDocs"
import {
  CreatableProjectKey,
  OrgScope,
  ProjectScope,
  TypeDraft,
  BlockDraft
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Redacted from "effect/Redacted"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { WorkflowEngine } from "effect/workflow"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const decodeBlock = Schema.decodeUnknownSync(BlockDraft)
const decodeType = Schema.decodeUnknownSync(TypeDraft)
const decodeKey = Schema.decodeSync(CreatableProjectKey)

describe.skipIf(!databaseUrl)("project import", () => {
  const suffix = randomUUID().slice(0, 8)
  const source = { id: `src-${suffix}`, slug: `src-${suffix}` }
  const target = { id: `dst-${suffix}`, slug: `dst-${suffix}` }
  const importer = `importer-${suffix}`
  const ada = `ada-${suffix}`
  const bob = `bob-${suffix}`
  const sourceProjectId = randomUUID()
  const attachmentId = "01K0000000000000000000000A"
  const objects = new Map<string, Uint8Array>()
  let pool: Pool
  let root: string

  const connection: S3Storage.S3Connection = {
    endpoint: "https://s3.example.com",
    bucket: "bucket",
    region: "auto",
    keyPrefix: null,
    forcePathStyle: true,
    accessKeyId: "key",
    secretAccessKey: "secret"
  }

  const layer = (workflowEngine = WorkflowEngine.layerMemory) => {
    const db = DbLive.pipe(
      Layer.provideMerge(
        PgClient.layer({ url: Redacted.make(databaseUrl!), maxConnections: 2 })
      )
    )
    const markdown = Markdown.layer.pipe(
      Layer.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ PROJECTS_DIR: root }))
      )
    )
    const storage = Layer.mergeAll(
      Layer.mock(OrgStorage.OrgStorage, {
        requireConnection: () => Effect.succeed(connection)
      }),
      Layer.mock(S3Storage.S3Storage, {
        putObject: (_c, key, _type, bytes) =>
          Effect.sync(() => void objects.set(key, bytes)),
        getObject: (_c, key) => Effect.succeed(objects.get(key) ?? null),
        headObject: (_c, key) =>
          Effect.succeed(
            objects.has(key)
              ? {
                  byteSize: objects.get(key)!.byteLength,
                  contentType: null,
                  contentHash: null
                }
              : null
          ),
        deleteObject: (_c, key) => Effect.sync(() => void objects.delete(key))
      })
    )
    const ticketDocs = TicketDocs.layer.pipe(
      Layer.provide(markdown),
      Layer.provide(KeyedLock.layer),
      Layer.provide(passthroughTicketActivity),
      Layer.provide(FinishedStatuses.layer.pipe(Layer.provide(db)))
    )
    const index = TicketIndexServices.layer.pipe(Layer.provide(ticketDocs))
    return Layer.mergeAll(
      ProjectImports.ProjectImportWorkflowLive.pipe(
        Layer.provideMerge(ProjectImports.layer)
      ),
      ProjectExport.layer
    ).pipe(
      Layer.provideMerge(workflowEngine),
      Layer.provide(index),
      Layer.provide(ProjectDocs.layer),
      Layer.provideMerge(LibraryDocs.layer.pipe(Layer.provide(markdown))),
      Layer.provideMerge(markdown),
      Layer.provide(storage),
      Layer.provideMerge(db),
      Layer.provideMerge(BunServices.layer),
      Layer.orDie
    )
  }

  beforeAll(async () => {
    const url = new URL(databaseUrl!)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error("Test requires an isolated local database")
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), { migrationsFolder })
    for (const [id, name] of [
      [importer, "Imogen"],
      [ada, "Ada"],
      [bob, "Bob"]
    ]) {
      await pool.query(
        'INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)',
        [id, name, `${id}@example.test`]
      )
    }
    for (const org of [source, target]) {
      await pool.query(
        "INSERT INTO organization (id, name, slug, created_at) VALUES ($1, $1, $2, now())",
        [org.id, org.slug]
      )
    }
    for (const [org, userId] of [
      [source.id, ada],
      [source.id, bob],
      [target.id, importer],
      [target.id, ada]
    ]) {
      await pool.query(
        "INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, 'member', now())",
        [randomUUID(), org, userId]
      )
    }
    await pool.query(
      "INSERT INTO project_index (id, slug, organization_id, key, name, icon, color, created_by, next_ticket_number) VALUES ($1, 'src', $2, 'T', 'Source', 'x', '#000000', $3, 3)",
      [sourceProjectId, source.id, ada]
    )
    for (const userId of [ada, bob]) {
      await pool.query(
        "INSERT INTO project_member (project_id, organization_id, user_id, role_id) VALUES ($1, $2, $3, $4)",
        [
          sourceProjectId,
          source.id,
          userId,
          userId === ada ? "pm" : "developer"
        ]
      )
    }
    await pool.query(
      "INSERT INTO project_status (project_id, slug, label, icon, color, order_key, created_by) VALUES ($1, 'todo', 'Todo', 'circle', 'gray', 'a0', $2)",
      [sourceProjectId, bob]
    )
    await pool.query(
      "INSERT INTO attachment_index (id, organization_id, org_slug, project_id, ticket_id, object_key, filename, content_type, byte_size, status, uploaded_by) VALUES ($1, $2, $3, $4, 'T-1', 'source-object', 'shot.png', 'image/png', 5, 'live', $5)",
      [attachmentId, source.id, source.slug, sourceProjectId, bob]
    )
    await pool.query(
      "INSERT INTO attachment_reference (attachment_id, project_id, ticket_id) VALUES ($1, $2, 'T-1')",
      [attachmentId, sourceProjectId]
    )
    await pool.query(
      `INSERT INTO ticket_activity (id, project_id, ticket_id, occurred_at, actor_kind, actor_user_id, change) VALUES ($1, $2, 'T-1', now(), 'user', $3, '{"kind":"description_edited"}')`,
      [randomUUID(), sourceProjectId, bob]
    )
    objects.set("source-object", new TextEncoder().encode("bytes"))
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM organization WHERE id = ANY($1)", [
        [source.id, target.id]
      ])
      await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [
        [importer, ada, bob]
      ])
      await pool.end()
    }
  })

  const writeSource = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const libraryDocs = yield* LibraryDocs.LibraryDocs
    yield* libraryDocs.writeBlock(
      source.slug,
      null,
      decodeBlock({
        key: "incident-note",
        name: "Incident note",
        icon: "FileText",
        color: null,
        description: "",
        sync: true,
        content: "Source incident template"
      })
    )
    const sourceType = decodeType({
      key: "incident",
      name: "Incident",
      icon: "Bug",
      color: null,
      description: "Urgent work",
      priority: "high",
      tags: [],
      body: '<block type="incident-note">\n\n</block>'
    })
    yield* libraryDocs.writeType(source.slug, null, sourceType)
    yield* libraryDocs.writeType(
      source.slug,
      null,
      decodeType({
        ...sourceType,
        key: "bug",
        name: "Bug",
        body: "Source Bug template"
      })
    )
    yield* libraryDocs.writeType(target.slug, null, {
      ...sourceType,
      body: "Destination template"
    })
    const dir = path.join(root, "orgs", source.slug, "projects", "src")
    yield* fs.makeDirectory(path.join(dir, "tickets"), { recursive: true })
    yield* fs.makeDirectory(path.join(dir, "groups"), { recursive: true })
    yield* fs.writeFileString(
      path.join(dir, "groups", "G-1.md"),
      `---\nid: G-1\nname: Source sprint\nkind: sprint\ncolor: '#8b5cf6'\ntickets: []\nstartsAt: null\nendsAt: null\ncompletedAt: null\ncreatedBy: ${ada}\ncreatedAt: '2026-01-01T00:00:00.000Z'\nupdatedAt: '2026-01-01T00:00:00.000Z'\n---\n`
    )
    yield* fs.writeFileString(
      path.join(dir, "project.md"),
      `---\norg: ${source.slug}\nslug: src\nformerKeys: [OLD]\nname: Source\ncreatedAt: 2026-01-01T00:00:00.000Z\n---\n`
    )
    yield* fs.writeFileString(
      path.join(dir, "tickets", "T-1.md"),
      [
        "---",
        "id: T-1",
        "title: First",
        "status: todo",
        "type: incident",
        "rank: a0",
        "sprint: G-1",
        "priority: med",
        "tags: []",
        `assignees: [${ada}, ${bob}]`,
        `createdBy: ${ada}`,
        "createdAt: '2026-01-01T00:00:00.000Z'",
        "updatedAt: '2026-01-01T00:00:00.000Z'",
        "---",
        "",
        `See [T-2](mention:ticket/T-2). ![shot](/api/attachments/${source.slug}/${attachmentId})`,
        "",
        '<block type="incident-note" sync>',
        "Stale ticket snapshot",
        "</block>",
        "",
        "<!-- comments:start -->",
        "<!-- comment:c_bob -->",
        "---",
        "author:",
        "  kind: user",
        `  userId: ${bob}`,
        "origin: native",
        "createdAt: 2026-01-02T00:00:00.000Z",
        "---",
        "On it.",
        "<!-- comments:end -->",
        ""
      ].join("\n")
    )
    yield* fs.writeFileString(
      path.join(dir, "tickets", "T-2.md"),
      `---\nid: T-2\ntitle: Second\nstatus: todo\ntype: bug\nrank: a1\npriority: med\ntags: []\ncreatedBy: ${ada}\ncreatedAt: '2026-01-01T00:00:00.000Z'\nupdatedAt: '2026-01-01T00:00:00.000Z'\n---\n`
    )
    yield* Effect.promise(() =>
      pool.query(
        "INSERT INTO comment_index (id, project_id, ticket_id, origin, author_kind, author_id, created_at) VALUES ('c_bob', $1, 'T-1', 'native', 'user', $2, '2026-01-02T00:00:00Z') ON CONFLICT DO NOTHING",
        [sourceProjectId, bob]
      )
    )
  })

  const exported = Effect.gen(function* () {
    const projectExport = yield* ProjectExport.ProjectExport
    const archive = yield* projectExport.archive().pipe(
      Effect.provideService(
        ProjectScope,
        projectScope("member", "pm", {
          userId: ada,
          organizationId: source.id,
          orgSlug: source.slug,
          projectId: sourceProjectId,
          slug: "src"
        })
      )
    )
    return archive.stream
  })

  const asImporter = Effect.provideService(
    OrgScope,
    orgScope("member", {
      userId: importer,
      organizationId: target.id,
      orgSlug: target.slug
    })
  )

  it.live(
    "moves a project into another org under a new key, linking the people chosen and keeping the rest as imported authors",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          root = yield* fs.makeTempDirectoryScoped({ prefix: "pp-import-" })
          yield* Effect.gen(function* () {
            yield* writeSource
            const notesDir = `${root}/orgs/${source.slug}/projects/src/notes`
            yield* fs.makeDirectory(notesDir, { recursive: true })
            for (let i = 0; i < 105; i++) {
              yield* fs.writeFileString(
                `${notesDir}/${i}.md`,
                `Source note ${i}`
              )
            }
            const imports = yield* ProjectImports.ProjectImports
            const uploaded = yield* imports
              .upload(yield* exported)
              .pipe(asImporter)
            expect(uploaded).toMatchObject({
              status: "ready",
              source: { key: "T", name: "Source" },
              counts: { tickets: 2, attachments: 1, missingAttachments: 0 },
              types: [
                { sourceKey: "bug", key: "bug", name: "Bug" },
                { sourceKey: "incident", key: "incident2", name: "Incident2" }
              ]
            })
            expect(
              uploaded.people.find((person) => person.id === ada)
                ?.suggestedUserId
            ).toBe(ada)

            const result = yield* imports
              .run(uploaded.id, {
                name: "Moved",
                slug: "moved",
                key: decodeKey("PP"),
                people: [
                  { sourceUserId: ada, userId: ada },
                  { sourceUserId: bob, userId: null }
                ]
              })
              .pipe(asImporter)
            expect(result.status).toBe("importing")
            const finished = yield* imports.get(uploaded.id).pipe(
              asImporter,
              Effect.repeat({
                while: (current) => current.status === "importing",
                schedule: Schedule.spaced("20 millis")
              }),
              Effect.timeout("10 seconds")
            )
            expect(finished).toMatchObject({
              status: "succeeded",
              destination: { slug: "moved" }
            })
            yield* imports.steps.publish(uploaded.id, 1)

            const q = <T>(text: string, values: ReadonlyArray<unknown>) =>
              Effect.promise(() =>
                pool.query<T & Record<string, unknown>>(text, [...values])
              ).pipe(Effect.map((r) => r.rows))
            const [project] = yield* q<{
              id: string
              published_at: Date | null
              key: string
            }>(
              "SELECT id, published_at, key FROM project_index WHERE organization_id = $1 AND slug = 'moved'",
              [target.id]
            )
            expect(project.published_at).not.toBeNull()
            expect(project.key).toBe("PP")
            expect(
              yield* q(
                "SELECT sprint_id FROM ticket_index WHERE project_id = $1 AND ticket_id = 'PP-1'",
                [project.id]
              )
            ).toEqual([{ sprint_id: "G-1" }])
            expect(
              yield* q<{ key: string; current: boolean }>(
                "SELECT key, current FROM project_key WHERE project_id = $1 ORDER BY key",
                [project.id]
              )
            ).toEqual([
              { key: "OLD", current: false },
              { key: "PP", current: true },
              { key: "T", current: false }
            ])
            expect(
              (yield* q<{ ticket_id: string }>(
                "SELECT ticket_id FROM ticket_index WHERE project_id = $1 ORDER BY ticket_id",
                [project.id]
              )).map((r) => r.ticket_id)
            ).toEqual(["PP-1", "PP-2"])
            expect(
              yield* q<{ user_id: string; role_id: string }>(
                "SELECT user_id, role_id FROM project_member WHERE project_id = $1 ORDER BY user_id",
                [project.id]
              )
            ).toEqual(
              [
                { user_id: ada, role_id: "pm" },
                { user_id: importer, role_id: "pm" }
              ].toSorted((a, b) => a.user_id.localeCompare(b.user_id))
            )
            expect(
              yield* q(
                "SELECT author_kind, imported_name, imported_source, imported_id, origin FROM comment_index WHERE project_id = $1",
                [project.id]
              )
            ).toEqual([
              {
                author_kind: "imported",
                imported_name: "Bob",
                imported_source: "projectproject",
                imported_id: bob,
                origin: "projectproject"
              }
            ])
            expect(
              yield* q(
                "SELECT actor_kind, imported_name, ticket_id FROM ticket_activity WHERE project_id = $1",
                [project.id]
              )
            ).toEqual([
              {
                actor_kind: "imported",
                imported_name: "Bob",
                ticket_id: "PP-1"
              }
            ])
            const [attachment] = yield* q<{
              id: string
              status: string
              object_key: string
              ticket_id: string
              uploaded_by: string
            }>(
              "SELECT id, status, object_key, ticket_id, uploaded_by FROM attachment_index WHERE project_id = $1",
              [project.id]
            )
            expect(attachment).toMatchObject({
              status: "live",
              ticket_id: "PP-1",
              uploaded_by: importer
            })
            expect(attachment.id).not.toBe(attachmentId)
            expect(objects.get(attachment.object_key)).toEqual(
              new TextEncoder().encode("bytes")
            )

            const ticket = yield* fs.readFileString(
              `${root}/orgs/${target.slug}/projects/moved/tickets/PP-1.md`
            )
            for (let i = 0; i < 105; i++) {
              expect(
                yield* fs.readFileString(
                  `${root}/orgs/${target.slug}/projects/moved/notes/${i}.md`
                )
              ).toBe(`Source note ${i}`)
            }
            expect(ticket).toContain("[PP-2](mention:ticket/PP-2)")
            expect(ticket).toContain("type: incident2")
            expect(ticket).toContain("Source incident template")
            expect(ticket).not.toContain("Stale ticket snapshot")
            expect(ticket).not.toContain('type="incident-note" sync')
            expect(
              yield* fs.readFileString(
                `${root}/orgs/${target.slug}/projects/moved/tickets/PP-2.md`
              )
            ).toContain("type: bug")
            expect(
              yield* fs.readFileString(
                `${root}/orgs/${target.slug}/projects/moved/types/bug.md`
              )
            ).toContain("Source Bug template")
            const importedType = yield* fs.readFileString(
              `${root}/orgs/${target.slug}/projects/moved/types/incident2.md`
            )
            expect(importedType).toContain("name: Incident2")
            expect(importedType).toContain("Source incident template")
            expect(
              yield* fs.readFileString(
                `${root}/orgs/${target.slug}/types/incident.md`
              )
            ).toContain("Destination template")
            expect(ticket).toContain(
              `/api/attachments/${target.slug}/${attachment.id}`
            )
            expect(ticket).toContain(`assignees:\n  - ${ada}\n`)
          }).pipe(Effect.provide(layer()))
        })
      ).pipe(Effect.provide(BunServices.layer))
  )

  it.live(
    "leaves a failed import retryable when dispatching its workflow fails",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          root = yield* fs.makeTempDirectoryScoped({
            prefix: "pp-import-dispatch-"
          })
          yield* Effect.gen(function* () {
            yield* writeSource
            const imports = yield* ProjectImports.ProjectImports
            const uploaded = yield* imports
              .upload(yield* exported)
              .pipe(asImporter)
            const result = yield* Effect.exit(
              imports
                .run(uploaded.id, {
                  name: "Dispatch failure",
                  slug: "dispatch-failure",
                  key: decodeKey("DSP"),
                  people: []
                })
                .pipe(asImporter)
            )
            expect(result._tag).toBe("Failure")
            expect(
              (yield* imports.get(uploaded.id).pipe(asImporter)).status
            ).toBe("failed")
          }).pipe(
            Effect.provide(
              layer(
                Layer.mock(WorkflowEngine.WorkflowEngine, {
                  register: () => Effect.void,
                  execute: () => Effect.die("workflow dispatch failed")
                })
              )
            )
          )
        })
      ).pipe(Effect.provide(BunServices.layer))
  )

  it.live("removes staged objects when an upload is interrupted", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        root = yield* fs.makeTempDirectoryScoped({ prefix: "pp-import-abort-" })
        yield* Effect.gen(function* () {
          yield* writeSource
          const imports = yield* ProjectImports.ProjectImports
          const before = new Set(objects.keys())
          const upload = yield* Effect.forkScoped(
            imports
              .upload(Stream.concat(yield* exported, Stream.never))
              .pipe(asImporter)
          )
          const staged = yield* Effect.sync(() =>
            [...objects.keys()].filter((key) => !before.has(key))
          ).pipe(
            Effect.repeat({
              while: (keys) => keys.length === 0,
              schedule: Schedule.spaced("20 millis")
            }),
            Effect.timeout("2 seconds")
          )
          yield* Fiber.interrupt(upload)
          expect(staged.some((key) => objects.has(key))).toBe(false)
        }).pipe(Effect.provide(layer()))
      })
    ).pipe(Effect.provide(BunServices.layer))
  )

  it.live("deletes uploaded files when an import is cancelled", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        root = yield* fs.makeTempDirectoryScoped({ prefix: "pp-import-" })
        yield* Effect.gen(function* () {
          yield* writeSource
          const imports = yield* ProjectImports.ProjectImports
          const before = new Set(objects.keys())
          const uploaded = yield* imports
            .upload(yield* exported)
            .pipe(asImporter)
          const staged = [...objects.keys()].filter((key) => !before.has(key))
          expect(staged).toHaveLength(1)
          const cancelled = yield* imports.cancel(uploaded.id).pipe(asImporter)
          expect(cancelled.status).toBe("cancelled")
          expect(staged.filter((key) => objects.has(key))).toEqual([])
        }).pipe(Effect.provide(layer()))
      }).pipe(Effect.provide(BunServices.layer))
    )
  )

  it.live("refuses a key already claimed in the destination organization", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        root = yield* fs.makeTempDirectoryScoped({ prefix: "pp-import-key-" })
        yield* Effect.gen(function* () {
          yield* writeSource
          const imports = yield* ProjectImports.ProjectImports
          const projectId = randomUUID()
          yield* Effect.promise(async () => {
            await pool.query(
              "INSERT INTO project_index (id, organization_id, slug, key, name, icon, color, created_by) VALUES ($1, $2, 'taken', 'TAK', 'Taken', 'folder', '#000000', $3)",
              [projectId, target.id, importer]
            )
            await pool.query(
              "INSERT INTO project_key (organization_id, key, project_id, current) VALUES ($1, 'TAK', $2, true)",
              [target.id, projectId]
            )
          })
          const uploaded = yield* imports
            .upload(yield* exported)
            .pipe(asImporter)
          const error = yield* Effect.flip(
            imports
              .run(uploaded.id, {
                name: "Copy",
                slug: "copy",
                key: decodeKey("TAK"),
                people: []
              })
              .pipe(asImporter)
          )
          expect(error).toMatchObject({
            _tag: "Conflict",
            reason: "project_key_taken"
          })
          expect(
            (yield* imports.get(uploaded.id).pipe(asImporter)).status
          ).toBe("ready")
          yield* imports.cancel(uploaded.id).pipe(asImporter)
        }).pipe(Effect.provide(layer()))
      })
    ).pipe(Effect.provide(BunServices.layer))
  )

  it.live("expires abandoned uploads without deleting active imports", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        root = yield* fs.makeTempDirectoryScoped({
          prefix: "pp-import-expire-"
        })
        yield* Effect.gen(function* () {
          yield* writeSource
          const imports = yield* ProjectImports.ProjectImports
          const uploaded = yield* imports
            .upload(yield* exported)
            .pipe(asImporter)
          const staged = [...objects.keys()].filter((key) =>
            key.includes(uploaded.id)
          )
          expect(staged).toHaveLength(1)
          const active = `active-${suffix}`
          yield* Effect.promise(async () => {
            await pool.query(
              "UPDATE project_import SET retained_until = now() - interval '1 day' WHERE id = $1",
              [uploaded.id]
            )
            await pool.query(
              "INSERT INTO project_import (id, organization_id, created_by, status, retained_until) VALUES ($1, $2, $3, 'importing', now() - interval '1 day')",
              [active, target.id, importer]
            )
          })
          yield* imports.expire()
          expect(
            yield* Effect.flip(imports.get(uploaded.id).pipe(asImporter))
          ).toMatchObject({ _tag: "NotFound" })
          expect(staged.some((key) => objects.has(key))).toBe(false)
          expect((yield* imports.get(active).pipe(asImporter)).status).toBe(
            "importing"
          )
        }).pipe(Effect.provide(layer()))
      })
    ).pipe(Effect.provide(BunServices.layer))
  )

  it.live(
    "marks an import failed and leaves no project behind when a step keeps failing",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          root = yield* fs.makeTempDirectoryScoped({ prefix: "pp-import-" })
          yield* Effect.gen(function* () {
            yield* writeSource
            const imports = yield* ProjectImports.ProjectImports
            const uploaded = yield* imports
              .upload(yield* exported)
              .pipe(asImporter)
            yield* fs.makeDirectory(`${root}/orgs/${target.slug}/projects`, {
              recursive: true
            })
            yield* fs.writeFileString(
              `${root}/orgs/${target.slug}/projects/broken`,
              "not a directory"
            )
            yield* imports
              .run(uploaded.id, {
                name: "Broken",
                slug: "broken",
                key: decodeKey("BRK"),
                people: []
              })
              .pipe(asImporter)
            const finished = yield* imports.get(uploaded.id).pipe(
              asImporter,
              Effect.repeat({
                while: (current) => current.status === "importing",
                schedule: Schedule.spaced("20 millis")
              }),
              Effect.timeout("10 seconds")
            )
            expect(finished.status).toBe("failed")
            yield* Effect.exit(
              ProjectImports.ProjectImportWorkflow.execute({
                importId: uploaded.id,
                attempt: 1
              })
            )
            const rows = yield* Effect.promise(() =>
              pool.query(
                "SELECT id FROM project_index WHERE organization_id = $1 AND slug = 'broken'",
                [target.id]
              )
            )
            expect(rows.rows).toEqual([])
          }).pipe(Effect.provide(layer()))
        })
      ).pipe(Effect.provide(BunServices.layer))
  )

  it.live.each(["fail", "cancel", "expire"] as const)(
    "%s leaves another project's folder intact when the destination id is absent",
    (operation) =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          root = yield* fs.makeTempDirectoryScoped({
            prefix: "pp-import-owner-"
          })
          yield* Effect.gen(function* () {
            const imports = yield* ProjectImports.ProjectImports
            const importId = randomUUID()
            const slug = `reused-${operation}`
            const dir = `${root}/orgs/${target.slug}/projects/${slug}`
            yield* fs.makeDirectory(dir, { recursive: true })
            yield* fs.writeFileString(`${dir}/project.md`, "Live project")
            yield* Effect.promise(async () => {
              await pool.query(
                "INSERT INTO project_index (id, organization_id, slug, key, name, icon, color, created_by) VALUES ($1, $2, $3, $4, 'Reused', 'folder', '#000000', $5)",
                [
                  randomUUID(),
                  target.id,
                  slug,
                  `R${operation.toUpperCase()}`,
                  importer
                ]
              )
              await pool.query(
                "INSERT INTO project_import (id, organization_id, created_by, status, attempt, destination_project_id, destination_project_slug, retained_until) VALUES ($1, $2, $3, $4, 1, $5, $6, now() - interval '1 day')",
                [
                  importId,
                  target.id,
                  importer,
                  operation === "fail" ? "importing" : "failed",
                  randomUUID(),
                  slug
                ]
              )
            })
            if (operation === "fail") yield* imports.steps.fail(importId, 1)
            else if (operation === "cancel")
              yield* imports.cancel(importId).pipe(asImporter)
            else yield* imports.expire()
            expect(yield* fs.readFileString(`${dir}/project.md`)).toBe(
              "Live project"
            )
          }).pipe(Effect.provide(layer()))
        })
      ).pipe(Effect.provide(BunServices.layer))
  )

  it.live(
    "rejects repeated file paths even when they span document batches",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          root = yield* fs.makeTempDirectoryScoped({
            prefix: "pp-import-duplicate-"
          })
          yield* Effect.gen(function* () {
            yield* writeSource
            const imports = yield* ProjectImports.ProjectImports
            const uploaded = yield* imports
              .upload(yield* exported)
              .pipe(asImporter)
            const {
              rows: [row]
            } = yield* Effect.promise(() =>
              pool.query<{ manifest: string }>(
                "SELECT manifest::text AS manifest FROM project_import WHERE id = $1",
                [uploaded.id]
              )
            )
            yield* imports.cancel(uploaded.id).pipe(asImporter)
            const encoder = new TextEncoder()
            const repeated = {
              name: "project/project.md",
              bytes: encoder.encode("Source project")
            }
            const archive = tarGz(
              Stream.fromIterable([
                {
                  name: "manifest.json",
                  bytes: encoder.encode(row.manifest)
                },
                repeated,
                ...Array.from({ length: 50 }, (_, i) => ({
                  name: `project/notes/${i}.md`,
                  bytes: encoder.encode(`Note ${i}`)
                })),
                repeated
              ])
            )
            const error = yield* Effect.flip(
              imports.upload(archive).pipe(asImporter)
            )
            expect(error).toMatchObject({
              _tag: "Validation",
              reason: "unexpected_entry"
            })
          }).pipe(Effect.provide(layer()))
        })
      ).pipe(Effect.provide(BunServices.layer))
  )

  it.live(
    "refuses a file from a newer export format, naming both versions",
    () =>
      Effect.gen(function* () {
        const imports = yield* ProjectImports.ProjectImports
        const archive = tarGz(
          Stream.make({
            name: "manifest.json",
            bytes: new TextEncoder().encode('{"formatVersion":99}')
          })
        )
        const error = yield* Effect.flip(
          imports.upload(archive).pipe(asImporter)
        )
        expect(error).toMatchObject({
          _tag: "ImportFormatUnsupported",
          fileVersion: 99,
          supportedVersion: 1
        })
      }).pipe(Effect.provide(layer()))
  )
})
