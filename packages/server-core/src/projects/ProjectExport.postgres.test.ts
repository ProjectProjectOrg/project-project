// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import {
  EMPTY_LAYER,
  ProjectExportManifestJson,
  ProjectScope
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as ByteSize from "effect/ByteSize"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { unpackTar } from "modern-tar"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { projectScope } from "../access/testing"
import * as LibraryDocs from "../library/LibraryDocs"
import * as Markdown from "../markdown/Markdown"
import * as OrgStorage from "../storage/OrgStorage"
import * as S3Storage from "../storage/S3Storage"
import * as ProjectExport from "./ProjectExport"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

const decodeManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(ProjectExportManifestJson)
)

const fileInfo = (type: FileSystem.File.Type): FileSystem.File.Info => ({
  type,
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 0n,
  ino: Option.none(),
  mode: 0o644,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  // @effect-diagnostics-next-line unstableApiUsage:off
  size: ByteSize.bytes(0),
  blksize: Option.none(),
  blocks: Option.none()
})

describe.skipIf(!databaseUrl)("ProjectExport", () => {
  const organizationId = randomUUID()
  const projectId = randomUUID()
  const orgSlug = `export-${organizationId.slice(0, 8)}`
  const pmId = `pm-${organizationId}`
  const mentionedId = `mentioned-${organizationId}`
  const storedId = "01K00000000000000000000001"
  const missingId = "01K00000000000000000000002"
  const encoder = new TextEncoder()
  const ticket = [
    "---",
    "id: EXP-1",
    `createdBy: ${pmId}`,
    "---",
    "",
    `Ask [Mo](mention:user/${mentionedId}).`
  ].join("\n")
  const files = new Map([
    ["/projects/export/project.md", "---\nslug: export\n---\n"],
    ["/projects/export/tickets/EXP-1.md", ticket]
  ])
  const directories = new Set(["/projects/export/tickets"])
  let pool: Pool
  let layer: Layer.Layer<ProjectExport.ProjectExport>

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
      "INSERT INTO organization (id, name, slug, created_at) VALUES ($1, $1, $2, now())",
      [organizationId, orgSlug]
    )
    await pool.query(
      "INSERT INTO \"user\" (id, name, email) VALUES ($1, 'Pam', $3), ($2, 'Mo', $4)",
      [pmId, mentionedId, `${pmId}@example.com`, `${mentionedId}@example.com`]
    )
    await pool.query(
      "INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, 'member', now())",
      [randomUUID(), organizationId, pmId]
    )
    await pool.query(
      "INSERT INTO project_index (id, slug, organization_id, key, name, icon, color, created_by, next_ticket_number) VALUES ($1, 'export', $2, 'EXP', 'Export', 'x', '#000000', $3, 2)",
      [projectId, organizationId, pmId]
    )
    await pool.query(
      "INSERT INTO project_member (project_id, organization_id, user_id, role_id) VALUES ($1, $2, $3, 'pm')",
      [projectId, organizationId, pmId]
    )
    for (const id of [storedId, missingId]) {
      await pool.query(
        "INSERT INTO attachment_index (id, organization_id, org_slug, project_id, object_key, filename, content_type, byte_size, status, uploaded_by) VALUES ($1, $2, $3, $4, $1, 'f.png', 'image/png', 5, 'live', $5)",
        [id, organizationId, orgSlug, projectId, pmId]
      )
    }
    await pool.query(
      "INSERT INTO attachment_reference (attachment_id, project_id, ticket_id) VALUES ($1, $2, 'EXP-1')",
      [storedId, projectId]
    )
    await pool.query(
      "INSERT INTO project_image_reference (project_id, attachment_id, slot) VALUES ($1, $2, 'banner')",
      [projectId, missingId]
    )

    const connection: S3Storage.S3Connection = {
      endpoint: "https://s3.example.com",
      bucket: "bucket",
      region: "auto",
      keyPrefix: null,
      forcePathStyle: true,
      accessKeyId: "key",
      secretAccessKey: "secret"
    }
    const objects = new Map([[storedId, encoder.encode("bytes")]])

    layer = ProjectExport.layer.pipe(
      Layer.provide(
        Layer.mock(LibraryDocs.LibraryDocs, {
          readLayer: () => Effect.succeed(EMPTY_LAYER)
        })
      ),
      Layer.provide(
        DbLive.pipe(
          Layer.provideMerge(
            PgClient.layer({
              url: Redacted.make(databaseUrl),
              maxConnections: 1
            })
          )
        )
      ),
      Layer.provide(
        Layer.mock(Markdown.Markdown, {
          root: "/projects",
          projectDir: () => "/projects/export",
          libraryDir: () => "/projects/library"
        })
      ),
      Layer.provide(
        Layer.mock(OrgStorage.OrgStorage, {
          requireConnection: () => Effect.succeed(connection)
        })
      ),
      Layer.provide(
        Layer.mock(S3Storage.S3Storage, {
          headObject: (_, key) =>
            Effect.succeed(
              objects.has(key)
                ? { byteSize: 5, contentType: null, contentHash: null }
                : null
            ),
          getObject: (_, key) => Effect.succeed(objects.get(key) ?? null)
        })
      ),
      Layer.provide(
        FileSystem.layerNoop({
          readDirectory: () =>
            Effect.succeed(["project.md", "tickets", "tickets/EXP-1.md"]),
          stat: (path) =>
            Effect.succeed(
              fileInfo(directories.has(path) ? "Directory" : "File")
            ),
          readFile: (path) =>
            Effect.succeed(encoder.encode(files.get(path) ?? ""))
        })
      ),
      Layer.provide(Path.layer),
      Layer.orDie
    )
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM organization WHERE id = $1", [
        organizationId
      ])
      await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [
        [pmId, mentionedId]
      ])
      await pool.end()
    }
  })

  it.effect(
    "archives the manifest, markdown and stored bytes, and marks objects storage lost as missing",
    () =>
      Effect.gen(function* () {
        const projectExport = yield* ProjectExport.ProjectExport
        const { filename, stream } = yield* projectExport.archive().pipe(
          Effect.provideService(
            ProjectScope,
            projectScope("member", "pm", {
              userId: pmId,
              organizationId,
              orgSlug,
              projectId,
              slug: "export"
            })
          )
        )

        const entries = yield* Effect.promise(() =>
          unpackTar(
            Stream.toReadableStream(stream).pipeThrough(
              new DecompressionStream("gzip")
            )
          )
        )
        const text = (name: string) =>
          new TextDecoder().decode(
            entries.find((entry) => entry.header.name === name)?.data
          )
        const manifest = decodeManifest(text("manifest.json"))

        expect(filename).toMatch(/^export-\d{4}-\d{2}-\d{2}\.tar\.gz$/)
        expect(entries.map((entry) => entry.header.name)).toEqual([
          "manifest.json",
          "project/project.md",
          "project/tickets/EXP-1.md",
          `attachments/${storedId}`
        ])
        expect(text("project/tickets/EXP-1.md")).toBe(ticket)
        expect(text(`attachments/${storedId}`)).toBe("bytes")
        expect(manifest.project).toMatchObject({
          key: "EXP",
          nextTicketNumber: 2
        })
        expect(manifest.members).toMatchObject([{ userId: pmId, role: "pm" }])
        expect(manifest.people.map((person) => person.id).toSorted()).toEqual(
          [mentionedId, pmId].toSorted()
        )
        expect(
          manifest.attachments.map(
            ({ id, references, imageSlots, missing }) => ({
              id,
              references,
              imageSlots,
              missing
            })
          )
        ).toEqual([
          {
            id: storedId,
            references: ["EXP-1"],
            imageSlots: [],
            missing: false
          },
          {
            id: missingId,
            references: [],
            imageSlots: ["banner"],
            missing: true
          }
        ])
      }).pipe(Effect.provide(layer))
  )
})
