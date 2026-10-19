import { Db } from "@pp/db"
import {
  organization,
  projectIndex,
  ticketActivity,
  ticketActivityOutbox,
  type TicketActivityOutboxRow
} from "@pp/db/schema"
import {
  ActivityActor,
  GIT_ACTIVITY_KINDS,
  TicketActivityChange,
  type ActivityActorShape,
  type ActivityCause
} from "@pp/shared"
import { and, desc, eq, lt, notInArray, or, sql } from "drizzle-orm"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"

import { contentHash } from "../markdown/fileContent"
import { Markdown } from "../markdown/Markdown"
import type { TicketScopedChange } from "./changes"
import {
  TicketActivity,
  type ActivityDocument,
  type ActivityPageCursor,
  type StoredTicketActivity,
  type TicketActivityShape
} from "./TicketActivity"

const ABSENT = "absent"

const documentHash = (content: string | null): string =>
  content === null ? ABSENT : contentHash(content)

const encodeChange = Schema.encodeSync(TicketActivityChange)
const decodeChange = Schema.decodeUnknownSync(TicketActivityChange)

type ActorColumns = Pick<
  TicketActivityOutboxRow,
  | "actorKind"
  | "actorUserId"
  | "actorClientId"
  | "actorClientName"
  | "actorSource"
>

const actorColumns = (actor: ActivityActorShape): ActorColumns => {
  if (actor.kind === "system") {
    return {
      actorKind: "system",
      actorUserId: null,
      actorClientId: null,
      actorClientName: null,
      actorSource: actor.source
    }
  }
  return {
    actorKind: actor.kind,
    actorUserId: actor.userId,
    actorClientId: actor.kind === "agent" ? actor.clientId : null,
    actorClientName: actor.kind === "agent" ? actor.clientName : null,
    actorSource: null
  }
}

const actorOf = (
  row: typeof ticketActivity.$inferSelect
): ActivityActorShape => {
  if (row.actorKind === "agent") {
    return ActivityActor.agent(row.actorUserId ?? "", {
      id: row.actorClientId ?? "",
      name: row.actorClientName ?? ""
    })
  }
  if (row.actorKind === "user") return ActivityActor.user(row.actorUserId ?? "")
  return ActivityActor.system(row.actorSource ?? "automation")
}

const olderThan = (cursor: ActivityPageCursor) =>
  or(
    lt(ticketActivity.occurredAt, cursor.occurredAt),
    and(
      eq(ticketActivity.occurredAt, cursor.occurredAt),
      lt(ticketActivity.seq, cursor.seq)
    )
  )

export const TicketActivityLive = Layer.effect(
  TicketActivity,
  Effect.gen(function* () {
    const db = yield* Db
    const markdown = yield* Markdown
    const crypto = yield* Crypto.Crypto
    const newId = crypto.randomUUIDv7.pipe(Effect.orDie)

    const projectIdOf = (orgSlug: string, slug: string) =>
      db
        .select({ id: projectIndex.id })
        .from(projectIndex)
        .innerJoin(
          organization,
          eq(organization.id, projectIndex.organizationId)
        )
        .where(and(eq(organization.slug, orgSlug), eq(projectIndex.slug, slug)))
        .limit(1)
        .pipe(
          Effect.orDie,
          Effect.map((rows) => rows[0]?.id ?? null)
        )

    const discard = (batchId: string) =>
      db
        .delete(ticketActivityOutbox)
        .where(eq(ticketActivityOutbox.batchId, batchId))
        .pipe(Effect.orDie, Effect.asVoid)

    const commit = (
      batchId: string,
      rows: ReadonlyArray<TicketActivityOutboxRow>
    ) =>
      db.transaction(() =>
        Effect.gen(function* () {
          yield* db
            .insert(ticketActivity)
            .values(
              rows.map((row) => ({
                ...row,
                occurredAt: DateTime.toDate(DateTime.makeUnsafe(row.occurredAt))
              }))
            )
            .onConflictDoNothing()
          yield* db
            .delete(ticketActivityOutbox)
            .where(eq(ticketActivityOutbox.batchId, batchId))
        })
      )

    type PendingBatch = Readonly<{
      batchId: string
      contentHash: string
      rows: ReadonlyArray<TicketActivityOutboxRow>
    }>

    const settle = (batch: PendingBatch, content: string | null) =>
      documentHash(content) === batch.contentHash
        ? commit(batch.batchId, batch.rows).pipe(Effect.orDie, Effect.as(true))
        : discard(batch.batchId).pipe(Effect.as(false))

    const readDocument = (
      orgSlug: string,
      slug: string,
      kind: ActivityDocument["kind"],
      id: string
    ) =>
      (kind === "ticket"
        ? markdown.readTicketFileRaw(orgSlug, slug, id)
        : markdown.readGroupFileRaw(orgSlug, slug, id)
      ).pipe(
        Effect.map((file): string | null => file.content),
        Effect.catchTag("NotFound", () => Effect.succeed(null))
      )

    const settlePending = (
      orgSlug: string,
      slug: string,
      projectId: string,
      document: ActivityDocument
    ) =>
      Effect.gen(function* () {
        const pending = yield* db
          .select({
            batchId: ticketActivityOutbox.batchId,
            contentHash: ticketActivityOutbox.contentHash,
            rows: ticketActivityOutbox.rows
          })
          .from(ticketActivityOutbox)
          .where(
            and(
              eq(ticketActivityOutbox.projectId, projectId),
              eq(ticketActivityOutbox.documentKind, document.kind),
              eq(ticketActivityOutbox.documentId, document.id)
            )
          )
          .pipe(Effect.orDie)
        if (pending.length === 0) return
        const content = yield* readDocument(
          orgSlug,
          slug,
          document.kind,
          document.id
        ).pipe(Effect.orDie)
        yield* Effect.forEach(pending, (batch) => settle(batch, content), {
          discard: true
        })
      })

    const record = <A, E, R>(
      orgSlug: string,
      slug: string,
      document: ActivityDocument,
      changes: ReadonlyArray<TicketScopedChange>,
      cause: ActivityCause | null,
      write: Effect.Effect<A, E, R>
    ): Effect.Effect<A, E, R | ActivityActor> =>
      Effect.gen(function* () {
        const projectId = yield* projectIdOf(orgSlug, slug)
        if (projectId === null) return yield* write
        yield* settlePending(orgSlug, slug, projectId, document)
        if (changes.length === 0) return yield* write
        const actor = yield* ActivityActor
        const occurredAt = DateTime.formatIso(yield* DateTime.now)
        const rows: ReadonlyArray<TicketActivityOutboxRow> =
          yield* Effect.forEach(changes, (entry) =>
            Effect.map(newId, (id) => ({
              id,
              projectId,
              ticketId: entry.ticketId,
              occurredAt,
              ...actorColumns(
                (entry.cause ?? cause) === "git_automation"
                  ? ActivityActor.system("github")
                  : actor
              ),
              cause: entry.cause ?? cause,
              change: encodeChange(entry.change)
            }))
          )
        const batchId = yield* newId
        yield* db
          .insert(ticketActivityOutbox)
          .values({
            batchId,
            projectId,
            documentKind: document.kind,
            documentId: document.id,
            contentHash: documentHash(document.content),
            rows
          })
          .pipe(Effect.orDie)
        const result = yield* write.pipe(Effect.onError(() => discard(batchId)))
        yield* commit(batchId, rows).pipe(
          Effect.retry({
            times: 3,
            schedule: Schedule.exponential("50 millis")
          }),
          Effect.catchCause((failure) =>
            Effect.logError(
              "ticket activity commit failed; boot recovery will settle it",
              { batchId, failure }
            )
          )
        )
        return result
      })

    const recover: TicketActivityShape["recover"] = () =>
      Effect.gen(function* () {
        const pending = yield* db
          .select({
            batchId: ticketActivityOutbox.batchId,
            documentKind: ticketActivityOutbox.documentKind,
            documentId: ticketActivityOutbox.documentId,
            contentHash: ticketActivityOutbox.contentHash,
            rows: ticketActivityOutbox.rows,
            orgSlug: organization.slug,
            slug: projectIndex.slug
          })
          .from(ticketActivityOutbox)
          .innerJoin(
            projectIndex,
            eq(projectIndex.id, ticketActivityOutbox.projectId)
          )
          .innerJoin(
            organization,
            eq(organization.id, projectIndex.organizationId)
          )
          .pipe(Effect.orDie)
        let committed = 0
        yield* Effect.forEach(
          pending,
          (batch) =>
            Effect.gen(function* () {
              const content = yield* readDocument(
                batch.orgSlug,
                batch.slug,
                batch.documentKind,
                batch.documentId
              )
              if (yield* settle(batch, content)) committed += 1
            }).pipe(
              Effect.catchCause((failure) =>
                Effect.logError("ticket activity recovery skipped a batch", {
                  batchId: batch.batchId,
                  failure
                })
              )
            ),
          { discard: true }
        )
        if (pending.length > 0) {
          yield* Effect.logInfo("ticket activity outbox recovered", {
            pending: pending.length,
            committed
          })
        }
      })

    const removeTicket: TicketActivityShape["removeTicket"] = (
      orgSlug,
      slug,
      ticketId
    ) =>
      Effect.gen(function* () {
        const projectId = yield* projectIdOf(orgSlug, slug)
        if (projectId === null) return
        yield* db
          .delete(ticketActivity)
          .where(
            and(
              eq(ticketActivity.projectId, projectId),
              eq(ticketActivity.ticketId, ticketId)
            )
          )
          .pipe(Effect.orDie)
      })

    const page: TicketActivityShape["page"] = (
      projectId,
      ticketId,
      before,
      limit,
      includeGit
    ) =>
      db
        .select()
        .from(ticketActivity)
        .where(
          and(
            eq(ticketActivity.projectId, projectId),
            eq(ticketActivity.ticketId, ticketId),
            before === null ? undefined : olderThan(before),
            includeGit
              ? undefined
              : notInArray(sql<string>`${ticketActivity.change}->>'kind'`, [
                  ...GIT_ACTIVITY_KINDS
                ])
          )
        )
        .orderBy(desc(ticketActivity.occurredAt), desc(ticketActivity.seq))
        .limit(limit)
        .pipe(
          Effect.orDie,
          Effect.map((rows) =>
            rows.map(
              (row): StoredTicketActivity => ({
                id: row.id,
                seq: row.seq,
                occurredAt: row.occurredAt,
                actor: actorOf(row),
                cause: row.cause,
                change: decodeChange(row.change)
              })
            )
          )
        )

    return TicketActivity.of({ record, recover, removeTicket, page })
  })
)

export const TicketActivityRecoveryLive = Layer.effectDiscard(
  Effect.flatMap(TicketActivity, (activity) => activity.recover())
)
