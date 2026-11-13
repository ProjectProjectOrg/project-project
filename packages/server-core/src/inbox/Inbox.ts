import { Db } from "@pp/db"
import { inboxRow } from "@pp/db/schema"
import { ProjectScope } from "@pp/shared"
import { and, eq, sql } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { lockTickets } from "./inboxRows"

export class Inbox extends Context.Service<
  Inbox,
  Readonly<{
    markRead: (ticketId: string) => Effect.Effect<void, never, ProjectScope>
  }>
>()("@pp/server-core/inbox/Inbox") {}

const make = Effect.gen(function* () {
  const db = yield* Db

  const markRead = Effect.fn("Inbox.markRead")(function* (ticketId: string) {
    const scope = yield* ProjectScope
    yield* db
      .transaction(() =>
        lockTickets(db, scope.projectId, [ticketId]).pipe(
          Effect.andThen(
            db
              .update(inboxRow)
              .set({
                state: sql`case when ${inboxRow.state} = 'done' then 'done' else 'read' end`,
                unreadCount: 0,
                lastReadAt: sql`now()`,
                readByClientName: null
              })
              .where(
                and(
                  eq(inboxRow.projectId, scope.projectId),
                  eq(inboxRow.ticketId, ticketId),
                  eq(inboxRow.userId, scope.userId)
                )
              )
          )
        )
      )
      .pipe(Effect.orDie)
  })

  return Inbox.of({ markRead })
})

export const layer = Layer.effect(Inbox, make)
