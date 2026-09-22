import {
  JiraError,
  JiraRateLimited as PublicJiraRateLimited
} from "@projectproject/shared"
import { it } from "@effect/vitest"
import { describe, expect } from "vite-plus/test"
import * as Duration from "effect/Duration"
import * as Fiber from "effect/Fiber"
import * as TestClock from "effect/testing/TestClock"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import * as Schema from "effect/Schema"
import { JiraRateLimited, JiraTransientFailure } from "./Blocked"
import { FetchHttpClient } from "effect/unstable/http"
import { JiraCredentials } from "./Credentials"
import {
  JiraClient,
  JiraClientLive,
  JiraTransport,
  JiraTransportLive,
  paginateCursor,
  paginateOffset,
  type JiraClientShape,
  type JiraCallError,
  type JiraTransportRequest,
  type JiraTransportResponse
} from "./Client"

const stubCredentials = JiraCredentials.of({
  status: () => Effect.die("unused"),
  beginConnect: () => Effect.die("unused"),
  completeConnect: () => Effect.die("unused"),
  completeConnectWithReturnPath: () => Effect.die("unused"),
  returnPathForState: () => Effect.die("unused"),
  accessTokenFor: () => Effect.succeed({ token: Redacted.make("token") }),
  disconnect: () => Effect.die("unused"),
  markReconnectRequired: () => Effect.void
})

describe("Jira client", () => {
  it("continues cursor pagination through an empty intermediate page", async () => {
    const seen: Array<string | null> = []
    const values = await Effect.runPromise(
      paginateCursor((cursor) => {
        seen.push(cursor)
        return Effect.succeed(
          cursor === null
            ? { values: ["a"], nextPageToken: "next" }
            : cursor === "next"
              ? { values: [], nextPageToken: "last" }
              : { values: ["b"], nextPageToken: null }
        )
      })
    )

    expect(values).toEqual(["a", "b"])
    expect(seen).toEqual([null, "next", "last"])
  })

  it("rejects a repeated cursor", async () => {
    const result = await Effect.runPromise(
      Effect.result(
        paginateCursor(() =>
          Effect.succeed({ values: [], nextPageToken: "repeat" })
        )
      )
    )

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure).toMatchObject({
        _tag: "JiraError",
        reason: "invalid_response"
      })
    }
  })

  it("uses server offset metadata and terminates an empty final page", async () => {
    const seen: Array<number> = []
    const values = await Effect.runPromise(
      paginateOffset((startAt) => {
        seen.push(startAt)
        return Effect.succeed(
          startAt === 0
            ? {
                values: ["a"],
                startAt: 0,
                maxResults: 1,
                total: 3,
                isLast: false
              }
            : startAt === 1
              ? {
                  values: [],
                  startAt: 1,
                  maxResults: 1,
                  total: 3,
                  isLast: false
                }
              : {
                  values: ["b"],
                  startAt: 2,
                  maxResults: 1,
                  total: 3,
                  isLast: true
                }
        )
      })
    )

    expect(values).toEqual(["a", "b"])
    expect(seen).toEqual([0, 1, 2])
  })

  it("adds bearer auth and exhausts project pagination", async () => {
    const requests = await Effect.runPromise(
      Ref.make<Array<JiraTransportRequest>>([])
    )
    const transport = JiraTransport.of({
      execute: (request) =>
        Effect.gen(function* () {
          yield* Ref.update(requests, (all) => [...all, request])
          const url = new URL(request.url)
          const startAt = Number(url.searchParams.get("startAt") ?? "0")
          const body =
            startAt === 0
              ? {
                  values: [
                    {
                      id: "1",
                      key: "APP",
                      name: "App",
                      projectTypeKey: "software",
                      simplified: false,
                      style: "classic",
                      avatarUrls: { "48x48": "https://avatar.example/app" }
                    }
                  ],
                  startAt: 0,
                  maxResults: 1,
                  total: 2,
                  isLast: false
                }
              : {
                  values: [
                    {
                      id: "2",
                      key: "OPS",
                      name: "Ops",
                      projectTypeKey: null,
                      simplified: null,
                      style: null,
                      avatarUrls: {}
                    }
                  ],
                  startAt: 1,
                  maxResults: 1,
                  total: 2,
                  isLast: true
                }
          return {
            status: 200,
            headers: {},
            json: Effect.succeed(body),
            stream: Stream.empty
          } satisfies JiraTransportResponse
        })
    })
    const credentials = JiraCredentials.of({
      status: () => Effect.die("unused"),
      beginConnect: () => Effect.die("unused"),
      completeConnect: () => Effect.die("unused"),
      completeConnectWithReturnPath: () => Effect.die("unused"),
      returnPathForState: () => Effect.die("unused"),
      accessTokenFor: () =>
        Effect.succeed({ token: Redacted.make("access-token") }),
      disconnect: () => Effect.die("unused"),
      markReconnectRequired: () => Effect.void
    })
    const projects = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* JiraClient
        return yield* client.projects("user-1", "cloud id")
      }).pipe(Effect.provide(clientLayer(transport, credentials)))
    )
    const recorded = await Effect.runPromise(Ref.get(requests))

    expect(projects.map(({ key }) => key)).toEqual(["APP", "OPS"])
    expect(recorded).toHaveLength(2)
    expect(recorded[0]?.headers.authorization).toBe("Bearer access-token")
    expect(recorded[0]?.url).toContain(
      "/ex/jira/cloud%20id/rest/api/3/project/search"
    )
  })

  it("decodes project statuses with top-level issue type fields", async () => {
    const transport = JiraTransport.of({
      execute: () =>
        Effect.succeed({
          status: 200,
          headers: {},
          json: Effect.succeed([
            {
              id: "10001",
              name: "Bug",
              subtask: false,
              statuses: [
                {
                  id: "3",
                  name: "In Progress",
                  statusCategory: { id: 4, key: "indeterminate" }
                }
              ]
            }
          ]),
          stream: Stream.empty
        })
    })
    const credentials = JiraCredentials.of({
      status: () => Effect.die("unused"),
      beginConnect: () => Effect.die("unused"),
      completeConnect: () => Effect.die("unused"),
      completeConnectWithReturnPath: () => Effect.die("unused"),
      returnPathForState: () => Effect.die("unused"),
      accessTokenFor: () => Effect.succeed({ token: Redacted.make("token") }),
      disconnect: () => Effect.die("unused"),
      markReconnectRequired: () => Effect.void
    })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* JiraClient
        return yield* client.projectStatuses("user", "cloud", "APP")
      }).pipe(Effect.provide(clientLayer(transport, credentials)))
    )

    expect(result).toEqual([
      {
        id: "10001",
        name: "Bug",
        subtask: false,
        statuses: [
          {
            id: "3",
            name: "In Progress",
            statusCategory: { id: 4, key: "indeterminate" }
          }
        ]
      }
    ])
  })

  it("omits an empty expand value from enhanced issue search", async () => {
    const requests: Array<JiraTransportRequest> = []
    const transport = JiraTransport.of({
      execute: (request) => {
        requests.push(request)
        return Effect.succeed({
          status: 200,
          headers: {},
          json: Effect.succeed({
            isLast: true,
            issues: [{ id: "10001", key: "APP-1", fields: {} }]
          }),
          stream: Stream.empty
        })
      }
    })
    const credentials = JiraCredentials.of({
      status: () => Effect.die("unused"),
      beginConnect: () => Effect.die("unused"),
      completeConnect: () => Effect.die("unused"),
      completeConnectWithReturnPath: () => Effect.die("unused"),
      returnPathForState: () => Effect.die("unused"),
      accessTokenFor: () => Effect.succeed({ token: Redacted.make("token") }),
      disconnect: () => Effect.die("unused"),
      markReconnectRequired: () => Effect.void
    })

    const issues = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* JiraClient
        return yield* client.searchIssues("user", "cloud", {
          jql: 'project = "APP"',
          fields: ["summary"]
        })
      }).pipe(Effect.provide(clientLayer(transport, credentials)))
    )

    expect(issues.map(({ key }) => key)).toEqual(["APP-1"])
    expect(requests[0]?.body).toEqual({
      jql: 'project = "APP"',
      fields: ["summary"],
      maxResults: 100
    })
  })

  it("uses the board-scoped enhanced endpoint for sprint issues", async () => {
    const requests: Array<JiraTransportRequest> = []
    const transport = JiraTransport.of({
      execute: (request) => {
        requests.push(request)
        const nextPageToken = new URL(request.url).searchParams.get(
          "nextPageToken"
        )
        return Effect.succeed({
          status: 200,
          headers: {},
          json: Effect.succeed(
            nextPageToken === null
              ? {
                  isLast: false,
                  nextPageToken: "next",
                  issues: [
                    {
                      expand: "",
                      id: "10001",
                      key: "APP-1",
                      self: "https://example.test/issue/10001"
                    }
                  ]
                }
              : {
                  isLast: true,
                  issues: [
                    {
                      expand: "",
                      id: "10002",
                      key: "APP-2",
                      self: "https://example.test/issue/10002"
                    }
                  ]
                }
          ),
          stream: Stream.empty
        })
      }
    })
    const credentials = JiraCredentials.of({
      status: () => Effect.die("unused"),
      beginConnect: () => Effect.die("unused"),
      completeConnect: () => Effect.die("unused"),
      completeConnectWithReturnPath: () => Effect.die("unused"),
      returnPathForState: () => Effect.die("unused"),
      accessTokenFor: () => Effect.succeed({ token: Redacted.make("token") }),
      disconnect: () => Effect.die("unused"),
      markReconnectRequired: () => Effect.void
    })

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* JiraClient
        return yield* Effect.exit(
          client.sprintIssues("user", "cloud", 84, 37, ["id"])
        )
      }).pipe(Effect.provide(clientLayer(transport, credentials)))
    )

    expect(exit._tag).toBe("Success")
    if (exit._tag === "Failure") return
    expect(exit.value.map(({ key }) => key)).toEqual(["APP-1", "APP-2"])
    expect(
      requests.map(({ url }) => {
        const parsed = new URL(url)
        return {
          pathname: parsed.pathname,
          fields: parsed.searchParams.get("fields"),
          maxResults: parsed.searchParams.get("maxResults"),
          nextPageToken: parsed.searchParams.get("nextPageToken")
        }
      })
    ).toEqual([
      {
        pathname: "/ex/jira/cloud/rest/software/1.0/board/84/sprint/37/issue",
        fields: "id",
        maxResults: "100",
        nextPageToken: null
      },
      {
        pathname: "/ex/jira/cloud/rest/software/1.0/board/84/sprint/37/issue",
        fields: "id",
        maxResults: "100",
        nextPageToken: "next"
      }
    ])
  })

  it("maps permission failures without reading the upstream body", async () => {
    let bodyRead = false
    const transport = JiraTransport.of({
      execute: () =>
        Effect.succeed({
          status: 403,
          headers: {},
          json: Effect.sync(() => {
            bodyRead = true
            return { secret: "must-not-read" }
          }),
          stream: Stream.empty
        })
    })
    const credentials = JiraCredentials.of({
      status: () => Effect.die("unused"),
      beginConnect: () => Effect.die("unused"),
      completeConnect: () => Effect.die("unused"),
      completeConnectWithReturnPath: () => Effect.die("unused"),
      returnPathForState: () => Effect.die("unused"),
      accessTokenFor: () => Effect.succeed({ token: Redacted.make("token") }),
      disconnect: () => Effect.die("unused"),
      markReconnectRequired: () => Effect.void
    })
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* JiraClient
        return yield* Effect.result(client.fields("user", "cloud"))
      }).pipe(Effect.provide(clientLayer(transport, credentials)))
    )

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("JiraAccessDenied")
    }
    expect(bodyRead).toBe(false)
  })

  it("refreshes once when attachment download returns unauthorized", async () => {
    const requests: Array<JiraTransportRequest> = []
    const refreshes: Array<boolean | undefined> = []
    const transport = JiraTransport.of({
      execute: (request) => {
        requests.push(request)
        return Effect.succeed({
          status: requests.length === 1 ? 401 : 206,
          headers: {},
          json: Effect.die("unused"),
          stream: Stream.make(new Uint8Array([1, 2, 3]))
        })
      }
    })
    const credentials = JiraCredentials.of({
      status: () => Effect.die("unused"),
      beginConnect: () => Effect.die("unused"),
      completeConnect: () => Effect.die("unused"),
      completeConnectWithReturnPath: () => Effect.die("unused"),
      returnPathForState: () => Effect.die("unused"),
      accessTokenFor: (_userId, options) => {
        refreshes.push(options?.forceRefresh)
        return Effect.succeed({
          token: Redacted.make(options?.forceRefresh ? "rotated" : "initial")
        })
      },
      disconnect: () => Effect.die("unused"),
      markReconnectRequired: () => Effect.void
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* JiraClient
        yield* client
          .attachmentContent("user", "cloud", "123", "bytes=2-4")
          .pipe(Stream.runDrain)
      }).pipe(Effect.provide(clientLayer(transport, credentials)))
    )

    expect(refreshes).toEqual([undefined, true])
    expect(requests.map(({ headers }) => headers.authorization)).toEqual([
      "Bearer initial",
      "Bearer rotated"
    ])
    expect(requests.map(({ headers }) => headers.range)).toEqual([
      "bytes=2-4",
      "bytes=2-4"
    ])
  })
})

const clientLayer = (
  transport: typeof JiraTransport.Service,
  credentials = stubCredentials
) =>
  JiraClientLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(JiraTransport, transport),
        Layer.succeed(JiraCredentials, credentials)
      )
    )
  )
const response = (
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {}
): JiraTransportResponse => ({
  status,
  headers,
  json: Effect.succeed(body),
  stream: Stream.empty
})
const scope = { userId: "user", cloudId: "cloud" }
const pageCases = [
  {
    method: "searchIssuesPage",
    input: {
      ...scope,
      jql: 'project = "APP"',
      fields: ["summary"],
      nextPageToken: "previous"
    },
    field: "issues",
    item: { id: "1", key: "APP-1", fields: {} },
    path: "/rest/api/3/search/jql",
    cursor: true
  },
  {
    method: "commentsPage",
    input: { ...scope, issueIdOrKey: "APP-1", startAt: 100 },
    field: "comments",
    item: {
      id: "1",
      body: {},
      author: { accountId: "a", displayName: "A" },
      created: "2026-01-01"
    },
    path: "/rest/api/3/issue/APP-1/comment"
  },
  {
    method: "worklogsPage",
    input: { ...scope, issueIdOrKey: "APP-1", startAt: 100 },
    field: "worklogs",
    item: {
      id: "1",
      author: { accountId: "a", displayName: "A" },
      started: "2026-01-01",
      created: "2026-01-01",
      updated: "2026-01-01",
      timeSpentSeconds: 60
    },
    path: "/rest/api/3/issue/APP-1/worklog"
  },
  {
    method: "changelogsPage",
    input: { ...scope, issueIdOrKey: "APP-1", startAt: 100 },
    field: "values",
    item: { id: "1", created: "2026-01-01", items: [] },
    path: "/rest/api/3/issue/APP-1/changelog"
  },
  {
    method: "componentsPage",
    input: { ...scope, projectIdOrKey: "APP", startAt: 100 },
    field: "values",
    item: { id: "1", name: "Core" },
    path: "/rest/api/3/project/APP/component"
  },
  {
    method: "versionsPage",
    input: { ...scope, projectIdOrKey: "APP", startAt: 100 },
    field: "values",
    item: { id: "1", name: "Release" },
    path: "/rest/api/3/project/APP/version"
  },
  {
    method: "boardsPage",
    input: { ...scope, projectIdOrKey: "APP", startAt: 100 },
    field: "values",
    item: { id: 1, name: "Board", type: "scrum" },
    path: "/rest/agile/1.0/board"
  },
  {
    method: "sprintsPage",
    input: { ...scope, boardId: 84, startAt: 100 },
    field: "values",
    item: { id: 1, name: "Sprint", state: "active" },
    path: "/rest/agile/1.0/board/84/sprint"
  },
  {
    method: "sprintIssuesPage",
    input: {
      ...scope,
      boardId: 84,
      sprintId: 37,
      fields: ["id"],
      nextPageToken: "previous"
    },
    field: "issues",
    item: { id: "1", key: "APP-1" },
    path: "/rest/software/1.0/board/84/sprint/37/issue",
    cursor: true
  }
] as const

const requestPage = (
  client: JiraClientShape,
  fixture: (typeof pageCases)[number]
): Effect.Effect<unknown, JiraCallError> => {
  switch (fixture.method) {
    case "searchIssuesPage":
      return client.searchIssuesPage(fixture.input)
    case "commentsPage":
      return client.commentsPage(fixture.input)
    case "worklogsPage":
      return client.worklogsPage(fixture.input)
    case "changelogsPage":
      return client.changelogsPage(fixture.input)
    case "componentsPage":
      return client.componentsPage(fixture.input)
    case "versionsPage":
      return client.versionsPage(fixture.input)
    case "boardsPage":
      return client.boardsPage(fixture.input)
    case "sprintsPage":
      return client.sprintsPage(fixture.input)
    case "sprintIssuesPage":
      return client.sprintIssuesPage(fixture.input)
    default:
      return Effect.die("Unexpected Jira page method")
  }
}

describe("Jira one-page boundary", () => {
  for (const fixture of pageCases) {
    it.effect(
      `${fixture.method} returns one decoded page with continuation`,
      () =>
        Effect.gen(function* () {
          const requests: Array<JiraTransportRequest> = []
          const transport = JiraTransport.of({
            execute: (request) =>
              Effect.sync(() => {
                requests.push(request)
                return response(200, {
                  [fixture.field]: [{ ...fixture.item, ignored: true }],
                  nextPageToken: "next",
                  startAt: 100,
                  maxResults: 100,
                  total: 300,
                  isLast: false
                })
              })
          })
          const page = yield* Effect.gen(function* () {
            const client = yield* JiraClient
            return yield* requestPage(client, fixture)
          }).pipe(Effect.provide(clientLayer(transport)))
          expect(page).toMatchObject(
            "cursor" in fixture
              ? { values: [fixture.item], nextPageToken: "next" }
              : {
                  values: [fixture.item],
                  startAt: 100,
                  maxResults: 100,
                  total: 300,
                  isLast: false
                }
          )
          expect(requests).toHaveLength(1)
          const url = new URL(requests[0].url)
          expect(url.pathname).toBe(`/ex/jira/cloud${fixture.path}`)
          if (fixture.method === "searchIssuesPage")
            expect(requests[0]?.body).toEqual({
              jql: 'project = "APP"',
              fields: ["summary"],
              maxResults: 100,
              nextPageToken: "previous"
            })
          else {
            expect(url.searchParams.get("maxResults")).toBe("100")
            expect(
              url.searchParams.get(
                "cursor" in fixture ? "nextPageToken" : "startAt"
              )
            ).toBe("cursor" in fixture ? "previous" : "100")
          }
        })
    )
  }
  for (const [header, expected] of [
    ["15", 15000],
    ["0", 0],
    ["86400", 86400000],
    ["Thu, 01 Jan 1970 00:00:15 GMT", 15000],
    ["Fri, 02 Jan 1970 00:00:00 GMT", 86400000],
    [undefined, null],
    ["", null],
    ["-1", null],
    ["1.5", null],
    ["1e2", null],
    ["garbage", null],
    ["86401", null],
    ["Fri, 02 Jan 1970 00:00:01 GMT", null],
    ["Wed, 31 Dec 1969 23:59:59 GMT", null],
    ["2026-01-01", null]
  ] as const) {
    it.effect(
      `returns immediately for Retry-After ${JSON.stringify(header)}`,
      () =>
        Effect.gen(function* () {
          let requests = 0
          const transport = JiraTransport.of({
            execute: () =>
              Effect.sync(() => {
                requests += 1
                return requests === 1
                  ? response(
                      429,
                      {},
                      header === undefined ? {} : { "retry-after": header }
                    )
                  : response(200, [])
              })
          })
          const fiber = yield* Effect.gen(function* () {
            const client = yield* JiraClient
            return yield* Effect.result(client.fields("user", "cloud"))
          }).pipe(Effect.provide(clientLayer(transport)), Effect.forkChild)
          yield* TestClock.adjust(Duration.days(2))
          expect(yield* Fiber.join(fiber)).toMatchObject({
            _tag: "Failure",
            failure:
              expected === null
                ? {
                    _tag: "JiraTransientFailure",
                    operation: "fields",
                    reason: "invalid_retry_after"
                  }
                : {
                    _tag: "JiraRateLimited",
                    operation: "fields",
                    retryAfterMillis: expected
                  }
          })
          expect(requests).toBe(1)
        })
    )
  }
  for (const reason of ["network", "timeout", "server_error"] as const) {
    it.effect(`returns typed ${reason} without retries`, () =>
      Effect.gen(function* () {
        let requests = 0
        const transport = JiraTransport.of({
          execute: () =>
            Effect.suspend(() => {
              requests += 1
              return reason === "server_error"
                ? Effect.succeed(response(503))
                : Effect.fail(new JiraError({ reason }))
            })
        })
        const fiber = yield* Effect.gen(function* () {
          const client = yield* JiraClient
          return yield* Effect.result(client.fields("user", "cloud"))
        }).pipe(Effect.provide(clientLayer(transport)), Effect.forkChild)
        yield* TestClock.adjust(Duration.seconds(10))
        expect(yield* Fiber.join(fiber)).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "JiraTransientFailure", operation: "fields", reason }
        })
        expect(requests).toBe(1)
      })
    )
  }
  for (const secondStatus of [200, 401]) {
    it.effect(`refreshes once and handles second status ${secondStatus}`, () =>
      Effect.gen(function* () {
        const requests: Array<JiraTransportRequest> = []
        const refreshes: Array<boolean | undefined> = []
        let reconnects = 0
        const credentials = JiraCredentials.of({
          ...stubCredentials,
          accessTokenFor: (_userId, options) =>
            Effect.sync(() => {
              refreshes.push(options?.forceRefresh)
              return {
                token: Redacted.make(
                  options?.forceRefresh ? "rotated" : "initial"
                )
              }
            }),
          markReconnectRequired: () =>
            Effect.sync(() => {
              reconnects += 1
            })
        })
        const transport = JiraTransport.of({
          execute: (request) =>
            Effect.sync(() => {
              requests.push(request)
              return response(requests.length === 1 ? 401 : secondStatus, [])
            })
        })
        const result = yield* Effect.gen(function* () {
          const client = yield* JiraClient
          return yield* Effect.result(client.fields("user", "cloud"))
        }).pipe(Effect.provide(clientLayer(transport, credentials)))
        expect(result).toMatchObject(
          secondStatus === 200
            ? { _tag: "Success", success: [] }
            : {
                _tag: "Failure",
                failure: {
                  _tag: "JiraReconnectRequired",
                  reason: "invalid_grant"
                }
              }
        )
        expect(refreshes).toEqual([undefined, true])
        expect(reconnects).toBe(secondStatus === 401 ? 1 : 0)
        expect(requests.map(({ headers }) => headers.authorization)).toEqual([
          "Bearer initial",
          "Bearer rotated"
        ])
      })
    )
  }
  it.effect("rejects a stalled offset", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        paginateOffset(() =>
          Effect.succeed({
            values: ["a"],
            startAt: 0,
            maxResults: 100,
            total: 300,
            isLast: false
          })
        )
      )
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "JiraError", reason: "invalid_response" }
      })
    })
  )
})

describe("Jira boundary edge cases", () => {
  it.effect(
    "stops offset aggregation when total is reached despite isLast false",
    () =>
      Effect.gen(function* () {
        let requests = 0
        const transport = JiraTransport.of({
          execute: () =>
            Effect.sync(() => {
              requests += 1
              return response(200, {
                values: [{ id: "1", key: "APP", name: "App" }],
                startAt: 0,
                maxResults: 100,
                total: 1,
                isLast: false
              })
            })
        })
        const result = yield* Effect.gen(function* () {
          const client = yield* JiraClient
          return yield* Effect.result(client.projects("user", "cloud"))
        }).pipe(Effect.provide(clientLayer(transport)))
        expect(result._tag).toBe("Success")
        expect(requests).toBe(1)
      })
  )

  for (const fixture of [
    {
      body: { values: [], startAt: 0, maxResults: 100 },
      expected: {
        values: [],
        startAt: 0,
        maxResults: 100,
        total: null,
        isLast: true
      }
    },
    {
      body: { values: [], startAt: 0, maxResults: 100, total: 250 },
      expected: {
        values: [],
        startAt: 0,
        maxResults: 100,
        total: 250,
        isLast: false
      }
    },
    {
      body: { values: [], startAt: 0, maxResults: 100, isLast: false },
      expected: {
        values: [],
        startAt: 0,
        maxResults: 100,
        total: null,
        isLast: false
      }
    }
  ]) {
    it.effect(
      `normalizes offset continuation ${JSON.stringify(fixture.body)}`,
      () =>
        Effect.gen(function* () {
          const result = yield* Effect.gen(function* () {
            const client = yield* JiraClient
            return yield* client.componentsPage({
              ...scope,
              projectIdOrKey: "APP"
            })
          }).pipe(
            Effect.provide(
              clientLayer(
                JiraTransport.of({
                  execute: () => Effect.succeed(response(200, fixture.body))
                })
              )
            )
          )
          expect(result).toEqual({ ...fixture.expected, raw: fixture.body })
        })
    )
  }

  for (const body of [
    { values: [], startAt: 99, maxResults: 100 },
    { values: [], startAt: 0, maxResults: 0 },
    { values: [], startAt: 0, maxResults: 1.5 },
    { values: [], startAt: 0, maxResults: 100, total: -1 },
    { values: [{ id: "1" }], startAt: 0, maxResults: 100 }
  ]) {
    it.effect(`rejects malformed offset page ${JSON.stringify(body)}`, () =>
      Effect.gen(function* () {
        const result = yield* Effect.gen(function* () {
          const client = yield* JiraClient
          return yield* Effect.result(
            client.componentsPage({ ...scope, projectIdOrKey: "APP" })
          )
        }).pipe(
          Effect.provide(
            clientLayer(
              JiraTransport.of({
                execute: () => Effect.succeed(response(200, body))
              })
            )
          )
        )
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "JiraError", reason: "invalid_response" }
        })
      })
    )
  }

  for (const method of ["searchIssuesPage", "sprintIssuesPage"] as const) {
    it.effect(`${method} rejects the supplied cursor returned unchanged`, () =>
      Effect.gen(function* () {
        const result = yield* Effect.gen(function* () {
          const client = yield* JiraClient
          return yield* Effect.result(
            client[method]({
              ...scope,
              jql: "",
              fields: [],
              boardId: 1,
              sprintId: 2,
              nextPageToken: "repeat"
            })
          )
        }).pipe(
          Effect.provide(
            clientLayer(
              JiraTransport.of({
                execute: () =>
                  Effect.succeed(
                    response(200, { issues: [], nextPageToken: "repeat" })
                  )
              })
            )
          )
        )
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "JiraError", reason: "invalid_response" }
        })
      })
    )
  }

  for (const seconds of [15, 86400, 86401, -1]) {
    it.effect(
      `normalizes credential rate limit ${seconds} without sending Jira request`,
      () =>
        Effect.gen(function* () {
          const result = yield* Effect.gen(function* () {
            const client = yield* JiraClient
            return yield* Effect.result(client.fields("user", "cloud"))
          }).pipe(
            Effect.provide(
              clientLayer(
                JiraTransport.of({
                  execute: () => Effect.die("must not request Jira")
                }),
                {
                  ...stubCredentials,
                  accessTokenFor: () =>
                    Effect.fail(
                      new PublicJiraRateLimited({ retryAfterSeconds: seconds })
                    )
                }
              )
            )
          )
          expect(result).toMatchObject({
            _tag: "Failure",
            failure:
              seconds === 15 || seconds === 86400
                ? {
                    _tag: "JiraRateLimited",
                    operation: "fields",
                    retryAfterMillis: seconds === 15 ? 15000 : 86400000
                  }
                : {
                    _tag: "JiraTransientFailure",
                    operation: "fields",
                    reason: "invalid_retry_after"
                  }
          })
        })
    )
  }

  it.effect("uses the current Effect clock for HTTP date rate limits", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(10000)
      const result = yield* Effect.gen(function* () {
        const client = yield* JiraClient
        return yield* Effect.result(client.fields("user", "cloud"))
      }).pipe(
        Effect.provide(
          clientLayer(
            JiraTransport.of({
              execute: () =>
                Effect.succeed(
                  response(
                    429,
                    {},
                    { "retry-after": "Thu, 01 Jan 1970 00:00:15 GMT" }
                  )
                )
            })
          )
        )
      )
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "JiraRateLimited", retryAfterMillis: 5000 }
      })
    })
  )

  for (const [status, header, expected] of [
    [
      429,
      "15",
      {
        _tag: "JiraRateLimited",
        operation: "attachmentContent",
        retryAfterMillis: 15000
      }
    ],
    [
      429,
      "-1",
      {
        _tag: "JiraTransientFailure",
        operation: "attachmentContent",
        reason: "invalid_retry_after"
      }
    ],
    [
      503,
      "",
      {
        _tag: "JiraTransientFailure",
        operation: "attachmentContent",
        reason: "server_error"
      }
    ]
  ] as const) {
    it.effect(
      `attachment failure ${status}/${header} remains typed without retry`,
      () =>
        Effect.gen(function* () {
          let requests = 0
          const transport = JiraTransport.of({
            execute: () =>
              Effect.sync(() => {
                requests += 1
                return response(status, {}, { "retry-after": header })
              })
          })
          const result = yield* Effect.gen(function* () {
            const client = yield* JiraClient
            return yield* Effect.result(
              client
                .attachmentContent("user", "cloud", "123")
                .pipe(Stream.runDrain)
            )
          }).pipe(Effect.provide(clientLayer(transport)))
          expect(result).toMatchObject({ _tag: "Failure", failure: expected })
          expect(requests).toBe(1)
        })
    )
  }

  it.effect(
    "drops bearer auth on attachment cross-origin redirects and retains byte range",
    () =>
      Effect.gen(function* () {
        const requests: Array<JiraTransportRequest> = []
        const transport = JiraTransport.of({
          execute: (request) =>
            Effect.sync(() => {
              requests.push(request)
              return requests.length === 1
                ? response(
                    302,
                    {},
                    { location: "https://cdn.example.test/file" }
                  )
                : {
                    ...response(206),
                    stream: Stream.make(new Uint8Array([1, 2]))
                  }
            })
        })
        const result = yield* Effect.gen(function* () {
          const client = yield* JiraClient
          return yield* client
            .attachmentContent("user", "cloud", "123", "bytes=1-2")
            .pipe(Stream.runCollect)
        }).pipe(Effect.provide(clientLayer(transport)))
        expect(result).toEqual([new Uint8Array([1, 2])])
        expect(requests.map(({ headers }) => headers.authorization)).toEqual([
          "Bearer token",
          undefined
        ])
        expect(requests.map(({ headers }) => headers.range)).toEqual([
          "bytes=1-2",
          "bytes=1-2"
        ])
      })
  )

  it.effect("encodes private failures for durable Activity history", () =>
    Effect.gen(function* () {
      const schema = Schema.fromJsonString(
        Schema.Union([JiraRateLimited, JiraTransientFailure])
      )
      for (const error of [
        new JiraRateLimited({ operation: "issues", retryAfterMillis: 15000 }),
        new JiraTransientFailure({ operation: "issues", reason: "network" })
      ]) {
        const encoded = yield* Schema.encodeEffect(schema)(error)
        const decoded = yield* Schema.decodeUnknownEffect(schema)(encoded)
        expect(decoded).toEqual(error)
      }
      expect(
        Schema.decodeUnknownOption(JiraRateLimited)({
          _tag: "JiraRateLimited",
          operation: "issues",
          retryAfterMillis: 86400001
        })._tag
      ).toBe("None")
    })
  )
})

it.effect("uses fresh credentials on authenticated attachment redirects", () =>
  Effect.gen(function* () {
    const requests: Array<JiraTransportRequest> = []
    let lookups = 0
    const credentials = JiraCredentials.of({
      ...stubCredentials,
      accessTokenFor: () =>
        Effect.sync(() => ({ token: Redacted.make(`token-${++lookups}`) }))
    })
    const transport = JiraTransport.of({
      execute: (request) =>
        Effect.sync(() => {
          requests.push(request)
          return requests.length === 1
            ? response(302, {}, { location: "/download/123" })
            : response(206)
        })
    })
    yield* Effect.gen(function* () {
      const client = yield* JiraClient
      yield* client
        .attachmentContent("user", "cloud", "123")
        .pipe(Stream.runDrain)
    }).pipe(Effect.provide(clientLayer(transport, credentials)))
    expect(requests.map(({ headers }) => headers.authorization)).toEqual([
      "Bearer token-1",
      "Bearer token-2"
    ])
  })
)

it.effect("rejects attachment responses without content", () =>
  Effect.gen(function* () {
    const result = yield* Effect.gen(function* () {
      const client = yield* JiraClient
      return yield* Effect.result(
        client.attachmentContent("user", "cloud", "123").pipe(Stream.runDrain)
      )
    }).pipe(
      Effect.provide(
        clientLayer(
          JiraTransport.of({ execute: () => Effect.succeed(response(204)) })
        )
      )
    )
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "JiraError", reason: "invalid_response" }
    })
  })
)

describe("Retry-After HTTP-date formats", () => {
  for (const [header, now, expected] of [
    ["Thursday, 01-Jan-70 00:00:15 GMT", 0, 15000],
    ["Thu Jan  1 00:00:15 1970", 0, 15000],
    ["Saturday, 01-Jan-50 00:00:00 GMT", 2524607990000, 10000],
    ["Friday, 01-Jan-70 00:00:15 GMT", 0, null],
    ["Thu Jan 32 00:00:15 1970", 0, null],
    ["Thursday, 32-Jan-70 00:00:15 GMT", 0, null],
    ["Thu, 32 Jan 1970 00:00:15 GMT", 0, null],
    ["Thu, 01 Jan 1970 24:00:00 GMT", 0, null],
    ["Thursday, 01-Jan-70 00:00:15 UTC", 0, null]
  ] as const) {
    it.effect(`validates HTTP-date ${header}`, () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(now)
        const result = yield* Effect.gen(function* () {
          const client = yield* JiraClient
          return yield* Effect.result(client.fields("user", "cloud"))
        }).pipe(
          Effect.provide(
            clientLayer(
              JiraTransport.of({
                execute: () =>
                  Effect.succeed(response(429, {}, { "retry-after": header }))
              })
            )
          )
        )
        expect(result).toMatchObject({
          _tag: "Failure",
          failure:
            expected === null
              ? { _tag: "JiraTransientFailure", reason: "invalid_retry_after" }
              : { _tag: "JiraRateLimited", retryAfterMillis: expected }
        })
      })
    )
  }
})

describe("Jira live JSON response transport", () => {
  for (const [kind, expected] of [
    [
      "body reset",
      { _tag: "JiraTransientFailure", operation: "fields", reason: "network" }
    ],
    ["malformed JSON", { _tag: "JiraError", reason: "invalid_response" }],
    ["invalid schema", { _tag: "JiraError", reason: "invalid_response" }]
  ] as const) {
    it.effect(`classifies ${kind} after successful response headers`, () =>
      Effect.gen(function* () {
        let requests = 0
        const fetch = Layer.succeed(
          FetchHttpClient.Fetch,
          Object.assign(
            async (
              _input: Parameters<typeof globalThis.fetch>[0],
              init?: Parameters<typeof globalThis.fetch>[1]
            ) => {
              requests += 1
              expect(new Headers(init?.headers).get("authorization")).toBe(
                "Bearer token"
              )
              const body =
                kind === "body reset"
                  ? new ReadableStream<Uint8Array>({
                      start(controller) {
                        controller.enqueue(new TextEncoder().encode("["))
                        controller.error(
                          new TypeError("socket reset during body read")
                        )
                      }
                    })
                  : kind === "malformed JSON"
                    ? "{"
                    : "{}"
              return new Response(body, {
                status: 200,
                headers: { "content-type": "application/json" }
              })
            },
            { preconnect: () => undefined }
          )
        )
        const live = JiraClientLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              JiraTransportLive.pipe(Layer.provide(FetchHttpClient.layer)),
              Layer.succeed(JiraCredentials, stubCredentials)
            )
          ),
          Layer.provideMerge(fetch)
        )
        const result = yield* Effect.gen(function* () {
          const client = yield* JiraClient
          return yield* Effect.result(client.fields("user", "cloud"))
        }).pipe(Effect.provide(live))
        expect(result).toMatchObject({ _tag: "Failure", failure: expected })
        expect(requests).toBe(1)
      })
    )
  }
})

describe("scan source provenance", () => {
  it("keeps original page and metadata JSON including unknown fields", async () => {
    const raw = {
      issues: [
        {
          id: "1",
          key: "APP-1",
          fields: { summary: "x" },
          hiddenExtension: "nested-marker"
        }
      ],
      nextPageToken: null,
      unknownEnvelope: "envelope-marker"
    }
    const projectRaw = {
      id: "1",
      key: "APP",
      name: "Application",
      hiddenExtension: "metadata-marker"
    }
    const layer = clientLayer(
      JiraTransport.of({
        execute: (request) =>
          Effect.succeed({
            status: 200,
            headers: {},
            json: Effect.succeed(request.method === "POST" ? raw : projectRaw),
            stream: Stream.empty
          })
      }),
      stubCredentials
    )
    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* JiraClient
        const page = yield* client.searchIssuesPage({
          userId: "u",
          cloudId: "c",
          jql: "project = APP",
          fields: ["*all"]
        })
        expect(page.raw).toEqual(raw)
        expect(page.values[0]).not.toHaveProperty("hiddenExtension")
        const snapshot = yield* client.snapshots.project("u", "c", "1")
        expect(snapshot.raw).toEqual(projectRaw)
        expect(snapshot.value).toEqual({
          id: "1",
          key: "APP",
          name: "Application"
        })
      }).pipe(Effect.provide(layer))
    )
  })
})
