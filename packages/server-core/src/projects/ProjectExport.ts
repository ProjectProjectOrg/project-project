import { Db } from "@pp/db"
import {
  attachmentIndex,
  attachmentReference,
  commentIndex,
  projectGitAutomation,
  projectImageReference,
  projectIndex,
  projectIntegrationLink,
  projectMember,
  projectStatus,
  projectTag,
  ticketActivity,
  user
} from "@pp/db/schema"
import {
  NotFound,
  resolveLibrary,
  blockLookupFor,
  expandTypeKeepingHints,
  resolveSyncedBlocks,
  PROJECT_EXPORT_ATTACHMENTS_DIR,
  PROJECT_EXPORT_FORMAT_VERSION,
  PROJECT_EXPORT_MANIFEST_PATH,
  PROJECT_EXPORT_MARKDOWN_DIR,
  ProjectExportManifestJson,
  ProjectScope,
  Role,
  StorageError,
  type ProjectExportManifest
} from "@pp/shared"
import { and, asc, eq, inArray } from "drizzle-orm"
import * as Arr from "effect/Array"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import * as LibraryDocs from "../library/LibraryDocs"
import { markdownFileContent } from "../markdown/fileContent"
import * as Markdown from "../markdown/Markdown"
import * as OrgStorage from "../storage/OrgStorage"
import * as S3Storage from "../storage/S3Storage"
import { markdownUserIds } from "./exportPeople"
import { tarGz, type TarEntry, type TarGzError } from "./tarGz"

const makeRole = Schema.decodeUnknownSync(Role)
const encodeManifest = Schema.encodeEffect(
  Schema.fromJsonString(ProjectExportManifestJson)
)
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const markdownError = (cause: unknown) =>
  new Markdown.MarkdownError({ cause, message: "could not read project" })

type StoredAttachment = Readonly<{
  id: string
  objectKey: string
  missing: boolean
}>

export type ProjectArchive = Readonly<{
  filename: string
  stream: Stream.Stream<Uint8Array, TarGzError>
}>

export class ProjectExport extends Context.Service<
  ProjectExport,
  Readonly<{
    archive: () => Effect.Effect<
      ProjectArchive,
      NotFound | StorageError | Markdown.MarkdownError,
      ProjectScope
    >
  }>
>()("@pp/server-core/projects/ProjectExport") {}

const unique = <A>(values: Iterable<A>): ReadonlyArray<A> => [
  ...new Set(values)
]

const make = Effect.gen(function* () {
  const db = yield* Db
  const markdown = yield* Markdown.Markdown
  const libraryDocs = yield* LibraryDocs.LibraryDocs
  const orgStorage = yield* OrgStorage.OrgStorage
  const s3 = yield* S3Storage.S3Storage
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  const readMarkdownFiles = Effect.fn("ProjectExport.readMarkdownFiles")(
    function* (dir: string) {
      const names = yield* fs.readDirectory(dir, { recursive: true })
      const files = yield* Effect.forEach(
        names.toSorted(),
        (name) =>
          Effect.gen(function* () {
            const full = path.join(dir, name)
            const info = yield* fs.stat(full)
            if (info.type !== "File") return []
            const bytes = yield* fs.readFile(full)
            return [{ path: name.split(path.sep).join("/"), bytes }]
          }),
        { concurrency: 16 }
      )
      return files.flat()
    },
    Effect.mapError(markdownError)
  )

  const loadRows = Effect.fn("ProjectExport.loadRows")(function* (
    projectId: string
  ) {
    const [project] = yield* db
      .select()
      .from(projectIndex)
      .where(eq(projectIndex.id, projectId))
      .pipe(Effect.orDie)
    if (project === undefined) return yield* new NotFound()
    return yield* Effect.all(
      {
        project: Effect.succeed(project),
        statuses: db
          .select()
          .from(projectStatus)
          .where(eq(projectStatus.projectId, projectId))
          .orderBy(asc(projectStatus.orderKey)),
        tags: db
          .select()
          .from(projectTag)
          .where(eq(projectTag.projectId, projectId))
          .orderBy(asc(projectTag.name)),
        gitAutomation: db
          .select()
          .from(projectGitAutomation)
          .where(eq(projectGitAutomation.projectId, projectId)),
        members: db
          .select()
          .from(projectMember)
          .where(eq(projectMember.projectId, projectId)),
        activity: db
          .select()
          .from(ticketActivity)
          .where(eq(ticketActivity.projectId, projectId))
          .orderBy(asc(ticketActivity.seq)),
        comments: db
          .select()
          .from(commentIndex)
          .where(eq(commentIndex.projectId, projectId))
          .orderBy(asc(commentIndex.createdAt)),
        references: db
          .select()
          .from(attachmentReference)
          .where(eq(attachmentReference.projectId, projectId)),
        imageSlots: db
          .select()
          .from(projectImageReference)
          .where(eq(projectImageReference.projectId, projectId)),
        integrations: db
          .select({ provider: projectIntegrationLink.provider })
          .from(projectIntegrationLink)
          .where(
            and(
              eq(projectIntegrationLink.projectId, projectId),
              eq(projectIntegrationLink.status, "active")
            )
          )
      },
      { concurrency: "unbounded" }
    ).pipe(Effect.orDie)
  })

  const loadAttachmentRows = (ids: ReadonlyArray<string>) =>
    ids.length === 0
      ? Effect.succeed([])
      : db
          .select()
          .from(attachmentIndex)
          .where(inArray(attachmentIndex.id, [...ids]))
          .orderBy(asc(attachmentIndex.id))
          .pipe(Effect.orDie)

  const loadPeople = (ids: ReadonlyArray<string>) =>
    ids.length === 0
      ? Effect.succeed([])
      : db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            username: user.username,
            image: user.image
          })
          .from(user)
          .where(inArray(user.id, [...ids]))
          .orderBy(asc(user.id))
          .pipe(Effect.orDie)

  const locateAttachments = Effect.fn("ProjectExport.locateAttachments")(
    function* (
      orgSlug: string,
      rows: ReadonlyArray<typeof attachmentIndex.$inferSelect>
    ) {
      if (rows.length === 0) {
        return { connection: Option.none(), stored: [] }
      }
      const connection = yield* orgStorage
        .requireConnection(orgSlug)
        .pipe(Effect.option)
      const stored = yield* Effect.forEach(
        rows,
        (row) =>
          Option.match(connection, {
            onNone: () => Effect.succeed(true),
            onSome: (c) =>
              s3
                .headObject(c, row.objectKey)
                .pipe(Effect.map((head) => head === null))
          }).pipe(
            Effect.map(
              (missing): StoredAttachment => ({
                id: row.id,
                objectKey: row.objectKey,
                missing
              })
            )
          ),
        { concurrency: 8 }
      )
      return { connection, stored }
    },
    Effect.catchTag("S3Unavailable", (error) =>
      Effect.fail(new StorageError({ reason: error.reason }))
    )
  )

  const attachmentEntries = (
    connection: Option.Option<S3Storage.S3Connection>,
    stored: ReadonlyArray<StoredAttachment>
  ) =>
    Option.match(connection, {
      onNone: () => Stream.empty,
      onSome: (c) => storedAttachmentEntries(c, stored)
    })

  const storedAttachmentEntries = (
    connection: S3Storage.S3Connection,
    stored: ReadonlyArray<StoredAttachment>
  ) =>
    Stream.fromIterable(stored.filter((a) => !a.missing)).pipe(
      Stream.mapEffect((attachment) =>
        s3.getObject(connection, attachment.objectKey).pipe(
          Effect.flatMap((bytes) =>
            bytes === null
              ? Effect.fail(
                  new StorageError({ reason: "attachment_disappeared" })
                )
              : Effect.succeed({
                  name: `${PROJECT_EXPORT_ATTACHMENTS_DIR}/${attachment.id}`,
                  bytes
                })
          )
        )
      )
    )

  const archive = Effect.fn("ProjectExport.archive")(function* () {
    const { orgSlug, slug, projectId } = yield* ProjectScope
    const rows = yield* loadRows(projectId)
    const files = yield* readMarkdownFiles(markdown.projectDir(orgSlug, slug))
    const library = resolveLibrary(
      {
        org: yield* libraryDocs.readLayer(orgSlug, null),
        project: yield* libraryDocs.readLayer(orgSlug, slug)
      },
      false
    )
    const typeFiles = library.types
      .filter((type) => type.origin !== "builtin" && !type.hidden)
      .map(({ key, name, icon, color, description, priority, tags, body }) => ({
        path: `types/${key}.md`,
        bytes: textEncoder.encode(
          markdownFileContent(
            { name, icon, color, description, priority, tags },
            resolveSyncedBlocks(
              expandTypeKeepingHints({ body }, blockLookupFor(library)),
              () => undefined
            )
          )
        )
      }))
    const typePaths = new Set(typeFiles.map((file) => file.path))
    const portableFiles = [
      ...files.filter((file) => !typePaths.has(file.path)),
      ...typeFiles
    ].toSorted((a, b) => a.path.localeCompare(b.path))

    const referencesByAttachment = Arr.groupBy(
      rows.references,
      (r) => r.attachmentId
    )
    const slotsByAttachment = Arr.groupBy(
      rows.imageSlots,
      (r) => r.attachmentId
    )
    const attachmentRows = yield* loadAttachmentRows(
      unique([
        ...Object.keys(referencesByAttachment),
        ...Object.keys(slotsByAttachment)
      ])
    )
    const { connection, stored } = yield* locateAttachments(
      orgSlug,
      attachmentRows
    )
    const missing = new Set(stored.filter((a) => a.missing).map((a) => a.id))

    const people = yield* loadPeople(
      unique([
        rows.project.createdBy,
        ...rows.statuses.map((s) => s.createdBy),
        ...rows.tags.map((t) => t.createdBy),
        ...rows.members.map((m) => m.userId),
        ...rows.activity.flatMap((a) => [
          ...(a.actorUserId === null ? [] : [a.actorUserId]),
          ...(a.change.kind === "assignees_changed"
            ? [...a.change.added, ...a.change.removed]
            : [])
        ]),
        ...rows.comments.flatMap((c) =>
          c.authorId === null ? [] : [c.authorId]
        ),
        ...attachmentRows.map((a) => a.uploadedBy),
        ...files
          .filter((f) => f.path.endsWith(".md"))
          .flatMap((f) => markdownUserIds(textDecoder.decode(f.bytes)))
      ])
    )

    const now = yield* DateTime.nowAsDate
    const sourceUrl = yield* Config.String("BETTER_AUTH_URL").pipe(
      Config.option,
      Effect.orElseSucceed(() => Option.none<string>())
    )
    const appVersion = yield* Config.String("APP_VERSION").pipe(
      Config.option,
      Effect.orElseSucceed(() => Option.none<string>())
    )

    const manifest: ProjectExportManifest = {
      formatVersion: PROJECT_EXPORT_FORMAT_VERSION,
      exportedAt: now,
      source: {
        url: Option.getOrNull(sourceUrl),
        appVersion: Option.getOrNull(appVersion)
      },
      project: {
        slug: rows.project.slug,
        key: rows.project.key,
        name: rows.project.name,
        icon: rows.project.icon,
        color: rows.project.color,
        banner: rows.project.banner,
        iconImage: rows.project.iconImage,
        estimation: rows.project.estimation,
        nextTicketNumber: rows.project.nextTicketNumber,
        gitAutomationForwardOnly: rows.project.gitAutomationForwardOnly,
        createdBy: rows.project.createdBy,
        createdAt: rows.project.createdAt
      },
      statuses: rows.statuses.map(({ projectId: _, ...status }) => status),
      tags: rows.tags.map(({ projectId: _, ...tag }) => tag),
      gitAutomation: rows.gitAutomation.map(({ event, statusSlug }) => ({
        event,
        statusSlug
      })),
      members: rows.members.map((m) => ({
        userId: m.userId,
        role: makeRole(m.roleId),
        createdAt: m.createdAt
      })),
      activity: rows.activity.map(
        ({ projectId: _, seq: __, ...activity }) => activity
      ),
      comments: rows.comments.map(({ projectId: _, ...comment }) => comment),
      attachments: attachmentRows.map((a) => ({
        id: a.id,
        filename: a.filename,
        contentType: a.contentType,
        byteSize: a.byteSize,
        contentHash: a.contentHash,
        uploadedBy: a.uploadedBy,
        createdAt: a.createdAt,
        references: unique(
          (referencesByAttachment[a.id] ?? []).map((r) => r.ticketId)
        ),
        imageSlots: (slotsByAttachment[a.id] ?? []).map((r) => r.slot),
        missing: missing.has(a.id)
      })),
      people,
      integrations: unique(rows.integrations.map((i) => i.provider))
    }
    const manifestJson = yield* encodeManifest(manifest).pipe(Effect.orDie)

    const entries = Stream.concat(
      Stream.fromIterable<TarEntry>([
        {
          name: PROJECT_EXPORT_MANIFEST_PATH,
          bytes: textEncoder.encode(manifestJson)
        },
        ...portableFiles.map(
          (file): TarEntry => ({
            name: `${PROJECT_EXPORT_MARKDOWN_DIR}/${file.path}`,
            bytes: file.bytes
          })
        )
      ]),
      attachmentEntries(connection, stored)
    )

    return {
      filename: `${slug}-${DateTime.formatIsoDateUtc(DateTime.fromDateUnsafe(now))}.tar.gz`,
      stream: tarGz(entries)
    }
  })

  return ProjectExport.of({ archive })
})

export const layer = Layer.effect(ProjectExport, make)
