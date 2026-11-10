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
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Redacted from "effect/Redacted"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as SchemaIssue from "effect/SchemaIssue"
import * as Stream from "effect/Stream"

import {
  JiraRateLimited,
  JiraTransientFailure,
  parseRetryAfter,
  rateLimitFromHeaders
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
  type JiraSprintIssuesPageInput
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
        return yield* new JiraError({
          reason: "invalid_response",
          path: "startAt"
        })
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
          reason: error.reason,
          ...(error.status === undefined ? {} : { status: error.status })
        }),
      JiraError: ({ reason, status, errorMessages }) =>
        new JiraError({
          reason,
          ...(status === undefined ? {} : { status }),
          ...(errorMessages === undefined ? {} : { errorMessages })
        }),
      JiraAccessDenied: ({ status }) =>
        new JiraAccessDenied(status === undefined ? {} : { status }),
      JiraResourceNotFound: () => new JiraResourceNotFound({})
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
    projects: (
      userId: string,
      cloudId: string
    ) => Effect.Effect<ReadonlyArray<JiraProjectChoice>, JiraCallError>
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

const ErrorBody = Schema.Struct({
  errorMessages: Schema.optional(Schema.Array(Schema.String)),
  errors: Schema.optional(Schema.Record(Schema.String, Schema.String))
})
const decodeErrorBodyOption = Schema.decodeUnknownOption(ErrorBody)
const formatSchemaIssue = SchemaIssue.makeFormatterStandardSchemaV1()

const errorMessagesOf = (body: Schema.Json) =>
  decodeErrorBodyOption(body).pipe(
    Option.map(({ errorMessages, errors }) =>
      [
        ...(errorMessages ?? []),
        ...Object.entries(errors ?? {}).map(
          ([field, message]) => `${field}: ${message}`
        )
      ]
        .slice(0, 10)
        .map((message) => message.slice(0, 500))
    ),
    Option.getOrElse((): ReadonlyArray<string> => [])
  )

const decodeFailure = (operation: string, error: Schema.SchemaError) => {
  const [first] = formatSchemaIssue(error.issue).issues
  return new JiraError({
    reason: "decode_failed",
    operation,
    ...(first?.path === undefined
      ? {}
      : { path: first.path.map(String).join(".") })
  })
}

const transportFailure = (operation: string) => (error: JiraCallError) =>
  Predicate.isTagged(error, "JiraError") &&
  (error.reason === "network" ||
    error.reason === "timeout" ||
    error.reason === "server_error")
    ? new JiraTransientFailure({
        operation,
        reason: error.reason,
        ...(error.status === undefined ? {} : { status: error.status })
      })
    : Predicate.isTagged(error, "JiraError") && error.operation === undefined
      ? new JiraError({
          reason: error.reason,
          operation,
          ...(error.status === undefined ? {} : { status: error.status }),
          ...(error.errorMessages === undefined
            ? {}
            : { errorMessages: error.errorMessages }),
          ...(error.path === undefined ? {} : { path: error.path })
        })
      : error

const INTERACTIVE_MAX_DELAY_MILLIS = 2_000

const interactiveRetryAfter = (error: JiraCallError) =>
  Predicate.isTagged(error, "JiraRateLimited")
    ? error.retryAfterSource === "header"
      ? error.retryAfterMillis
      : null
    : Predicate.isTagged(error, "JiraTransientFailure")
      ? (error.retryAfterMillis ?? 0)
      : null

const interactiveRetry = Schedule.exponential("250 millis").pipe(
  Schedule.setInputType<JiraCallError>(),
  Schedule.modifyDelay(({ duration, input }) =>
    Effect.succeed(
      Duration.max(duration, Duration.millis(interactiveRetryAfter(input) ?? 0))
    )
  )
)

const withInteractiveRetry = <A>(effect: Effect.Effect<A, JiraCallError>) =>
  effect.pipe(
    Effect.retry({
      schedule: interactiveRetry,
      times: 2,
      while: (error) => {
        const retryAfter = interactiveRetryAfter(error)
        return retryAfter !== null && retryAfter <= INTERACTIVE_MAX_DELAY_MILLIS
      }
    })
  )

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
      .pipe(Effect.mapError(transportFailure(operation)))

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
    return yield* new JiraAccessDenied({ status: 401, operation })
  })

  const errorMessages = (response: Transport.JiraTransportResponse) =>
    response.json.pipe(
      Effect.map(errorMessagesOf),
      Effect.orElseSucceed((): ReadonlyArray<string> => [])
    )

  const checkResponse = Effect.fn("JiraClient.checkResponse")(function* (
    response: Transport.JiraTransportResponse,
    operation: string,
    cursor: string | null = null
  ) {
    if (response.status === 403)
      return yield* new JiraAccessDenied({ status: 403, operation })
    if (response.status === 404)
      return yield* new JiraResourceNotFound({ operation })
    if (response.status === 429)
      return yield* rateLimitFromHeaders(
        operation,
        response.headers,
        yield* Clock.currentTimeMillis
      )
    if (response.status >= 500) {
      const retryAfterMillis = parseRetryAfter(
        response.headers["retry-after"],
        yield* Clock.currentTimeMillis
      )
      return yield* new JiraTransientFailure({
        operation,
        reason: "server_error",
        status: response.status,
        ...(retryAfterMillis === null ? {} : { retryAfterMillis })
      })
    }
    if (response.status < 200 || response.status >= 300) {
      const messages = yield* errorMessages(response)
      return yield* new JiraError({
        reason:
          response.status === 400
            ? cursor === null
              ? "bad_request"
              : "cursor_expired"
            : "unexpected_status",
        status: response.status,
        operation,
        ...(messages.length === 0 ? {} : { errorMessages: messages })
      })
    }
    return response
  })

  const requestSnapshot = <A>(
    userId: string,
    operation: string,
    method: "GET" | "POST",
    url: string,
    decode: ReturnType<typeof Schema.decodeUnknownEffect<Schema.Decoder<A>>>,
    body?: Schema.Json,
    cursor: string | null = null
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
      Effect.flatMap((response) => checkResponse(response, operation, cursor)),
      Effect.flatMap((response) =>
        response.json.pipe(Effect.mapError(transportFailure(operation)))
      ),
      Effect.flatMap((raw) =>
        decode(raw).pipe(
          Effect.map((value) => ({ raw, value })),
          Effect.mapError((error) => decodeFailure(operation, error))
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
            return Effect.fail(
              new JiraError({
                reason: "invalid_response",
                operation,
                path: "startAt"
              })
            )
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
      },
      input.nextPageToken ?? null
    )
    if (
      page.nextPageToken != null &&
      page.nextPageToken === input.nextPageToken
    )
      return yield* new JiraError({
        reason: "repeated_cursor",
        operation: "issues"
      })
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
    const { raw, value: page } = yield* requestSnapshot(
      input.userId,
      "sprintIssues",
      "GET",
      url.toString(),
      decodeUnknownSprintIssuesResponse,
      undefined,
      input.nextPageToken ?? null
    )
    if (
      page.nextPageToken != null &&
      page.nextPageToken === input.nextPageToken
    )
      return yield* new JiraError({
        reason: "repeated_cursor",
        operation: "sprintIssues"
      })
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
          const redirectFailure = new JiraError({
            reason: "invalid_redirect",
            status: response.status,
            operation
          })
          const location = response.headers.location
          if (!location) return yield* redirectFailure
          const next = yield* Effect.try({
            try: () => new URL(location, url),
            catch: () => redirectFailure
          })
          if (next.protocol !== "https:") return yield* redirectFailure
          if (next.origin !== new URL(url).origin) authorization = undefined
          url = next.toString()
        }
        return yield* new JiraError({ reason: "invalid_redirect", operation })
      })
      const response = yield* authorize(userId, operation, follow)
      yield* checkResponse(response, operation)
      if (response.status !== 200 && response.status !== 206)
        return yield* new JiraError({
          reason: "unexpected_status",
          status: response.status,
          operation
        })
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

  const accessibleSites = Effect.fn("JiraClient.accessibleSites")(function* (
    userId: string
  ) {
    const sites = yield* withInteractiveRetry(
      direct(
        userId,
        "sites",
        "https://api.atlassian.com/oauth/token/accessible-resources",
        decodeUnknownSitesResponse
      )
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
      withInteractiveRetry(
        readProjectsOffsetPage(
          userId,
          "projects",
          `${platformBase(cloudId)}/project/search`,
          startAt
        )
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

  return JiraClient.of({
    snapshots,
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
    attachmentContent
  })
})

export const layer = Layer.effect(JiraClient, make)

export { JiraIssueSearchInput }
