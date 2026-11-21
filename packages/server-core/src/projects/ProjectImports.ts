// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import { Db } from "@pp/db"
import {
  attachmentIndex,
  member,
  organization,
  projectImageReference,
  projectImport,
  projectImportReference,
  projectIndex,
  projectKey,
  user,
  type ProjectImportAttachment,
  type ProjectImportConfiguration,
  type ProjectImportFile
} from "@pp/db/schema"
import {
  ATTACHMENT_MAX_BYTES,
  resolveLibrary,
  AttachmentId,
  ImportFormatUnsupported,
  NotFound,
  OrgScope,
  PROJECT_EXPORT_ATTACHMENTS_DIR,
  PROJECT_EXPORT_FORMAT_VERSION,
  PROJECT_EXPORT_MANIFEST_PATH,
  PROJECT_EXPORT_MARKDOWN_DIR,
  PROJECT_IMPORT_MAX_BYTES,
  ProjectExportManifestJson,
  ProjectKey,
  StorageError,
  StorageNotConnected,
  type ProjectExportManifest,
  type ProjectImport,
  type RunProjectImportInput,
  ProjectIdentifierTaken,
  ProjectImportInvalid,
  type ProjectImportInvalidKind,
  ProjectImportStateConflict
} from "@pp/shared"
import {
  and,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  lte,
  sql
} from "drizzle-orm"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { Activity, Workflow, WorkflowEngine } from "effect/workflow"
import { createTarDecoder } from "modern-tar"
import { ulid } from "ulid"

import * as LibraryDocs from "../library/LibraryDocs"
import { parseMarkdownFile, markdownFileContent } from "../markdown/fileContent"
import type * as Markdown from "../markdown/Markdown"
import * as OrgStorage from "../storage/OrgStorage"
import * as S3Storage from "../storage/S3Storage"
import type * as TicketDocs from "../tickets/TicketDocs"
import type * as TicketIndex from "../tickets/TicketIndex"
import * as TicketIndexMaintenance from "../tickets/TicketIndexMaintenance"
import type * as Users from "../users/Users"
import * as HiddenProject from "./hiddenProject"
import {
  forEachImportReferenceBatch,
  insertImportReferences,
  pruneResolvedImportReferences
} from "./importReferences"
import {
  importedAuthorOf,
  renameTicketId,
  rewriteImportedChange,
  transformImportedFile,
  type ImportMapping
} from "./importTransform"
import { importedTypes, planImportedTypes } from "./importTypes"
import * as ProjectDocs from "./ProjectDocs"
import { referenceOrigin } from "./references"

const MANIFEST_MAX_BYTES = 64 * 1024 * 1024
const MARKDOWN_FILE_MAX_BYTES = 5 * 1024 * 1024
const MARKDOWN_TOTAL_MAX_BYTES = 256 * 1024 * 1024
const RETENTION_DAYS = 30
const DOCUMENT_BATCH_SIZE = 50
const SAFE_PATH = /^(?!.*\.\.)[A-Za-z0-9_-][A-Za-z0-9_./-]*$/

const decodeVersion = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ formatVersion: Schema.Int }))
)
const decodeManifest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ProjectExportManifestJson)
)
const decodeStoredManifest = Schema.decodeUnknownSync(ProjectExportManifestJson)
const encodeManifest = Schema.encodeSync(ProjectExportManifestJson)
const decodeFormerKeys = Schema.decodeUnknownOption(Schema.Array(ProjectKey))
const decodeAttachmentId = Schema.decodeSync(AttachmentId)

type ImportRow = typeof projectImport.$inferSelect

export class ProjectImportFailure extends Schema.TaggedError<ProjectImportFailure>()(
  "ProjectImportFailure",
  { reason: Schema.String }
) {}

export const ProjectImportWorkflow = Workflow.make(
  "ProjectProject/ProjectImport/v1",
  {
    payload: Schema.Struct({ importId: Schema.String, attempt: Schema.Int }),
    success: Schema.Void,
    error: ProjectImportFailure,
    idempotencyKey: ({ importId, attempt }) => `${importId}/${attempt}`
  }
)

type StepError = ProjectImportFailure

type UploadError =
  | ProjectImportInvalid
  | ImportFormatUnsupported
  | StorageNotConnected
  | StorageError

export class ProjectImports extends Context.Service<
  ProjectImports,
  Readonly<{
    upload: <E>(
      body: Stream.Stream<Uint8Array, E>
    ) => Effect.Effect<ProjectImport, UploadError, OrgScope>
    get: (id: string) => Effect.Effect<ProjectImport, NotFound, OrgScope>
    run: (
      id: string,
      input: RunProjectImportInput
    ) => Effect.Effect<
      ProjectImport,
      | NotFound
      | ProjectImportStateConflict
      | ProjectIdentifierTaken
      | ProjectImportInvalid
      | StorageNotConnected
      | StorageError,
      OrgScope
    >
    cancel: (
      id: string
    ) => Effect.Effect<
      ProjectImport,
      NotFound | ProjectImportStateConflict,
      OrgScope
    >
    expire: () => Effect.Effect<void>
    steps: Readonly<{
      ensureHidden: (
        id: string,
        attempt: number
      ) => Effect.Effect<void, StepError>
      documentBatches: (
        id: string,
        attempt: number
      ) => Effect.Effect<number, StepError>
      writeDocuments: (
        id: string,
        attempt: number,
        batch: number
      ) => Effect.Effect<void, StepError>
      recordAttachments: (
        id: string,
        attempt: number
      ) => Effect.Effect<void, StepError>
      index: (id: string, attempt: number) => Effect.Effect<void, StepError>
      stageReferenceCandidates: (
        id: string,
        attempt: number
      ) => Effect.Effect<void, StepError>
      publish: (id: string, attempt: number) => Effect.Effect<void, StepError>
      fail: (id: string, attempt: number) => Effect.Effect<void>
    }>
  }>
>()("@pp/server-core/projects/ProjectImports") {}

const invalid = (kind: ProjectImportInvalidKind) =>
  new ProjectImportInvalid({ kind })

const sha256 = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex")

const stableUuid = (seed: string) => {
  const hex = sha256(seed)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const importObjectKey = (
  keyPrefix: string | null,
  orgSlug: string,
  importId: string,
  attachmentId: string,
  filename: string
) => {
  const prefix = (keyPrefix ?? "").replace(/^\/+|\/+$/g, "")
  const tail = `orgs/${orgSlug}/imports/${importId}/${attachmentId}-${S3Storage.sanitizeFilename(filename)}`
  return prefix === "" ? tail : `${prefix}/${tail}`
}

const retentionFrom = (now: Date) =>
  DateTime.toDate(
    DateTime.add(DateTime.fromDateUnsafe(now), { days: RETENTION_DAYS })
  )

const make = Effect.gen(function* () {
  const db = yield* Db
  const libraryDocs = yield* LibraryDocs.LibraryDocs
  const orgStorage = yield* OrgStorage.OrgStorage
  const s3 = yield* S3Storage.S3Storage
  const projectDocs = yield* ProjectDocs.ProjectDocs
  const maintenance = yield* TicketIndexMaintenance.TicketIndexMaintenance
  const engine = yield* WorkflowEngine.WorkflowEngine
  const provided = yield* Effect.context<
    | Db
    | HiddenProjectRequirements
    | TicketDocs.TicketDocs
    | TicketIndex.TicketIndex
    | Users.Users
  >()

  const orgMembers = (organizationId: string) =>
    db
      .select({ id: user.id, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, organizationId))
      .pipe(Effect.orDie)

  const typePlan = (orgSlug: string, files: ReadonlyArray<ProjectImportFile>) =>
    libraryDocs.readLayer(orgSlug, null).pipe(
      Effect.map((org) =>
        planImportedTypes(
          importedTypes(files),
          resolveLibrary({ org, project: null }, false).types
        )
      ),
      Effect.orDie
    )

  const present = Effect.fn("ProjectImports.present")(function* (
    row: ImportRow
  ) {
    const manifest =
      row.manifest === null ? null : decodeStoredManifest(row.manifest)
    const members =
      manifest === null ? [] : yield* orgMembers(row.organizationId)
    const byEmail = new Map(
      members.map((m) => [m.email.toLowerCase(), m.id] as const)
    )
    const files = row.files ?? []
    return {
      id: row.id,
      status: row.status,
      source:
        manifest === null
          ? null
          : {
              url: manifest.source.url,
              name: manifest.project.name,
              key: manifest.project.key,
              slug: manifest.project.slug
            },
      counts: {
        tickets: files.filter((f) => f.path.startsWith("tickets/")).length,
        groups: files.filter((f) => f.path.startsWith("groups/")).length,
        attachments: manifest?.attachments.length ?? 0,
        missingAttachments:
          manifest === null
            ? 0
            : manifest.attachments.length - (row.attachments ?? []).length,
        activity: manifest?.activity.length ?? 0
      },
      people: (manifest?.people ?? []).map((person) => ({
        id: person.id,
        name: person.name,
        email: person.email,
        image: person.image,
        suggestedUserId: byEmail.get(person.email.toLowerCase()) ?? null
      })),
      integrations: manifest?.integrations ?? [],
      types:
        row.configuration?.types ??
        (yield* typePlan((yield* OrgScope).orgSlug, files)),
      destination:
        row.status === "succeeded" && row.destinationProjectSlug !== null
          ? { slug: row.destinationProjectSlug }
          : null,
      failureReason: row.failureReason
    } satisfies ProjectImport
  })

  const ownRow = Effect.fn("ProjectImports.ownRow")(function* (id: string) {
    const scope = yield* OrgScope
    const [row] = yield* db
      .select()
      .from(projectImport)
      .where(
        and(
          eq(projectImport.id, id),
          eq(projectImport.organizationId, scope.organizationId),
          eq(projectImport.createdBy, scope.userId)
        )
      )
      .pipe(Effect.orDie)
    if (!row) return yield* new NotFound()
    return row
  })

  const deleteObjects = (
    orgSlug: string,
    attachments: ReadonlyArray<ProjectImportAttachment>
  ) =>
    attachments.length === 0
      ? Effect.void
      : orgStorage.requireConnection(orgSlug).pipe(
          Effect.flatMap((connection) =>
            Effect.forEach(
              attachments,
              (attachment) => s3.deleteObject(connection, attachment.objectKey),
              { concurrency: 4, discard: true }
            )
          ),
          Effect.catchCause((cause) =>
            Effect.logWarning("project import object cleanup failed", cause)
          )
        )

  const removeDestination = (orgSlug: string, row: ImportRow) =>
    db
      .transaction((tx) =>
        Effect.gen(function* () {
          if (
            row.destinationProjectId === null ||
            row.destinationProjectSlug === null
          )
            return
          const [owned] = yield* tx
            .select({ id: projectIndex.id })
            .from(projectIndex)
            .where(
              and(
                eq(projectIndex.id, row.destinationProjectId),
                eq(projectIndex.organizationId, row.organizationId),
                eq(projectIndex.slug, row.destinationProjectSlug),
                sql`${projectIndex.publishedAt} is null`
              )
            )
            .for("update")
          if (!owned) return
          yield* tx
            .delete(attachmentIndex)
            .where(
              and(
                eq(attachmentIndex.projectId, owned.id),
                eq(attachmentIndex.organizationId, row.organizationId),
                eq(attachmentIndex.status, "pending")
              )
            )
          yield* projectDocs.removeDir(orgSlug, row.destinationProjectSlug)
          yield* tx.delete(projectIndex).where(eq(projectIndex.id, owned.id))
        })
      )
      .pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("project import destination cleanup failed", cause)
        )
      )

  const upload = Effect.fn("ProjectImports.upload")(function* <E>(
    body: Stream.Stream<Uint8Array, E>
  ) {
    const scope = yield* OrgScope
    const id = ulid()
    const now = yield* DateTime.nowAsDate
    yield* db
      .insert(projectImport)
      .values({
        id,
        organizationId: scope.organizationId,
        createdBy: scope.userId,
        status: "uploading",
        createdAt: now,
        updatedAt: now,
        retainedUntil: retentionFrom(now)
      })
      .pipe(Effect.orDie)

    let received = 0
    let markdownBytes = 0
    let manifest: ProjectExportManifest | null = null
    let connection: S3Storage.S3Connection | null = null
    const files: Array<ProjectImportFile> = []
    const staged: Array<ProjectImportAttachment> = []
    const entryNames = new Set<string>()

    const limited = body.pipe(
      Stream.mapError(() => invalid("upload_interrupted")),
      Stream.mapEffect((chunk) => {
        received += chunk.byteLength
        return received > PROJECT_IMPORT_MAX_BYTES
          ? Effect.fail(invalid("archive_too_large"))
          : Effect.succeed(chunk)
      })
    )
    const entries = Stream.fromReadableStream({
      evaluate: () =>
        Stream.toReadableStream(limited)
          .pipeThrough(new DecompressionStream("gzip"))
          .pipeThrough(createTarDecoder()),
      onError: () => invalid("invalid_archive")
    })

    const readEntry = (
      entryBody: ReadableStream<Uint8Array>,
      size: number,
      max: number
    ) =>
      size > max
        ? Effect.promise(() => entryBody.cancel()).pipe(
            Effect.andThen(Effect.fail(invalid("entry_too_large")))
          )
        : Effect.tryPromise({
            try: () => new Response(entryBody).bytes(),
            catch: () => invalid("invalid_archive")
          })

    const handleEntry = Effect.fnUntraced(function* (entry: {
      header: { name: string; size: number; type?: string }
      body: ReadableStream<Uint8Array>
    }) {
      const name = entry.header.name.replace(/^\.\//, "")
      if (entry.header.type !== undefined && entry.header.type !== "file") {
        yield* Effect.promise(() => entry.body.cancel())
        return
      }
      if (entryNames.has(name)) return yield* invalid("unexpected_entry")
      entryNames.add(name)
      if (manifest === null) {
        if (name !== PROJECT_EXPORT_MANIFEST_PATH)
          return yield* invalid("manifest_must_come_first")
        const bytes = yield* readEntry(
          entry.body,
          entry.header.size,
          MANIFEST_MAX_BYTES
        )
        const text = new TextDecoder().decode(bytes)
        const version = decodeVersion(text)
        if (Option.isNone(version)) return yield* invalid("invalid_manifest")
        if (version.value.formatVersion > PROJECT_EXPORT_FORMAT_VERSION)
          return yield* new ImportFormatUnsupported({
            fileVersion: version.value.formatVersion,
            supportedVersion: PROJECT_EXPORT_FORMAT_VERSION
          })
        manifest = yield* decodeManifest(text).pipe(
          Effect.mapError(() => invalid("invalid_manifest"))
        )
        return
      }
      if (name.startsWith(`${PROJECT_EXPORT_MARKDOWN_DIR}/`)) {
        const path = name.slice(PROJECT_EXPORT_MARKDOWN_DIR.length + 1)
        if (!SAFE_PATH.test(path)) return yield* invalid("unsafe_path")
        const bytes = yield* readEntry(
          entry.body,
          entry.header.size,
          MARKDOWN_FILE_MAX_BYTES
        )
        markdownBytes += bytes.byteLength
        if (markdownBytes > MARKDOWN_TOTAL_MAX_BYTES)
          return yield* invalid("markdown_too_large")
        files.push({ path, content: new TextDecoder().decode(bytes) })
        return
      }
      if (name.startsWith(`${PROJECT_EXPORT_ATTACHMENTS_DIR}/`)) {
        const sourceId = name.slice(PROJECT_EXPORT_ATTACHMENTS_DIR.length + 1)
        const planned = manifest.attachments.find(
          (attachment) => attachment.id === sourceId && !attachment.missing
        )
        if (!planned) return yield* invalid("unexpected_attachment")
        const bytes = yield* readEntry(
          entry.body,
          entry.header.size,
          ATTACHMENT_MAX_BYTES
        )
        if (bytes.byteLength !== planned.byteSize)
          return yield* invalid("attachment_size_mismatch")
        connection ??= yield* orgStorage
          .requireConnection(scope.orgSlug)
          .pipe(
            Effect.catchTag("StorageConfigMissing", () =>
              Effect.fail(
                new StorageError({ reason: "storage_config_missing" })
              )
            )
          )
        const attachmentId = ulid()
        const objectKey = importObjectKey(
          connection.keyPrefix,
          scope.orgSlug,
          id,
          attachmentId,
          planned.filename
        )
        staged.push({
          sourceId,
          id: attachmentId,
          objectKey,
          byteSize: bytes.byteLength,
          contentType: planned.contentType,
          contentHash: sha256(bytes)
        })
        yield* s3
          .putObject(connection, objectKey, planned.contentType, bytes)
          .pipe(
            Effect.mapError(
              (error) => new StorageError({ reason: error.reason })
            )
          )
        return
      }
      return yield* invalid("unexpected_entry")
    })

    return yield* Effect.gen(function* () {
      const received$ = yield* entries.pipe(
        Stream.runForEach(handleEntry),
        Effect.flatMap(() =>
          manifest === null
            ? Effect.fail(invalid("missing_manifest"))
            : Effect.succeed(manifest)
        ),
        Effect.tap(() =>
          Effect.try({
            try: () => importedTypes(files),
            catch: () => invalid("invalid_type_definition")
          })
        )
      )
      const [row] = yield* db
        .update(projectImport)
        .set({
          status: "ready",
          manifest: encodeManifest(received$),
          files,
          attachments: staged,
          updatedAt: yield* DateTime.nowAsDate
        })
        .where(eq(projectImport.id, id))
        .returning()
        .pipe(Effect.orDie)
      return yield* present(row)
    }).pipe(
      Effect.onExit((exit) => {
        if (Exit.isSuccess(exit)) return Effect.void
        const error = Cause.findErrorOption(exit.cause)
        return Effect.gen(function* () {
          yield* deleteObjects(scope.orgSlug, staged)
          yield* db
            .update(projectImport)
            .set({
              status: "failed",
              files: null,
              attachments: null,
              failureReason: Option.isSome(error)
                ? Match.value(error.value).pipe(
                    Match.tag("ProjectImportInvalid", ({ kind }) => kind),
                    Match.orElse(({ _tag }) => _tag)
                  )
                : Cause.hasInterruptsOnly(exit.cause)
                  ? "upload_interrupted"
                  : "upload_failed",
              updatedAt: yield* DateTime.nowAsDate
            })
            .where(eq(projectImport.id, id))
            .pipe(Effect.orDie)
        })
      })
    )
  })

  const get = Effect.fn("ProjectImports.get")(function* (id: string) {
    return yield* present(yield* ownRow(id))
  })

  const lockAttempt =
    (id: string, attempt: number, allowSucceeded = false) =>
    (tx: Tx) =>
      tx
        .select({
          organizationId: projectImport.organizationId,
          attempt: projectImport.attempt,
          status: projectImport.status,
          destinationProjectId: projectImport.destinationProjectId
        })
        .from(projectImport)
        .where(eq(projectImport.id, id))
        .for("update")
        .pipe(
          Effect.flatMap(([row]) =>
            row &&
            row.attempt === attempt &&
            (row.status === "importing" ||
              (allowSucceeded && row.status === "succeeded"))
              ? Effect.succeed(row)
              : Effect.fail(
                  new HiddenProject.HiddenProjectInvalid({
                    reasons: ["stale-import-attempt"]
                  })
                )
          )
        )

  const run = Effect.fn("ProjectImports.run")(function* (
    id: string,
    input: RunProjectImportInput
  ) {
    const scope = yield* OrgScope
    const row = yield* ownRow(id)
    if (row.status !== "ready" && row.status !== "failed")
      return yield* new ProjectImportStateConflict({ kind: "not_ready" })
    if (row.manifest === null) return yield* invalid("missing_manifest")
    const manifest = decodeStoredManifest(row.manifest)

    const [slugTaken] = yield* db
      .select({ id: projectIndex.id })
      .from(projectIndex)
      .where(
        and(
          eq(projectIndex.organizationId, scope.organizationId),
          eq(projectIndex.slug, input.slug)
        )
      )
      .pipe(Effect.orDie)
    if (slugTaken) return yield* new ProjectIdentifierTaken({ kind: "slug" })
    const sourceProject = (row.files ?? []).find(
      (file) => file.path === "project.md"
    )
    const oldKeys =
      sourceProject === undefined
        ? []
        : Option.getOrElse(
            decodeFormerKeys(
              parseMarkdownFile(sourceProject.content).data.formerKeys
            ),
            () => []
          )
    const sourceKeys = [...new Set([manifest.project.key, ...oldKeys])]
    const keys = yield* db
      .select({ key: projectKey.key })
      .from(projectKey)
      .where(
        and(
          eq(projectKey.organizationId, scope.organizationId),
          inArray(projectKey.key, [input.key, ...sourceKeys])
        )
      )
      .pipe(Effect.orDie)
    if (keys.some((row) => row.key === input.key))
      return yield* new ProjectIdentifierTaken({ kind: "key" })
    const formerKeys = sourceKeys.filter(
      (key) => key !== input.key && !keys.some((row) => row.key === key)
    )

    const memberIds = new Set(
      (yield* orgMembers(scope.organizationId)).map((m) => m.id)
    )
    for (const choice of input.people) {
      if (choice.userId !== null && !memberIds.has(choice.userId))
        return yield* invalid("linked_user_not_in_org")
    }

    const attempt = row.attempt + 1
    const [started] = yield* db
      .update(projectImport)
      .set({
        status: "importing",
        attempt,
        configuration: {
          types: yield* typePlan(scope.orgSlug, row.files ?? []),
          name: input.name,
          slug: input.slug,
          key: input.key,
          formerKeys,
          people: input.people
        },
        destinationProjectId: stableUuid(`${id}/${attempt}/project`),
        destinationProjectSlug: input.slug,
        failureReason: null,
        updatedAt: yield* DateTime.nowAsDate
      })
      .where(
        and(
          eq(projectImport.id, id),
          eq(projectImport.attempt, row.attempt),
          inArray(projectImport.status, ["ready", "failed"])
        )
      )
      .returning()
      .pipe(Effect.orDie)
    if (!started)
      return yield* new ProjectImportStateConflict({ kind: "not_ready" })
    yield* ProjectImportWorkflow.execute(
      { importId: id, attempt },
      { discard: true }
    ).pipe(
      Effect.provideService(WorkflowEngine.WorkflowEngine, engine),
      Effect.onExit((exit) =>
        Exit.isSuccess(exit) ? Effect.void : fail(id, attempt)
      )
    )
    return yield* present(started)
  })

  const loadAttempt = Effect.fn("ProjectImports.loadAttempt")(function* (
    id: string,
    attempt: number,
    phase: "metadata" | "publish" | Readonly<{ batch: number }> = "metadata"
  ) {
    const [state] = yield* db
      .select({
        row: {
          ...getTableColumns(projectImport),
          manifest:
            phase === "publish"
              ? projectImport.manifest
              : sql<
                  ImportRow["manifest"]
                >`${projectImport.manifest} || '{"activity":[],"comments":[]}'::jsonb`,
          files:
            typeof phase === "string"
              ? sql<ImportRow["files"]>`null::jsonb`
              : sql<
                  ImportRow["files"]
                >`jsonb_path_query_array(${projectImport.files}, ${`$[${phase.batch * DOCUMENT_BATCH_SIZE} to ${(phase.batch + 1) * DOCUMENT_BATCH_SIZE - 1}]`}::jsonpath)`
        },
        orgSlug: organization.slug
      })
      .from(projectImport)
      .innerJoin(
        organization,
        eq(organization.id, projectImport.organizationId)
      )
      .where(eq(projectImport.id, id))
      .pipe(Effect.orDie)
    if (!state || state.row.attempt !== attempt)
      return yield* new ProjectImportFailure({ reason: "stale-import-attempt" })
    const { row, orgSlug } = state
    const { configuration, destinationProjectId } = row
    if (
      row.manifest === null ||
      configuration === null ||
      destinationProjectId === null
    )
      return yield* new ProjectImportFailure({ reason: "missing-import-plan" })
    const manifest = decodeStoredManifest(row.manifest)
    const staged = row.attachments ?? []
    const users = new Map(
      configuration.people.flatMap((choice) =>
        choice.userId === null ? [] : [[choice.sourceUserId, choice.userId]]
      )
    )
    const seed = `${id}/${attempt}`
    const mapping: ImportMapping = {
      types: new Map(
        configuration.types.map((type) => [type.sourceKey, type.key])
      ),
      fromSlug: manifest.project.slug,
      toSlug: configuration.slug,
      fromKey: manifest.project.key,
      toKey: configuration.key,
      orgSlug,
      users,
      people: new Map(manifest.people.map((p) => [p.id, { name: p.name }])),
      attachments: new Map(staged.map((a) => [a.sourceId, a.id])),
      newCommentId: (sourceId) =>
        `c_${sha256(`${seed}/comment/${sourceId}`).slice(0, 26)}`
    }
    const plan = importPlan({
      manifest,
      mapping,
      staged,
      files: row.files ?? [],
      projectId: destinationProjectId,
      organizationId: row.organizationId,
      orgSlug,
      importerId: row.createdBy,
      configuration,
      seed
    })
    return { row, orgSlug, configuration, plan, sourceUrl: manifest.source.url }
  })

  const asFailure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("project import step failed", cause).pipe(
          Effect.andThen(
            Effect.fail(
              new ProjectImportFailure({
                reason: Cause.hasInterruptsOnly(cause)
                  ? "interrupted"
                  : "step_failed"
              })
            )
          )
        )
      ),
      Effect.provide(provided)
    )

  const ensureHidden = Effect.fn("ProjectImports.ensureHidden")(function* (
    id: string,
    attempt: number
  ) {
    const { plan } = yield* loadAttempt(id, attempt)
    yield* HiddenProject.ensureHiddenProject(plan.identity, {
      lock: lockAttempt(id, attempt),
      claimed: () => Effect.void
    }).pipe(asFailure)
  })

  const documentBatches = Effect.fn("ProjectImports.documentBatches")(
    function* (id: string, attempt: number) {
      const [row] = yield* db
        .select({
          attempt: projectImport.attempt,
          count: sql<number>`coalesce(jsonb_array_length(${projectImport.files}), 0)`
        })
        .from(projectImport)
        .where(eq(projectImport.id, id))
        .pipe(Effect.orDie)
      if (!row || row.attempt !== attempt)
        return yield* new ProjectImportFailure({
          reason: "stale-import-attempt"
        })
      return Math.ceil(row.count / DOCUMENT_BATCH_SIZE)
    }
  )

  const writeDocuments = Effect.fn("ProjectImports.writeDocuments")(function* (
    id: string,
    attempt: number,
    batch: number
  ) {
    const { plan, orgSlug, configuration } = yield* loadAttempt(id, attempt, {
      batch
    })
    yield* HiddenProject.writeHiddenDocuments(
      {
        projectId: plan.identity.id,
        orgSlug,
        projectSlug: configuration.slug,
        documents: plan.documents,
        isAllowedPath: (path) => SAFE_PATH.test(path)
      },
      lockAttempt(id, attempt)
    ).pipe(asFailure)
  })

  const recordAttachments = Effect.fn("ProjectImports.recordAttachments")(
    function* (id: string, attempt: number) {
      const { plan, configuration } = yield* loadAttempt(id, attempt)
      yield* Effect.forEach(
        plan.pending,
        (pending) =>
          HiddenProject.recordPendingAttachment(
            pending,
            configuration.slug,
            lockAttempt(id, attempt)
          ),
        { discard: true }
      ).pipe(asFailure)
    }
  )

  const index = Effect.fn("ProjectImports.index")(function* (
    id: string,
    attempt: number
  ) {
    const { plan, orgSlug, configuration } = yield* loadAttempt(id, attempt)
    yield* maintenance
      .rebuildProject({
        orgSlug,
        organizationId: plan.identity.organizationId,
        projectId: plan.identity.id,
        slug: configuration.slug
      })
      .pipe(asFailure)
  })

  const stageReferenceCandidates = Effect.fn(
    "ProjectImports.stageReferenceCandidates"
  )(function* (id: string, attempt: number) {
    const { row, plan, orgSlug, configuration, sourceUrl } = yield* loadAttempt(
      id,
      attempt
    )
    if (row.status === "succeeded") return
    const projectId = plan.identity.id
    yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          const owner = yield* lockAttempt(id, attempt, true)(tx)
          if (owner.status === "succeeded") return
          yield* tx
            .delete(projectImportReference)
            .where(eq(projectImportReference.projectId, projectId))
          yield* forEachImportReferenceBatch(
            {
              orgSlug,
              organizationId: plan.identity.organizationId,
              projectId,
              slug: configuration.slug
            },
            referenceOrigin(sourceUrl),
            (candidates) => insertImportReferences(tx, candidates)
          )
        })
      )
      .pipe(asFailure)
  })

  const publish = Effect.fn("ProjectImports.publish")(function* (
    id: string,
    attempt: number
  ) {
    const { plan, configuration, orgSlug } = yield* loadAttempt(
      id,
      attempt,
      "publish"
    )
    const now = yield* DateTime.nowAsDate
    yield* HiddenProject.publishHiddenProject(
      {
        ...plan.indexes,
        attachments: plan.pending.map((pending) => ({
          row: pending,
          committedAt: now
        }))
      },
      {
        lock: lockAttempt(id, attempt, true),
        decide: (_tx, project, row) =>
          Effect.succeed(
            row.status === "succeeded" &&
              row.destinationProjectId === project.id &&
              project.publishedAt !== null
              ? ("replayed" as const)
              : ("publish" as const)
          ),
        published: (tx, project, publishedAt) =>
          Effect.gen(function* () {
            yield* tx
              .update(projectIndex)
              .set(plan.projectSettings)
              .where(eq(projectIndex.id, project.id))
            if (plan.imageReferences.length > 0)
              yield* tx
                .insert(projectImageReference)
                .values([...plan.imageReferences])
            if (configuration.formerKeys.length > 0)
              yield* tx.insert(projectKey).values(
                configuration.formerKeys.map((key) => ({
                  organizationId: plan.identity.organizationId,
                  key,
                  projectId: project.id,
                  current: false
                }))
              )
            yield* pruneResolvedImportReferences(tx, {
              projectId: project.id,
              organizationId: project.organizationId,
              orgSlug,
              slug: project.slug
            }).pipe(Effect.provide(provided))
            yield* tx
              .update(projectImport)
              .set({
                status: "succeeded",
                files: null,
                referencesScanned: true,
                retainedUntil: null,
                updatedAt: publishedAt
              })
              .where(eq(projectImport.id, id))
          })
      }
    ).pipe(asFailure)
  })

  const fail = Effect.fn("ProjectImports.fail")(function* (
    id: string,
    attempt: number
  ) {
    const [state] = yield* db
      .select({ row: projectImport, orgSlug: organization.slug })
      .from(projectImport)
      .innerJoin(
        organization,
        eq(organization.id, projectImport.organizationId)
      )
      .where(
        and(
          eq(projectImport.id, id),
          eq(projectImport.attempt, attempt),
          eq(projectImport.status, "importing")
        )
      )
      .pipe(Effect.orDie)
    if (!state) return
    const now = yield* DateTime.nowAsDate
    const [failed] = yield* db
      .update(projectImport)
      .set({
        status: "failed",
        failureReason: "import_failed",
        retainedUntil: retentionFrom(now),
        updatedAt: now
      })
      .where(
        and(
          eq(projectImport.id, id),
          eq(projectImport.attempt, attempt),
          eq(projectImport.status, "importing")
        )
      )
      .returning()
      .pipe(Effect.orDie)
    if (failed) yield* removeDestination(state.orgSlug, failed)
  })

  const cancel = Effect.fn("ProjectImports.cancel")(function* (id: string) {
    const scope = yield* OrgScope
    const row = yield* ownRow(id)
    if (row.status === "importing" || row.status === "succeeded")
      return yield* new ProjectImportStateConflict({ kind: "not_cancellable" })
    const [claimed] = yield* db
      .update(projectImport)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(projectImport.id, id),
          eq(projectImport.attempt, row.attempt),
          eq(projectImport.status, row.status)
        )
      )
      .returning()
      .pipe(Effect.orDie)
    if (!claimed)
      return yield* new ProjectImportStateConflict({ kind: "not_cancellable" })
    yield* removeDestination(scope.orgSlug, claimed)
    yield* deleteObjects(scope.orgSlug, claimed.attachments ?? [])
    const [cancelled] = yield* db
      .update(projectImport)
      .set({
        status: "cancelled",
        files: null,
        attachments: null,
        updatedAt: yield* DateTime.nowAsDate
      })
      .where(eq(projectImport.id, id))
      .returning()
      .pipe(Effect.orDie)
    return yield* present(cancelled)
  })

  const expire = Effect.fn("ProjectImports.expire")(function* () {
    const now = yield* DateTime.nowAsDate
    const rows = yield* db
      .select({
        row: projectImport,
        orgSlug: sql<string>`(select slug from organization where id = ${projectImport.organizationId})`
      })
      .from(projectImport)
      .where(
        and(
          isNotNull(projectImport.retainedUntil),
          lte(projectImport.retainedUntil, now),
          inArray(projectImport.status, [
            "uploading",
            "ready",
            "failed",
            "cancelled"
          ])
        )
      )
      .limit(100)
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      rows,
      ({ row, orgSlug }) =>
        Effect.gen(function* () {
          const [claimed] = yield* db
            .update(projectImport)
            .set({ status: "cancelled" })
            .where(
              and(
                eq(projectImport.id, row.id),
                eq(projectImport.attempt, row.attempt),
                eq(projectImport.status, row.status)
              )
            )
            .returning()
            .pipe(Effect.orDie)
          if (!claimed) return
          yield* removeDestination(orgSlug, claimed)
          yield* deleteObjects(orgSlug, claimed.attachments ?? [])
          yield* db
            .delete(projectImport)
            .where(eq(projectImport.id, row.id))
            .pipe(Effect.orDie)
        }),
      { discard: true }
    )
  })

  return ProjectImports.of({
    upload,
    get,
    run,
    cancel,
    expire,
    steps: {
      ensureHidden,
      documentBatches,
      writeDocuments,
      recordAttachments,
      index,
      stageReferenceCandidates,
      publish,
      fail
    }
  })
})

type Tx = Parameters<Parameters<Db["Service"]["transaction"]>[0]>[0]

type HiddenProjectRequirements =
  | Markdown.Markdown
  | FileSystem.FileSystem
  | Path.Path

export const importPlan = (
  input: Readonly<{
    manifest: ProjectExportManifest
    mapping: ImportMapping
    staged: ReadonlyArray<ProjectImportAttachment>
    files: ReadonlyArray<ProjectImportFile>
    projectId: string
    organizationId: string
    orgSlug: string
    importerId: string
    configuration: ProjectImportConfiguration
    seed: string
  }>
) => {
  const { manifest, mapping, projectId } = input
  const mapUser = (id: string) => mapping.users.get(id) ?? input.importerId
  const byAttachment = new Map(manifest.attachments.map((a) => [a.id, a]))
  const createdAt = manifest.project.createdAt
  const identity: HiddenProject.HiddenProjectIdentity = {
    id: projectId,
    organizationId: input.organizationId,
    slug: input.configuration.slug,
    key: input.configuration.key,
    name: input.configuration.name,
    icon: manifest.project.icon,
    color: manifest.project.color,
    nextTicketNumber: manifest.project.nextTicketNumber,
    createdBy: input.importerId,
    createdAt: createdAt.toISOString()
  }
  const documents = input.files.map((file) => {
    const original = transformImportedFile(
      mapping,
      {
        slug: input.configuration.slug,
        name: input.configuration.name,
        formerKeys: input.configuration.formerKeys
      },
      file
    )
    let transformed = original
    const type = input.configuration.types.find(
      (type) => file.path === `types/${type.sourceKey}.md`
    )
    if (type !== undefined) {
      const parsed = parseMarkdownFile(transformed.content)
      transformed = {
        path: `types/${type.key}.md`,
        content: markdownFileContent(
          { ...parsed.data, name: type.name },
          parsed.content
        )
      }
    }
    return {
      ...transformed,
      sha256: createHash("sha256").update(transformed.content).digest("hex")
    }
  })
  const pending = input.staged.map((staged) => {
    const source = byAttachment.get(staged.sourceId)
    const firstReference = source?.references[0]
    return {
      id: staged.id,
      organizationId: input.organizationId,
      orgSlug: input.orgSlug,
      projectId,
      ticketId:
        firstReference === undefined
          ? null
          : renameTicketId(mapping, firstReference),
      objectKey: staged.objectKey,
      filename: source?.filename ?? staged.id,
      contentType: staged.contentType,
      byteSize: staged.byteSize,
      contentHash: staged.contentHash,
      uploadedBy: mapUser(source?.uploadedBy ?? input.importerId),
      createdAt: source?.createdAt ?? createdAt
    } satisfies HiddenProject.PendingAttachment
  })
  const members = new Map<string, "pm" | "developer" | "client">()
  for (const m of manifest.members) {
    const target = mapping.users.get(m.userId)
    if (target !== undefined) members.set(target, m.role)
  }
  if (![...members.values()].includes("pm") || !members.has(input.importerId))
    members.set(input.importerId, "pm")
  const attachmentId = (sourceId: string) => {
    const target = mapping.attachments.get(sourceId)
    return target === undefined ? undefined : decodeAttachmentId(target)
  }
  const banner = manifest.project.banner
  const iconImage = manifest.project.iconImage
  const bannerId =
    banner?.type === "attachment"
      ? attachmentId(banner.attachmentId)
      : undefined
  const iconSource =
    iconImage === null ? undefined : attachmentId(iconImage.sourceAttachmentId)
  const iconRendered =
    iconImage?.type === "sticker"
      ? attachmentId(iconImage.renderedAttachmentId)
      : undefined
  return {
    identity,
    documents,
    pending,
    projectSettings: {
      estimation: manifest.project.estimation,
      gitAutomationForwardOnly: manifest.project.gitAutomationForwardOnly,
      banner:
        banner === null
          ? null
          : banner.type === "preset"
            ? banner
            : bannerId === undefined
              ? null
              : {
                  ...banner,
                  attachmentId: bannerId
                },
      iconImage:
        iconImage === null || iconSource === undefined
          ? null
          : iconImage.type === "full_bleed"
            ? {
                ...iconImage,
                sourceAttachmentId: iconSource
              }
            : iconRendered === undefined
              ? null
              : {
                  ...iconImage,
                  sourceAttachmentId: iconSource,
                  renderedAttachmentId: iconRendered
                }
    },
    imageReferences: manifest.attachments.flatMap((a) => {
      const target = attachmentId(a.id)
      return target === undefined
        ? []
        : a.imageSlots.map((slot) => ({
            projectId,
            attachmentId: target,
            slot
          }))
    }),
    indexes: {
      project: identity,
      statuses: manifest.statuses.map((status) => ({
        ...status,
        projectId,
        createdBy: mapUser(status.createdBy)
      })),
      gitAutomation: manifest.gitAutomation.map((rule) => ({
        ...rule,
        projectId
      })),
      tags: manifest.tags.map((tag) => ({
        ...tag,
        projectId,
        createdBy: mapUser(tag.createdBy)
      })),
      members: [...members].map(([userId, roleId]) => ({
        projectId,
        organizationId: input.organizationId,
        userId,
        roleId
      })),
      tickets: [],
      comments: [],
      activity: manifest.activity.map((activity) => {
        const actorUser =
          activity.actorUserId === null
            ? undefined
            : mapping.users.get(activity.actorUserId)
        const unlinked =
          (activity.actorKind === "user" || activity.actorKind === "agent") &&
          actorUser === undefined
        const imported = unlinked
          ? importedAuthorOf(mapping, activity.actorUserId ?? "")
          : null
        return {
          id: stableUuid(`${input.seed}/activity/${activity.id}`),
          projectId,
          ticketId: renameTicketId(mapping, activity.ticketId),
          occurredAt: activity.occurredAt,
          actorKind: imported === null ? activity.actorKind : "imported",
          actorUserId: imported === null ? (actorUser ?? null) : null,
          actorClientId: imported === null ? activity.actorClientId : null,
          actorClientName: imported === null ? activity.actorClientName : null,
          actorSource: activity.actorSource,
          importedName: imported?.displayName ?? activity.importedName,
          importedSource: imported?.source ?? activity.importedSource,
          importedId: imported?.sourceId ?? activity.importedId,
          cause: activity.cause,
          change: rewriteImportedChange(mapping, activity.change)
        }
      }),
      attachmentReferences: manifest.attachments.flatMap((a) => {
        const target = attachmentId(a.id)
        return target === undefined
          ? []
          : a.references.map((ticketId) => ({
              attachmentId: target,
              projectId,
              ticketId: renameTicketId(mapping, ticketId)
            }))
      }),
      attachments: []
    } satisfies HiddenProject.PublishedIndexes
  }
}

export const layer = Layer.effect(ProjectImports, make)

const STEP_RETRIES = 3

export const ProjectImportWorkflowLive = Layer.unwrap(
  Effect.gen(function* () {
    const imports = yield* ProjectImports
    const { steps } = imports
    return ProjectImportWorkflow.toLayer(({ importId, attempt }) =>
      Effect.gen(function* () {
        const step = <A>(
          name: string,
          success: Schema.Codec<A>,
          execute: Effect.Effect<A, ProjectImportFailure>
        ) =>
          Activity.make({
            name,
            success,
            error: ProjectImportFailure,
            execute: execute.pipe(Activity.retry({ times: STEP_RETRIES }))
          })
        yield* Workflow.addFinalizer((exit) =>
          Exit.isSuccess(exit)
            ? Effect.void
            : Activity.make({
                name: "fail",
                execute: steps.fail(importId, attempt)
              })
        )
        yield* step(
          "ensure-hidden",
          Schema.Void,
          steps.ensureHidden(importId, attempt)
        )
        const batches = yield* step(
          "document-batches",
          Schema.Int,
          steps.documentBatches(importId, attempt)
        )
        for (let batch = 0; batch < batches; batch++)
          yield* step(
            `documents/${batch}`,
            Schema.Void,
            steps.writeDocuments(importId, attempt, batch)
          )
        yield* step(
          "attachments",
          Schema.Void,
          steps.recordAttachments(importId, attempt)
        )
        yield* step("index", Schema.Void, steps.index(importId, attempt))
        yield* step(
          "reference-candidates",
          Schema.Void,
          steps.stageReferenceCandidates(importId, attempt)
        )
        yield* step("publish", Schema.Void, steps.publish(importId, attempt))
      })
    )
  })
)

export const ProjectImportRetentionLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const imports = yield* ProjectImports
    yield* Effect.forkScoped(
      Effect.repeat(
        imports
          .expire()
          .pipe(
            Effect.catchCause((cause) =>
              Effect.logError("project import retention failed", cause)
            )
          ),
        Schedule.spaced("1 hour")
      )
    )
  })
)
