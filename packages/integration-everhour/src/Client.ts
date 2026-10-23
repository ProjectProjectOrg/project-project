import {
  EverhourAuthInvalid,
  EverhourError,
  EverhourProjectAccessDenied,
  EverhourRateLimited
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Function from "effect/Function"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"

export type EverhourUser = Readonly<{
  id: string
  name: string | null
  email: string | null
}>

export type EverhourProject = Readonly<{
  id: string
  name: string
  type: "board" | "list"
  users: ReadonlyArray<string> | null
}>

export type EverhourSection = Readonly<{
  id: string
  name: string
  status: "open" | "archived"
}>

export type EverhourTask = Readonly<{
  id: string
  name: string
  section: string | number | null
  labels: ReadonlyArray<string>
  status: "open" | "closed"
}>

export type EverhourTaskPayload = Readonly<{
  name: string
  section: string
  labels: ReadonlyArray<string>
  description: string
  status: "open" | "closed"
}>

export type EverhourTimer = Readonly<{
  id: string | null
  status: "active" | "stopped"
  taskId: string | null
  userId: string | null
  startedAt: string | null
}>

export type EverhourTimeEntry = Readonly<{
  id: string
  seconds: number
}>

export type EverhourTimeRecord = Readonly<{
  id: string
  taskId: string | null
  userId: string | null
  seconds: number
  date: string
  comment: string | null
  history: ReadonlyArray<EverhourTimeEntry>
}>

export type EverhourClientError =
  | EverhourAuthInvalid
  | EverhourRateLimited
  | EverhourError

export type EverhourTrackingError =
  | EverhourClientError
  | EverhourProjectAccessDenied

export type EverhourShape = Readonly<{
  getCurrentUser: (
    apiKey: string
  ) => Effect.Effect<EverhourUser, EverhourClientError>
  getProject: (
    apiKey: string,
    projectId: string
  ) => Effect.Effect<EverhourProject, EverhourClientError>
  createProject: (
    apiKey: string,
    input: Readonly<{
      name: string
      type: "board"
      users?: ReadonlyArray<string>
    }>
  ) => Effect.Effect<EverhourProject, EverhourClientError>
  updateProject: (
    apiKey: string,
    projectId: string,
    input: Readonly<{ name: string }>
  ) => Effect.Effect<EverhourProject, EverhourClientError>
  teamUserIds: (
    apiKey: string
  ) => Effect.Effect<ReadonlyArray<string>, EverhourClientError>
  assignProjectUsers: (
    apiKey: string,
    projectId: string,
    users: ReadonlyArray<string>
  ) => Effect.Effect<EverhourProject, EverhourClientError>
  createSection: (
    apiKey: string,
    projectId: string,
    input: Readonly<{ name: string; status: "open" | "archived" }>
  ) => Effect.Effect<EverhourSection, EverhourClientError>
  updateSection: (
    apiKey: string,
    sectionId: string,
    input: Readonly<{ name: string; status: "open" | "archived" }>
  ) => Effect.Effect<EverhourSection, EverhourClientError>
  getTask: (
    apiKey: string,
    taskId: string
  ) => Effect.Effect<EverhourTask, EverhourClientError>
  createTask: (
    apiKey: string,
    projectId: string,
    payload: EverhourTaskPayload
  ) => Effect.Effect<EverhourTask, EverhourClientError>
  updateTask: (
    apiKey: string,
    taskId: string,
    payload: EverhourTaskPayload
  ) => Effect.Effect<EverhourTask, EverhourClientError>
  startTimer: (
    apiKey: string,
    input: Readonly<{
      task: string
      comment?: string
      userDate?: string
    }>
  ) => Effect.Effect<EverhourTimer, EverhourTrackingError>
  stopTimer: (
    apiKey: string
  ) => Effect.Effect<EverhourTimeRecord | null, EverhourClientError>
  getCurrentTimer: (
    apiKey: string
  ) => Effect.Effect<EverhourTimer | null, EverhourClientError>
  addTime: (
    apiKey: string,
    input: Readonly<{
      task: string
      time: number
      date: string
      comment?: string
    }>
  ) => Effect.Effect<EverhourTimeRecord, EverhourTrackingError>
  createWebhook: (
    apiKey: string,
    input: Readonly<{ targetUrl: string; project: string }>
  ) => Effect.Effect<Readonly<{ id: string }>, EverhourClientError>
  deleteWebhook: (
    apiKey: string,
    webhookId: string
  ) => Effect.Effect<void, EverhourClientError>
}>

export class Everhour extends Context.Service<Everhour, EverhourShape>()(
  "@pp/integration-everhour/Client/Everhour"
) {}

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
  time: Schema.Finite,
  previousTime: Schema.optional(Schema.Finite)
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

const isString = Schema.is(Schema.String)
const isEverhourRateLimited = Schema.is(EverhourRateLimited)
const decodeJson = Schema.decodeUnknownEffect(Schema.Json)
const decodeUnknownUserResponse = Schema.decodeUnknownEffect(UserResponse)
const decodeUnknownProjectResponse = Schema.decodeUnknownEffect(ProjectResponse)
const decodeUnknownSectionResponse = Schema.decodeUnknownEffect(SectionResponse)
const decodeUnknownTaskResponse = Schema.decodeUnknownEffect(TaskResponse)
const decodeUnknownTimerResponse = Schema.decodeUnknownEffect(TimerResponse)
const decodeUnknownTimeRecordResponse =
  Schema.decodeUnknownEffect(TimeRecordResponse)
const decodeUnknownStoppedTimerResponse =
  Schema.decodeUnknownEffect(StoppedTimerResponse)
const decodeUnknownWebhookResponse = Schema.decodeUnknownEffect(WebhookResponse)
const decodeUnknownTeamResponse = Schema.decodeUnknownEffect(TeamResponse)
const decodeErrorResponse = Schema.decodeUnknownOption(ErrorResponse)

const mapUser = (user: typeof UserResponse.Type): EverhourUser => ({
  id: String(user.id),
  name: user.name,
  email: user.email
})

const mapProject = (project: typeof ProjectResponse.Type): EverhourProject => ({
  id: String(project.id),
  name: project.name,
  type: project.type === "list" ? "list" : "board",
  users: project.users === undefined ? null : project.users.map(String)
})

const mapSection = (section: typeof SectionResponse.Type): EverhourSection => ({
  id: String(section.id),
  name: section.name,
  status: section.status === "archived" ? "archived" : "open"
})

const mapTask = (task: typeof TaskResponse.Type): EverhourTask => ({
  id: String(task.id),
  name: task.name,
  section: task.section,
  labels: task.labels,
  status: task.status === "closed" ? "closed" : "open"
})

const mapTimer = (timer: typeof TimerResponse.Type): EverhourTimer => ({
  id: timer.id,
  status: timer.status === "active" ? "active" : "stopped",
  taskId: timer.task === null ? null : String(timer.task.id),
  userId: timer.user === null ? null : String(timer.user.id),
  startedAt: timer.startedAt
})

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

const decodeUser = Function.compose(
  decodeUnknownUserResponse,
  Effect.map(mapUser)
)
const decodeProject = Function.compose(
  decodeUnknownProjectResponse,
  Effect.map(mapProject)
)
const decodeSection = Function.compose(
  decodeUnknownSectionResponse,
  Effect.map(mapSection)
)
const decodeTask = Function.compose(
  decodeUnknownTaskResponse,
  Effect.map(mapTask)
)
const decodeTimer = Function.compose(
  decodeUnknownTimerResponse,
  Effect.map(mapTimer)
)
const decodeTimeRecord = Function.compose(
  decodeUnknownTimeRecordResponse,
  Effect.map(toTimeRecord)
)
const decodeStoppedTimer = Function.compose(
  decodeUnknownStoppedTimerResponse,
  Effect.map(({ taskTime }) =>
    taskTime === null ? null : toTimeRecord(taskTime)
  )
)
const decodeTeam = Function.compose(
  decodeUnknownTeamResponse,
  Effect.map((users) => users.map((user) => String(user.id)))
)
const decodeTimeRecordResponses = Schema.decodeUnknownEffect(
  Schema.Array(TimeRecordResponse)
)

const decodeWebhook = Function.compose(
  decodeUnknownWebhookResponse,
  Effect.map((webhook) => ({ id: String(webhook.id) }))
)

const payloadPreview = (payload: Schema.Json) => {
  const text: string = isString(payload)
    ? payload
    : JSON.stringify(payload ?? null)
  return text.length > 500 ? `${text.slice(0, 500)}...` : text
}

const MAX_RATE_LIMIT_WAIT_SECONDS = 10
const REQUEST_TIMEOUT = Duration.seconds(30)

const rateLimitBackoff = Schedule.exponential("1 second").pipe(
  Schedule.jittered,
  Schedule.modifyDelay(({ input, duration }) =>
    Effect.succeed(
      isEverhourRateLimited(input)
        ? Duration.max(duration, Duration.seconds(input.retryAfterSeconds))
        : duration
    )
  )
)

const send = (
  apiKey: string,
  method: string,
  path: string,
  body: Schema.Json | undefined,
  treatNotFound: boolean
) =>
  Effect.gen(function* () {
    const fetch = yield* Effect.service(Fetch)
    const { response, payload } = yield* Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: (signal) =>
          fetch(`${baseUrl}${path}`, {
            method,
            headers: {
              "Content-Type": "application/json",
              "X-Api-Key": apiKey,
              "X-Accept-Version": "1.2"
            },
            body: body === undefined ? undefined : Response.json(body).body,
            signal
          }),
        catch: (cause) => new EverhourError({ message: String(cause) })
      })
      const payload =
        response.status === 204
          ? null
          : yield* Effect.promise(() => response.json().catch(() => null)).pipe(
              Effect.flatMap(decodeJson),
              Effect.orElseSucceed(() => null)
            )
      return { response, payload }
    }).pipe(
      Effect.timeoutOrElse({
        duration: REQUEST_TIMEOUT,
        orElse: () =>
          Effect.fail(
            new EverhourError({ message: "Everhour did not respond in time" })
          )
      })
    )
    if (response.ok || (treatNotFound && response.status === 404)) {
      return { payload, status: response.status }
    }
    const failure = Option.getOrUndefined(decodeErrorResponse(payload))
    const message =
      failure?.message ?? failure?.error ?? failure?.detail ?? "Everhour error"
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
    if (failure?.errorType === "task_provider_no_task_access")
      return yield* new EverhourProjectAccessDenied()
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
        isEverhourRateLimited(error) &&
        error.retryAfterSeconds <= MAX_RATE_LIMIT_WAIT_SECONDS
    })
  )

const request = <A>(
  apiKey: string,
  method: string,
  path: string,
  body: Schema.Json | undefined,
  decode: ReturnType<typeof Schema.decodeUnknownEffect<Schema.Decoder<A>>>
) =>
  send(apiKey, method, path, body, false).pipe(
    Effect.flatMap(({ payload }) =>
      decode(payload).pipe(
        Effect.mapError(
          (cause) => new EverhourError({ message: String(cause) })
        )
      )
    )
  )

const requestNullable = <A>(
  apiKey: string,
  method: string,
  path: string,
  body: Schema.Json | undefined,
  decode: ReturnType<typeof Schema.decodeUnknownEffect<Schema.Decoder<A>>>
) =>
  send(apiKey, method, path, body, true).pipe(
    Effect.flatMap(({ payload, status }) =>
      status === 404 || payload === null
        ? Effect.succeed(null)
        : decode(payload).pipe(
            Effect.mapError(
              (cause) => new EverhourError({ message: String(cause) })
            )
          )
    )
  )

const ensureTimeHistory = Effect.fn("Everhour.ensureTimeHistory")(function* (
  apiKey: string,
  record: EverhourTimeRecord,
  expectedDelta?: number
) {
  if (record.history.length > 0 || record.seconds === 0) return record
  const userId =
    record.userId ??
    (yield* request(apiKey, "GET", "/users/me", undefined, decodeUser)).id
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      from: record.date,
      to: record.date,
      limit: "100",
      page: String(page)
    })
    const records = yield* request(
      apiKey,
      "GET",
      `/users/${encodeURIComponent(userId)}/time?${query.toString()}`,
      undefined,
      decodeTimeRecordResponses
    )
    const saved = records.find(
      (candidate) => String(candidate.id) === record.id
    )
    if (saved) {
      if (saved.history.some((entry) => entry.previousTime === undefined)) break
      const matches = saved.history.filter(
        (entry) =>
          entry.previousTime !== undefined &&
          entry.previousTime + entry.time === record.seconds &&
          (expectedDelta === undefined || entry.time === expectedDelta)
      )
      const entry = matches.length === 1 ? matches[0] : undefined
      if (entry)
        return {
          ...record,
          history: [{ id: String(entry.id), seconds: entry.time }]
        }
      break
    }
    if (records.length < 100) break
  }
  return yield* new EverhourError({
    message: "Everhour did not return history for the saved time record"
  })
})

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
        withFetch(request(apiKey, "GET", "/users/me", undefined, decodeUser)),
      getProject: (apiKey, projectId) =>
        withFetch(
          request(
            apiKey,
            "GET",
            `/projects/${encodeURIComponent(projectId)}`,
            undefined,
            decodeProject
          )
        ),
      createProject: (apiKey, input) =>
        withFetch(request(apiKey, "POST", "/projects", input, decodeProject)),
      updateProject: (apiKey, projectId, input) =>
        withFetch(
          request(
            apiKey,
            "PUT",
            `/projects/${encodeURIComponent(projectId)}`,
            { name: input.name, type: "board" },
            decodeProject
          )
        ),
      teamUserIds: (apiKey) =>
        withFetch(request(apiKey, "GET", "/team/users", undefined, decodeTeam)),
      assignProjectUsers: (apiKey, projectId, users) =>
        withFetch(
          request(
            apiKey,
            "PUT",
            `/projects/${encodeURIComponent(projectId)}`,
            { users: users.map(Number) },
            decodeProject
          )
        ),
      createSection: (apiKey, projectId, input) =>
        withFetch(
          request(
            apiKey,
            "POST",
            `/projects/${encodeURIComponent(projectId)}/sections`,
            input,
            decodeSection
          )
        ),
      updateSection: (apiKey, sectionId, input) =>
        withFetch(
          request(
            apiKey,
            "PUT",
            `/sections/${encodeURIComponent(sectionId)}`,
            input,
            decodeSection
          )
        ),
      getTask: (apiKey, taskId) =>
        withFetch(
          request(
            apiKey,
            "GET",
            `/tasks/${encodeURIComponent(taskId)}`,
            undefined,
            decodeTask
          )
        ),
      createTask: (apiKey, projectId, payload) =>
        withFetch(
          request(
            apiKey,
            "POST",
            `/projects/${encodeURIComponent(projectId)}/tasks`,
            { ...payload },
            decodeTask
          )
        ),
      updateTask: (apiKey, taskId, payload) =>
        withFetch(
          request(
            apiKey,
            "PUT",
            `/tasks/${encodeURIComponent(taskId)}`,
            { ...payload },
            decodeTask
          )
        ),
      startTimer: (apiKey, input) =>
        tracking(request(apiKey, "POST", "/timers", input, decodeTimer)),
      getCurrentTimer: (apiKey) =>
        withFetch(
          requestNullable(
            apiKey,
            "GET",
            "/timers/current",
            undefined,
            decodeTimer
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
            decodeStoppedTimer
          ).pipe(
            Effect.flatMap((record) =>
              record === null
                ? Effect.succeed(null)
                : ensureTimeHistory(apiKey, record)
            )
          )
        ),
      addTime: (apiKey, input) =>
        tracking(
          request(apiKey, "POST", "/time", input, decodeTimeRecord).pipe(
            Effect.flatMap((record) =>
              ensureTimeHistory(apiKey, record, input.time)
            )
          )
        ),
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
            decodeWebhook
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
