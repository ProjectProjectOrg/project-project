import { Db } from "@pp/db"
import { ticketIndex } from "@pp/db/schema"
import { NO_DESCRIPTION_REVISION, type SyncCursor } from "@pp/shared"
import { and, eq, inArray } from "drizzle-orm"
import * as Effect from "effect/Effect"

export const descriptionRevisions = Effect.fn("descriptionRevisions")(
  function* (projectId: string, ids: ReadonlyArray<string>) {
    if (ids.length === 0) return new Map<string, SyncCursor>()
    const db = yield* Db
    const rows = yield* db
      .select({
        id: ticketIndex.ticketId,
        revision: ticketIndex.descriptionRevision
      })
      .from(ticketIndex)
      .where(
        and(
          eq(ticketIndex.projectId, projectId),
          inArray(ticketIndex.ticketId, [...ids])
        )
      )
    return new Map(
      rows.map((row): [string, SyncCursor] => [
        row.id,
        row.revision ?? NO_DESCRIPTION_REVISION
      ])
    )
  },
  Effect.orDie
)
