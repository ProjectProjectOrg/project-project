import { it } from "@effect/vitest"
import * as BetterAuth from "@pp/server-core/auth/BetterAuth"
import * as LiveFeed from "@pp/server-core/live/LiveFeed"
import { AppApi, type LiveEvent, TicketId } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpRouter,
  HttpServer
} from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiClient } from "effect/http-api"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { expect, vi } from "vitest"

vi.mock("../auth", () => ({
  auth: {},
  mcpResource: "http://localhost:3000/mcp",
  toolsResource: "http://localhost:3000/api/v1/tools"
}))

import { AuthenticationLive } from "../auth/Authentication"
import { LiveHandlerLive } from "./Handlers"

const viewer = {
  id: "user-1",
  email: "viewer@example.com",
  name: "Viewer",
  image: null,
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
}

const SessionStub = Layer.mock(BetterAuth.BetterAuth, {
  getSession: () => Effect.succeed({ user: viewer, session: {} })
})

const ApiRouterLive = Layer.effect(
  HttpRouter.HttpRouter,
  Effect.map(HttpRouter.HttpRouter, (router) => router.prefixed("/api"))
)

const liveApi = (feed: LiveFeed.LiveFeed["Service"]) =>
  HttpApiBuilder.layer(HttpApi.make(AppApi.identifier).add(AppApi.groups.live))
    .pipe(
      Layer.provide(LiveHandlerLive),
      Layer.provide(Layer.succeed(LiveFeed.LiveFeed, feed)),
      Layer.provide(AuthenticationLive),
      Layer.provide(SessionStub),
      Layer.provide(ApiRouterLive)
    )
    .pipe(Layer.provideMerge(HttpServer.layerServices))

const openLiveClient = (feed: LiveFeed.LiveFeed["Service"], after?: string) =>
  Effect.gen(function* () {
    const { handler, dispose } = HttpRouter.toWebHandler(liveApi(feed))
    yield* Effect.addFinalizer(() => Effect.promise(dispose))
    const client = yield* HttpApiClient.make(AppApi, {
      baseUrl: "http://localhost/api",
      transformClient: HttpClient.mapRequest(
        HttpClientRequest.setHeader("cookie", "better-auth.session_token=s")
      )
    }).pipe(
      Effect.provide(
        FetchHttpClient.layer.pipe(
          Layer.provide(
            Layer.succeed(
              FetchHttpClient.Fetch,
              Object.assign(
                (
                  input: Parameters<typeof fetch>[0],
                  init?: Parameters<typeof fetch>[1]
                ) =>
                  handler(
                    input instanceof Request
                      ? input
                      : new Request(String(input), init)
                  ),
                { preconnect: fetch.preconnect }
              )
            )
          )
        )
      )
    )
    return yield* client.live.events({
      query: after === undefined ? {} : { after }
    })
  })

it.live(
  "streams the viewer's feed as server-sent events from the requested cursor",
  () =>
    Effect.gen(function* () {
      const requested: Array<string | undefined> = []
      const events: ReadonlyArray<LiveEvent> = [
        { kind: "heartbeat", cursor: "p1.1.4" },
        {
          kind: "ticket",
          orgSlug: "acme",
          slug: "web",
          id: TicketId.make("T-1"),
          origin: "tab-1",
          cursor: "p1.1.5"
        }
      ]
      const stream = yield* openLiveClient(
        {
          forCurrentUser: (after) =>
            Effect.sync(() => {
              requested.push(after)
              return Stream.fromIterable(events)
            })
        },
        "p1.1.4"
      )
      expect(yield* stream.pipe(Stream.take(2), Stream.runCollect)).toEqual(
        events
      )
      expect(requested).toEqual(["p1.1.4"])
    })
)
