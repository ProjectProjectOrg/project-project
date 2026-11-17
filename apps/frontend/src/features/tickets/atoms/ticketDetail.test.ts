import {
  TicketRank,
  EMPTY_TICKET_RELATIONS,
  Forbidden,
  NotFound,
  TicketDetail,
  TicketId,
  TicketStatus,
  TicketUpdateResult,
  UpdateTicketInput,
  TypeKey
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Schema from "effect/Schema"
import { describe, expect, it, vi } from "vitest"

import { Api } from "@/api/Api"
import { Keys, projectScope, type ReactivityKey } from "@/api/keys"
import { query } from "@/api/query"
import { stubFetch } from "@/api/testFetch"
import { localActive } from "@/features/local/atoms/localActive"
import { localProject } from "@/features/local/atoms/localProject"
import { localTicketDetail } from "@/features/local/atoms/localTicket"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"

import { createdKeys } from "./createdKeys"
import {
  lastKnownBeforeNotFound,
  ticketDetail,
  ticketRequest,
  updateTicketDetail
} from "./ticketDetail"

const encodeForbidden = Schema.encodeSync(Forbidden)
const encodeNotFound = Schema.encodeSync(NotFound)

const encodeTicketUpdateResultSync = Schema.encodeSync(TicketUpdateResult)

const decodeUnknownUpdateTicketInputSync =
  Schema.decodeUnknownSync(UpdateTicketInput)

const ticket = {
  id: Schema.decodeSync(TicketId)("T-1"),
  title: "Before",
  status: Schema.decodeSync(TicketStatus)("todo"),
  type: TypeKey.make("chore"),
  priority: "med",
  estimate: null,
  flag: null,
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  rank: TicketRank.make("a0"),
  lastTransitionedPr: null,
  parent: null,
  parentState: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  relations: EMPTY_TICKET_RELATIONS,
  creator: null,
  updater: null,
  body: "Before"
} satisfies TicketDetail

const encode = Schema.encodeSync(TicketDetail)
const encodeUpdate = (t: TicketDetail) =>
  encodeTicketUpdateResultSync({ ticket: t, orderKey: null })
const req = ticketRequest("acme", "web", ticket.id)

const fetchStub = stubFetch()

describe("ticket detail optimistic update", () => {
  it("paints instantly, holds until the refetch lands, then shows server truth", async () => {
    let served: TicketDetail = ticket
    let finish = (_r: Response) => {}
    fetchStub.set((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(Response.json(encode(served)))
    })
    const registry = AtomRegistry.make()
    const view = ticketDetail(req)
    const mutation = updateTicketDetail(req)
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, { priority: "high" })
      expect(registry.get(view)).toMatchObject({
        waiting: true,
        value: { priority: "high" }
      })

      // A stale GET resolving mid-transition must not be shown.
      served = ticket
      expect(registry.get(view)).toMatchObject({ value: { priority: "high" } })

      const confirmed = {
        ...ticket,
        priority: "high" as const,
        title: "Renamed by server"
      }
      served = confirmed
      finish(Response.json(encodeUpdate(confirmed)))

      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value.priority).toBe("high")
      expect(settled.value.title).toBe("Renamed by server")
    } finally {
      registry.dispose()
    }
  })

  it("rolls back when the mutation fails", async () => {
    let finish = (_r: Response) => {}
    fetchStub.set((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(Response.json(encode(ticket)))
    })
    const registry = AtomRegistry.make()
    const view = ticketDetail(req)
    const mutation = updateTicketDetail(req)
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(updateTicketDetail(req), { priority: "high" })
      expect(registry.get(view)).toMatchObject({ value: { priority: "high" } })

      finish(new Response("nope", { status: 500 }))

      await vi.waitFor(() =>
        expect(registry.get(updateTicketDetail(req)).waiting).toBe(false)
      )
      expect(registry.get(view)).toMatchObject({ value: { priority: "med" } })
    } finally {
      registry.dispose()
    }
  })

  it("does not carry a failed patch into a later edit", async () => {
    const payloads: Array<unknown> = []
    fetchStub.set(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const request =
          input instanceof Request ? input : new Request(input, init)
        payloads.push(await request.json())
        if (payloads.length === 1) return new Response("nope", { status: 500 })
        return Response.json(encodeUpdate({ ...ticket, title: "After" }))
      }
      return Response.json(encode(ticket))
    })
    const registry = AtomRegistry.make()
    const view = ticketDetail(req)
    const mutation = updateTicketDetail(req)
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { priority: "high" })
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      registry.set(mutation, { title: "After" })
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      expect(payloads).toEqual([{ priority: "high" }, { title: "After" }])
    } finally {
      registry.dispose()
    }
  })

  it("stacks two rapid edits", async () => {
    const payloads: Array<unknown> = []
    let finishFirst: ((response: Response) => void) | undefined
    let served: TicketDetail = ticket
    const confirmed = {
      ...ticket,
      priority: "high" as const,
      type: TypeKey.make("bug")
    }
    fetchStub.set(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const request =
          input instanceof Request ? input : new Request(input, init)
        const payload = decodeUnknownUpdateTicketInputSync(await request.json())
        payloads.push(payload)
        if (payload.type !== undefined) {
          served = confirmed
          return Response.json(encodeUpdate(confirmed))
        }
        return new Promise<Response>((resolve) => {
          finishFirst = resolve
        })
      }
      return Promise.resolve(Response.json(encode(served)))
    })
    const registry = AtomRegistry.make()
    const view = ticketDetail(req)
    const mutation = updateTicketDetail(req)
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { priority: "high" })
      registry.set(mutation, { type: TypeKey.make("bug") })
      expect(registry.get(view)).toMatchObject({
        value: { priority: "high", type: TypeKey.make("bug") }
      })
      await vi.waitFor(() => expect(payloads).toHaveLength(1))
      served = { ...ticket, priority: "high" }
      finishFirst?.(Response.json(encodeUpdate(served)))
      await vi.waitFor(() =>
        expect(payloads).toEqual([
          { priority: "high" },
          { type: TypeKey.make("bug") }
        ])
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      expect(registry.get(view)).toMatchObject({
        value: { priority: "high", type: TypeKey.make("bug") }
      })
    } finally {
      registry.dispose()
    }
  })
})

const scope = projectScope("acme", "web")

const probe = (name: string, key: string) =>
  query("tickets", "count", {
    params: { orgSlug: "acme", slug: "web" },
    query: { q: name },
    timeToLive: "2 minutes",
    reactivityKeys: [key]
  })

const probeNames = ["ticketsIn", "ticketLists", "titleQuery", "self"] as const

type ProbeName = (typeof probeNames)[number]

const probes: Readonly<Record<ProbeName, ReturnType<typeof probe>>> = {
  ticketsIn: probe("ticketsIn", Keys.ticketsIn(scope)),
  ticketLists: probe("ticketLists", Keys.ticketLists(scope)),
  titleQuery: probe("titleQuery", Keys.ticketTitleQuery(scope)),
  self: probe("self", Keys.ticket(scope, ticket.id))
}

describe("ticket detail invalidation keys", () => {
  const setup = async () => {
    const fetched = new Map<string, number>()
    fetchStub.set((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost"
      )
      if (init?.method === "PATCH") {
        return Promise.resolve(Response.json(encodeUpdate(ticket)))
      }
      if (url.pathname.endsWith("/count")) {
        const name = url.searchParams.get("q") ?? ""
        fetched.set(name, (fetched.get(name) ?? 0) + 1)
        return Promise.resolve(Response.json({ total: 0, byStatus: {} }))
      }
      return Promise.resolve(Response.json(encode(ticket)))
    })

    const registry = AtomRegistry.make()
    registry.mount(ticketDetail(req))
    registry.mount(updateTicketDetail(req))
    for (const atom of Object.values(probes)) registry.mount(atom)

    await vi.waitFor(() => {
      expect(registry.get(ticketDetail(req))).toMatchObject({
        _tag: "Success",
        waiting: false
      })
      for (const [name, atom] of Object.entries(probes)) {
        expect(
          AsyncResult.isSuccess(registry.get(atom)),
          `probe ${name} did not load`
        ).toBe(true)
      }
    })

    const publishedBy = async (
      patch: TicketEdit,
      expected: ReadonlyArray<ProbeName>
    ) => {
      fetched.clear()
      registry.set(updateTicketDetail(req), patch)
      await vi.waitFor(() => {
        expect(registry.get(updateTicketDetail(req)).waiting).toBe(false)
        for (const name of expected) {
          expect(
            fetched.get(name) ?? 0,
            `${name} should refetch`
          ).toBeGreaterThan(0)
        }
      })
      return new Set(probeNames.filter((name) => (fetched.get(name) ?? 0) > 0))
    }

    return { registry, publishedBy }
  }

  it("publishes ticketsIn, the title query and the ticket's own key for a title edit", async () => {
    const { registry, publishedBy } = await setup()
    try {
      const published = await publishedBy({ title: "After" }, [
        "ticketsIn",
        "titleQuery"
      ])
      expect(published).toEqual(
        new Set<ProbeName>(["ticketsIn", "titleQuery", "self"])
      )
    } finally {
      registry.dispose()
    }
  })

  it("publishes the ticket list and the ticket's own key for a body-only edit", async () => {
    const { registry, publishedBy } = await setup()
    try {
      const published = await publishedBy({ body: "After" }, ["ticketsIn"])
      expect(published).toEqual(new Set<ProbeName>(["ticketsIn", "self"]))
    } finally {
      registry.dispose()
    }
  })

  it("publishes the list keys and the ticket's own key for a non-content edit", async () => {
    const { registry, publishedBy } = await setup()
    try {
      const published = await publishedBy({ priority: "high" }, [
        "ticketsIn",
        "ticketLists"
      ])
      expect(published).toEqual(
        new Set<ProbeName>(["ticketsIn", "ticketLists", "self"])
      )
    } finally {
      registry.dispose()
    }
  })
})

describe("an open ticket that disappears", () => {
  it("keeps the last loaded version once a refetch says it no longer exists, and only then", async () => {
    let respond = () => Response.json(encode(ticket))
    fetchStub.set(() => Promise.resolve(respond()))
    const registry = AtomRegistry.make()
    const view = ticketDetail(req)
    registry.mount(view)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )
      expect(lastKnownBeforeNotFound(registry.get(view))).toBeNull()

      respond = () =>
        Response.json(encodeForbidden(new Forbidden()), {
          status: 403
        })
      registry.refresh(view)
      await vi.waitFor(() =>
        expect(AsyncResult.isFailure(registry.get(view))).toBe(true)
      )
      expect(lastKnownBeforeNotFound(registry.get(view))).toBeNull()

      respond = () =>
        Response.json(encodeNotFound(new NotFound()), {
          status: 404
        })
      registry.refresh(view)
      await vi.waitFor(() =>
        expect(lastKnownBeforeNotFound(registry.get(view))).toEqual(ticket)
      )
    } finally {
      registry.dispose()
    }
  })
})

const otherTicket = Schema.decodeSync(TicketId)("T-2")

const invalidate = Api.runtime.fn((keys: ReadonlyArray<ReactivityKey>) =>
  Reactivity.invalidate(keys)
)

describe("an open ticket and changes elsewhere in its project", () => {
  it("refetches when the ticket itself changes, and not when another ticket does", async () => {
    const gets = vi.fn<() => Promise<Response>>(() =>
      Promise.resolve(Response.json(encode(ticket)))
    )
    fetchStub.set(gets)
    const registry = AtomRegistry.make()
    registry.mount(ticketDetail(req))
    registry.mount(invalidate)
    try {
      await vi.waitFor(() => expect(gets).toHaveBeenCalledTimes(1))

      registry.set(invalidate, Keys.ticketChanged(scope, otherTicket))
      registry.set(invalidate, Keys.ticketChanged(scope, ticket.id))
      await vi.waitFor(() => expect(gets).toHaveBeenCalledTimes(2))
      expect(gets).toHaveBeenCalledTimes(2)
    } finally {
      registry.dispose()
    }
  })
})

describe("a ticket the project's ready copy doesn't hold", () => {
  const withCopy = (created: ReadonlyMap<TicketId, string>) =>
    AtomRegistry.make({
      initialValues: [
        [localActive(projectScope("acme", "web")), true],
        [
          localProject({ orgSlug: "acme", slug: "web" }),
          AsyncResult.success({ kind: "ready", sync: "live" })
        ],
        [localTicketDetail(req), AsyncResult.success(null)],
        [createdKeys(projectScope("acme", "web")), created]
      ]
    })

  it("is NotFound without asking the server", () => {
    fetchStub.set(() => Promise.reject(new Error("asked the server")))
    const registry = withCopy(new Map())
    try {
      const error = AsyncResult.error(registry.get(ticketDetail(req)))
      expect(Option.getOrUndefined(error)).toBeInstanceOf(NotFound)
    } finally {
      registry.dispose()
    }
  })

  it("waits for the copy when this session just created it", () => {
    fetchStub.set(() => Promise.reject(new Error("asked the server")))
    const registry = withCopy(new Map([[ticket.id, "client-key"]]))
    try {
      expect(AsyncResult.isInitial(registry.get(ticketDetail(req)))).toBe(true)
    } finally {
      registry.dispose()
    }
  })
})
