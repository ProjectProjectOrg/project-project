import { describe, expect, it } from "vite-plus/test"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import { JiraCredentials } from "./Credentials"
import {
  JiraClient,
  JiraClientLive,
  JiraTransport,
  paginateCursor,
  paginateOffset,
  type JiraClientShape,
  type JiraTransportRequest,
  type JiraTransportResponse
} from "./Client"

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
      }).pipe(
        Effect.provide(JiraClientLive),
        Effect.provide(Layer.succeed(JiraTransport, transport)),
        Effect.provide(Layer.succeed(JiraCredentials, credentials))
      )
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
      }).pipe(
        Effect.provide(JiraClientLive),
        Effect.provide(Layer.succeed(JiraTransport, transport)),
        Effect.provide(Layer.succeed(JiraCredentials, credentials))
      )
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
      }).pipe(
        Effect.provide(JiraClientLive),
        Effect.provide(Layer.succeed(JiraTransport, transport)),
        Effect.provide(Layer.succeed(JiraCredentials, credentials))
      )
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
        const sprintIssues = client.sprintIssues as unknown as (
          userId: string,
          cloudId: string,
          boardId: number,
          sprintId: number,
          fields: ReadonlyArray<string>
        ) => ReturnType<JiraClientShape["sprintIssues"]>
        return yield* Effect.exit(
          Effect.suspend(() => sprintIssues("user", "cloud", 84, 37, ["id"]))
        )
      }).pipe(
        Effect.provide(JiraClientLive),
        Effect.provide(Layer.succeed(JiraTransport, transport)),
        Effect.provide(Layer.succeed(JiraCredentials, credentials))
      )
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
      }).pipe(
        Effect.provide(JiraClientLive),
        Effect.provide(Layer.succeed(JiraTransport, transport)),
        Effect.provide(Layer.succeed(JiraCredentials, credentials))
      )
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
      }).pipe(
        Effect.provide(JiraClientLive),
        Effect.provide(Layer.succeed(JiraTransport, transport)),
        Effect.provide(Layer.succeed(JiraCredentials, credentials))
      )
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
