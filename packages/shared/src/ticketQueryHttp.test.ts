import { expect, it } from "vite-plus/test"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import { HttpServer } from "effect/unstable/http"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiGroup,
  HttpApiTest
} from "effect/unstable/httpapi"
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
const params = { orgSlug: "acme", slug: "web" }
const page = { items: [], nextCursor: null }
const makeHarness = Effect.gen(function* () {
  const received = yield* Ref.make<TicketOrderKeyQuery>({})
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
        Ref.set(received, query).pipe(Effect.as({ ticket, orderKey: null }))
      )
  ).pipe(Layer.provideMerge(auth))
  const client = yield* HttpApiTest.groups(api, ["tickets"]).pipe(
    Effect.provide(Layer.merge(handlers, HttpServer.layerServices))
  )
  return { client, received }
})

it("preserves every sort and direction through the production HTTP endpoints", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const { client, received } = yield* makeHarness
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
          expect((yield* Ref.get(received)).sort).toEqual(sort)
        }
      }
    }).pipe(Effect.scoped)
  )
})

it("preserves filters and keeps an omitted update sort absent", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const { client, received } = yield* makeHarness
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
      expect(yield* Ref.get(received)).toEqual({})
      yield* client.tickets.sections({
        params,
        query: { sort: DEFAULT_TICKET_SORT }
      })
      expect((yield* Ref.get(received)).sort).toEqual(DEFAULT_TICKET_SORT)
    }).pipe(Effect.scoped)
  )
})
