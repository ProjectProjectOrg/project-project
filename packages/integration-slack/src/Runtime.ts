import { Db } from "@pp/db"
import {
  organization,
  organizationIntegration,
  slackNotification
} from "@pp/db/schema"
import { SlackError } from "@pp/shared"
import { LogLevel, SocketModeClient } from "@slack/socket-mode"
import { and, eq, isNull, lte } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FiberSet from "effect/FiberSet"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as Scope from "effect/Scope"

import { SlackDeliveryWorkflow } from "./Delivery"
import { SlackEvents } from "./Events"
import { SlackIntegrations } from "./Integrations"
import { SlackPreviews } from "./Previews"

const quietLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  setLevel: () => {},
  getLevel: () => LogLevel.ERROR,
  setName: () => {}
}

export const SlackRuntimeLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const db = yield* Db
    const integrations = yield* SlackIntegrations
    const previews = yield* SlackPreviews
    const events = yield* SlackEvents
    const scope = yield* Scope.Scope
    const sockets = new Map<
      string,
      Readonly<{ token: string; fiber: Fiber.Fiber<void, never> }>
    >()

    const setSocketError = (
      organizationId: string,
      lastCheckError: string | null
    ) =>
      db
        .update(organizationIntegration)
        .set({ lastCheckError })
        .where(
          and(
            eq(organizationIntegration.organizationId, organizationId),
            eq(organizationIntegration.provider, "slack"),
            eq(organizationIntegration.status, "active")
          )
        )
        .pipe(Effect.orDie)

    // The SDK's own reconnect loop swallows permanent failures after the first
    // connection, so each session ends on disconnect and the loop reopens it,
    // surfacing a failed reopen as a connection error.
    const openSocket = (organizationId: string, appToken: string) =>
      Effect.gen(function* () {
        const socket = yield* Effect.acquireRelease(
          Effect.sync(
            () =>
              new SocketModeClient({
                appToken,
                logger: quietLogger,
                autoReconnectEnabled: false,
                clientOptions: { retryConfig: { retries: 0 }, timeout: 10_000 }
              })
          ),
          (client) =>
            Effect.promise(() => client.disconnect().catch(() => undefined))
        )
        const run = yield* FiberSet.makeRuntime()
        socket.on(
          "slack_event",
          ({
            ack,
            body
          }: Readonly<{ ack: () => Promise<void>; body: unknown }>) => {
            void ack().catch(() => undefined)
            run(
              previews.handle(organizationId, body).pipe(
                Effect.catchCause(() =>
                  Effect.logWarning("Slack preview could not be delivered", {
                    organizationId
                  })
                )
              )
            )
          }
        )
        yield* Effect.tryPromise({
          try: () => socket.start(),
          catch: () => new SlackError({ reason: "socket_connection" })
        })
        yield* setSocketError(organizationId, null)
        yield* Effect.callback<void>((resume) => {
          socket.once("disconnected", () => resume(Effect.void))
        })
      }).pipe(
        Effect.scoped,
        Effect.repeat(Schedule.spaced("1 second")),
        Effect.asVoid,
        Effect.catchCause(() =>
          Effect.gen(function* () {
            yield* setSocketError(organizationId, "socket_connection")
            yield* Effect.logWarning(
              "Slack connection failed; it will be retried",
              { organizationId }
            )
          })
        )
      )

    const reconcile = Effect.gen(function* () {
      const rows = yield* db
        .select({ id: organizationIntegration.organizationId })
        .from(organizationIntegration)
        .innerJoin(
          organization,
          eq(organization.id, organizationIntegration.organizationId)
        )
        .where(
          and(
            eq(organizationIntegration.provider, "slack"),
            eq(organizationIntegration.status, "active"),
            isNull(organization.deletedAt)
          )
        )
        .pipe(Effect.orDie)
      const active = new Set(rows.map((row) => row.id))
      for (const [id, socket] of sockets) {
        if (!active.has(id)) {
          yield* Fiber.interrupt(socket.fiber)
          sockets.delete(id)
        }
      }
      for (const { id } of rows) {
        yield* Effect.gen(function* () {
          const credentials = yield* integrations.credentials(id)
          const existing = sockets.get(id)
          if (
            existing &&
            existing.token === credentials.appToken &&
            existing.fiber.pollUnsafe() === undefined
          )
            return
          if (existing) yield* Fiber.interrupt(existing.fiber)
          const fiber = yield* openSocket(id, credentials.appToken).pipe(
            Effect.forkIn(scope)
          )
          sockets.set(id, { token: credentials.appToken, fiber })
        }).pipe(
          Effect.catchCause(() =>
            Effect.gen(function* () {
              yield* setSocketError(id, "credentials")
              yield* Effect.logWarning(
                "Slack configuration could not be loaded",
                { organizationId: id }
              )
            })
          )
        )
      }
    })
    const dispatch = Effect.gen(function* () {
      yield* events.enqueue()
      const now = yield* DateTime.nowAsDate
      const pending = yield* db
        .select({ id: slackNotification.id })
        .from(slackNotification)
        .where(
          and(
            isNull(slackNotification.dispatchedAt),
            isNull(slackNotification.finishedAt),
            lte(slackNotification.availableAt, now)
          )
        )
        .orderBy(slackNotification.availableAt)
        .limit(100)
        .pipe(Effect.orDie)
      yield* Effect.forEach(
        pending,
        ({ id }) =>
          SlackDeliveryWorkflow.execute({ id }, { discard: true }).pipe(
            Effect.andThen(
              db
                .update(slackNotification)
                .set({ dispatchedAt: now })
                .where(eq(slackNotification.id, id))
                .pipe(Effect.orDie)
            )
          ),
        { concurrency: 4, discard: true }
      )
    })
    yield* reconcile.pipe(
      Effect.catchCause(() =>
        Effect.logWarning("Slack connection refresh failed")
      ),
      Effect.repeat(Schedule.spaced("10 seconds")),
      Effect.forkIn(scope)
    )
    yield* dispatch.pipe(
      Effect.catchCause(() =>
        Effect.logWarning(
          "Slack job dispatch failed; queued jobs will be retried"
        )
      ),
      Effect.repeat(Schedule.spaced("2 seconds")),
      Effect.forkIn(scope)
    )
  })
)
