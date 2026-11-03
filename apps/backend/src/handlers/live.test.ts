import { it } from "@effect/vitest"
import { Project } from "@pp/access/roles"
import * as Access from "@pp/server-core/access/Access"
import * as BetterAuth from "@pp/server-core/auth/BetterAuth"
import * as LiveChanges from "@pp/server-core/live/LiveChanges"
import * as LiveFeed from "@pp/server-core/live/LiveFeed"
import { AppApi, NotFound, TicketId } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpRouter,
  HttpServer
} from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiClient } from "effect/http-api"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import { expect, vi } from "vitest"

vi.mock("../auth", () => ({
  auth: {},
  mcpResource: "http://localhost:3000/mcp",
  toolsResource: "http://localhost:3000/api/v1/tools"
}))

import { AuthenticationLive } from "../Layers/Auth"
import { ApiRouterLive } from "../main"
import { LiveHandlerLive } from "./live"

const viewer = {
  id: "user-1",
  email: "viewer@example.com",
  name: "Viewer",
  image: null,
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
}

const readable = (orgSlug: string, slug: string) =>
  Effect.succeed({
    userId: viewer.id,
    organizationId: "org-1",
    orgSlug,
    orgRole: "member" as const,
    projectId: `${orgSlug}/${slug}`,
    slug,
    role: "developer" as const,
    permissions: Project.developer
  })

const readableSlugs = new Set<string>()

const AccessStub = Layer.mock(Access.Access, {
  project: (orgSlug, slug) =>
    readableSlugs.has(slug)
      ? readable(orgSlug, slug)
      : Effect.fail(new NotFound())
})

const SessionStub = Layer.mock(BetterAuth.BetterAuth, {
  getSession: () => Effect.succeed({ user: viewer, session: {} })
})

const liveApi = (changes: LiveChanges.LiveChanges["Service"]) =>
  HttpApiBuilder.layer(HttpApi.make(AppApi.identifier).add(AppApi.groups.live))
    .pipe(
      Layer.provide(LiveHandlerLive),
      Layer.provide(LiveFeed.layer),
      Layer.provide(AccessStub),
      Layer.provide(Layer.succeed(LiveChanges.LiveChanges, changes)),
      Layer.provide(AuthenticationLive),
      Layer.provide(SessionStub),
      Layer.provide(ApiRouterLive)
    )
    .pipe(Layer.provideMerge(HttpServer.layerServices))

const ticketIn = (slug: string, id = "T-1"): LiveChanges.LiveChangeInput => ({
  kind: "ticket",
  orgSlug: "acme",
  slug,
  id: TicketId.make(id)
})

const openLiveClient = (
  changes: LiveChanges.LiveChanges["Service"],
  after?: string
) =>
  Effect.gen(function* () {
    const { handler, dispose } = HttpRouter.toWebHandler(liveApi(changes))
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
  "streams changes from projects the viewer can read, stamped with the writer's origin",
  () =>
    Effect.gen(function* () {
      readableSlugs.clear()
      readableSlugs.add("web")
      const changes = yield* LiveChanges.LiveChanges
      const events = yield* openLiveClient(changes)
      const received = yield* events.pipe(
        Stream.filter((event) => event.kind !== "heartbeat"),
        Stream.take(1),
        Stream.runCollect,
        Effect.forkScoped
      )
      yield* Effect.forever(
        changes
          .publish(ticketIn("hidden"))
          .pipe(
            Effect.andThen(changes.publish(ticketIn("web"))),
            Effect.andThen(Effect.sleep("20 millis"))
          )
      ).pipe(
        Effect.provideService(LiveChanges.ChangeOrigin, "tab-1"),
        Effect.forkScoped
      )

      expect(yield* Fiber.join(received)).toMatchObject([
        { ...ticketIn("web"), origin: "tab-1" }
      ])
    }).pipe(Effect.provide(LiveChanges.layer)),
  { timeout: 10_000 }
)

it.live(
  "stops streaming a project's changes once the viewer loses access to it",
  () =>
    Effect.gen(function* () {
      readableSlugs.clear()
      readableSlugs.add("web")
      const changes = yield* LiveChanges.LiveChanges
      const events = yield* openLiveClient(changes)
      const warmedUp = yield* Deferred.make<void>()
      const received = yield* events.pipe(
        Stream.filter((event) => event.kind !== "heartbeat"),
        Stream.tap(() => Deferred.succeed(warmedUp, undefined)),
        Stream.takeUntil(
          (event) => event.kind === "ticket" && event.id !== "T-1"
        ),
        Stream.runCollect,
        Effect.forkScoped
      )
      const warmUp = yield* Effect.forever(
        changes
          .publish(ticketIn("web"))
          .pipe(Effect.andThen(Effect.sleep("20 millis")))
      ).pipe(Effect.forkScoped)
      yield* Deferred.await(warmedUp)
      yield* Fiber.interrupt(warmUp)

      readableSlugs.clear()
      readableSlugs.add("docs")
      yield* Effect.forever(
        changes
          .publish(ticketIn("web", "T-2"))
          .pipe(
            Effect.andThen(changes.publish(ticketIn("docs", "T-3"))),
            Effect.andThen(Effect.sleep("20 millis"))
          )
      ).pipe(Effect.forkScoped)

      const delivered = yield* Fiber.join(received)
      expect(delivered.at(-1)).toMatchObject({
        ...ticketIn("docs", "T-3"),
        origin: null
      })
      expect(
        delivered.filter(
          (event) => event.kind === "ticket" && event.id === "T-2"
        )
      ).toEqual([])
    }).pipe(Effect.provide(LiveChanges.layer)),
  { timeout: 10_000 }
)

it.live(
  "replays a readable change missed while disconnected when the client reconnects with its last cursor",
  () =>
    Effect.gen(function* () {
      readableSlugs.clear()
      readableSlugs.add("web")
      const changes = yield* LiveChanges.LiveChanges
      const hello = yield* Effect.scoped(
        Effect.flatMap(openLiveClient(changes), (events) =>
          events.pipe(Stream.runHead)
        )
      )
      const cursor = Option.getOrThrow(hello).cursor

      yield* changes.publish(ticketIn("hidden", "T-7"))
      yield* changes.publish(ticketIn("web", "T-8"))

      const replayed = yield* Effect.scoped(
        Effect.flatMap(openLiveClient(changes, cursor), (events) =>
          events.pipe(Stream.take(2), Stream.runCollect)
        )
      )
      expect([...replayed].map((event) => event.kind)).toEqual([
        "heartbeat",
        "ticket"
      ])
      expect([...replayed][1]).toMatchObject(ticketIn("web", "T-8"))
    }).pipe(Effect.provide(LiveChanges.layer)),
  { timeout: 10_000 }
)
