import { Db } from "@pp/db"
import { sidebarPin } from "@pp/db/schema"
import { and, eq } from "drizzle-orm"
import * as Effect from "effect/Effect"

export const removeTicketPins = (projectId: string, ticketId: string) =>
  Effect.flatMap(Db, (db) =>
    db
      .delete(sidebarPin)
      .where(
        and(
          eq(sidebarPin.projectId, projectId),
          eq(sidebarPin.kind, "ticket"),
          eq(sidebarPin.ref, ticketId)
        )
      )
  )
