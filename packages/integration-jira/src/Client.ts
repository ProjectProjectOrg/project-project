import {
  JiraAccessDenied,
  JiraError,
  JiraNotConnected,
  JiraRateLimited as PublicJiraRateLimited,
  JiraReconnectRequired,
  JiraResourceNotFound,
  type JiraProjectChoice,
  type JiraSite
} from "@pp/shared"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import {
  JiraRateLimited,
  JiraTransientFailure,
  MAX_RETRY_AFTER_MILLIS
} from "./Blocked"
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
  type JiraSnapshot,
  type JiraCursorPage,
  type JiraOffsetPage,
  type JiraIssuePageInput,
  type JiraProjectPageInput,
  type JiraSprintsPageInput,
  type JiraSearchIssuesPageInput,
  type JiraSprintIssuesPageInput,
  type JiraIssueSearchInput as JiraIssueSearchInputType
} from "./ClientSchemas"
import * as Credentials from "./Credentials"
import * as Transport from "./Transport"

const decodeUnknownIssuesResponse = Schema.decodeUnknownEffect(
  Schema.Struct({
    issues: Schema.Array(JiraIssue),
    nextPageToken: Schema.optional(Schema.NullOr(Schema.String))
  })
)

const decodeUnknownSprintIssuesResponse = Schema.decodeUnknownEffect(
  Schema.Struct({
    issues: Schema.Array(JiraIssueReference),
    nextPageToken: Schema.optional(Schema.NullOr(Schema.String))
  })
)

const decodeUnknownJiraUser = Schema.decodeUnknownEffect(JiraUser)

const decodeUnknownJiraProject = Schema.decodeUnknownEffect(JiraProject)

const decodeUnknownJiraIssueTypeStatusesArray = Schema.decodeUnknownEffect(
  Schema.Array(JiraIssueTypeStatuses)
)

const decodeUnknownJiraFieldArray = Schema.decodeUnknownEffect(
  Schema.Array(JiraField)
)

const decodeUnknownJiraPriorityArray = Schema.decodeUnknownEffect(
  Schema.Array(JiraPriority)
)

const decodeUnknownJiraWatchers = Schema.decodeUnknownEffect(JiraWatchers)

const decodeUnknownJiraVotes = Schema.decodeUnknownEffect(JiraVotes)

const decodeUnknownJiraBoardConfiguration = Schema.decodeUnknownEffect(
  JiraBoardConfiguration
)

const decodeUnknownSitesResponse = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      url: Schema.String,
      avatarUrl: Schema.optional(Schema.String)
    })
  )
)

export type JiraCallError =
  | JiraNotConnected
  | JiraReconnectRequired
  | JiraAccessDenied
  | JiraResourceNotFound
  | JiraRateLimited
  | JiraTransientFailure
  | JiraError

export const paginateCursor = <A, E>(
  fetchPage: (
    cursor: string | null
  ) => Effect.Effect<Omit<JiraCursorPage<A>, "raw">, E>
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
  fetchPage: (
    startAt: number
  ) => Effect.Effect<Omit<JiraOffsetPage<A>, "raw">, E>
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

export const toPublicJiraError = (error: JiraCallError) =>
  Match.value(error).pipe(
    Match.tags({
      JiraRateLimited: (error) =>
        new PublicJiraRateLimited({
          retryAfterSeconds: error.retryAfterMillis / 1000
        }),
      JiraTransientFailure: (error) =>
        new JiraError({
          reason:
            error.reason === "invalid_retry_after"
              ? "invalid_response"
              : error.reason
        })
    }),
    Match.orElse((error) => error)
  )

export class JiraClient extends Context.Service<
  JiraClient,
  Readonly<{
    snapshots: Readonly<{
      currentUser: (
        userId: string,
        cloudId: string
      ) => Effect.Effect<JiraSnapshot<typeof JiraUser.Type>, JiraCallError>
      project: (
        userId: string,
        cloudId: string,
        projectIdOrKey: string
      ) => Effect.Effect<JiraSnapshot<typeof JiraProject.Type>, JiraCallError>
      projectStatuses: (
        userId: string,
        cloudId: string,
        projectIdOrKey: string
      ) => Effect.Effect<
        JiraSnapshot<ReadonlyArray<typeof JiraIssueTypeStatuses.Type>>,
        JiraCallError
      >
      fields: (
        userId: string,
        cloudId: string
      ) => Effect.Effect<
        JiraSnapshot<ReadonlyArray<typeof JiraField.Type>>,
        JiraCallError
      >
      priorities: (
        userId: string,
        cloudId: string
      ) => Effect.Effect<
        JiraSnapshot<ReadonlyArray<typeof JiraPriority.Type>>,
        JiraCallError
      >
      watchers: (
        userId: string,
        cloudId: string,
        issueIdOrKey: string
      ) => Effect.Effect<JiraSnapshot<typeof JiraWatchers.Type>, JiraCallError>
      votes: (
        userId: string,
        cloudId: string,
        issueIdOrKey: string
      ) => Effect.Effect<JiraSnapshot<typeof JiraVotes.Type>, JiraCallError>
      boardConfiguration: (
        userId: string,
        cloudId: string,
        boardId: number
      ) => Effect.Effect<
        JiraSnapshot<typeof JiraBoardConfiguration.Type>,
        JiraCallError
      >
    }>

    searchIssuesPage: (
      input: JiraSearchIssuesPageInput
    ) => Effect.Effect<JiraCursorPage<JiraIssue>, JiraCallError>
    commentsPage: (
      input: JiraIssuePageInput
    ) => Effect.Effect<JiraOffsetPage<JiraComment>, JiraCallError>
    worklogsPage: (
      input: JiraIssuePageInput
    ) => Effect.Effect<JiraOffsetPage<JiraWorklog>, JiraCallError>
    changelogsPage: (
      input: JiraIssuePageInput
    ) => Effect.Effect<JiraOffsetPage<JiraChangelog>, JiraCallError>
    componentsPage: (
      input: JiraProjectPageInput
    ) => Effect.Effect<JiraOffsetPage<JiraComponent>, JiraCallError>
    versionsPage: (
      input: JiraProjectPageInput
    ) => Effect.Effect<JiraOffsetPage<JiraVersion>, JiraCallError>
    boardsPage: (
      input: JiraProjectPageInput
    ) => Effect.Effect<JiraOffsetPage<JiraBoard>, JiraCallError>
    sprintsPage: (
      input: JiraSprintsPageInput
    ) => Effect.Effect<JiraOffsetPage<JiraSprint>, JiraCallError>
    sprintIssuesPage: (
      input: JiraSprintIssuesPageInput
    ) => Effect.Effect<JiraCursorPage<JiraIssueReference>, JiraCallError>
    accessibleSites: (
      userId: string
    ) => Effect.Effect<ReadonlyArray<JiraSite>, JiraCallError>
    currentUser: (
      userId: string,
      cloudId: string
    ) => Effect.Effect<typeof JiraUser.Type, JiraCallError>
    projects: (
      userId: string,
      cloudId: string
    ) => Effect.Effect<ReadonlyArray<JiraProjectChoice>, JiraCallError>
    project: (
      userId: string,
      cloudId: string,
      projectIdOrKey: string
    ) => Effect.Effect<typeof JiraProject.Type, JiraCallError>
    projectStatuses: (
      userId: string,
      cloudId: string,
      projectIdOrKey: string
    ) => Effect.Effect<
      ReadonlyArray<typeof JiraIssueTypeStatuses.Type>,
      JiraCallError
    >
    fields: (
      userId: string,
      cloudId: string
    ) => Effect.Effect<ReadonlyArray<typeof JiraField.Type>, JiraCallError>
    priorities: (
      userId: string,
      cloudId: string
    ) => Effect.Effect<ReadonlyArray<typeof JiraPriority.Type>, JiraCallError>
    components: (
      userId: string,
      cloudId: string,
      projectIdOrKey: string
    ) => Effect.Effect<ReadonlyArray<JiraComponent>, JiraCallError>
    versions: (
      userId: string,
      cloudId: string,
      projectIdOrKey: string
    ) => Effect.Effect<ReadonlyArray<JiraVersion>, JiraCallError>
    searchIssues: (
      userId: string,
      cloudId: string,
      input: JiraIssueSearchInputType
    ) => Effect.Effect<ReadonlyArray<JiraIssue>, JiraCallError>
    comments: (
      userId: string,
      cloudId: string,
      issueIdOrKey: string
    ) => Effect.Effect<ReadonlyArray<JiraComment>, JiraCallError>
    worklogs: (
      userId: string,
      cloudId: string,
      issueIdOrKey: string
    ) => Effect.Effect<ReadonlyArray<JiraWorklog>, JiraCallError>
    changelogs: (
      userId: string,
      cloudId: string,
      issueIdOrKey: string
    ) => Effect.Effect<ReadonlyArray<JiraChangelog>, JiraCallError>
    watchers: (
      userId: string,
      cloudId: string,
      issueIdOrKey: string
    ) => Effect.Effect<typeof JiraWatchers.Type, JiraCallError>
    votes: (
      userId: string,
      cloudId: string,
      issueIdOrKey: string
    ) => Effect.Effect<typeof JiraVotes.Type, JiraCallError>
    boards: (
      userId: string,
      cloudId: string,
      projectIdOrKey: string
    ) => Effect.Effect<ReadonlyArray<JiraBoard>, JiraCallError>
    boardConfiguration: (
      userId: string,
      cloudId: string,
      boardId: number
    ) => Effect.Effect<typeof JiraBoardConfiguration.Type, JiraCallError>
    sprints: (
      userId: string,
      cloudId: string,
      boardId: number
    ) => Effect.Effect<ReadonlyArray<JiraSprint>, JiraCallError>
    sprintIssues: (
      userId: string,
      cloudId: string,
      boardId: number,
      sprintId: number,
      fields: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyArray<JiraIssueReference>, JiraCallError>
    attachmentContent: (
      userId: string,
      cloudId: string,
      attachmentId: string,
      range?: string
    ) => Stream.Stream<Uint8Array, JiraCallError>
  }>
>()("@pp/integration-jira/Client/JiraClient") {}

const platformBase = (cloudId: string) =>
  `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3`

const agileBase = (cloudId: string) =>
  `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/agile/1.0`

const softwareBase = (cloudId: string) =>
  `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/software/1.0`

const pathPart = (value: string | number) => encodeURIComponent(String(value))

const RetryAfterSeconds = Schema.String.check(Schema.isPattern(/^\d+$/))

const decodeUnknownRetryAfterSecondsOption =
  Schema.decodeUnknownOption(RetryAfterSeconds)
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

const decodeUnknownRetryAfterDateOption =
  Schema.decodeUnknownOption(RetryAfterDate)

const httpDateMillis = (header: string | undefined, now: number) => {
  const decoded = decodeUnknownRetryAfterDateOption(header)
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

const decodeUnknownRetryDelay = Schema.decodeUnknownEffect(RetryDelay)

const rateLimited = Effect.fn("JiraClient.rateLimited")(function* (
  operation: string,
  header: string | undefined
) {
  const now = yield* Clock.currentTimeMillis
  const seconds = decodeUnknownRetryAfterSecondsOption(header)
  const millis = Option.isSome(seconds)
    ? Number(seconds.value) * 1000
    : httpDateMillis(header, now) - now
  return yield* validatedRateLimit(operation, millis)
})

const validatedRateLimit = (operation: string, millis: number) =>
  decodeUnknownRetryDelay(millis).pipe(
    Effect.mapError(
      () =>
        new JiraTransientFailure({ operation, reason: "invalid_retry_after" })
    ),
    Effect.flatMap((retryAfterMillis) =>
      Effect.fail(new JiraRateLimited({ operation, retryAfterMillis }))
    )
  )

const transportFailure = (operation: string) => (error: JiraCallError) =>
  Predicate.isTagged(error, "JiraError") &&
  (error.reason === "network" ||
    error.reason === "timeout" ||
    error.reason === "server_error")
    ? new JiraTransientFailure({ operation, reason: error.reason })
    : error

const make = Effect.gen(function* () {
  const transport = yield* Transport.JiraTransport
  const credentials = yield* Credentials.JiraCredentials
  const accessToken = (
    userId: string,
    operation: string,
    forceRefresh = false
  ) =>
    credentials
      .accessTokenFor(userId, forceRefresh ? { forceRefresh: true } : undefined)
      .pipe(
        Effect.catchTag("JiraRateLimited", (error) =>
          validatedRateLimit(operation, error.retryAfterSeconds * 1000)
        ),
        Effect.mapError(transportFailure(operation))
      )

  const authorize = Effect.fn("JiraClient.authorize")(function* (
    userId: string,
    operation: string,
    execute: (
      token: string
    ) => Effect.Effect<Transport.JiraTransportResponse, JiraCallError>
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
    response: Transport.JiraTransportResponse,
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

  const requestSnapshot = <A>(
    userId: string,
    operation: string,
    method: "GET" | "POST",
    url: string,
    decode: ReturnType<typeof Schema.decodeUnknownEffect<Schema.Decoder<A>>>,
    body?: Schema.Json
  ): Effect.Effect<JiraSnapshot<A>, JiraCallError> =>
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
      Effect.flatMap((raw) =>
        decode(raw).pipe(Effect.map((value) => ({ raw, value })))
      ),
      Effect.mapError((error) =>
        Match.value(error).pipe(
          Match.tag(
            "SchemaError",
            () => new JiraError({ reason: "invalid_response" })
          ),
          Match.orElse((error) => error)
        )
      )
    )

  const requestJson = <A>(
    userId: string,
    operation: string,
    method: "GET" | "POST",
    url: string,
    decode: ReturnType<typeof Schema.decodeUnknownEffect<Schema.Decoder<A>>>,
    body?: Schema.Json
  ) =>
    requestSnapshot(userId, operation, method, url, decode, body).pipe(
      Effect.map(({ value }) => value)
    )

  const directSnapshot = <A>(
    userId: string,
    operation: string,
    url: string,
    decode: ReturnType<typeof Schema.decodeUnknownEffect<Schema.Decoder<A>>>
  ) => requestSnapshot(userId, operation, "GET", url, decode)

  const direct = <A>(
    userId: string,
    operation: string,
    url: string,
    decode: ReturnType<typeof Schema.decodeUnknownEffect<Schema.Decoder<A>>>
  ) => requestJson(userId, operation, "GET", url, decode)

  const readOffsetPage = <A>(schema: Schema.Decoder<A>, field: string) => {
    const decode = Schema.decodeUnknownEffect(
      Schema.Struct({
        values: Schema.Array(schema),
        startAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
        maxResults: Schema.Int.check(Schema.isGreaterThan(0)),
        total: Schema.optional(
          Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
        ),
        isLast: Schema.optional(Schema.Boolean)
      }).pipe(Schema.encodeKeys({ values: field }))
    )
    return (
      userId: string,
      operation: string,
      url: string,
      startAt = 0
    ): Effect.Effect<JiraOffsetPage<A>, JiraCallError> => {
      const target = new URL(url)
      target.searchParams.set("startAt", String(startAt))
      target.searchParams.set("maxResults", "100")
      return directSnapshot(userId, operation, target.toString(), decode).pipe(
        Effect.flatMap(({ raw, value: page }) => {
          if (page.startAt !== startAt)
            return Effect.fail(new JiraError({ reason: "invalid_response" }))
          const values = page.values
          return Effect.succeed({
            raw,
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
  }

  const readCommentsOffsetPage = readOffsetPage(JiraComment, "comments")
  const readWorklogsOffsetPage = readOffsetPage(JiraWorklog, "worklogs")
  const readChangelogsOffsetPage = readOffsetPage(JiraChangelog, "values")
  const readComponentsOffsetPage = readOffsetPage(JiraComponent, "values")
  const readVersionsOffsetPage = readOffsetPage(JiraVersion, "values")
  const readBoardsOffsetPage = readOffsetPage(JiraBoard, "values")
  const readSprintsOffsetPage = readOffsetPage(JiraSprint, "values")
  const readProjectsOffsetPage = readOffsetPage(JiraProject, "values")

  const searchIssuesPage = Effect.fn("JiraClient.searchIssuesPage")(function* (
    input: JiraSearchIssuesPageInput
  ) {
    const { raw, value: page } = yield* requestSnapshot(
      input.userId,
      "issues",
      "POST",
      `${platformBase(input.cloudId)}/search/jql`,
      decodeUnknownIssuesResponse,
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
    )
    if (
      page.nextPageToken != null &&
      page.nextPageToken === input.nextPageToken
    )
      return yield* new JiraError({ reason: "invalid_response" })
    return {
      raw,
      values: page.issues,
      nextPageToken: page.nextPageToken ?? null
    }
  })

  const sprintIssuesPage = Effect.fn("JiraClient.sprintIssuesPage")(function* (
    input: JiraSprintIssuesPageInput
  ) {
    const url = new URL(
      `${softwareBase(input.cloudId)}/board/${pathPart(input.boardId)}/sprint/${pathPart(input.sprintId)}/issue`
    )
    url.searchParams.set("fields", input.fields.join(","))
    url.searchParams.set("maxResults", "100")
    if (input.nextPageToken != null)
      url.searchParams.set("nextPageToken", input.nextPageToken)
    const { raw, value: page } = yield* directSnapshot(
      input.userId,
      "sprintIssues",
      url.toString(),
      decodeUnknownSprintIssuesResponse
    )
    if (
      page.nextPageToken != null &&
      page.nextPageToken === input.nextPageToken
    )
      return yield* new JiraError({ reason: "invalid_response" })
    return {
      raw,
      values: page.issues,
      nextPageToken: page.nextPageToken ?? null
    }
  })

  const commentsPage = Effect.fn("JiraClient.commentsPage")(function* (
    input: JiraIssuePageInput
  ) {
    return yield* readCommentsOffsetPage(
      input.userId,
      "comments",
      `${platformBase(input.cloudId)}/issue/${pathPart(input.issueIdOrKey)}/comment`,
      input.startAt
    )
  })

  const worklogsPage = Effect.fn("JiraClient.worklogsPage")(function* (
    input: JiraIssuePageInput
  ) {
    return yield* readWorklogsOffsetPage(
      input.userId,
      "worklogs",
      `${platformBase(input.cloudId)}/issue/${pathPart(input.issueIdOrKey)}/worklog`,
      input.startAt
    )
  })

  const changelogsPage = Effect.fn("JiraClient.changelogsPage")(function* (
    input: JiraIssuePageInput
  ) {
    return yield* readChangelogsOffsetPage(
      input.userId,
      "changelogs",
      `${platformBase(input.cloudId)}/issue/${pathPart(input.issueIdOrKey)}/changelog`,
      input.startAt
    )
  })

  const componentsPage = Effect.fn("JiraClient.componentsPage")(function* (
    input: JiraProjectPageInput
  ) {
    return yield* readComponentsOffsetPage(
      input.userId,
      "components",
      `${platformBase(input.cloudId)}/project/${pathPart(input.projectIdOrKey)}/component`,
      input.startAt
    )
  })

  const versionsPage = Effect.fn("JiraClient.versionsPage")(function* (
    input: JiraProjectPageInput
  ) {
    return yield* readVersionsOffsetPage(
      input.userId,
      "versions",
      `${platformBase(input.cloudId)}/project/${pathPart(input.projectIdOrKey)}/version`,
      input.startAt
    )
  })

  const boardsPage = Effect.fn("JiraClient.boardsPage")(function* (
    input: JiraProjectPageInput
  ) {
    return yield* readBoardsOffsetPage(
      input.userId,
      "boards",
      `${agileBase(input.cloudId)}/board?projectKeyOrId=${pathPart(input.projectIdOrKey)}`,
      input.startAt
    )
  })

  const sprintsPage = Effect.fn("JiraClient.sprintsPage")(function* (
    input: JiraSprintsPageInput
  ) {
    return yield* readSprintsOffsetPage(
      input.userId,
      "sprints",
      `${agileBase(input.cloudId)}/board/${pathPart(input.boardId)}/sprint`,
      input.startAt
    )
  })

  const openAttachmentContent = Effect.fn("JiraClient.attachmentContent")(
    function* (
      userId: string,
      cloudId: string,
      attachmentId: string,
      range?: string
    ) {
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
          if (response.status < 300 || response.status >= 400) return response
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
      return response.stream.pipe(Stream.mapError(transportFailure(operation)))
    }
  )

  const attachmentContent: JiraClient["Service"]["attachmentContent"] = (
    userId,
    cloudId,
    attachmentId,
    range
  ) =>
    Stream.unwrap(openAttachmentContent(userId, cloudId, attachmentId, range))

  const snapshots: JiraClient["Service"]["snapshots"] = {
    currentUser: Effect.fn("JiraClient.snapshots.currentUser")(
      function* (userId, cloudId) {
        return yield* directSnapshot(
          userId,
          "currentUser",
          `${platformBase(cloudId)}/myself`,
          decodeUnknownJiraUser
        )
      }
    ),
    project: Effect.fn("JiraClient.snapshots.project")(
      function* (userId, cloudId, projectIdOrKey) {
        return yield* directSnapshot(
          userId,
          "project",
          `${platformBase(cloudId)}/project/${pathPart(projectIdOrKey)}`,
          decodeUnknownJiraProject
        )
      }
    ),
    projectStatuses: Effect.fn("JiraClient.snapshots.projectStatuses")(
      function* (userId, cloudId, projectIdOrKey) {
        return yield* directSnapshot(
          userId,
          "projectStatuses",
          `${platformBase(cloudId)}/project/${pathPart(projectIdOrKey)}/statuses`,
          decodeUnknownJiraIssueTypeStatusesArray
        )
      }
    ),
    fields: Effect.fn("JiraClient.snapshots.fields")(
      function* (userId, cloudId) {
        return yield* directSnapshot(
          userId,
          "fields",
          `${platformBase(cloudId)}/field`,
          decodeUnknownJiraFieldArray
        )
      }
    ),
    priorities: Effect.fn("JiraClient.snapshots.priorities")(
      function* (userId, cloudId) {
        return yield* directSnapshot(
          userId,
          "priorities",
          `${platformBase(cloudId)}/priority`,
          decodeUnknownJiraPriorityArray
        )
      }
    ),
    watchers: Effect.fn("JiraClient.snapshots.watchers")(
      function* (userId, cloudId, issueIdOrKey) {
        return yield* directSnapshot(
          userId,
          "watchers",
          `${platformBase(cloudId)}/issue/${pathPart(issueIdOrKey)}/watchers`,
          decodeUnknownJiraWatchers
        )
      }
    ),
    votes: Effect.fn("JiraClient.snapshots.votes")(
      function* (userId, cloudId, issueIdOrKey) {
        return yield* directSnapshot(
          userId,
          "votes",
          `${platformBase(cloudId)}/issue/${pathPart(issueIdOrKey)}/votes`,
          decodeUnknownJiraVotes
        )
      }
    ),
    boardConfiguration: Effect.fn("JiraClient.snapshots.boardConfiguration")(
      function* (userId, cloudId, boardId) {
        return yield* directSnapshot(
          userId,
          "boardConfiguration",
          `${agileBase(cloudId)}/board/${pathPart(boardId)}/configuration`,
          decodeUnknownJiraBoardConfiguration
        )
      }
    )
  }

  const currentUser = Effect.fn("JiraClient.currentUser")(function* (
    userId: string,
    cloudId: string
  ) {
    return (yield* snapshots.currentUser(userId, cloudId)).value
  })

  const project = Effect.fn("JiraClient.project")(function* (
    userId: string,
    cloudId: string,
    projectIdOrKey: string
  ) {
    return (yield* snapshots.project(userId, cloudId, projectIdOrKey)).value
  })

  const projectStatuses = Effect.fn("JiraClient.projectStatuses")(function* (
    userId: string,
    cloudId: string,
    projectIdOrKey: string
  ) {
    return (yield* snapshots.projectStatuses(userId, cloudId, projectIdOrKey))
      .value
  })

  const fields = Effect.fn("JiraClient.fields")(function* (
    userId: string,
    cloudId: string
  ) {
    return (yield* snapshots.fields(userId, cloudId)).value
  })

  const priorities = Effect.fn("JiraClient.priorities")(function* (
    userId: string,
    cloudId: string
  ) {
    return (yield* snapshots.priorities(userId, cloudId)).value
  })

  const watchers = Effect.fn("JiraClient.watchers")(function* (
    userId: string,
    cloudId: string,
    issueIdOrKey: string
  ) {
    return (yield* snapshots.watchers(userId, cloudId, issueIdOrKey)).value
  })

  const votes = Effect.fn("JiraClient.votes")(function* (
    userId: string,
    cloudId: string,
    issueIdOrKey: string
  ) {
    return (yield* snapshots.votes(userId, cloudId, issueIdOrKey)).value
  })

  const boardConfiguration = Effect.fn("JiraClient.boardConfiguration")(
    function* (userId: string, cloudId: string, boardId: number) {
      return (yield* snapshots.boardConfiguration(userId, cloudId, boardId))
        .value
    }
  )

  const accessibleSites = Effect.fn("JiraClient.accessibleSites")(function* (
    userId: string
  ) {
    const sites = yield* direct(
      userId,
      "sites",
      "https://api.atlassian.com/oauth/token/accessible-resources",
      decodeUnknownSitesResponse
    )
    return sites.map((site) => ({
      cloudId: site.id,
      name: site.name,
      url: site.url,
      avatarUrl: site.avatarUrl ?? null
    }))
  })

  const projects = Effect.fn("JiraClient.projects")(function* (
    userId: string,
    cloudId: string
  ) {
    const projects = yield* paginateOffset((startAt) =>
      readProjectsOffsetPage(
        userId,
        "projects",
        `${platformBase(cloudId)}/project/search`,
        startAt
      )
    )
    return projects.map((project) => ({
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
  })

  const searchIssues = Effect.fn("JiraClient.searchIssues")(function* (
    userId: string,
    cloudId: string,
    input: JiraIssueSearchInputType
  ) {
    return yield* paginateCursor((nextPageToken) =>
      searchIssuesPage({ userId, cloudId, ...input, nextPageToken })
    )
  })

  const sprintIssues = Effect.fn("JiraClient.sprintIssues")(function* (
    userId: string,
    cloudId: string,
    boardId: number,
    sprintId: number,
    fields: ReadonlyArray<string>
  ) {
    return yield* paginateCursor((nextPageToken) =>
      sprintIssuesPage({
        userId,
        cloudId,
        boardId,
        sprintId,
        fields,
        nextPageToken
      })
    )
  })

  const comments = Effect.fn("JiraClient.comments")(function* (
    userId: string,
    cloudId: string,
    issueIdOrKey: string
  ) {
    return yield* paginateOffset((startAt) =>
      commentsPage({ userId, cloudId, issueIdOrKey, startAt })
    )
  })

  const worklogs = Effect.fn("JiraClient.worklogs")(function* (
    userId: string,
    cloudId: string,
    issueIdOrKey: string
  ) {
    return yield* paginateOffset((startAt) =>
      worklogsPage({ userId, cloudId, issueIdOrKey, startAt })
    )
  })

  const changelogs = Effect.fn("JiraClient.changelogs")(function* (
    userId: string,
    cloudId: string,
    issueIdOrKey: string
  ) {
    return yield* paginateOffset((startAt) =>
      changelogsPage({ userId, cloudId, issueIdOrKey, startAt })
    )
  })

  const components = Effect.fn("JiraClient.components")(function* (
    userId: string,
    cloudId: string,
    projectIdOrKey: string
  ) {
    return yield* paginateOffset((startAt) =>
      componentsPage({ userId, cloudId, projectIdOrKey, startAt })
    )
  })

  const versions = Effect.fn("JiraClient.versions")(function* (
    userId: string,
    cloudId: string,
    projectIdOrKey: string
  ) {
    return yield* paginateOffset((startAt) =>
      versionsPage({ userId, cloudId, projectIdOrKey, startAt })
    )
  })

  const boards = Effect.fn("JiraClient.boards")(function* (
    userId: string,
    cloudId: string,
    projectIdOrKey: string
  ) {
    return yield* paginateOffset((startAt) =>
      boardsPage({ userId, cloudId, projectIdOrKey, startAt })
    )
  })

  const sprints = Effect.fn("JiraClient.sprints")(function* (
    userId: string,
    cloudId: string,
    boardId: number
  ) {
    return yield* paginateOffset((startAt) =>
      sprintsPage({ userId, cloudId, boardId, startAt })
    )
  })

  return JiraClient.of({
    snapshots,
    currentUser,
    project,
    projectStatuses,
    fields,
    priorities,
    watchers,
    votes,
    boardConfiguration,
    searchIssuesPage,
    commentsPage,
    worklogsPage,
    changelogsPage,
    componentsPage,
    versionsPage,
    boardsPage,
    sprintsPage,
    sprintIssuesPage,
    accessibleSites,
    projects,
    searchIssues,
    sprintIssues,
    comments,
    worklogs,
    changelogs,
    components,
    versions,
    boards,
    sprints,
    attachmentContent
  })
})

export const layer = Layer.effect(JiraClient, make)

export { JiraIssueSearchInput }
