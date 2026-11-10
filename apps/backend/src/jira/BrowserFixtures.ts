import { JiraManifestSourceV2 } from "@pp/integration-jira/Manifest"
import * as OAuth from "@pp/integration-jira/OAuth"
import type * as TokenEndpoint from "@pp/integration-jira/TokenEndpoint"
import type * as Transport from "@pp/integration-jira/Transport"
import { JiraError, JiraReconnectRequired } from "@pp/shared"
import {
  DateTime,
  Deferred,
  Effect,
  Predicate,
  Ref,
  Schema,
  Stream
} from "effect"
import * as Match from "effect/Match"

import {
  defaultJiraFixtureScale,
  fixtureUnit,
  buildGeneratedSite,
  type JiraFixtureScale
} from "./generatedSite"

export const JiraBrowserScenario = Schema.Literals([
  "happy_path",
  "rate_limited_once",
  "reconnect_once",
  "pause_issue_page",
  "pause_attachment"
])

export type JiraBrowserScenario = typeof JiraBrowserScenario.Type

export type JiraFixtureCall = Readonly<{
  target: "jira" | "oauth"
  operation: string
  page: string
  method: "GET" | "POST"
  url: string
}>

export type JiraBrowserFixture = Readonly<{
  transport: Transport.JiraTransport["Service"]
  tokenEndpoint: TokenEndpoint.JiraTokenEndpoint["Service"]
  source: typeof JiraManifestSourceV2.Type
  categories: ReadonlyArray<string>
  setScenario: (scenario: JiraBrowserScenario) => Effect.Effect<void>
  setRevoked: (revoked: boolean) => Effect.Effect<void>
  releaseAttachment: Effect.Effect<void>
  calls: Effect.Effect<ReadonlyArray<JiraFixtureCall>>
  callCounts: Effect.Effect<Readonly<Record<string, number>>>
}>

type FixtureState = Readonly<{
  scenario: JiraBrowserScenario
  rateLimited: boolean
  reconnectExpired: boolean
  revoked: boolean
  calls: number
}>

const RECORDED_CALL_LIMIT = 2000

const appProjectChoice = {
  id: "10000",
  key: "APP",
  name: "Fixture Application",
  projectTypeKey: "software",
  simplified: false,
  style: "classic",
  avatarUrls: { "48x48": "https://fixture.atlassian.net/avatar/project.png" }
}

const source = {
  cloudId: "fixture-cloud-1",
  siteUrl: "https://fixture.atlassian.net",
  projectId: "10000",
  projectKey: "APP",
  projectName: "Fixture Application",
  scannedAt: "2026-09-22T10:00:00.000Z",
  visibleAccount: {
    accountId: "fixture-account-1",
    displayName: "Ada Fixture",
    caveat: "Only content visible to Ada Fixture is included."
  }
} satisfies typeof JiraManifestSourceV2.Type

const categories = [
  "fieldDefinitions",
  "workflows",
  "identities",
  "statuses",
  "issueTypes",
  "priorities",
  "components",
  "issues",
  "comments",
  "changelogs",
  "worklogs",
  "watchers",
  "votes",
  "attachments",
  "parentsSubtasks",
  "epics",
  "sprints",
  "versionsReleases",
  "ranks",
  "links",
  "restrictions",
  "productApps",
  "customFields"
] as const

const user = {
  accountId: source.visibleAccount.accountId,
  displayName: source.visibleAccount.displayName,
  emailAddress: "ada.fixture@example.test",
  active: true,
  accountType: "atlassian",
  avatarUrls: {
    "48x48": "https://fixture.atlassian.net/avatar/ada.png"
  }
}

const adf = (text: string) => ({
  version: 1,
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text }]
    }
  ]
})

const issues = [
  {
    id: "10001",
    key: "APP-1",
    fields: {
      summary: "Ship browser migration harness",
      description: adf("Fixture issue with complete Jira source metadata."),
      status: {
        id: "status-1",
        name: "In Progress",
        statusCategory: { id: 4, key: "indeterminate", name: "In Progress" }
      },
      issuetype: { id: "type-1", name: "Story", subtask: false },
      priority: { id: "priority-1", name: "High" },
      assignee: user,
      reporter: user,
      labels: ["migration", "browser-proof"],
      components: [{ id: "component-1", name: "Migration" }],
      fixVersions: [{ id: "version-1", name: "1.0" }],
      attachment: [
        {
          id: "attachment-1",
          filename: "migration-notes.txt",
          mimeType: "text/plain",
          size: 23,
          content:
            "https://api.atlassian.com/ex/jira/fixture-cloud-1/rest/api/3/attachment/content/attachment-1",
          self: "https://fixture.atlassian.net/rest/api/3/attachment/attachment-1",
          author: user,
          created: "2026-09-20T09:00:00.000Z"
        },
        {
          id: "attachment-2",
          filename: "migration-preview.png",
          mimeType: "image/png",
          size: 68,
          content:
            "https://api.atlassian.com/ex/jira/fixture-cloud-1/rest/api/3/attachment/content/attachment-2",
          self: "https://fixture.atlassian.net/rest/api/3/attachment/attachment-2",
          author: user,
          created: "2026-09-20T09:15:00.000Z"
        },
        {
          id: "attachment-3",
          filename: "migration-demo.mp4",
          mimeType: "video/mp4",
          size: 128,
          content:
            "https://api.atlassian.com/ex/jira/fixture-cloud-1/rest/api/3/attachment/content/attachment-3",
          self: "https://fixture.atlassian.net/rest/api/3/attachment/attachment-3",
          author: user,
          created: "2026-09-20T09:30:00.000Z"
        }
      ],
      issuelinks: [
        {
          id: "link-1",
          type: {
            id: "10000",
            name: "Blocks",
            inward: "is blocked by",
            outward: "blocks"
          },
          outwardIssue: { id: "10002", key: "APP-2" }
        }
      ],
      security: { id: "security-1", name: "Migration team" },
      customfield_10001: "0|hzzzzz:",
      customfield_10002: { id: "epic-1", key: "APP-EPIC", name: "Migration" },
      created: "2026-09-20T08:00:00.000Z",
      updated: "2026-09-22T09:45:00.000Z"
    }
  },
  {
    id: "10002",
    key: "APP-2",
    fields: {
      summary: "Verify imported attachment",
      description: adf("Subtask fixture."),
      status: {
        id: "status-2",
        name: "Todo",
        statusCategory: { id: 2, key: "new", name: "To Do" }
      },
      issuetype: { id: "type-2", name: "Subtask", subtask: true },
      priority: { id: "priority-2", name: "Medium" },
      assignee: null,
      reporter: user,
      labels: ["migration"],
      components: [{ id: "component-1", name: "Migration" }],
      fixVersions: [{ id: "version-1", name: "1.0" }],
      attachment: [],
      issuelinks: [],
      parent: { id: "10001", key: "APP-1" },
      customfield_10001: "0|i00000:",
      created: "2026-09-21T08:00:00.000Z",
      updated: "2026-09-22T09:50:00.000Z"
    }
  }
] as const

const offsetPage = (
  startAt: number,
  field: string,
  first: Schema.Json,
  second: Schema.Json
) => ({
  [field]: [startAt === 0 ? first : second],
  startAt,
  maxResults: 100,
  total: 101,
  isLast: startAt !== 0
})

const response = (
  body: Schema.Json,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
  stream: Stream.Stream<Uint8Array, JiraError> = Stream.empty
): Transport.JiraTransportResponse => ({
  status,
  headers,
  json: Effect.succeed(body),
  stream
})

const nextPageToken = (request: Transport.JiraTransportRequest) =>
  Predicate.isObject(request.body) &&
  Predicate.isString(request.body.nextPageToken)
    ? request.body.nextPageToken
    : null

const pageFromRequest = (request: Transport.JiraTransportRequest) => {
  const url = new URL(request.url)
  const path = url.pathname
  const startAt = url.searchParams.get("startAt") ?? "0"
  if (path.endsWith("/search/jql")) {
    return { operation: "issues", page: nextPageToken(request) ?? "first" }
  }
  const issueCollection = path.match(
    /\/issue\/([^/]+)\/(comment|worklog|changelog)$/
  )
  if (issueCollection) {
    const [, issueId, collection] = issueCollection
    return {
      operation: Match.value(collection).pipe(
        Match.when("comment", () => "comments"),
        Match.when("worklog", () => "worklogs"),
        Match.orElse(() => "changelogs")
      ),
      page: `${decodeURIComponent(issueId)}:${startAt}`
    }
  }
  const attachment = path.match(/\/attachment\/content\/([^/]+)$/)
  if (attachment)
    return {
      operation: "attachmentContent",
      page: decodeURIComponent(attachment[1])
    }
  if (path.endsWith("/myself"))
    return { operation: "currentUser", page: "single" }
  if (path.endsWith("/statuses"))
    return { operation: "projectStatuses", page: "single" }
  if (path.endsWith("/field")) return { operation: "fields", page: "single" }
  if (path.endsWith("/priority"))
    return { operation: "priorities", page: "single" }
  if (path.endsWith("/watchers"))
    return { operation: "watchers", page: "single" }
  if (path.endsWith("/votes")) return { operation: "votes", page: "single" }
  if (path.endsWith("/configuration"))
    return { operation: "boardConfiguration", page: "single" }
  if (path.endsWith("/component"))
    return { operation: "components", page: startAt }
  if (path.endsWith("/version")) return { operation: "versions", page: startAt }
  if (path.endsWith("/sprint")) return { operation: "sprints", page: startAt }
  if (path.endsWith("/issue"))
    return {
      operation: "sprintIssues",
      page: url.searchParams.get("nextPageToken") ?? "first"
    }
  if (path.endsWith("/board")) return { operation: "boards", page: startAt }
  if (path.endsWith("/project/search"))
    return { operation: "projects", page: startAt }
  if (path.includes("/project/"))
    return { operation: "project", page: "single" }
  if (path.endsWith("/oauth/token/accessible-resources"))
    return { operation: "sites", page: "single" }
  return { operation: "unknown", page: "single" }
}

const jsonForRequest = (
  request: Transport.JiraTransportRequest
): Schema.Json => {
  const url = new URL(request.url)
  const path = url.pathname
  const startAt = Number(url.searchParams.get("startAt") ?? "0")
  if (path.endsWith("/oauth/token/accessible-resources"))
    return [
      {
        id: source.cloudId,
        name: "Fixture Jira",
        url: source.siteUrl,
        avatarUrl: `${source.siteUrl}/avatar/site.png`
      }
    ]
  if (path.endsWith("/myself")) return user
  if (
    path.endsWith(`/project/${source.projectId}`) ||
    path.endsWith("/project/APP")
  )
    return {
      id: source.projectId,
      key: source.projectKey,
      name: source.projectName,
      description: adf("Fixture software project."),
      projectTypeKey: "software",
      simplified: false,
      style: "classic",
      lead: user,
      avatarUrls: { "48x48": `${source.siteUrl}/avatar/project.png` }
    }
  if (path.endsWith("/statuses"))
    return [
      {
        id: "type-1",
        name: "Story",
        subtask: false,
        statuses: [
          {
            id: "status-1",
            name: "In Progress",
            description: "Work is active.",
            statusCategory: { id: 4, key: "indeterminate", name: "In Progress" }
          }
        ]
      },
      {
        id: "type-2",
        name: "Subtask",
        subtask: true,
        statuses: [
          {
            id: "status-2",
            name: "Todo",
            description: "Work has not started.",
            statusCategory: { id: 2, key: "new", name: "To Do" }
          }
        ]
      }
    ]
  if (path.endsWith("/field"))
    return [
      {
        id: "summary",
        key: "summary",
        name: "Summary",
        custom: false,
        schema: { type: "string" }
      },
      {
        id: "customfield_10001",
        key: "customfield_10001",
        name: "Rank",
        custom: true,
        schema: {
          type: "string",
          custom: "com.pyxis.greenhopper.jira:gh-lexo-rank"
        }
      },
      {
        id: "customfield_10002",
        key: "customfield_10002",
        name: "Epic Link",
        custom: true,
        schema: {
          type: "any",
          custom: "com.pyxis.greenhopper.jira:gh-epic-link"
        }
      }
    ]
  if (path.endsWith("/priority"))
    return [
      {
        id: "priority-1",
        name: "High",
        description: "High priority",
        iconUrl: null,
        statusColor: "#d04437"
      },
      {
        id: "priority-2",
        name: "Medium",
        description: "Medium priority",
        iconUrl: null,
        statusColor: "#f79232"
      }
    ]
  if (path.endsWith("/component"))
    return {
      values: [
        {
          id: "component-1",
          name: "Migration",
          description: "Jira migration work",
          lead: user
        }
      ],
      startAt,
      maxResults: 100,
      total: 1,
      isLast: true
    }
  if (path.endsWith("/version"))
    return {
      values: [
        {
          id: "version-1",
          name: "1.0",
          description: "First migration release",
          archived: false,
          released: false,
          startDate: "2026-09-01",
          releaseDate: "2026-10-01"
        }
      ],
      startAt,
      maxResults: 100,
      total: 1,
      isLast: true
    }
  if (path.endsWith("/search/jql")) {
    return nextPageToken(request) === "issues-2"
      ? { issues: [issues[1]], nextPageToken: null }
      : { issues: [issues[0]], nextPageToken: "issues-2" }
  }
  const issueCollection = path.match(
    /\/issue\/([^/]+)\/(comment|worklog|changelog)$/
  )
  if (issueCollection && !["APP-1", "10001"].includes(issueCollection[1]))
    return {
      [Match.value(issueCollection[2]).pipe(
        Match.when("changelog", () => "values"),
        Match.when("comment", () => "comments"),
        Match.orElse(() => "worklogs")
      )]: [],
      startAt,
      maxResults: 100,
      total: 0,
      isLast: true
    }
  if (path.endsWith("/comment"))
    return offsetPage(
      startAt,
      "comments",
      {
        id: "comment-1",
        body: adf("First fixture comment."),
        author: user,
        updateAuthor: user,
        created: "2026-09-20T10:00:00.000Z",
        updated: "2026-09-20T10:05:00.000Z",
        visibility: { type: "role", value: "Developers" }
      },
      {
        id: "comment-2",
        body: adf("Second fixture comment."),
        author: user,
        created: "2026-09-21T10:00:00.000Z",
        updated: null
      }
    )
  if (path.endsWith("/worklog"))
    return offsetPage(
      startAt,
      "worklogs",
      {
        id: "worklog-1",
        author: user,
        updateAuthor: user,
        comment: adf("Initial migration work."),
        started: "2026-09-20T11:00:00.000Z",
        created: "2026-09-20T11:30:00.000Z",
        updated: "2026-09-20T11:30:00.000Z",
        timeSpentSeconds: 1800,
        visibility: { type: "role", value: "Developers" }
      },
      {
        id: "worklog-2",
        author: user,
        comment: adf("Verification work."),
        started: "2026-09-21T11:00:00.000Z",
        created: "2026-09-21T11:15:00.000Z",
        updated: "2026-09-21T11:15:00.000Z",
        timeSpentSeconds: 900
      }
    )
  if (path.endsWith("/changelog"))
    return offsetPage(
      startAt,
      "values",
      {
        id: "changelog-1",
        author: user,
        created: "2026-09-20T12:00:00.000Z",
        items: [
          {
            field: "status",
            fieldId: "status",
            from: "status-2",
            to: "status-1"
          }
        ]
      },
      {
        id: "changelog-2",
        author: user,
        created: "2026-09-21T12:00:00.000Z",
        items: [
          {
            field: "priority",
            fieldId: "priority",
            from: "priority-2",
            to: "priority-1"
          }
        ]
      }
    )
  if (path.endsWith("/watchers"))
    return { watchCount: 1, isWatching: true, watchers: [user] }
  if (path.endsWith("/votes"))
    return { votes: 1, hasVoted: true, voters: [user] }
  if (path.endsWith("/board"))
    return {
      values: [
        {
          id: 1,
          name: "Fixture board",
          type: "scrum",
          location: {
            projectId: Number(source.projectId),
            projectKey: source.projectKey
          }
        }
      ],
      startAt,
      maxResults: 100,
      total: 1,
      isLast: true
    }
  if (path.endsWith("/configuration"))
    return {
      id: 1,
      name: "Fixture board",
      type: "scrum",
      location: {
        projectId: Number(source.projectId),
        projectKey: source.projectKey
      },
      columnConfig: {
        columns: [
          { name: "Todo", statuses: [{ id: "status-2" }] },
          { name: "In Progress", statuses: [{ id: "status-1" }] }
        ]
      },
      ranking: { rankCustomFieldId: 10001 }
    }
  if (path.endsWith("/sprint"))
    return {
      values: [
        {
          id: 10,
          name: "Fixture Sprint",
          state: "active",
          startDate: "2026-09-15T08:00:00.000Z",
          endDate: "2026-09-29T08:00:00.000Z",
          completeDate: null,
          goal: "Complete the migration proof"
        }
      ],
      startAt,
      maxResults: 100,
      total: 1,
      isLast: true
    }
  if (path.endsWith("/issue"))
    return {
      issues: issues.map(({ id, key }) => ({ id, key })),
      nextPageToken: null
    }
  throw new Error(
    `Unexpected Jira fixture request ${request.method} ${request.url}`
  )
}

const failureStatus = (
  status: number,
  headers: Readonly<Record<string, string>> = {}
) => response({ errorMessages: [`Fixture failure ${status}`] }, status, headers)

export const createJiraBrowserFixture = Effect.fn("createJiraBrowserFixture")(
  function* (
    initialScenario: JiraBrowserScenario,
    scale: JiraFixtureScale = defaultJiraFixtureScale
  ): Effect.fn.Return<JiraBrowserFixture> {
    const state = yield* Ref.make<FixtureState>({
      scenario: initialScenario,
      rateLimited: false,
      reconnectExpired: false,
      revoked: false,
      calls: 0
    })
    const site = buildGeneratedSite(scale, source.siteUrl, source.cloudId)
    const recordedCalls = yield* Ref.make<ReadonlyArray<JiraFixtureCall>>([])
    const recordedCounts = yield* Ref.make<Readonly<Record<string, number>>>({})
    const initialAttachmentRelease = yield* Deferred.make<void>()
    const attachmentRelease = yield* Ref.make(initialAttachmentRelease)

    const record = (call: JiraFixtureCall) =>
      Effect.all([
        Ref.update(recordedCalls, (calls) =>
          calls.length >= RECORDED_CALL_LIMIT
            ? [...calls.slice(calls.length - RECORDED_CALL_LIMIT + 1), call]
            : [...calls, call]
        ),
        Ref.update(recordedCounts, (counts) => {
          const key = `${call.operation}:${call.page}`
          return { ...counts, [key]: (counts[key] ?? 0) + 1 }
        })
      ])

    const injectedFault = Effect.fn("JiraBrowserFixture.injectedFault")(
      function* (call: number, operation: string) {
        const faults = scale.faults
        const draw = (kind: string) =>
          fixtureUnit(scale.seed, `fault:${kind}:${call}`)
        if (scale.latencyMs > 0) yield* Effect.sleep(scale.latencyMs)
        if (draw("slow") < faults.slow) yield* Effect.sleep(faults.slowMs)
        if (draw("drop") < faults.drop && operation !== "attachmentContent")
          return yield* new JiraError({ reason: "network" })
        if (draw("429") < faults.rateLimit)
          return failureStatus(429, { "retry-after": "2" })
        if (draw("429-bare") < faults.bareRateLimit) return failureStatus(429)
        if (draw("5xx") < faults.serverError)
          return draw("5xx-header") < 0.5
            ? failureStatus(503, { "retry-after": "3" })
            : failureStatus(500)
        return null
      }
    )

    const attachmentDropped = (call: number) =>
      fixtureUnit(scale.seed, `fault:drop:${call}`) < scale.faults.drop

    const transport = {
      execute: Effect.fn("JiraBrowserFixture.transport.execute")(function* (
        request: Transport.JiraTransportRequest
      ) {
        const logicalPage = pageFromRequest(request)
        yield* record({
          target: "jira",
          operation: logicalPage.operation,
          page: logicalPage.page,
          method: request.method,
          url: request.url
        })
        const counted = yield* Ref.updateAndGet(state, (current) => ({
          ...current,
          calls: current.calls + 1,
          revoked:
            current.revoked ||
            (scale.faults.revokeAfterCalls > 0 &&
              current.calls + 1 === scale.faults.revokeAfterCalls)
        }))
        if (counted.revoked && logicalPage.operation !== "sites")
          return failureStatus(401)
        const fault = yield* injectedFault(counted.calls, logicalPage.operation)
        if (fault !== null) return fault
        const current = counted
        if (current.scenario === "rate_limited_once" && !current.rateLimited) {
          yield* Ref.update(state, (latest) => ({
            ...latest,
            rateLimited: true
          }))
          return response({ errorMessages: ["Fixture rate limit"] }, 429, {
            "retry-after": "1"
          })
        }
        if (
          current.scenario === "pause_issue_page" &&
          logicalPage.operation === "issues"
        )
          return yield* Effect.never
        const generated = site.route(
          request.method,
          new URL(request.url),
          request.body,
          {
            id: source.projectId,
            key: source.projectKey,
            body: appProjectChoice
          }
        )
        if (generated?.kind === "json")
          return response(generated.body, generated.status)
        if (generated?.kind === "bytes") {
          if (generated.missing) return failureStatus(404)
          const dropped = attachmentDropped(counted.calls)
          const content = dropped
            ? generated
                .bytes(Math.floor(generated.byteSize / 2))
                .pipe(
                  Stream.concat(
                    Stream.fail(new JiraError({ reason: "network" }))
                  )
                )
            : generated.bytes(generated.byteSize)
          return response(
            {},
            200,
            {
              "content-length": String(generated.byteSize),
              "content-type": generated.contentType
            },
            content
          )
        }
        if (logicalPage.operation === "attachmentContent") {
          const supported = logicalPage.page === "attachment-2"
          const bytes = supported
            ? Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y0fcJ8AAAAASUVORK5CYII=",
                "base64"
              )
            : new TextEncoder().encode("fixture attachment body")
          const release = yield* Ref.get(attachmentRelease)
          const content =
            current.scenario === "pause_attachment"
              ? Stream.fromEffect(Deferred.await(release)).pipe(
                  Stream.flatMap(() => Stream.succeed(bytes))
                )
              : Stream.succeed(bytes)
          return response(
            {},
            200,
            {
              "content-length": String(bytes.byteLength),
              "content-type": supported ? "image/png" : "text/plain"
            },
            content
          )
        }
        return response(jsonForRequest(request))
      })
    } satisfies Transport.JiraTransport["Service"]

    const tokenGrant = Effect.gen(function* () {
      const now = yield* DateTime.now
      return {
        accessToken: "fixture-access-token-2",
        refreshToken: "fixture-refresh-token-2",
        expiresAt: DateTime.toDate(
          scale.rollingGrant
            ? DateTime.add(now, { hours: 1 })
            : DateTime.makeUnsafe("2026-09-22T11:00:00.000Z")
        ),
        grantedScopes: OAuth.JIRA_SCOPES.split(" ")
      }
    })
    const tokenEndpoint = {
      exchange: Effect.fn("JiraBrowserFixture.tokenEndpoint.exchange")(
        function* (_code: string, _codeVerifier: string | null) {
          yield* record({
            target: "oauth",
            operation: "oauth.exchange",
            page: "single",
            method: "POST",
            url: "https://auth.atlassian.com/oauth/token"
          })
          yield* Ref.update(state, (current) => ({
            ...current,
            revoked: false
          }))
          return yield* tokenGrant
        }
      ),
      refresh: Effect.fn("JiraBrowserFixture.tokenEndpoint.refresh")(function* (
        _refreshToken: string
      ) {
        yield* record({
          target: "oauth",
          operation: "oauth.refresh",
          page: "single",
          method: "POST",
          url: "https://auth.atlassian.com/oauth/token"
        })
        const current = yield* Ref.get(state)
        if (current.revoked)
          return yield* new JiraReconnectRequired({ reason: "invalid_grant" })
        if (
          current.scenario === "reconnect_once" &&
          !current.reconnectExpired
        ) {
          yield* Ref.set(state, { ...current, reconnectExpired: true })
          return yield* new JiraReconnectRequired({ reason: "invalid_grant" })
        }
        return yield* tokenGrant
      })
    } satisfies TokenEndpoint.JiraTokenEndpoint["Service"]

    return {
      transport,
      tokenEndpoint,
      source,
      categories,
      setScenario: (scenario) =>
        Effect.gen(function* () {
          yield* Ref.update(state, (current) => ({
            ...current,
            scenario,
            rateLimited: false,
            reconnectExpired: false
          }))
          const release = yield* Deferred.make<void>()
          yield* Ref.set(attachmentRelease, release)
        }),
      setRevoked: (revoked) =>
        Ref.update(state, (current) => ({ ...current, revoked })),
      releaseAttachment: Ref.get(attachmentRelease).pipe(
        Effect.flatMap((release) => Deferred.succeed(release, undefined)),
        Effect.asVoid
      ),
      calls: Ref.get(recordedCalls),
      callCounts: Ref.get(recordedCounts)
    }
  }
)
