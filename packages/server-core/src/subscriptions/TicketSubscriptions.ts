import { Db } from "@pp/db"
import { ticketSubscription, ticketIndex } from "@pp/db/schema"
import {
  Forbidden,
  NotFound,
  ProjectScope,
  type TicketSubscribers,
  UserId
} from "@pp/shared"
import { and, eq, sql } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import * as Users from "../users/Users"

export class TicketSubscriptions extends Context.Service<
  TicketSubscriptions,
  Readonly<{
    list: (
      ticketId: string
    ) => Effect.Effect<TicketSubscribers, NotFound, ProjectScope>
    setSubscribed: (
      ticketId: string,
      subscribed: boolean
    ) => Effect.Effect<TicketSubscribers, NotFound | Forbidden, ProjectScope>
  }>
>()("@pp/server-core/subscriptions/TicketSubscriptions") {}

const decodeUserId = Schema.decodeSync(UserId)

const make = Effect.gen(function* () {
  const db = yield* Db
  const users = yield* Users.Users

  const requireTicket = (projectId: string, ticketId: string) =>
    db
      .select({ ticketId: ticketIndex.ticketId })
      .from(ticketIndex)
      .where(
        and(
          eq(ticketIndex.projectId, projectId),
          eq(ticketIndex.ticketId, ticketId)
        )
      )
      .limit(1)
      .pipe(
        Effect.orDie,
        Effect.flatMap((rows) =>
          rows.length === 0 ? Effect.fail(new NotFound()) : Effect.void
        )
      )

  const subscribersOf = (scope: ProjectScope["Service"], ticketId: string) =>
    Effect.gen(function* () {
      const rows = yield* db
        .select({ userId: ticketSubscription.userId })
        .from(ticketSubscription)
        .where(
          and(
            eq(ticketSubscription.projectId, scope.projectId),
            eq(ticketSubscription.ticketId, ticketId),
            eq(ticketSubscription.subscribed, true)
          )
        )
        .orderBy(ticketSubscription.updatedAt)
        .pipe(Effect.orDie)
      const userIds = rows.map((row) => decodeUserId(row.userId))
      const found = yield* users.fullByIds(userIds)
      const byId = new Map(found.map((user) => [user.id, user]))
      return {
        subscribed: userIds.some((id) => id === scope.userId),
        subscribers: userIds.flatMap((id) => {
          const user = byId.get(id)
          return user === undefined ? [] : [user]
        })
      } satisfies TicketSubscribers
    })

  const list = Effect.fn("TicketSubscriptions.list")(function* (
    ticketId: string
  ) {
    const scope = yield* ProjectScope
    yield* requireTicket(scope.projectId, ticketId)
    return yield* subscribersOf(scope, ticketId)
  })

  const setSubscribed = Effect.fn("TicketSubscriptions.setSubscribed")(
    function* (ticketId: string, subscribed: boolean) {
      const scope = yield* ProjectScope
      if (scope.role === null) return yield* new Forbidden()
      yield* requireTicket(scope.projectId, ticketId)
      yield* db
        .insert(ticketSubscription)
        .values({
          projectId: scope.projectId,
          ticketId,
          userId: scope.userId,
          subscribed
        })
        .onConflictDoUpdate({
          target: [
            ticketSubscription.projectId,
            ticketSubscription.ticketId,
            ticketSubscription.userId
          ],
          set: { subscribed, updatedAt: sql`now()` }
        })
        .pipe(Effect.orDie)
      return yield* subscribersOf(scope, ticketId)
    }
  )

  return TicketSubscriptions.of({ list, setSubscribed })
})

export const layer = Layer.effect(TicketSubscriptions, make)
