import { TicketId, type TicketTitle } from "@pp/shared"
import { and, asc, eq } from "drizzle-orm"
import * as Effect from "effect/Effect"

import { LocalDb } from "./LocalDb"
import { localTickets } from "./tables"

const t = localTickets

export const localTitles = (copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const rows = yield* db
      .select({ id: t.id, title: t.title })
      .from(t)
      .where(and(eq(t.copy, copy), eq(t.archived, 0)))
      .orderBy(asc(t.orderId))
    return rows.map(
      (row): TicketTitle => ({ id: TicketId.make(row.id), title: row.title })
    )
  })
