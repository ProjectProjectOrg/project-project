import {
  JiraAccessDenied,
  JiraError,
  JiraNotConnected,
  JiraRateLimited,
  JiraReconnectRequired,
  JiraResourceNotFound,
  type JiraProjectChoice,
  type JiraSite
} from "@projectproject/shared"
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
import { JiraCredentials } from "./Credentials"
import {
  JiraBoard,
  JiraBoardConfiguration,
  JiraChangelog,
  JiraComment,
  JiraComponent,
  JiraField,
  JiraIssue,
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
  type JiraIssueSearchInput as JiraIssueSearchInputType
} from "./ClientSchemas"

export type JiraCallError =
  | JiraNotConnected
  | JiraReconnectRequired
  | JiraAccessDenied
  | JiraResourceNotFound
  | JiraRateLimited
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

interface CursorPage<A> {
  readonly values: ReadonlyArray<A>
  readonly nextPageToken: string | null
}

export const paginateCursor = <A, E>(
  fetchPage: (cursor: string | null) => Effect.Effect<CursorPage<A>, E>
): Effect.Effect<ReadonlyArray<A>, E | JiraError> =>
  Effect.gen(function* () {
    const values: Array<A> = []
    const seen = new Set<string>()
    let cursor: string | null = null
    while (true) {
      const page: CursorPage<A> = yield* fetchPage(cursor)
      values.push(...page.values)
      if (page.nextPageToken === null) return values
      if (seen.has(page.nextPageToken)) {
        return yield* new JiraError({ reason: "invalid_response" })
      }
      seen.add(page.nextPageToken)
      cursor = page.nextPageToken
    }
  })

interface OffsetPage<A> {
  readonly values: ReadonlyArray<A>
  readonly startAt: number
  readonly maxResults: number
  readonly total?: number
  readonly isLast?: boolean
}

export const paginateOffset = <A, E>(
  fetchPage: (startAt: number) => Effect.Effect<OffsetPage<A>, E>
): Effect.Effect<ReadonlyArray<A>, E | JiraError> =>
  Effect.gen(function* () {
    const values: Array<A> = []
    let startAt = 0
    while (true) {
      const page: OffsetPage<A> = yield* fetchPage(startAt)
      values.push(...page.values)
      if (page.isLast === true) return values
      const next = page.startAt + page.maxResults
      if (!Number.isFinite(next) || page.maxResults <= 0 || next <= startAt) {
        return yield* new JiraError({ reason: "invalid_response" })
      }
      if (page.total !== undefined && next >= page.total) return values
      if (
        page.total === undefined &&
        page.isLast === undefined &&
        page.values.length < page.maxResults
      ) {
        return values
      }
      startAt = next
    }
  })

export interface JiraClientShape {
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
  ) => Effect.Effect<ReadonlyArray<typeof JiraComponent.Type>, JiraCallError>
  readonly versions: (
    userId: string,
    cloudId: string,
    projectIdOrKey: string
  ) => Effect.Effect<ReadonlyArray<typeof JiraVersion.Type>, JiraCallError>
  readonly searchIssues: (
    userId: string,
    cloudId: string,
    input: JiraIssueSearchInputType
  ) => Effect.Effect<ReadonlyArray<typeof JiraIssue.Type>, JiraCallError>
  readonly comments: (
    userId: string,
    cloudId: string,
    issueIdOrKey: string
  ) => Effect.Effect<ReadonlyArray<typeof JiraComment.Type>, JiraCallError>
  readonly worklogs: (
    userId: string,
    cloudId: string,
    issueIdOrKey: string
  ) => Effect.Effect<ReadonlyArray<typeof JiraWorklog.Type>, JiraCallError>
  readonly changelogs: (
    userId: string,
    cloudId: string,
    issueIdOrKey: string
  ) => Effect.Effect<ReadonlyArray<typeof JiraChangelog.Type>, JiraCallError>
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
  ) => Effect.Effect<ReadonlyArray<typeof JiraBoard.Type>, JiraCallError>
  readonly boardConfiguration: (
    userId: string,
    cloudId: string,
    boardId: number
  ) => Effect.Effect<typeof JiraBoardConfiguration.Type, JiraCallError>
  readonly sprints: (
    userId: string,
    cloudId: string,
    boardId: number
  ) => Effect.Effect<ReadonlyArray<typeof JiraSprint.Type>, JiraCallError>
  readonly sprintIssues: (
    userId: string,
    cloudId: string,
    sprintId: number,
    fields: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<typeof JiraIssue.Type>, JiraCallError>
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

const pathPart = (value: string | number) => encodeURIComponent(String(value))

export const JiraClientLive = Layer.effect(
  JiraClient,
  Effect.gen(function* () {
    const transport = yield* JiraTransport
    const credentials = yield* JiraCredentials

    const send = Effect.fn("JiraClient.send")(function* (input: {
      readonly userId: string
      readonly method: "GET" | "POST"
      readonly url: string
      readonly body?: unknown
    }) {
      let refreshed = false
      let retries = 0
      let waitedSeconds = 0
      let access = yield* credentials.accessTokenFor(input.userId)
      while (true) {
        const response = yield* transport.execute({
          method: input.method,
          url: input.url,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${Redacted.value(access.token)}`
          },
          body: input.body
        })
        if (response.status === 401) {
          if (refreshed) {
            yield* credentials.markReconnectRequired(
              input.userId,
              "invalid_grant"
            )
            return yield* new JiraReconnectRequired({
              reason: "invalid_grant"
            })
          }
          access = yield* credentials.accessTokenFor(input.userId, {
            forceRefresh: true
          })
          refreshed = true
          continue
        }
        if (response.status === 403) return yield* new JiraAccessDenied()
        if (response.status === 404) return yield* new JiraResourceNotFound()
        if (response.status === 429) {
          const header = response.headers["retry-after"]
          const retryAfterSeconds =
            header === undefined ? Number.NaN : Number(header)
          if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) {
            return yield* new JiraRateLimited({ retryAfterSeconds: 0 })
          }
          const delay = retryAfterSeconds
          if (retries >= 4 || waitedSeconds + delay > 60) {
            return yield* new JiraRateLimited({ retryAfterSeconds: delay })
          }
          retries += 1
          waitedSeconds += delay
          yield* Effect.sleep(delay * 1000)
          continue
        }
        if (response.status >= 500) {
          return yield* new JiraError({ reason: "server_error" })
        }
        if (response.status < 200 || response.status >= 300) {
          return yield* new JiraError({ reason: "invalid_response" })
        }
        return response
      }
    })

    const requestJson = <A>(
      userId: string,
      method: "GET" | "POST",
      url: string,
      schema: Schema.Codec<A, unknown, never, never>,
      body?: unknown
    ): Effect.Effect<A, JiraCallError> =>
      send({ userId, method, url, body }).pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap(Schema.decodeUnknownEffect(schema)),
        Effect.mapError((error) =>
          error._tag === "SchemaError"
            ? new JiraError({ reason: "invalid_response" })
            : error
        )
      )

    const accessibleSites = (userId: string) =>
      requestJson(
        userId,
        "GET",
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
      )

    const offsetPage = <A>(
      schema: Schema.Codec<A, unknown, never, never>,
      field = "values"
    ) =>
      Schema.Struct({
        [field]: Schema.Array(schema),
        startAt: Schema.Finite,
        maxResults: Schema.Finite,
        total: Schema.optional(Schema.Finite),
        isLast: Schema.optional(Schema.Boolean)
      })

    const readOffset = <A>(input: {
      readonly userId: string
      readonly url: (startAt: number) => string
      readonly schema: Schema.Codec<A, unknown, never, never>
      readonly field?: string
    }) =>
      paginateOffset((startAt) =>
        requestJson(
          input.userId,
          "GET",
          input.url(startAt),
          offsetPage(input.schema, input.field)
        ).pipe(
          Effect.map((page) => ({
            values: page[input.field ?? "values"] as ReadonlyArray<A>,
            startAt: page.startAt,
            maxResults: page.maxResults,
            total: page.total,
            isLast: page.isLast
          }))
        )
      )

    const withOffset = (url: string, startAt: number) => {
      const value = new URL(url)
      value.searchParams.set("startAt", String(startAt))
      value.searchParams.set("maxResults", "100")
      return value.toString()
    }

    const projects = (userId: string, cloudId: string) =>
      readOffset({
        userId,
        url: (startAt) =>
          withOffset(`${platformBase(cloudId)}/project/search`, startAt),
        schema: JiraProject
      }).pipe(
        Effect.map((values) =>
          values.map((project) => ({
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
      )

    const direct = <A>(
      userId: string,
      url: string,
      schema: Schema.Codec<A, unknown, never, never>
    ) => requestJson(userId, "GET", url, schema)

    const issueOffset = <A>(
      userId: string,
      url: string,
      schema: Schema.Codec<A, unknown, never, never>,
      field: string
    ) =>
      readOffset({
        userId,
        url: (startAt) => withOffset(url, startAt),
        schema,
        field
      })

    const searchIssues = (
      userId: string,
      cloudId: string,
      input: JiraIssueSearchInputType
    ) =>
      paginateCursor((nextPageToken) =>
        requestJson(
          userId,
          "POST",
          `${platformBase(cloudId)}/search/jql`,
          Schema.Struct({
            issues: Schema.Array(JiraIssue),
            nextPageToken: Schema.optional(Schema.String)
          }),
          {
            jql: input.jql,
            fields: input.fields,
            ...(input.expand && input.expand.length > 0
              ? { expand: input.expand.join(",") }
              : {}),
            maxResults: 100,
            ...(nextPageToken ? { nextPageToken } : {})
          }
        ).pipe(
          Effect.map((page) => ({
            values: page.issues,
            nextPageToken: page.nextPageToken ?? null
          }))
        )
      )

    const attachmentContent = (
      userId: string,
      cloudId: string,
      attachmentId: string,
      range?: string
    ) =>
      Stream.unwrap(
        Effect.gen(function* () {
          let access = yield* credentials.accessTokenFor(userId)
          const initialUrl = `${platformBase(cloudId)}/attachment/content/${pathPart(attachmentId)}`
          let url = initialUrl
          let authorization: string | undefined =
            `Bearer ${Redacted.value(access.token)}`
          let redirects = 0
          let refreshed = false
          while (redirects <= 3) {
            const headers: Record<string, string> = {}
            if (authorization) headers.authorization = authorization
            if (range) headers.range = range
            const response = yield* transport.execute({
              method: "GET",
              url,
              headers
            })
            if ([200, 206].includes(response.status)) return response.stream
            if (response.status >= 300 && response.status < 400) {
              const location = response.headers.location
              if (!location) {
                return yield* new JiraError({ reason: "invalid_response" })
              }
              const next = new URL(location, url)
              if (next.protocol !== "https:") {
                return yield* new JiraError({ reason: "invalid_response" })
              }
              if (next.origin !== new URL(url).origin) authorization = undefined
              url = next.toString()
              redirects += 1
              continue
            }
            if (response.status === 401) {
              if (!refreshed) {
                access = yield* credentials.accessTokenFor(userId, {
                  forceRefresh: true
                })
                authorization = `Bearer ${Redacted.value(access.token)}`
                url = initialUrl
                redirects = 0
                refreshed = true
                continue
              }
              yield* credentials.markReconnectRequired(userId, "invalid_grant")
              return yield* new JiraReconnectRequired({
                reason: "invalid_grant"
              })
            }
            if (response.status === 403) return yield* new JiraAccessDenied()
            if (response.status === 404) {
              return yield* new JiraResourceNotFound()
            }
            if (response.status === 429) {
              return yield* new JiraRateLimited({
                retryAfterSeconds: Number(response.headers["retry-after"] ?? 0)
              })
            }
            return yield* new JiraError({
              reason:
                response.status >= 500 ? "server_error" : "invalid_response"
            })
          }
          return yield* new JiraError({ reason: "invalid_response" })
        })
      )

    return JiraClient.of({
      accessibleSites,
      currentUser: (userId, cloudId) =>
        direct(userId, `${platformBase(cloudId)}/myself`, JiraUser),
      projects,
      project: (userId, cloudId, projectIdOrKey) =>
        direct(
          userId,
          `${platformBase(cloudId)}/project/${pathPart(projectIdOrKey)}`,
          JiraProject
        ),
      projectStatuses: (userId, cloudId, projectIdOrKey) =>
        direct(
          userId,
          `${platformBase(cloudId)}/project/${pathPart(projectIdOrKey)}/statuses`,
          Schema.Array(JiraIssueTypeStatuses)
        ),
      fields: (userId, cloudId) =>
        direct(
          userId,
          `${platformBase(cloudId)}/field`,
          Schema.Array(JiraField)
        ),
      priorities: (userId, cloudId) =>
        direct(
          userId,
          `${platformBase(cloudId)}/priority`,
          Schema.Array(JiraPriority)
        ),
      components: (userId, cloudId, projectIdOrKey) =>
        issueOffset(
          userId,
          `${platformBase(cloudId)}/project/${pathPart(projectIdOrKey)}/component`,
          JiraComponent,
          "values"
        ),
      versions: (userId, cloudId, projectIdOrKey) =>
        issueOffset(
          userId,
          `${platformBase(cloudId)}/project/${pathPart(projectIdOrKey)}/version`,
          JiraVersion,
          "values"
        ),
      searchIssues,
      comments: (userId, cloudId, issueIdOrKey) =>
        issueOffset(
          userId,
          `${platformBase(cloudId)}/issue/${pathPart(issueIdOrKey)}/comment`,
          JiraComment,
          "comments"
        ),
      worklogs: (userId, cloudId, issueIdOrKey) =>
        issueOffset(
          userId,
          `${platformBase(cloudId)}/issue/${pathPart(issueIdOrKey)}/worklog`,
          JiraWorklog,
          "worklogs"
        ),
      changelogs: (userId, cloudId, issueIdOrKey) =>
        issueOffset(
          userId,
          `${platformBase(cloudId)}/issue/${pathPart(issueIdOrKey)}/changelog`,
          JiraChangelog,
          "values"
        ),
      watchers: (userId, cloudId, issueIdOrKey) =>
        direct(
          userId,
          `${platformBase(cloudId)}/issue/${pathPart(issueIdOrKey)}/watchers`,
          JiraWatchers
        ),
      votes: (userId, cloudId, issueIdOrKey) =>
        direct(
          userId,
          `${platformBase(cloudId)}/issue/${pathPart(issueIdOrKey)}/votes`,
          JiraVotes
        ),
      boards: (userId, cloudId, projectIdOrKey) =>
        issueOffset(
          userId,
          `${agileBase(cloudId)}/board?projectKeyOrId=${pathPart(projectIdOrKey)}`,
          JiraBoard,
          "values"
        ),
      boardConfiguration: (userId, cloudId, boardId) =>
        direct(
          userId,
          `${agileBase(cloudId)}/board/${pathPart(boardId)}/configuration`,
          JiraBoardConfiguration
        ),
      sprints: (userId, cloudId, boardId) =>
        issueOffset(
          userId,
          `${agileBase(cloudId)}/board/${pathPart(boardId)}/sprint`,
          JiraSprint,
          "values"
        ),
      sprintIssues: (userId, cloudId, sprintId, fields) =>
        issueOffset(
          userId,
          `${agileBase(cloudId)}/sprint/${pathPart(sprintId)}/issue?fields=${fields.map(pathPart).join(",")}`,
          JiraIssue,
          "issues"
        ),
      attachmentContent
    })
  })
)

export { JiraIssueSearchInput }
