import {
  DateTime,
  Deferred,
  Effect,
  Predicate,
  Ref,
  Schema,
  Stream
} from "effect"
import { JiraReconnectRequired } from "@projectproject/shared"
import type {
  JiraTransportRequest,
  JiraTransportResponse,
  JiraTransportShape
} from "./Client"
import { JiraManifestSourceV2 } from "./Manifest"
import { JIRA_SCOPES, type JiraTokenEndpointShape } from "./OAuth"

export const JiraBrowserScenario = Schema.Literals([
  "happy_path",
  "rate_limited_once",
  "reconnect_once",
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
  transport: JiraTransportShape
  tokenEndpoint: JiraTokenEndpointShape
  source: typeof JiraManifestSourceV2.Type
  categories: ReadonlyArray<string>
  setScenario: (scenario: JiraBrowserScenario) => Effect.Effect<void>
  releaseAttachment: Effect.Effect<void>
  calls: Effect.Effect<ReadonlyArray<JiraFixtureCall>>
  callCounts: Effect.Effect<Readonly<Record<string, number>>>
}>

type FixtureState = Readonly<{
  scenario: JiraBrowserScenario
  rateLimited: boolean
  reconnectExpired: boolean
}>

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
  first: unknown,
  second: unknown
) => ({
  [field]: [startAt === 0 ? first : second],
  startAt,
  maxResults: 100,
  total: 101,
  isLast: startAt !== 0
})

const response = (
  body: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
  stream: Stream.Stream<Uint8Array> = Stream.empty
): JiraTransportResponse => ({
  status,
  headers,
  json: Effect.succeed(body),
  stream
})

const nextPageToken = (request: JiraTransportRequest) =>
  Predicate.isObject(request.body) &&
  Predicate.isString(request.body.nextPageToken)
    ? request.body.nextPageToken
    : null

const pageFromRequest = (request: JiraTransportRequest) => {
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
      operation:
        collection === "comment"
          ? "comments"
          : collection === "worklog"
            ? "worklogs"
            : "changelogs",
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

const jsonForRequest = (request: JiraTransportRequest) => {
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
  if (path.endsWith("/project/search"))
    return {
      values: [
        {
          id: source.projectId,
          key: source.projectKey,
          name: source.projectName,
          projectTypeKey: "software",
          simplified: false,
          style: "classic",
          avatarUrls: { "48x48": `${source.siteUrl}/avatar/project.png` }
        }
      ],
      startAt,
      maxResults: 100,
      total: 1,
      isLast: true
    }
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

export const makeJiraBrowserFixture = Effect.fn("makeJiraBrowserFixture")(
  function* (
    initialScenario: JiraBrowserScenario
  ): Effect.fn.Return<JiraBrowserFixture> {
    const state = yield* Ref.make<FixtureState>({
      scenario: initialScenario,
      rateLimited: false,
      reconnectExpired: false
    })
    const recordedCalls = yield* Ref.make<ReadonlyArray<JiraFixtureCall>>([])
    const initialAttachmentRelease = yield* Deferred.make<void>()
    const attachmentRelease = yield* Ref.make(initialAttachmentRelease)

    const record = (call: JiraFixtureCall) =>
      Ref.update(recordedCalls, (calls) => [...calls, call])

    const transport = {
      execute: Effect.fn("JiraBrowserFixture.transport.execute")(function* (
        request: JiraTransportRequest
      ) {
        const logicalPage = pageFromRequest(request)
        yield* record({
          target: "jira",
          operation: logicalPage.operation,
          page: logicalPage.page,
          method: request.method,
          url: request.url
        })
        const current = yield* Ref.get(state)
        if (current.scenario === "rate_limited_once" && !current.rateLimited) {
          yield* Ref.set(state, { ...current, rateLimited: true })
          return response({ errorMessages: ["Fixture rate limit"] }, 429, {
            "retry-after": "1"
          })
        }
        if (logicalPage.operation === "attachmentContent") {
          const bytes = new TextEncoder().encode("fixture attachment body")
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
              "content-type": "text/plain"
            },
            content
          )
        }
        return response(jsonForRequest(request))
      })
    } satisfies JiraTransportShape

    const tokenGrant = {
      accessToken: "fixture-access-token-2",
      refreshToken: "fixture-refresh-token-2",
      expiresAt: DateTime.toDate(
        DateTime.makeUnsafe("2026-09-22T11:00:00.000Z")
      ),
      grantedScopes: JIRA_SCOPES.split(" ")
    }
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
          return tokenGrant
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
        if (
          current.scenario === "reconnect_once" &&
          !current.reconnectExpired
        ) {
          yield* Ref.set(state, { ...current, reconnectExpired: true })
          return yield* new JiraReconnectRequired({ reason: "invalid_grant" })
        }
        return tokenGrant
      })
    } satisfies JiraTokenEndpointShape

    return {
      transport,
      tokenEndpoint,
      source,
      categories,
      setScenario: (scenario) =>
        Effect.gen(function* () {
          yield* Ref.set(state, {
            scenario,
            rateLimited: false,
            reconnectExpired: false
          })
          const release = yield* Deferred.make<void>()
          yield* Ref.set(attachmentRelease, release)
        }),
      releaseAttachment: Ref.get(attachmentRelease).pipe(
        Effect.flatMap((release) => Deferred.succeed(release, undefined)),
        Effect.asVoid
      ),
      calls: Ref.get(recordedCalls),
      callCounts: Ref.get(recordedCalls).pipe(
        Effect.map((calls) =>
          calls.reduce<Record<string, number>>((counts, call) => {
            const key = `${call.operation}:${call.page}`
            counts[key] = (counts[key] ?? 0) + 1
            return counts
          }, {})
        )
      )
    }
  }
)
