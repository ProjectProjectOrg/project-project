import { Db } from "@pp/db"
import { projectImport, projectImportReference } from "@pp/db/schema"
import {
  type ActivityActor,
  type Conflict,
  type FixReferenceInput,
  type Forbidden,
  type MentionInvalid,
  type NotFound,
  ProjectScope,
  type ReferencesToFix,
  type ReferenceToFix,
  Validation
} from "@pp/shared"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type * as Markdown from "../markdown/Markdown"
import * as TicketCommands from "../tickets/TicketCommands"
import * as TicketDocs from "../tickets/TicketDocs"
import type * as TicketIndex from "../tickets/TicketIndex"
import type { TicketReadError } from "../tickets/ticketPresentation"
import type * as Users from "../users/Users"
import {
  insertImportReferences,
  readImportReferenceCandidates,
  readReferenceCandidates,
  referenceKey,
  unresolvedReferences
} from "./importReferences"
import { applyReferenceFix, referenceOrigin } from "./references"

export class ProjectReferences extends Context.Service<
  ProjectReferences,
  Readonly<{
    list: () => Effect.Effect<
      ReferencesToFix,
      Markdown.MarkdownError,
      ProjectScope
    >
    fix: (
      input: FixReferenceInput
    ) => Effect.Effect<
      ReferencesToFix,
      | Markdown.MarkdownError
      | Forbidden
      | NotFound
      | Validation
      | MentionInvalid
      | Conflict
      | TicketReadError,
      ProjectScope | ActivityActor
    >
  }>
>()("@pp/server-core/projects/ProjectReferences") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const ticketDocs = yield* TicketDocs.TicketDocs
  const commands = yield* TicketCommands.TicketCommands
  const provided = yield* Effect.context<
    TicketDocs.TicketDocs | TicketIndex.TicketIndex | Users.Users
  >()

  const backfill = Effect.fn("ProjectReferences.backfill")(function* (
    scope: ProjectScope["Service"],
    importId: string
  ) {
    yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          const [pending] = yield* tx
            .select({
              sourceUrl: sql<
                string | null
              >`${projectImport.manifest} -> 'source' ->> 'url'`
            })
            .from(projectImport)
            .where(
              and(
                eq(projectImport.id, importId),
                eq(projectImport.referencesScanned, false)
              )
            )
            .for("update", { skipLocked: true })
          if (!pending) return
          const candidates = yield* readImportReferenceCandidates(
            scope,
            referenceOrigin(pending.sourceUrl)
          )
          const unresolved = yield* unresolvedReferences(scope, candidates)
          yield* insertImportReferences(tx, unresolved)
          yield* tx
            .update(projectImport)
            .set({ referencesScanned: true })
            .where(eq(projectImport.id, importId))
        })
      )
      .pipe(Effect.provide(provided))
  })

  const list = Effect.fn("ProjectReferences.list")(function* () {
    const scope = yield* ProjectScope
    const [imported] = yield* db
      .select({
        id: projectImport.id,
        referencesScanned: projectImport.referencesScanned
      })
      .from(projectImport)
      .where(
        and(
          eq(projectImport.destinationProjectId, scope.projectId),
          eq(projectImport.status, "succeeded")
        )
      )
      .orderBy(desc(projectImport.updatedAt))
      .limit(1)
      .pipe(Effect.orDie)
    if (!imported) return { items: [] }
    if (!imported.referencesScanned)
      yield* backfill(scope, imported.id).pipe(
        Effect.catchCause((cause) =>
          Effect.logError("project import reference backfill failed", {
            importId: imported.id,
            cause
          })
        ),
        Effect.forkDetach
      )

    const rows = yield* db
      .select()
      .from(projectImportReference)
      .where(eq(projectImportReference.projectId, scope.projectId))
      .orderBy(projectImportReference.ticketId)
      .pipe(Effect.orDie)
    if (rows.length === 0) return { items: [] }

    const unresolved = yield* unresolvedReferences(scope, rows).pipe(
      Effect.provide(provided)
    )
    const current = yield* Effect.forEach(
      Object.entries(Arr.groupBy(unresolved, (row) => row.ticketId)),
      ([ticketId, references]) =>
        Effect.gen(function* () {
          const origin = referenceOrigin(
            references.find((row) => row.kind === "link")?.target ?? null
          )
          const candidates = yield* readReferenceCandidates(
            scope,
            ticketId,
            origin
          )
          const byKey = new Map(
            references.map((row) => [referenceKey(row), row.id])
          )
          return candidates.flatMap((candidate) => {
            const id = byKey.get(referenceKey(candidate))
            return id === undefined
              ? []
              : [
                  {
                    id,
                    item: { ticketId, ...candidate } satisfies ReferenceToFix
                  }
                ]
          })
        }),
      { concurrency: 16 }
    ).pipe(Effect.provide(provided))

    const matches = current.flat()
    const liveIds = new Set(matches.map(({ id }) => id))
    const stale = rows.filter(({ id }) => !liveIds.has(id)).map(({ id }) => id)
    for (const ids of Arr.chunksOf(stale, 500)) {
      yield* db
        .delete(projectImportReference)
        .where(inArray(projectImportReference.id, ids))
        .pipe(Effect.orDie)
    }
    return { items: matches.map(({ item }) => item) }
  })

  const fix = Effect.fn("ProjectReferences.fix")(function* (
    input: FixReferenceInput
  ) {
    const { items } = yield* list()
    const ticketIds = [
      ...new Set(
        items
          .filter(
            (item) =>
              item.kind === input.kind &&
              item.target === input.target &&
              (input.ticketId === null || item.ticketId === input.ticketId)
          )
          .map((item) => item.ticketId)
      )
    ]
    const scope = yield* ProjectScope
    for (const ticketId of ticketIds) {
      const document = yield* ticketDocs.read(
        scope.orgSlug,
        scope.slug,
        ticketId
      )
      const body = applyReferenceFix(document.body, input, input.action)
      if (body === document.body) continue
      yield* commands
        .update(ticketId, { body }, undefined, {
          body: document.body,
          updatedAt: document.updatedAt
        })
        .pipe(
          Effect.catchTag(
            "SprintCompletedImmutable",
            () => new Validation({ reason: "sprint_completed_immutable" })
          )
        )
      yield* db
        .delete(projectImportReference)
        .where(
          and(
            eq(projectImportReference.projectId, scope.projectId),
            eq(projectImportReference.ticketId, ticketId),
            eq(projectImportReference.kind, input.kind),
            eq(projectImportReference.target, input.target)
          )
        )
        .pipe(Effect.orDie)
    }
    return yield* list()
  })

  return ProjectReferences.of({ list, fix })
})

export const layer = Layer.effect(ProjectReferences, make)
