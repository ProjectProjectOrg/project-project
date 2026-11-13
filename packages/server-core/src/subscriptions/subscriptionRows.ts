import { Db } from "@pp/db"
import {
  projectMember,
  ticketActivityOutbox,
  ticketSubscription
} from "@pp/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"
import * as Effect from "effect/Effect"

import { overridesUnsubscribe, type SubscriptionIntent } from "./intents"

export type StagedSubscription =
  (typeof ticketActivityOutbox.$inferSelect)["subscriptions"][number]

export const stageSubscriptions = (
  intents: ReadonlyArray<SubscriptionIntent>
): ReadonlyArray<StagedSubscription> =>
  intents.map(({ ticketId, userId, reason }) => ({
    ticketId,
    userId,
    overridesUnsubscribe: overridesUnsubscribe(reason)
  }))

export const applySubscriptions = (
  projectId: string,
  subscriptions: ReadonlyArray<StagedSubscription>
) =>
  Effect.gen(function* () {
    if (subscriptions.length === 0) return
    const db = yield* Db
    const members = yield* db
      .select({ userId: projectMember.userId })
      .from(projectMember)
      .where(
        and(
          eq(projectMember.projectId, projectId),
          inArray(projectMember.userId, [
            ...new Set(subscriptions.map((subscribe) => subscribe.userId))
          ])
        )
      )
    const memberIds = new Set(members.map((member) => member.userId))
    const rowsOf = (overrides: boolean) =>
      subscriptions
        .filter(
          (subscribe) =>
            memberIds.has(subscribe.userId) &&
            subscribe.overridesUnsubscribe === overrides
        )
        .map((subscribe) => ({
          projectId,
          ticketId: subscribe.ticketId,
          userId: subscribe.userId,
          subscribed: true
        }))
    const overriding = rowsOf(true)
    const joining = rowsOf(false)
    const target = [
      ticketSubscription.projectId,
      ticketSubscription.ticketId,
      ticketSubscription.userId
    ]
    if (overriding.length > 0)
      yield* db
        .insert(ticketSubscription)
        .values(overriding)
        .onConflictDoUpdate({
          target,
          set: { subscribed: true, updatedAt: sql`now()` },
          setWhere: eq(ticketSubscription.subscribed, false)
        })
    if (joining.length > 0)
      yield* db
        .insert(ticketSubscription)
        .values(joining)
        .onConflictDoNothing({ target })
  })

export const removeTicketSubscriptions = (
  projectId: string,
  ticketId: string
) =>
  Effect.flatMap(Db, (db) =>
    db
      .delete(ticketSubscription)
      .where(
        and(
          eq(ticketSubscription.projectId, projectId),
          eq(ticketSubscription.ticketId, ticketId)
        )
      )
  )
