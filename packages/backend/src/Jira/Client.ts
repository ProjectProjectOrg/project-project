import {
  JiraAccessDenied,
  JiraError,
  JiraNotConnected,
  JiraRateLimited as PublicJiraRateLimited,
  JiraReconnectRequired,
  JiraResourceNotFound,
  type JiraProjectChoice,
  type JiraSite
} from "@projectproject/shared"
import * as Clock from "effect/Clock"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse
} from "effect/unstable/http"
import {
  JiraRateLimited,
  JiraTransientFailure,
  MAX_RETRY_AFTER_MILLIS
} from "./Blocked"
import { JiraCredentials } from "./Credentials"
import {
  JiraBoard,
  JiraBoardConfiguration,
  JiraChangelog,
  JiraComment,
  JiraComponent,
  JiraField,
  JiraIssue,
  JiraIssueReference,
  JiraIssueSearchInput,
  JiraIssueTypeStatuses,
  JiraPriority,
  JiraProject,
  JiraSprint,
  JiraUser,
  JiraVersion,
  JiraVotes,
  JiraWatchers,
  JiraWorklog,
  type JiraCursorPage,
  type JiraOffsetPage,
  type JiraIssuePageInput,
  type JiraProjectPageInput,
  type JiraSprintsPageInput,
  type JiraSearchIssuesPageInput,
  type JiraSprintIssuesPageInput,
  type JiraIssueSearchInput as JiraIssueSearchInputType
} from "./ClientSchemas"

export type JiraCallError =
  | JiraNotConnected
  | JiraReconnectRequired
  | JiraAccessDenied
  | JiraResourceNotFound
  | JiraRateLimited
  | JiraTransientFailure
  | JiraError

export interface JiraTransportRequest {
  readonly method: "GET" | "POST"
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body?: unknown
}

export interface JiraTransportResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly json: Effect.Effect<unknown, JiraError>
  readonly stream: Stream.Stream<Uint8Array, JiraError>
}

export interface JiraTransportShape {
  readonly execute: (
    request: JiraTransportRequest
  ) => Effect.Effect<JiraTransportResponse, JiraError>
}

export class JiraTransport extends Context.Service<
  JiraTransport,
  JiraTransportShape
>()("@projectproject/backend/Jira/Client/JiraTransport") {}

export const JiraTransportLive = Layer.effect(
  JiraTransport,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return JiraTransport.of({
      execute: (input) => {
        let request =
          input.method === "POST"
            ? HttpClientRequest.post(input.url)
            : HttpClientRequest.get(input.url)
        request = HttpClientRequest.setHeaders(request, input.headers)
        if (input.body !== undefined) {
          request = HttpClientRequest.bodyJsonUnsafe(request, input.body)
        }
        return client.execute(request).pipe(
          Effect.provideService(FetchHttpClient.RequestInit, {
            redirect: "manual"
          }),
          Effect.timeout("20 seconds"),
          Effect.mapError((error) =>
            Predicate.isObject(error) && error._tag === "TimeoutError"
              ? new JiraError({ reason: "timeout" })
              : new JiraError({ reason: "network" })
          ),
          Effect.map((response) => ({
            status: response.status,
            headers: response.headers,
            json: HttpClientResponse.schemaBodyJson(Schema.Unknown)(
              response
            ).pipe(
              Effect.mapError(
                () => new JiraError({ reason: "invalid_response" })
              )
            ),
            stream: response.stream.pipe(
              Stream.mapError(() => new JiraError({ reason: "network" }))
            )
          }))
        )
      }
    })
  })
)

export const paginateCursor = <A, E>(
  fetchPage: (cursor: string | null) => Effect.Effect<JiraCursorPage<A>, E>
): Effect.Effect<ReadonlyArray<A>, E | JiraError> =>
  Stream.paginate(
    { cursor: null as string | null, seen: new Set<string>() },
    Effect.fn(function* ({ cursor, seen }) {
      const page = yield* fetchPage(cursor)
      if (page.nextPageToken === null)
        return [page.values, Option.none()] as const
      if (seen.has(page.nextPageToken))
        return yield* new JiraError({ reason: "invalid_response" })
      return [
        page.values,
        Option.some({
          cursor: page.nextPageToken,
          seen: new Set([...seen, page.nextPageToken])
        })
      ] as const
    })
  ).pipe(Stream.runCollect)

export const paginateOffset = <A, E>(
  fetchPage: (startAt: number) => Effect.Effect<JiraOffsetPage<A>, E>
): Effect.Effect<ReadonlyArray<A>, E | JiraError> =>
  Stream.paginate(
    0,
    Effect.fn(function* (startAt) {
      const page = yield* fetchPage(startAt)
      const next = page.startAt + page.maxResults
      if (
        page.startAt !== startAt ||
        !Number.isSafeInteger(next) ||
        page.maxResults <= 0
      ) {
        return yield* new JiraError({ reason: "invalid_response" })
      }
      return [
        page.values,
        page.isLast || (page.total !== null && next >= page.total)
          ? Option.none()
          : Option.some(next)
      ] as const
    })
  ).pipe(Stream.runCollect)

export const toPublicJiraError = (error: JiraCallError) => {
  if (error._tag === "JiraRateLimited")
    return new PublicJiraRateLimited({
      retryAfterSeconds: error.retryAfterMillis / 1000
    })
  if (error._tag === "JiraTransientFailure")
    return new JiraError({
      reason:
        error.reason === "invalid_retry_after"
          ? "invalid_response"
          : error.reason
    })
  return error
}

export interface JiraClientShape {
  readonly searchIssuesPage: (
    input: JiraSearchIssuesPageInput
  ) => Effect.Effect<JiraCursorPage<JiraIssue>, JiraCallError>
  readonly commentsPage: (
    input: JiraIssuePageInput
  ) => Effect.Effect<JiraOffsetPage<JiraComment>, JiraCallError>
  readonly worklogsPage: (
    input: JiraIssuePageInput
  ) => Effect.Effect<JiraOffsetPage<JiraWorklog>, JiraCallError>
  readonly changelogsPage: (
    input: JiraIssuePageInput
  ) => Effect.Effect<JiraOffsetPage<JiraChangelog>, JiraCallError>
  readonly componentsPage: (
    input: JiraProjectPageInput
  ) => Effect.Effect<JiraOffsetPage<JiraComponent>, JiraCallError>
  readonly versionsPage: (
    input: JiraProjectPageInput
  ) => Effect.Effect<JiraOffsetPage<JiraVersion>, JiraCallError>
  readonly boardsPage: (
    input: JiraProjectPageInput
  ) => Effect.Effect<JiraOffsetPage<JiraBoard>, JiraCallError>
  readonly sprintsPage: (
    input: JiraSprintsPageInput
  ) => Effect.Effect<JiraOffsetPage<JiraSprint>, JiraCallError>
  readonly sprintIssuesPage: (
    input: JiraSprintIssuesPageInput
  ) => Effect.Effect<JiraCursorPage<JiraIssueReference>, JiraCallError>
  readonly accessibleSites: (
    userId: string
  ) => Effect.Effect<ReadonlyArray<JiraSite>, JiraCallError>
  readonly currentUser: (
    userId: string,
    cloudId: string
  ) => Effect.Effect<typeof JiraUser.Type, JiraCallError>
  readonly projects: (
    userId: string,
    cloudId: string
  ) => Effect.Effect<ReadonlyArray<JiraProjectChoice>, JiraCallError>
  readonly project: (
    userId: string,
    cloudId: string,
    projectIdOrKey: string
  ) => Effect.Effect<typeof JiraProject.Type, JiraCallError>
  readonly projectStatuses: (
    userId: string,
    cloudId: string,
    projectIdOrKey: string
  ) => Effect.Effect<
    ReadonlyArray<typeof JiraIssueTypeStatuses.Type>,
    JiraCallError
  >
  readonly fields: (
    userId: string,
    cloudId: string
  ) => Effect.Effect<ReadonlyArray<typeof JiraField.Type>, JiraCallError>
  readonly priorities: (
    userId: string,
    cloudId: string
  ) => Effect.Effect<ReadonlyArray<typeof JiraPriority.Type>, JiraCallError>
  readonly components: (
    userId: string,
    cloudId: string,
    projectIdOrKey: string
  ) => Effect.Effect<ReadonlyArray<JiraComponent>, JiraCallError>
  readonly versions: (
    userId: string,
    cloudId: string,
    projectIdOrKey: string
  ) => Effect.Effect<ReadonlyArray<JiraVersion>, JiraCallError>
  readonly searchIssues: (
    userId: string,
    cloudId: string,
    input: JiraIssueSearchInputType
  ) => Effect.Effect<ReadonlyArray<JiraIssue>, JiraCallError>
  readonly comments: (
    userId: string,
    cloudId: string,
    issueIdOrKey: string
  ) => Effect.Effect<ReadonlyArray<JiraComment>, JiraCallError>
  readonly worklogs: (
    userId: string,
    cloudId: string,
    issueIdOrKey: string
  ) => Effect.Effect<ReadonlyArray<JiraWorklog>, JiraCallError>
  readonly changelogs: (
    userId: string,
    cloudId: string,
    issueIdOrKey: string
  ) => Effect.Effect<ReadonlyArray<JiraChangelog>, JiraCallError>
  readonly watchers: (
    userId: string,
    cloudId: string,
    issueIdOrKey: string
  ) => Effect.Effect<typeof JiraWatchers.Type, JiraCallError>
  readonly votes: (
    userId: string,
    cloudId: string,
    issueIdOrKey: string
  ) => Effect.Effect<typeof JiraVotes.Type, JiraCallError>
  readonly boards: (
    userId: string,
    cloudId: string,
    projectIdOrKey: string
  ) => Effect.Effect<ReadonlyArray<JiraBoard>, JiraCallError>
  readonly boardConfiguration: (
    userId: string,
    cloudId: string,
    boardId: number
  ) => Effect.Effect<typeof JiraBoardConfiguration.Type, JiraCallError>
  readonly sprints: (
    userId: string,
    cloudId: string,
    boardId: number
  ) => Effect.Effect<ReadonlyArray<JiraSprint>, JiraCallError>
  readonly sprintIssues: (
    userId: string,
    cloudId: string,
    boardId: number,
    sprintId: number,
    fields: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<JiraIssueReference>, JiraCallError>
  readonly attachmentContent: (
    userId: string,
    cloudId: string,
    attachmentId: string,
    range?: string
  ) => Stream.Stream<Uint8Array, JiraCallError>
}

export class JiraClient extends Context.Service<JiraClient, JiraClientShape>()(
  "@projectproject/backend/Jira/Client/JiraClient"
) {}

const platformBase = (cloudId: string) =>
  `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3`

const agileBase = (cloudId: string) =>
  `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/agile/1.0`

const softwareBase = (cloudId: string) =>
  `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/software/1.0`

const pathPart = (value: string | number) => encodeURIComponent(String(value))

const RetryAfterSeconds = Schema.String.check(Schema.isPattern(/^\d+$/))
const ImfDatePattern =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}:\d{2}:\d{2}) GMT$/
const Rfc850DatePattern =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}:\d{2}:\d{2}) GMT$/
const AsctimeDatePattern =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( \d|\d{2}) (\d{2}:\d{2}:\d{2}) (\d{4})$/
const RetryAfterDate = Schema.Union([
  Schema.String.check(Schema.isPattern(ImfDatePattern)),
  Schema.String.check(Schema.isPattern(Rfc850DatePattern)),
  Schema.String.check(Schema.isPattern(AsctimeDatePattern))
])

const httpDateMillis = (header: string | undefined, now: number) => {
  const decoded = Schema.decodeUnknownOption(RetryAfterDate)(header)
  if (Option.isNone(decoded)) return NaN
  let canonical = decoded.value
  const rfc850 = canonical.match(Rfc850DatePattern)
  const asctime = canonical.match(AsctimeDatePattern)
  if (rfc850) {
    const limit = DateTime.add(DateTime.makeUnsafe(now), { years: 50 })
    let year =
      Math.floor(DateTime.toPartsUtc(limit).year / 100) * 100 +
      Number(rfc850[4])
    const normalized = () =>
      `${rfc850[1].slice(0, 3)}, ${rfc850[2]} ${rfc850[3]} ${year} ${rfc850[5]} GMT`
    const candidate = DateTime.make(normalized())
    if (
      Option.isSome(candidate) &&
      DateTime.toEpochMillis(candidate.value) > DateTime.toEpochMillis(limit)
    )
      year -= 100
    canonical = normalized()
  } else if (asctime) {
    canonical = `${asctime[1]}, ${asctime[3].trim().padStart(2, "0")} ${asctime[2]} ${asctime[5]} ${asctime[4]} GMT`
  }
  const date = DateTime.make(canonical)
  return Option.isSome(date) &&
    DateTime.toDateUtc(date.value).toUTCString() === canonical
    ? DateTime.toEpochMillis(date.value)
    : NaN
}

const RetryDelay = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: MAX_RETRY_AFTER_MILLIS })
)

const rateLimited = Effect.fn("JiraClient.rateLimited")(function* (
  operation: string,
  header: string | undefined
) {
  const now = yield* Clock.currentTimeMillis
  const seconds = Schema.decodeUnknownOption(RetryAfterSeconds)(header)
  const millis = Option.isSome(seconds)
    ? Number(seconds.value) * 1000
    : httpDateMillis(header, now) - now
  return yield* validatedRateLimit(operation, millis)
})

const validatedRateLimit = (operation: string, millis: number) =>
  Schema.decodeUnknownEffect(RetryDelay)(millis).pipe(
    Effect.mapError(
      () =>
        new JiraTransientFailure({ operation, reason: "invalid_retry_after" })
    ),
    Effect.flatMap((retryAfterMillis) =>
      Effect.fail(new JiraRateLimited({ operation, retryAfterMillis }))
    )
  )

const transportFailure = (operation: string) => (error: JiraCallError) =>
  error._tag === "JiraError" &&
  (error.reason === "network" ||
    error.reason === "timeout" ||
    error.reason === "server_error")
    ? new JiraTransientFailure({ operation, reason: error.reason })
    : error

export const JiraClientLive = Layer.effect(
  JiraClient,
  Effect.gen(function* () {
    const transport = yield* JiraTransport
    const credentials = yield* JiraCredentials
    const accessToken = (
      userId: string,
      operation: string,
      forceRefresh = false
    ) =>
      credentials
        .accessTokenFor(
          userId,
          forceRefresh ? { forceRefresh: true } : undefined
        )
        .pipe(
          Effect.catchTag("JiraRateLimited", (error) =>
            validatedRateLimit(operation, error.retryAfterSeconds * 1000)
          ),
          Effect.mapError((error) =>
            error._tag === "JiraError"
              ? transportFailure(operation)(error)
              : error
          )
        )

    const authorize = Effect.fn("JiraClient.authorize")(function* (
      userId: string,
      operation: string,
      execute: (
        token: string
      ) => Effect.Effect<JiraTransportResponse, JiraCallError>
    ) {
      const access = yield* accessToken(userId, operation)
      const first = yield* execute(Redacted.value(access.token)).pipe(
        Effect.mapError(transportFailure(operation))
      )
      if (first.status !== 401) return first
      const refreshed = yield* accessToken(userId, operation, true)
      const second = yield* execute(Redacted.value(refreshed.token)).pipe(
        Effect.mapError(transportFailure(operation))
      )
      if (second.status !== 401) return second
      yield* credentials.markReconnectRequired(userId, "invalid_grant")
      return yield* new JiraReconnectRequired({ reason: "invalid_grant" })
    })

    const checkResponse = Effect.fn("JiraClient.checkResponse")(function* (
      response: JiraTransportResponse,
      operation: string
    ) {
      if (response.status === 403) return yield* new JiraAccessDenied()
      if (response.status === 404) return yield* new JiraResourceNotFound()
      if (response.status === 429)
        return yield* rateLimited(operation, response.headers["retry-after"])
      if (response.status >= 500)
        return yield* new JiraTransientFailure({
          operation,
          reason: "server_error"
        })
      if (response.status < 200 || response.status >= 300)
        return yield* new JiraError({ reason: "invalid_response" })
      return response
    })

    const requestJson = <A>(
      userId: string,
      operation: string,
      method: "GET" | "POST",
      url: string,
      schema: Schema.Codec<A, unknown>,
      body?: unknown
    ): Effect.Effect<A, JiraCallError> =>
      authorize(userId, operation, (token) =>
        transport.execute({
          method,
          url,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${token}`
          },
          body
        })
      ).pipe(
        Effect.flatMap((response) => checkResponse(response, operation)),
        Effect.flatMap((response) =>
          response.json.pipe(Effect.mapError(transportFailure(operation)))
        ),
        Effect.flatMap(Schema.decodeUnknownEffect(schema)),
        Effect.mapError((error) =>
          error._tag === "SchemaError"
            ? new JiraError({ reason: "invalid_response" })
            : error
        )
      )

    const direct = <A>(
      userId: string,
      operation: string,
      url: string,
      schema: Schema.Codec<A, unknown>
    ) => requestJson(userId, operation, "GET", url, schema)

    const readOffsetPage = <A>(
      userId: string,
      operation: string,
      url: string,
      schema: Schema.Codec<A, unknown>,
      field: string,
      startAt = 0
    ): Effect.Effect<JiraOffsetPage<A>, JiraCallError> => {
      const target = new URL(url)
      target.searchParams.set("startAt", String(startAt))
      target.searchParams.set("maxResults", "100")
      return direct(
        userId,
        operation,
        target.toString(),
        Schema.Struct({
          values: Schema.Array(schema),
          startAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
          maxResults: Schema.Int.check(Schema.isGreaterThan(0)),
          total: Schema.optional(
            Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
          ),
          isLast: Schema.optional(Schema.Boolean)
        }).pipe(Schema.encodeKeys({ values: field }))
      ).pipe(
        Effect.flatMap((page) => {
          if (page.startAt !== startAt)
            return Effect.fail(new JiraError({ reason: "invalid_response" }))
          const values = page.values
          return Effect.succeed({
            values,
            startAt: page.startAt,
            maxResults: page.maxResults,
            total: page.total ?? null,
            isLast:
              page.isLast ??
              (page.total === undefined
                ? values.length < page.maxResults
                : page.startAt + page.maxResults >= page.total)
          })
        })
      )
    }

    const searchIssuesPage = (input: JiraSearchIssuesPageInput) =>
      requestJson(
        input.userId,
        "issues",
        "POST",
        `${platformBase(input.cloudId)}/search/jql`,
        Schema.Struct({
          issues: Schema.Array(JiraIssue),
          nextPageToken: Schema.optional(Schema.NullOr(Schema.String))
        }),
        {
          jql: input.jql,
          fields: input.fields,
          ...(input.expand && input.expand.length > 0
            ? { expand: input.expand.join(",") }
            : {}),
          maxResults: 100,
          ...(input.nextPageToken != null
            ? { nextPageToken: input.nextPageToken }
            : {})
        }
      ).pipe(
        Effect.flatMap((page) =>
          page.nextPageToken != null &&
          page.nextPageToken === input.nextPageToken
            ? Effect.fail(new JiraError({ reason: "invalid_response" }))
            : Effect.succeed({
                values: page.issues,
                nextPageToken: page.nextPageToken ?? null
              })
        )
      )

    const sprintIssuesPage = (input: JiraSprintIssuesPageInput) => {
      const url = new URL(
        `${softwareBase(input.cloudId)}/board/${pathPart(input.boardId)}/sprint/${pathPart(input.sprintId)}/issue`
      )
      url.searchParams.set("fields", input.fields.join(","))
      url.searchParams.set("maxResults", "100")
      if (input.nextPageToken != null)
        url.searchParams.set("nextPageToken", input.nextPageToken)
      return direct(
        input.userId,
        "sprintIssues",
        url.toString(),
        Schema.Struct({
          issues: Schema.Array(JiraIssueReference),
          nextPageToken: Schema.optional(Schema.NullOr(Schema.String))
        })
      ).pipe(
        Effect.flatMap((page) =>
          page.nextPageToken != null &&
          page.nextPageToken === input.nextPageToken
            ? Effect.fail(new JiraError({ reason: "invalid_response" }))
            : Effect.succeed({
                values: page.issues,
                nextPageToken: page.nextPageToken ?? null
              })
        )
      )
    }
    const commentsPage = (input: JiraIssuePageInput) =>
      readOffsetPage(
        input.userId,
        "comments",
        `${platformBase(input.cloudId)}/issue/${pathPart(input.issueIdOrKey)}/comment`,
        JiraComment,
        "comments",
        input.startAt
      )
    const worklogsPage = (input: JiraIssuePageInput) =>
      readOffsetPage(
        input.userId,
        "worklogs",
        `${platformBase(input.cloudId)}/issue/${pathPart(input.issueIdOrKey)}/worklog`,
        JiraWorklog,
        "worklogs",
        input.startAt
      )
    const changelogsPage = (input: JiraIssuePageInput) =>
      readOffsetPage(
        input.userId,
        "changelogs",
        `${platformBase(input.cloudId)}/issue/${pathPart(input.issueIdOrKey)}/changelog`,
        JiraChangelog,
        "values",
        input.startAt
      )
    const componentsPage = (input: JiraProjectPageInput) =>
      readOffsetPage(
        input.userId,
        "components",
        `${platformBase(input.cloudId)}/project/${pathPart(input.projectIdOrKey)}/component`,
        JiraComponent,
        "values",
        input.startAt
      )
    const versionsPage = (input: JiraProjectPageInput) =>
      readOffsetPage(
        input.userId,
        "versions",
        `${platformBase(input.cloudId)}/project/${pathPart(input.projectIdOrKey)}/version`,
        JiraVersion,
        "values",
        input.startAt
      )
    const boardsPage = (input: JiraProjectPageInput) =>
      readOffsetPage(
        input.userId,
        "boards",
        `${agileBase(input.cloudId)}/board?projectKeyOrId=${pathPart(input.projectIdOrKey)}`,
        JiraBoard,
        "values",
        input.startAt
      )
    const sprintsPage = (input: JiraSprintsPageInput) =>
      readOffsetPage(
        input.userId,
        "sprints",
        `${agileBase(input.cloudId)}/board/${pathPart(input.boardId)}/sprint`,
        JiraSprint,
        "values",
        input.startAt
      )

    const attachmentContent = (
      userId: string,
      cloudId: string,
      attachmentId: string,
      range?: string
    ) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const operation = "attachmentContent"
          const initialUrl = `${platformBase(cloudId)}/attachment/content/${pathPart(attachmentId)}`
          const follow = Effect.fn("JiraClient.attachmentRedirects")(function* (
            token: string
          ) {
            let url = initialUrl
            let authorization: string | undefined = `Bearer ${token}`
            for (let redirects = 0; redirects <= 3; redirects += 1) {
              if (redirects > 0 && authorization !== undefined) {
                const access = yield* accessToken(userId, operation)
                authorization = `Bearer ${Redacted.value(access.token)}`
              }
              const response = yield* transport.execute({
                method: "GET",
                url,
                headers: {
                  ...(authorization ? { authorization } : {}),
                  ...(range ? { range } : {})
                }
              })
              if (response.status < 300 || response.status >= 400)
                return response
              const location = response.headers.location
              if (!location)
                return yield* new JiraError({ reason: "invalid_response" })
              const next = yield* Effect.try({
                try: () => new URL(location, url),
                catch: () => new JiraError({ reason: "invalid_response" })
              })
              if (next.protocol !== "https:")
                return yield* new JiraError({ reason: "invalid_response" })
              if (next.origin !== new URL(url).origin) authorization = undefined
              url = next.toString()
            }
            return yield* new JiraError({ reason: "invalid_response" })
          })
          const response = yield* authorize(userId, operation, follow)
          yield* checkResponse(response, operation)
          if (response.status !== 200 && response.status !== 206)
            return yield* new JiraError({ reason: "invalid_response" })
          return response.stream.pipe(
            Stream.mapError(transportFailure(operation))
          )
        })
      )

    return JiraClient.of({
      searchIssuesPage,
      commentsPage,
      worklogsPage,
      changelogsPage,
      componentsPage,
      versionsPage,
      boardsPage,
      sprintsPage,
      sprintIssuesPage,
      accessibleSites: (userId) =>
        direct(
          userId,
          "sites",
          "https://api.atlassian.com/oauth/token/accessible-resources",
          Schema.Array(
            Schema.Struct({
              id: Schema.String,
              name: Schema.String,
              url: Schema.String,
              avatarUrl: Schema.optional(Schema.String)
            })
          )
        ).pipe(
          Effect.map((sites) =>
            sites.map((site) => ({
              cloudId: site.id,
              name: site.name,
              url: site.url,
              avatarUrl: site.avatarUrl ?? null
            }))
          )
        ),
      projects: (userId, cloudId) =>
        paginateOffset((startAt) =>
          readOffsetPage(
            userId,
            "projects",
            `${platformBase(cloudId)}/project/search`,
            JiraProject,
            "values",
            startAt
          )
        ).pipe(
          Effect.map((projects) =>
            projects.map((project) => ({
              id: project.id,
              key: project.key,
              name: project.name,
              projectTypeKey: project.projectTypeKey ?? null,
              simplified: project.simplified ?? null,
              style: project.style ?? null,
              avatarUrl:
                typeof project.avatarUrls?.["48x48"] === "string"
                  ? project.avatarUrls["48x48"]
                  : null
            }))
          )
        ),
      currentUser: (userId, cloudId) =>
        direct(
          userId,
          "currentUser",
          `${platformBase(cloudId)}/myself`,
          JiraUser
        ),
      project: (userId, cloudId, projectIdOrKey) =>
        direct(
          userId,
          "project",
          `${platformBase(cloudId)}/project/${pathPart(projectIdOrKey)}`,
          JiraProject
        ),
      projectStatuses: (userId, cloudId, projectIdOrKey) =>
        direct(
          userId,
          "projectStatuses",
          `${platformBase(cloudId)}/project/${pathPart(projectIdOrKey)}/statuses`,
          Schema.Array(JiraIssueTypeStatuses)
        ),
      fields: (userId, cloudId) =>
        direct(
          userId,
          "fields",
          `${platformBase(cloudId)}/field`,
          Schema.Array(JiraField)
        ),
      priorities: (userId, cloudId) =>
        direct(
          userId,
          "priorities",
          `${platformBase(cloudId)}/priority`,
          Schema.Array(JiraPriority)
        ),
      watchers: (userId, cloudId, issueIdOrKey) =>
        direct(
          userId,
          "watchers",
          `${platformBase(cloudId)}/issue/${pathPart(issueIdOrKey)}/watchers`,
          JiraWatchers
        ),
      votes: (userId, cloudId, issueIdOrKey) =>
        direct(
          userId,
          "votes",
          `${platformBase(cloudId)}/issue/${pathPart(issueIdOrKey)}/votes`,
          JiraVotes
        ),
      boardConfiguration: (userId, cloudId, boardId) =>
        direct(
          userId,
          "boardConfiguration",
          `${agileBase(cloudId)}/board/${pathPart(boardId)}/configuration`,
          JiraBoardConfiguration
        ),
      searchIssues: (userId, cloudId, input) =>
        paginateCursor((nextPageToken) =>
          searchIssuesPage({ userId, cloudId, ...input, nextPageToken })
        ),
      sprintIssues: (userId, cloudId, boardId, sprintId, fields) =>
        paginateCursor((nextPageToken) =>
          sprintIssuesPage({
            userId,
            cloudId,
            boardId,
            sprintId,
            fields,
            nextPageToken
          })
        ),
      comments: (userId, cloudId, issueIdOrKey) =>
        paginateOffset((startAt) =>
          commentsPage({ userId, cloudId, issueIdOrKey, startAt })
        ),
      worklogs: (userId, cloudId, issueIdOrKey) =>
        paginateOffset((startAt) =>
          worklogsPage({ userId, cloudId, issueIdOrKey, startAt })
        ),
      changelogs: (userId, cloudId, issueIdOrKey) =>
        paginateOffset((startAt) =>
          changelogsPage({ userId, cloudId, issueIdOrKey, startAt })
        ),
      components: (userId, cloudId, projectIdOrKey) =>
        paginateOffset((startAt) =>
          componentsPage({ userId, cloudId, projectIdOrKey, startAt })
        ),
      versions: (userId, cloudId, projectIdOrKey) =>
        paginateOffset((startAt) =>
          versionsPage({ userId, cloudId, projectIdOrKey, startAt })
        ),
      boards: (userId, cloudId, projectIdOrKey) =>
        paginateOffset((startAt) =>
          boardsPage({ userId, cloudId, projectIdOrKey, startAt })
        ),
      sprints: (userId, cloudId, boardId) =>
        paginateOffset((startAt) =>
          sprintsPage({ userId, cloudId, boardId, startAt })
        ),
      attachmentContent
    })
  })
)

export { JiraIssueSearchInput }
