import type { Db } from "@pp/db"
import { projectImportReference } from "@pp/db/schema"
import { eq, inArray } from "drizzle-orm"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"

import * as TicketDocs from "../tickets/TicketDocs"
import * as TicketIndex from "../tickets/TicketIndex"
import type { TicketProject } from "../tickets/ticketProject"
import * as Users from "../users/Users"
import { referenceCandidates } from "./references"

type Target = Pick<
  typeof projectImportReference.$inferSelect,
  "kind" | "target"
>
type Tx = Parameters<Parameters<Db["Service"]["transaction"]>[0]>[0]

const BATCH_SIZE = 500

export const referenceKey = ({ kind, target }: Target) => `${kind}:${target}`

export const readReferenceCandidates = Effect.fn("ImportReferences.read")(
  function* (project: TicketProject, ticketId: string, origin: string | null) {
    const docs = yield* TicketDocs.TicketDocs
    return yield* docs.read(project.orgSlug, project.slug, ticketId).pipe(
      Effect.map((document) => referenceCandidates(document.body, origin)),
      Effect.catchTags({
        NotFound: () => Effect.succeed([]),
        MalformedTicketDocument: () => Effect.succeed([])
      })
    )
  }
)

export const unresolvedReferences = Effect.fn("ImportReferences.unresolved")(
  function* <A extends Target>(
    project: TicketProject,
    references: ReadonlyArray<A>
  ) {
    const ticketIndex = yield* TicketIndex.TicketIndex
    const users = yield* Users.Users
    const batches = yield* Effect.forEach(
      Arr.chunksOf(references, BATCH_SIZE),
      (batch) =>
        Effect.gen(function* () {
          const ticketTargets = [
            ...new Set(
              batch.filter((r) => r.kind === "ticket").map((r) => r.target)
            )
          ]
          const userTargets = [
            ...new Set(
              batch.filter((r) => r.kind === "user").map((r) => r.target)
            )
          ]
          const existingTickets = yield* ticketIndex.existingIds(
            project,
            ticketTargets
          )
          const mentionableTickets = yield* ticketIndex.mentionableIds(
            project,
            ticketTargets
          )
          const existingUsers = new Set(
            (yield* users.findManyByIds(userTargets)).map((user) => user.id)
          )
          return batch.filter(
            ({ kind, target }) =>
              kind === "link" ||
              (kind === "user"
                ? !existingUsers.has(target)
                : !existingTickets.has(target) &&
                  !mentionableTickets.has(target))
          )
        })
    )
    return batches.flat()
  }
)

export const readImportReferenceCandidates = Effect.fn("ImportReferences.scan")(
  function* (project: TicketProject, origin: string | null) {
    const docs = yield* TicketDocs.TicketDocs
    const ids = yield* docs.listIds(project.orgSlug, project.slug)
    const tickets = yield* Effect.forEach(
      ids,
      (ticketId) =>
        Effect.map(
          readReferenceCandidates(project, ticketId, origin),
          (candidates) => [
            ...new Map(
              candidates.map(({ kind, target }) => [
                referenceKey({ kind, target }),
                { projectId: project.projectId, ticketId, kind, target }
              ])
            ).values()
          ]
        ),
      { concurrency: 16 }
    )
    return tickets.flat()
  }
)

export const insertImportReferences = Effect.fn("ImportReferences.insert")(
  function* (
    tx: Tx,
    references: ReadonlyArray<typeof projectImportReference.$inferInsert>
  ) {
    for (const rows of Arr.chunksOf(references, BATCH_SIZE)) {
      yield* tx.insert(projectImportReference).values(rows)
    }
  }
)

export const pruneResolvedImportReferences = Effect.fn(
  "ImportReferences.pruneResolved"
)(function* (tx: Tx, project: TicketProject) {
  const rows = yield* tx
    .select()
    .from(projectImportReference)
    .where(eq(projectImportReference.projectId, project.projectId))
  const unresolved = new Set(
    (yield* unresolvedReferences(project, rows)).map(({ id }) => id)
  )
  const resolved = rows
    .filter(({ id }) => !unresolved.has(id))
    .map(({ id }) => id)
  for (const ids of Arr.chunksOf(resolved, BATCH_SIZE)) {
    yield* tx
      .delete(projectImportReference)
      .where(inArray(projectImportReference.id, ids))
  }
})
