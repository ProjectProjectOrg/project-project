import { Db } from "@pp/db"
import { feedbackOutbox } from "@pp/db/schema"
import { AppApi, FeedbackReport, NotFound, Validation } from "@pp/shared"
import { and, eq, isNull } from "drizzle-orm"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import { HttpApiClient } from "effect/http-api"
import * as HttpClient from "effect/http/HttpClient"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import { Activity, DurableClock, Workflow } from "effect/workflow"

import {
  type FeedbackAttachmentBytes,
  FeedbackAttachments
} from "./FeedbackAttachments"
import { FeedbackConfig } from "./FeedbackConfig"

const MAX_ATTEMPTS = 16
const BASE_RETRY_SECONDS = 30
const MAX_RETRY_SECONDS = 6 * 60 * 60
const REQUEST_TIMEOUT = Duration.seconds(60)

const DeliveryOutcome = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("done") }),
  Schema.Struct({ kind: Schema.Literal("retry"), seconds: Schema.Finite })
])
type DeliveryOutcome = typeof DeliveryOutcome.Type

const backoffSeconds = (attempt: number) =>
  Math.min(BASE_RETRY_SECONDS * 2 ** attempt, MAX_RETRY_SECONDS)

const decodeReport = Schema.decodeEffect(FeedbackReport)
const encodeReport = Schema.encodeEffect(FeedbackReport)
const encodeReportJson = Schema.encodeEffect(
  Schema.fromJsonString(FeedbackReport)
)

export const FeedbackDeliveryWorkflow = Workflow.make(
  "ProjectProject/FeedbackDelivery/v1",
  {
    payload: Schema.Struct({ id: Schema.String }),
    success: Schema.Void,
    idempotencyKey: ({ id }) => id
  }
)

const makeFeedbackDelivery = Effect.gen(function* () {
  const db = yield* Db
  const config = yield* FeedbackConfig
  const httpClient = yield* HttpClient.HttpClient
  const crypto = yield* Crypto.Crypto
  const attachments = yield* FeedbackAttachments

  const finish = Effect.fn("FeedbackDelivery.finish")(function* (
    id: string,
    error?: string | null
  ) {
    const now = yield* DateTime.nowAsDate
    yield* db
      .update(feedbackOutbox)
      .set(
        error === undefined ? { finishedAt: now } : { finishedAt: now, error }
      )
      .where(and(eq(feedbackOutbox.id, id), isNull(feedbackOutbox.finishedAt)))
      .pipe(Effect.orDie)
  })

  const recordError = (id: string, error: string) =>
    db
      .update(feedbackOutbox)
      .set({ error })
      .where(eq(feedbackOutbox.id, id))
      .pipe(Effect.orDie)

  const send = Effect.fn("FeedbackDelivery.send")(function* (
    targetUrl: string,
    report: FeedbackReport,
    files: ReadonlyArray<FeedbackAttachmentBytes>
  ) {
    const client = yield* HttpApiClient.group(AppApi, {
      group: "feedbackIntake",
      httpClient,
      baseUrl: new URL("/api", targetUrl).toString()
    })
    const form = new FormData()
    form.append("report", yield* encodeReportJson(report).pipe(Effect.orDie))
    for (const file of files) {
      form.append(
        "files",
        new Blob([file.bytes], { type: file.contentType }),
        file.filename
      )
    }
    yield* client.receive({ payload: form })
  }, Effect.timeout(REQUEST_TIMEOUT))

  const enqueue = Effect.fn("FeedbackDelivery.enqueue")(function* (
    report: Omit<FeedbackReport, "id" | "attachments">,
    attachmentIds: ReadonlyArray<string>
  ) {
    if (Option.isNone(config.targetUrl)) return yield* new NotFound()
    const id = yield* crypto.randomUUIDv7().pipe(Effect.orDie)
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          const claimed = yield* attachments.claimable(attachmentIds)
          const payload = yield* encodeReport({
            ...report,
            id,
            attachments: claimed.map(({ filename, contentType, byteSize }) => ({
              filename,
              contentType,
              byteSize
            }))
          }).pipe(
            Effect.mapError(
              () => new Validation({ reason: "invalid_feedback_report" })
            )
          )
          yield* db
            .insert(feedbackOutbox)
            .values({ id, payload })
            .pipe(Effect.orDie)
          yield* attachments.claim(attachmentIds, id)
        })
      )
      .pipe(Effect.catchTag("SqlError", Effect.die))
  })

  const abandon = (id: string, error?: string) =>
    finish(id, error).pipe(Effect.andThen(attachments.release(id)))

  const retryLater = Effect.fn("FeedbackDelivery.retryLater")(function* (
    id: string,
    attempt: number,
    cause: Cause.Cause<unknown>
  ): Effect.fn.Return<DeliveryOutcome> {
    yield* recordError(id, Cause.pretty(cause).slice(0, 2000))
    yield* Effect.logWarning("feedback delivery failed; will retry", {
      id,
      attempt
    })
    return { kind: "retry", seconds: backoffSeconds(attempt) }
  })

  const deliver = Effect.fn("FeedbackDelivery.deliver")(function* (
    id: string,
    attempt: number
  ): Effect.fn.Return<DeliveryOutcome> {
    const [row] = yield* db
      .select({ payload: feedbackOutbox.payload })
      .from(feedbackOutbox)
      .where(and(eq(feedbackOutbox.id, id), isNull(feedbackOutbox.finishedAt)))
      .limit(1)
      .pipe(Effect.orDie)
    if (!row) return { kind: "done" }
    if (Option.isNone(config.targetUrl)) {
      yield* abandon(id, "sending_disabled")
      return { kind: "done" }
    }
    const report = yield* decodeReport(row.payload).pipe(Effect.orDie)
    const targetUrl = config.targetUrl.value
    return yield* attachments.load(id).pipe(
      Effect.flatMap((files) => send(targetUrl, report, files)),
      Effect.andThen(finish(id, null)),
      Effect.andThen(attachments.release(id)),
      Effect.as<DeliveryOutcome>({ kind: "done" }),
      Effect.catchTag("RateLimited", ({ resetAt }) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          yield* recordError(id, "rate_limited")
          return {
            kind: "retry",
            seconds: Math.max(backoffSeconds(attempt), resetAt - now / 1000)
          } satisfies DeliveryOutcome
        })
      ),
      Effect.catch((error) => retryLater(id, attempt, Cause.fail(error))),
      Effect.catchDefect((defect) => retryLater(id, attempt, Cause.die(defect)))
    )
  })

  const dispatch = Effect.gen(function* () {
    const now = yield* DateTime.nowAsDate
    const pending = yield* db
      .select({ id: feedbackOutbox.id })
      .from(feedbackOutbox)
      .where(
        and(
          isNull(feedbackOutbox.dispatchedAt),
          isNull(feedbackOutbox.finishedAt)
        )
      )
      .orderBy(feedbackOutbox.createdAt)
      .limit(50)
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      pending,
      ({ id }) =>
        FeedbackDeliveryWorkflow.execute({ id }, { discard: true }).pipe(
          Effect.andThen(
            db
              .update(feedbackOutbox)
              .set({ dispatchedAt: now })
              .where(eq(feedbackOutbox.id, id))
              .pipe(Effect.orDie)
          )
        ),
      { concurrency: 4, discard: true }
    )
  })

  const sweep = Effect.gen(function* () {
    yield* dispatch
    yield* attachments.reapUnclaimed
  })

  return { enqueue, deliver, abandon, sweep }
})

export class FeedbackDelivery extends Context.Service<
  FeedbackDelivery,
  Effect.Success<typeof makeFeedbackDelivery>
>()("@pp/server-core/feedback/FeedbackDelivery") {
  static readonly layer = Layer.effect(FeedbackDelivery, makeFeedbackDelivery)
}

export const FeedbackDeliveryWorkflowLive = Layer.unwrap(
  Effect.gen(function* () {
    const delivery = yield* FeedbackDelivery
    return FeedbackDeliveryWorkflow.toLayer(({ id }) =>
      Effect.gen(function* () {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          const outcome = yield* Activity.make({
            name: `deliver/${attempt}`,
            success: DeliveryOutcome,
            execute: delivery.deliver(id, attempt)
          })
          if (outcome.kind === "done") return
          yield* DurableClock.sleep({
            name: `retry/${attempt}`,
            duration: Duration.seconds(Math.ceil(outcome.seconds)),
            inMemoryThreshold: 0
          })
        }
        yield* Activity.make({
          name: "give-up",
          execute: delivery.abandon(id)
        })
      })
    )
  })
)

export const FeedbackDispatcherLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const delivery = yield* FeedbackDelivery
    yield* delivery.sweep.pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning(
          "feedback dispatch failed; queued reports will be retried",
          cause
        )
      ),
      Effect.repeat(Schedule.spaced("5 seconds")),
      Effect.forkScoped
    )
  })
)
