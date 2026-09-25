import { it } from "@effect/vitest"
import { Project } from "@pp/access/roles"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import { HttpClientRequest, HttpServer } from "effect/unstable/http"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiTest
} from "effect/unstable/httpapi"
import { expect } from "vitest"

import { ProjectAccess } from "./access/ProjectAccess"
import { ProjectScope } from "./access/ProjectScope"
import { AppApi } from "./api"
import { Authentication, CurrentUser } from "./Authentication"
import {
  DEFAULT_TICKET_SORT,
  SortDir,
  SortKey,
  TicketListQuery,
  TicketOrderKeyQuery
} from "./filters/Ticket"
import { TicketDetail } from "./schemas/Ticket"
import { User } from "./schemas/User"

const endpoints = AppApi.groups.tickets.endpoints
const api = HttpApi.make("TicketQueryTest").add(
  HttpApiGroup.make("tickets").add(
    endpoints.list,
    endpoints.sections,
    endpoints.update
  )
)
const ticket = Schema.decodeSync(TicketDetail)({
  id: "T-1",
  title: "Test",
  status: "todo",
  type: "chore",
  priority: "med",
  tags: [],
  assignees: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  archivedAt: null,
  createdBy: "user-1",
  creator: null,
  updater: null,
  body: "",
  createdAt: "2026-09-15T10:00:00.000Z",
  updatedAt: "2026-09-15T10:11:12.345Z"
})
const user = Schema.decodeSync(User)({
  id: "user-1",
  email: "test@example.com",
  name: "Test",
  username: null,
  image: null,
  createdAt: "2026-09-15T10:00:00.000Z",
  activeOrgSlug: "acme",
  personalGithub: { connected: false },
  editorPreference: "github",
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
})
const auth = Layer.succeed(Authentication, {
  sessionCookie: (effect) => Effect.provideService(effect, CurrentUser, user)
})
const projectAccess = Layer.succeed(ProjectAccess, (effect) =>
  Effect.provideService(effect, ProjectScope, {
    userId: user.id,
    organizationId: "org-1",
    orgSlug: "acme",
    orgRole: "member",
    projectId: "project-1",
    slug: "web",
    role: "pm",
    permissions: Project.pm
  })
)
const params = { orgSlug: "acme", slug: "web" }
const page = { items: [], nextCursor: null }
const makeHarness = Effect.gen(function* () {
  const received = yield* Ref.make<TicketListQuery>({
    sort: DEFAULT_TICKET_SORT
  })
  const receivedUpdate = yield* Ref.make<TicketOrderKeyQuery>({})
  const handlers = HttpApiBuilder.group(api, "tickets", (handlers) =>
    handlers
      .handle("list", ({ query }) =>
        Ref.set(received, query).pipe(Effect.as(page))
      )
      .handle("sections", ({ query }) =>
        Ref.set(received, query).pipe(
          Effect.as({
            counts: { total: 0, byStatus: {} },
            sections: {}
          })
        )
      )
      .handle("update", ({ query }) =>
        Ref.set(receivedUpdate, query).pipe(
          Effect.as({ ticket, orderKey: null })
        )
      )
  ).pipe(Layer.provideMerge(auth), Layer.provideMerge(projectAccess))
  const client = yield* HttpApiTest.groups(api, ["tickets"]).pipe(
    Effect.provide(Layer.merge(handlers, HttpServer.layerServices))
  )
  return { client, received, receivedUpdate }
})

it.effect(
  "preserves every sort and direction through the production HTTP endpoints",
  () =>
    Effect.gen(function* () {
      const { client, received, receivedUpdate } = yield* makeHarness
      for (const key of SortKey.literals) {
        for (const dir of SortDir.literals) {
          const sort = { key, dir }
          yield* client.tickets.list({ params, query: { sort } })
          expect((yield* Ref.get(received)).sort).toEqual(sort)
          yield* client.tickets.sections({ params, query: { sort } })
          expect((yield* Ref.get(received)).sort).toEqual(sort)
          yield* client.tickets.update({
            params: { ...params, id: ticket.id },
            query: { sort },
            payload: {}
          })
          expect((yield* Ref.get(receivedUpdate)).sort).toEqual(sort)
        }
      }
    }).pipe(Effect.scoped)
)

it.effect("preserves filters and keeps an omitted update sort absent", () =>
  Effect.gen(function* () {
    const { client, received, receivedUpdate } = yield* makeHarness
    const query = yield* Schema.decodeEffect(TicketListQuery)({
      sort: { key: "updated", dir: "desc" },
      status: ["todo", "in_progress"],
      type: ["bug"],
      hasBranch: false,
      archived: true,
      q: "same day",
      cursor: "next-page",
      updatedAfter: "2026-09-15T10:11:12.345Z"
    })
    yield* client.tickets.list({ params, query })
    expect(yield* Ref.get(received)).toEqual(query)
    yield* client.tickets.update({
      params: { ...params, id: ticket.id },
      query: {},
      payload: {}
    })
    expect(yield* Ref.get(receivedUpdate)).toEqual({})
    yield* client.tickets.sections({
      params,
      query: { sort: DEFAULT_TICKET_SORT }
    })
    expect((yield* Ref.get(received)).sort).toEqual(DEFAULT_TICKET_SORT)
  }).pipe(Effect.scoped)
)

it.effect(
  "defaults omitted list sorts and rejects malformed sorts at the HTTP boundary",
  () =>
    Effect.gen(function* () {
      for (const sort of [
        undefined,
        "bad",
        '{"key":"unknown","dir":"asc"}',
        '{"key":"id","dir":"sideways"}'
      ]) {
        const middleware = HttpApiMiddleware.layerClient(
          Authentication,
          ({ next, request }) =>
            next(
              sort === undefined
                ? HttpClientRequest.make(request.method)(request.url, {
                    headers: request.headers,
                    body: request.body
                  })
                : HttpClientRequest.setUrlParam(request, "sort", sort)
            )
        )
        const { client, received, receivedUpdate } = yield* makeHarness.pipe(
          Effect.provide(middleware)
        )
        const query = { sort: DEFAULT_TICKET_SORT }
        const requests = [
          client.tickets.list({ params, query, responseMode: "response-only" }),
          client.tickets.sections({
            params,
            query,
            responseMode: "response-only"
          }),
          client.tickets.update({
            params: { ...params, id: ticket.id },
            query,
            payload: {},
            responseMode: "response-only"
          })
        ]
        for (const request of requests) {
          const result = yield* Effect.exit(request)
          if (sort === undefined) {
            expect(result).toMatchObject({
              _tag: "Success",
              value: { status: 200 }
            })
          } else {
            expect(Exit.isFailure(result)).toBe(true)
            if (Exit.isFailure(result))
              expect(Cause.squash(result.cause)).toMatchObject({
                _tag: "HttpApiSchemaError"
              })
          }
        }
        if (sort === undefined) {
          expect(yield* Ref.get(received)).toEqual(query)
          expect(yield* Ref.get(receivedUpdate)).toEqual({})
        }
      }
    }).pipe(Effect.scoped)
)
