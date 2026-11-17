// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import { Db } from "@pp/db"
import {
  attachmentIndex,
  attachmentReference,
  commentIndex,
  member,
  organization,
  projectGitAutomation,
  projectIndex,
  projectKey,
  projectMember,
  projectStatus,
  projectTag,
  ticketActivity,
  ticketIndex
} from "@pp/db/schema"
import { and, eq, inArray, isNull, sql as drizzleSql } from "drizzle-orm"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"

import * as Markdown from "../markdown/Markdown"
import type * as S3Storage from "../storage/S3Storage"

export class HiddenProjectInvalid extends Data.TaggedError(
  "HiddenProjectInvalid"
)<Readonly<{ reasons: ReadonlyArray<string> }>> {}

type Tx = Parameters<Parameters<Db["Service"]["transaction"]>[0]>[0]

export type OwnerLock = Readonly<{ organizationId: string }>

export type HiddenProjectIdentity = Readonly<{
  id: string
  organizationId: string
  slug: string
  key: string
  name: string
  icon: string
  color: string
  nextTicketNumber: number
  createdBy: string
  createdAt: string
}>

export type HiddenDocument = Readonly<{
  path: string
  content: string
  sha256: string
}>

export type PendingAttachment = Readonly<{
  id: string
  organizationId: string
  orgSlug: string
  projectId: string
  ticketId: string | null
  objectKey: string
  filename: string
  contentType: string
  byteSize: number
  contentHash: string | null
  uploadedBy: string
  createdAt: Date
}>

export type PublishedIndexes = Readonly<{
  project: HiddenProjectIdentity
  statuses: ReadonlyArray<typeof projectStatus.$inferInsert>
  gitAutomation: ReadonlyArray<typeof projectGitAutomation.$inferInsert>
  tags: ReadonlyArray<typeof projectTag.$inferInsert>
  members: ReadonlyArray<typeof projectMember.$inferInsert>
  tickets: ReadonlyArray<typeof ticketIndex.$inferInsert>
  comments: ReadonlyArray<typeof commentIndex.$inferInsert>
  activity: ReadonlyArray<typeof ticketActivity.$inferInsert>
  attachmentReferences: ReadonlyArray<typeof attachmentReference.$inferInsert>
  attachments: ReadonlyArray<
    Readonly<{ row: PendingAttachment; committedAt: Date }>
  >
}>

export type HiddenProjectDestination = Readonly<{
  organizationId: string
  orgSlug: string
  projectId: string | null
  projectSlug: string | null
}>

const invalid = (reason: string) =>
  new HiddenProjectInvalid({ reasons: [reason] })

const sha256 = (content: string | Uint8Array) =>
  createHash("sha256").update(content).digest("hex")

const sameIdentity = (
  row: typeof projectIndex.$inferSelect,
  project: HiddenProjectIdentity
) =>
  row.id === project.id &&
  row.organizationId === project.organizationId &&
  row.slug === project.slug &&
  row.key === project.key &&
  row.name === project.name &&
  row.icon === project.icon &&
  row.color === project.color &&
  row.nextTicketNumber === project.nextTicketNumber &&
  row.createdBy === project.createdBy &&
  row.createdAt.toISOString() === project.createdAt

const samePendingRow = (
  row: typeof attachmentIndex.$inferSelect,
  planned: PendingAttachment
) =>
  row.status === "pending" &&
  row.organizationId === planned.organizationId &&
  row.orgSlug === planned.orgSlug &&
  row.projectId === planned.projectId &&
  row.ticketId === planned.ticketId &&
  row.objectKey === planned.objectKey &&
  row.filename === planned.filename &&
  row.contentType === planned.contentType &&
  row.byteSize === planned.byteSize &&
  row.contentHash === planned.contentHash &&
  row.uploadedBy === planned.uploadedBy &&
  row.createdAt.getTime() === planned.createdAt.getTime()

const hiddenProjectInOrg = Effect.fnUntraced(function* (
  tx: Tx,
  projectId: string,
  lock: OwnerLock,
  expected: Readonly<{ orgSlug: string; projectSlug: string }>
) {
  const [project] = yield* tx
    .select()
    .from(projectIndex)
    .where(eq(projectIndex.id, projectId))
    .limit(1)
  const [org] = project
    ? yield* tx
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, project.organizationId))
        .limit(1)
    : []
  return (
    project !== undefined &&
    project.publishedAt === null &&
    project.slug === expected.projectSlug &&
    project.organizationId === lock.organizationId &&
    org?.slug === expected.orgSlug
  )
})

export const ensureHiddenProject = <E>(
  project: HiddenProjectIdentity,
  owner: Readonly<{
    lock: (tx: Tx) => Effect.Effect<OwnerLock, E>
    claimed: (tx: Tx) => Effect.Effect<void, E>
  }>
) =>
  Effect.gen(function* () {
    const db = yield* Db
    return yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* owner.lock(tx)
        yield* tx
          .insert(projectIndex)
          .values({
            ...project,
            createdAt: DateTime.toDate(DateTime.makeUnsafe(project.createdAt)),
            banner: null,
            iconImage: null,
            publishedAt: null
          })
          .onConflictDoNothing()
        const [existing] = yield* tx
          .select()
          .from(projectIndex)
          .where(
            and(
              eq(projectIndex.organizationId, project.organizationId),
              eq(projectIndex.slug, project.slug)
            )
          )
          .limit(1)
        if (
          !existing ||
          !sameIdentity(existing, project) ||
          existing.banner !== null ||
          existing.iconImage !== null ||
          existing.publishedAt !== null
        )
          return yield* invalid("hidden-project-identity-conflict")
        yield* tx
          .insert(projectKey)
          .values({
            organizationId: project.organizationId,
            key: project.key,
            projectId: project.id,
            current: true
          })
          .onConflictDoNothing()
        const [claimedKey] = yield* tx
          .select({ projectId: projectKey.projectId })
          .from(projectKey)
          .where(
            and(
              eq(projectKey.organizationId, project.organizationId),
              eq(projectKey.key, project.key)
            )
          )
        if (claimedKey?.projectId !== project.id)
          return yield* invalid("hidden-project-identity-conflict")
        yield* owner.claimed(tx)
        return existing.id
      })
    )
  }).pipe(Effect.withSpan("HiddenProject.ensure"))

export const writeHiddenDocuments = <E>(
  input: Readonly<{
    projectId: string
    orgSlug: string
    projectSlug: string
    documents: ReadonlyArray<HiddenDocument>
    isAllowedPath: (path: string) => boolean
  }>,
  lock: (tx: Tx) => Effect.Effect<OwnerLock, E>
) =>
  Effect.gen(function* () {
    const db = yield* Db
    const markdown = yield* Markdown.Markdown
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    if (
      new Set(input.documents.map((document) => document.path)).size !==
      input.documents.length
    )
      return yield* invalid("duplicate-document-path")
    for (const document of input.documents) {
      if (
        !input.isAllowedPath(document.path) ||
        sha256(document.content) !== document.sha256
      )
        return yield* invalid("invalid-document-content-or-path")
    }
    return yield* Effect.uninterruptible(
      db.transaction((tx) =>
        Effect.gen(function* () {
          const owner = yield* lock(tx)
          if (!(yield* hiddenProjectInOrg(tx, input.projectId, owner, input)))
            return yield* invalid("stale-materialization-attempt")
          const directory = markdown.projectDir(
            input.orgSlug,
            input.projectSlug
          )
          for (const document of input.documents) {
            const target = path.join(directory, document.path)
            yield* fs.makeDirectory(path.dirname(target), { recursive: true })
            const temporary = `${target}.import-tmp`
            yield* fs.writeFileString(temporary, document.content)
            yield* fs.rename(temporary, target)
            const stored = yield* fs.readFileString(target)
            if (sha256(stored) !== document.sha256)
              return yield* invalid("document-verification-failed")
          }
          return input.documents.length
        })
      )
    )
  }).pipe(Effect.withSpan("HiddenProject.writeDocuments"))

export const recordPendingAttachment = <E>(
  planned: PendingAttachment,
  projectSlug: string,
  lock: (tx: Tx) => Effect.Effect<OwnerLock, E>
) =>
  Effect.gen(function* () {
    const db = yield* Db
    return yield* db.transaction((tx) =>
      Effect.gen(function* () {
        const owner = yield* lock(tx)
        const [project] = yield* tx
          .select()
          .from(projectIndex)
          .where(eq(projectIndex.id, planned.projectId))
          .limit(1)
        if (
          owner.organizationId !== planned.organizationId ||
          !project ||
          project.publishedAt !== null ||
          project.organizationId !== planned.organizationId ||
          project.slug !== projectSlug
        )
          return yield* invalid("stale-materialization-attempt")
        yield* tx
          .insert(attachmentIndex)
          .values({ ...planned, status: "pending" })
          .onConflictDoNothing()
        const [row] = yield* tx
          .select()
          .from(attachmentIndex)
          .where(eq(attachmentIndex.id, planned.id))
          .limit(1)
        if (!row || !samePendingRow(row, planned))
          return yield* invalid("attachment-identity-conflict")
      })
    )
  }).pipe(Effect.withSpan("HiddenProject.recordPendingAttachment"))

export const verifyHiddenProject = <E>(
  s3: Pick<S3Storage.S3Storage["Service"], "getObject" | "headObject">,
  input: Readonly<{
    projectId: string
    orgSlug: string
    projectSlug: string
    documents: ReadonlyArray<HiddenDocument>
    isAllowedPath: (path: string) => boolean
    unresolvedReferences: (content: string) => number
    attachments: ReadonlyArray<
      Readonly<{
        attachmentId: string
        objectKey: string
        byteSize: number
        contentType: string
        contentSha256: string
      }>
    >
    connection: S3Storage.S3Connection
  }>,
  lock: Effect.Effect<OwnerLock, E>
) =>
  Effect.gen(function* () {
    const db = yield* Db
    const markdown = yield* Markdown.Markdown
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const owner = yield* lock
    const [project] = yield* db
      .select()
      .from(projectIndex)
      .where(eq(projectIndex.id, input.projectId))
      .limit(1)
    if (
      !project ||
      project.organizationId !== owner.organizationId ||
      project.slug !== input.projectSlug ||
      project.publishedAt !== null
    )
      return yield* invalid("stale-materialization-attempt")
    const [org] = yield* db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, project.organizationId))
      .limit(1)
    if (org?.slug !== input.orgSlug)
      return yield* invalid("hidden-project-identity-conflict")
    if (
      new Set(input.documents.map((document) => document.path)).size !==
      input.documents.length
    )
      return yield* invalid("duplicate-document-path")
    const directory = markdown.projectDir(input.orgSlug, input.projectSlug)
    let unresolved = 0
    for (const document of input.documents) {
      if (!input.isAllowedPath(document.path))
        return yield* invalid("invalid-document-content-or-path")
      const stored = yield* fs
        .readFileString(path.join(directory, document.path))
        .pipe(Effect.mapError(() => invalid("missing-document")))
      if (sha256(stored) !== document.sha256)
        return yield* invalid("document-verification-failed")
      unresolved += input.unresolvedReferences(stored)
    }
    if (unresolved !== 0)
      return yield* invalid("unresolved-document-references")
    if (
      new Set(input.attachments.map((a) => a.attachmentId)).size !==
      input.attachments.length
    )
      return yield* invalid("duplicate-attachment-outcome")
    for (const attachment of input.attachments) {
      const [row] = yield* db
        .select()
        .from(attachmentIndex)
        .where(eq(attachmentIndex.id, attachment.attachmentId))
        .limit(1)
      const head = yield* s3.headObject(input.connection, attachment.objectKey)
      const bytes = yield* s3.getObject(input.connection, attachment.objectKey)
      if (
        !row ||
        row.organizationId !== owner.organizationId ||
        row.orgSlug !== input.orgSlug ||
        row.projectId !== input.projectId ||
        row.objectKey !== attachment.objectKey ||
        row.byteSize !== attachment.byteSize ||
        row.contentType !== attachment.contentType ||
        row.contentHash !== attachment.contentSha256 ||
        row.status !== "pending" ||
        !head ||
        head.byteSize !== attachment.byteSize ||
        head.contentType !== attachment.contentType ||
        !bytes ||
        bytes.length !== attachment.byteSize ||
        sha256(bytes) !== attachment.contentSha256
      )
        return yield* invalid("attachment-verification-failed")
    }
    return {
      documentCount: input.documents.length,
      attachmentCount: input.attachments.length
    }
  }).pipe(Effect.withSpan("HiddenProject.verify"))

const insertChunked = <A, B, E, R>(
  rows: ReadonlyArray<A>,
  insert: (rows: Array<A>) => Effect.Effect<B, E, R>
) =>
  Effect.forEach(
    Array.from({ length: Math.ceil(rows.length / 500) }, (_, index) =>
      rows.slice(index * 500, (index + 1) * 500)
    ),
    (chunk) => insert([...chunk]),
    { discard: true }
  )

export const publishHiddenProject = <L extends OwnerLock, E>(
  indexes: PublishedIndexes,
  owner: Readonly<{
    lock: (tx: Tx) => Effect.Effect<L, E>
    decide: (
      tx: Tx,
      project: typeof projectIndex.$inferSelect,
      lock: L
    ) => Effect.Effect<"publish" | "replayed", E>
    published: (
      tx: Tx,
      project: typeof projectIndex.$inferSelect,
      now: Date,
      lock: L
    ) => Effect.Effect<void, E>
  }>
) =>
  Effect.gen(function* () {
    const db = yield* Db
    const planned = indexes.project
    return yield* Effect.uninterruptible(
      db.transaction((tx) =>
        Effect.gen(function* () {
          const lock = yield* owner.lock(tx)
          const [project] = yield* tx
            .select()
            .from(projectIndex)
            .where(eq(projectIndex.id, planned.id))
            .for("update")
          if (!project) return yield* invalid("stale-publication-attempt")
          if ((yield* owner.decide(tx, project, lock)) === "replayed")
            return true
          if (
            project.publishedAt !== null ||
            project.organizationId !== lock.organizationId ||
            !sameIdentity(project, planned)
          )
            return yield* invalid("hidden-project-identity-conflict")
          const memberIds = [
            ...new Set(indexes.members.map((row) => row.userId))
          ]
          if (memberIds.length > 0) {
            const orgMembers = yield* tx
              .select({ userId: member.userId })
              .from(member)
              .where(
                and(
                  eq(member.organizationId, lock.organizationId),
                  inArray(member.userId, memberIds)
                )
              )
              .for("share")
            if (orgMembers.length !== memberIds.length)
              return yield* invalid("publication-member-conflict")
          }
          if (indexes.statuses.length > 0)
            yield* insertChunked(indexes.statuses, (rows) =>
              tx.insert(projectStatus).values(rows)
            )
          if (indexes.gitAutomation.length > 0)
            yield* tx
              .insert(projectGitAutomation)
              .values([...indexes.gitAutomation])
          if (indexes.tags.length > 0)
            yield* insertChunked(indexes.tags, (rows) =>
              tx.insert(projectTag).values(rows)
            )
          if (indexes.members.length > 0)
            yield* insertChunked(indexes.members, (rows) =>
              tx.insert(projectMember).values(rows)
            )
          if (indexes.tickets.length > 0)
            yield* insertChunked(indexes.tickets, (rows) =>
              tx.insert(ticketIndex).values(rows)
            )
          if (indexes.comments.length > 0)
            yield* insertChunked(indexes.comments, (rows) =>
              tx.insert(commentIndex).values(rows)
            )
          if (indexes.activity.length > 0)
            yield* insertChunked(indexes.activity, (rows) =>
              tx.insert(ticketActivity).values(rows)
            )
          if (indexes.attachmentReferences.length > 0)
            yield* insertChunked(indexes.attachmentReferences, (rows) =>
              tx.insert(attachmentReference).values(rows)
            )
          for (const { row: pendingRow, committedAt } of indexes.attachments) {
            const [pending] = yield* tx
              .select()
              .from(attachmentIndex)
              .where(eq(attachmentIndex.id, pendingRow.id))
              .for("update")
            if (
              !pending ||
              pending.projectId !== planned.id ||
              !samePendingRow(pending, pendingRow)
            )
              return yield* invalid("attachment-identity-conflict")
            yield* tx
              .update(attachmentIndex)
              .set({ status: "live", committedAt })
              .where(eq(attachmentIndex.id, pendingRow.id))
          }
          const now = yield* DateTime.nowAsDate
          const published = yield* tx
            .update(projectIndex)
            .set({ publishedAt: now })
            .where(
              and(
                eq(projectIndex.id, project.id),
                drizzleSql`${projectIndex.publishedAt} is null`
              )
            )
            .returning({ id: projectIndex.id })
          if (published.length !== 1)
            return yield* invalid("publication-race-lost")
          yield* owner.published(tx, project, now, lock)
          return true
        })
      )
    )
  }).pipe(Effect.withSpan("HiddenProject.publish"))

export const isUnpublishedDestination = (
  destination: HiddenProjectDestination
) =>
  Effect.gen(function* () {
    if (destination.projectId === null) return true
    const db = yield* Db
    const [project] = yield* db
      .select()
      .from(projectIndex)
      .where(eq(projectIndex.id, destination.projectId))
      .limit(1)
    return (
      !project ||
      (project.organizationId === destination.organizationId &&
        project.slug === destination.projectSlug &&
        project.publishedAt === null)
    )
  })

export const pendingObjectKeys = (destination: HiddenProjectDestination) =>
  Effect.gen(function* () {
    if (destination.projectId === null) return []
    const db = yield* Db
    const rows = yield* db
      .select({ objectKey: attachmentIndex.objectKey })
      .from(attachmentIndex)
      .where(
        and(
          eq(attachmentIndex.organizationId, destination.organizationId),
          eq(attachmentIndex.projectId, destination.projectId),
          eq(attachmentIndex.status, "pending")
        )
      )
    return rows.map((row) => row.objectKey)
  })

export const deletePendingAttachments = (
  destination: HiddenProjectDestination
) =>
  Effect.gen(function* () {
    if (destination.projectId === null) return
    const db = yield* Db
    yield* db
      .delete(attachmentIndex)
      .where(
        and(
          eq(attachmentIndex.organizationId, destination.organizationId),
          eq(attachmentIndex.projectId, destination.projectId),
          eq(attachmentIndex.status, "pending")
        )
      )
  })

export const deleteHiddenProjectRow = (destination: HiddenProjectDestination) =>
  Effect.gen(function* () {
    if (destination.projectId === null) return
    const db = yield* Db
    yield* db
      .delete(projectIndex)
      .where(
        and(
          eq(projectIndex.id, destination.projectId),
          eq(projectIndex.organizationId, destination.organizationId),
          isNull(projectIndex.publishedAt)
        )
      )
  })
