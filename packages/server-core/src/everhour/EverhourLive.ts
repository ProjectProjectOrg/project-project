import {
  EverhourAuthInvalid,
  EverhourError,
  EverhourProjectAccessDenied,
  EverhourRateLimited
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"

import {
  Everhour,
  type EverhourProject,
  type EverhourSection,
  type EverhourShape,
  type EverhourTask,
  type EverhourTimeRecord,
  type EverhourTimer,
  type EverhourTrackingError,
  type EverhourUser
} from "./Everhour"

const baseUrl = "https://api.everhour.com"

const Fetch = FetchHttpClient.Fetch as Context.Key<
  never,
  typeof globalThis.fetch
>

const ExternalId = Schema.Union([Schema.String, Schema.Finite])
const NullableString = Schema.NullOr(Schema.String).pipe(
  Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
)
const IdReference = Schema.Struct({ id: ExternalId })
const NullableIdReference = Schema.NullOr(IdReference).pipe(
  Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
)
const UserResponse = Schema.Struct({
  id: ExternalId,
  name: NullableString,
  email: NullableString
})
const ProjectResponse = Schema.Struct({
  id: ExternalId,
  name: Schema.String.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(""))
  ),
  type: Schema.optional(Schema.String),
  users: Schema.optional(Schema.Array(ExternalId))
})
const TeamResponse = Schema.Array(Schema.Struct({ id: ExternalId }))
const SectionResponse = Schema.Struct({
  id: ExternalId,
  name: Schema.String.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(""))
  ),
  status: Schema.optional(Schema.String)
})
const TaskResponse = Schema.Struct({
  id: ExternalId,
  name: Schema.String.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(""))
  ),
  section: Schema.NullOr(ExternalId).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  labels: Schema.Array(Schema.String).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed([]))
  ),
  status: Schema.optional(Schema.String)
})
const TimerResponse = Schema.Struct({
  id: NullableString,
  status: Schema.optional(Schema.String),
  task: NullableIdReference,
  user: NullableIdReference,
  startedAt: NullableString
})
const TimeEntryResponse = Schema.Struct({
  id: ExternalId,
  time: Schema.Finite
})
export const TimeRecordResponse = Schema.Struct({
  id: ExternalId,
  task: NullableIdReference,
  user: Schema.NullOr(ExternalId).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  time: Schema.Finite,
  date: Schema.String.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(""))
  ),
  comment: NullableString,
  history: Schema.Array(TimeEntryResponse).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed([]))
  )
})
const StoppedTimerResponse = Schema.Struct({
  taskTime: Schema.NullOr(TimeRecordResponse).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  )
})
const WebhookResponse = Schema.Struct({ id: ExternalId })
const ErrorResponse = Schema.Struct({
  message: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  detail: Schema.optional(Schema.String),
  errorType: Schema.optional(Schema.String)
})

const decodeResponse = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown
): Effect.Effect<S["Type"], EverhourError> =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError((cause) => new EverhourError({ message: String(cause) }))
  )

const mapUser = (value: unknown): Effect.Effect<EverhourUser, EverhourError> =>
  decodeResponse(UserResponse, value).pipe(
    Effect.map((user) => ({
      id: String(user.id),
      name: user.name,
      email: user.email
    }))
  )

const mapProject = (
  value: unknown
): Effect.Effect<EverhourProject, EverhourError> =>
  decodeResponse(ProjectResponse, value).pipe(
    Effect.map((project) => ({
      id: String(project.id),
      name: project.name,
      type: project.type === "list" ? "list" : "board",
      users: project.users === undefined ? null : project.users.map(String)
    }))
  )

const mapSection = (
  value: unknown
): Effect.Effect<EverhourSection, EverhourError> =>
  decodeResponse(SectionResponse, value).pipe(
    Effect.map((section) => ({
      id: String(section.id),
      name: section.name,
      status: section.status === "archived" ? "archived" : "open"
    }))
  )

const mapTask = (value: unknown): Effect.Effect<EverhourTask, EverhourError> =>
  decodeResponse(TaskResponse, value).pipe(
    Effect.map((task) => ({
      id: String(task.id),
      name: task.name,
      section: task.section,
      labels: task.labels,
      status: task.status === "closed" ? "closed" : "open"
    }))
  )

const mapTimer = (
  value: unknown
): Effect.Effect<EverhourTimer, EverhourError> =>
  decodeResponse(TimerResponse, value).pipe(
    Effect.map((timer) => ({
      id: timer.id,
      status: timer.status === "active" ? "active" : "stopped",
      taskId: timer.task === null ? null : String(timer.task.id),
      userId: timer.user === null ? null : String(timer.user.id),
      startedAt: timer.startedAt
    }))
  )

export const toTimeRecord = (
  record: typeof TimeRecordResponse.Type
): EverhourTimeRecord => ({
  id: String(record.id),
  taskId: record.task === null ? null : String(record.task.id),
  userId: record.user === null ? null : String(record.user),
  seconds: record.time,
  date: record.date,
  comment: record.comment,
  history: record.history.map((entry) => ({
    id: String(entry.id),
    seconds: entry.time
  }))
})

const mapTimeRecord = (
  value: unknown
): Effect.Effect<EverhourTimeRecord, EverhourError> =>
  decodeResponse(TimeRecordResponse, value).pipe(Effect.map(toTimeRecord))

const noTaskAccess = (body: unknown) =>
  Schema.decodeUnknownOption(ErrorResponse)(body).pipe(
    Option.exists(
      ({ errorType }) => errorType === "task_provider_no_task_access"
    )
  )

const errorMessage = (body: unknown) => {
  const decoded = Schema.decodeUnknownOption(ErrorResponse)(body)
  if (Option.isNone(decoded)) return "Everhour error"
  return (
    decoded.value.message ??
    decoded.value.error ??
    decoded.value.detail ??
    "Everhour error"
  )
}

const payloadPreview = (payload: unknown) => {
  const text = Schema.is(Schema.String)(payload)
    ? payload
    : JSON.stringify(payload ?? null)
  return text.length > 500 ? `${text.slice(0, 500)}...` : text
}

const MAX_RATE_LIMIT_WAIT_SECONDS = 10

const rateLimitBackoff = Schedule.exponential("1 second").pipe(
  Schedule.jittered,
  Schedule.modifyDelay(({ input, duration }) =>
    Effect.succeed(
      Schema.is(EverhourRateLimited)(input)
        ? Duration.max(duration, Duration.seconds(input.retryAfterSeconds))
        : duration
    )
  )
)

const send = <A>(
  apiKey: string,
  method: string,
  path: string,
  body: unknown,
  onOk: (payload: unknown, status: number) => A,
  treatNotFound: boolean
) =>
  Effect.gen(function* () {
    const fetch = yield* Effect.service(Fetch)
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
            "X-Accept-Version": "1.2"
          },
          body: body === undefined ? undefined : Response.json(body).body
        }),
      catch: (cause) => new EverhourError({ message: String(cause) })
    })
    const payload =
      response.status === 204
        ? null
        : yield* Effect.promise(() => response.json().catch(() => null))
    if (response.ok || (treatNotFound && response.status === 404)) {
      return onOk(payload, response.status)
    }
    const message = errorMessage(payload)
    const endpoint = `${method} ${baseUrl}${path}`
    yield* Effect.logWarning(
      `Everhour API request failed: ${endpoint} -> ${response.status} ${message}`
    ).pipe(
      Effect.annotateLogs({
        endpoint,
        method,
        path,
        status: response.status,
        message,
        responseBody: payloadPreview(payload)
      })
    )
    if (response.status === 401) return yield* new EverhourAuthInvalid()
    if (noTaskAccess(payload)) return yield* new EverhourProjectAccessDenied()
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "1")
      return yield* new EverhourRateLimited({
        retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 1
      })
    }
    return yield* new EverhourError({ message })
  }).pipe(
    Effect.retry({
      schedule: rateLimitBackoff,
      times: 3,
      while: (error) =>
        error._tag === "EverhourRateLimited" &&
        error.retryAfterSeconds <= MAX_RATE_LIMIT_WAIT_SECONDS
    })
  )

const request = <A>(
  apiKey: string,
  method: string,
  path: string,
  body: unknown,
  map: (value: unknown) => Effect.Effect<A, EverhourError>
) =>
  send(apiKey, method, path, body, (payload) => payload, false).pipe(
    Effect.flatMap(map)
  )

const requestNullable = <A>(
  apiKey: string,
  method: string,
  path: string,
  body: unknown,
  map: (value: unknown) => Effect.Effect<A, EverhourError>
) =>
  send(
    apiKey,
    method,
    path,
    body,
    (payload, status) => (status === 404 ? null : payload),
    true
  ).pipe(
    Effect.flatMap((payload) =>
      payload === null ? Effect.succeed(null) : map(payload)
    )
  )

export const EverhourLive = Layer.effect(
  Everhour,
  Effect.gen(function* () {
    const fetch = yield* Effect.service(Fetch)
    const tracking = <A>(
      effect: Effect.Effect<A, EverhourTrackingError>
    ): Effect.Effect<A, EverhourTrackingError> =>
      effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch))
    const withFetch = <A>(effect: Effect.Effect<A, EverhourTrackingError>) =>
      tracking(effect).pipe(
        Effect.catchTag("EverhourProjectAccessDenied", () =>
          Effect.fail(
            new EverhourError({
              message: "Everhour denied access to this project"
            })
          )
        )
      )

    return {
      getCurrentUser: (apiKey) =>
        withFetch(request(apiKey, "GET", "/users/me", undefined, mapUser)),
      getProject: (apiKey, projectId) =>
        withFetch(
          request(
            apiKey,
            "GET",
            `/projects/${encodeURIComponent(projectId)}`,
            undefined,
            mapProject
          )
        ),
      createProject: (apiKey, input) =>
        withFetch(request(apiKey, "POST", "/projects", input, mapProject)),
      updateProject: (apiKey, projectId, input) =>
        withFetch(
          request(
            apiKey,
            "PUT",
            `/projects/${encodeURIComponent(projectId)}`,
            { name: input.name, type: "board" },
            mapProject
          )
        ),
      teamUserIds: (apiKey) =>
        withFetch(
          request(apiKey, "GET", "/team/users", undefined, (value) =>
            decodeResponse(TeamResponse, value).pipe(
              Effect.map((users) => users.map((user) => String(user.id)))
            )
          )
        ),
      assignProjectUsers: (apiKey, projectId, users) =>
        withFetch(
          request(
            apiKey,
            "PUT",
            `/projects/${encodeURIComponent(projectId)}`,
            { users: users.map(Number) },
            mapProject
          )
        ),
      createSection: (apiKey, projectId, input) =>
        withFetch(
          request(
            apiKey,
            "POST",
            `/projects/${encodeURIComponent(projectId)}/sections`,
            input,
            mapSection
          )
        ),
      updateSection: (apiKey, sectionId, input) =>
        withFetch(
          request(
            apiKey,
            "PUT",
            `/sections/${encodeURIComponent(sectionId)}`,
            input,
            mapSection
          )
        ),
      getTask: (apiKey, taskId) =>
        withFetch(
          request(
            apiKey,
            "GET",
            `/tasks/${encodeURIComponent(taskId)}`,
            undefined,
            mapTask
          )
        ),
      createTask: (apiKey, projectId, payload) =>
        withFetch(
          request(
            apiKey,
            "POST",
            `/projects/${encodeURIComponent(projectId)}/tasks`,
            payload,
            mapTask
          )
        ),
      updateTask: (apiKey, taskId, payload) =>
        withFetch(
          request(
            apiKey,
            "PUT",
            `/tasks/${encodeURIComponent(taskId)}`,
            payload,
            mapTask
          )
        ),
      startTimer: (apiKey, input) =>
        tracking(request(apiKey, "POST", "/timers", input, mapTimer)),
      getCurrentTimer: (apiKey) =>
        withFetch(
          requestNullable(
            apiKey,
            "GET",
            "/timers/current",
            undefined,
            mapTimer
          ).pipe(
            Effect.map((timer) =>
              timer && timer.status === "active" && timer.taskId ? timer : null
            )
          )
        ),
      stopTimer: (apiKey) =>
        withFetch(
          requestNullable(
            apiKey,
            "DELETE",
            "/timers/current",
            undefined,
            (value) =>
              decodeResponse(StoppedTimerResponse, value).pipe(
                Effect.map(({ taskTime }) =>
                  taskTime === null ? null : toTimeRecord(taskTime)
                )
              )
          )
        ),
      addTime: (apiKey, input) =>
        tracking(request(apiKey, "POST", "/time", input, mapTimeRecord)),
      createWebhook: (apiKey, input) =>
        withFetch(
          request(
            apiKey,
            "POST",
            "/hooks",
            {
              targetUrl: input.targetUrl,
              events: ["api:time:updated"],
              project: input.project
            },
            (value) =>
              decodeResponse(WebhookResponse, value).pipe(
                Effect.map((webhook) => ({ id: String(webhook.id) }))
              )
          )
        ),
      deleteWebhook: (apiKey, webhookId) =>
        withFetch(
          request(
            apiKey,
            "DELETE",
            `/hooks/${encodeURIComponent(webhookId)}`,
            undefined,
            () => Effect.void
          )
        )
    } satisfies EverhourShape
  })
)
