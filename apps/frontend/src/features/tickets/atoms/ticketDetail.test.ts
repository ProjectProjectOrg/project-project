import {
  TicketDetail,
  TicketId,
  TicketStatus,
  TicketUpdateResult,
  UpdateTicketInput
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { stubFetch } from "@/api/testFetch"

import { ticketDetail, ticketRequest, updateTicketDetail } from "./ticketDetail"

const ticket = {
  id: Schema.decodeSync(TicketId)("T-1"),
  title: "Before",
  status: Schema.decodeSync(TicketStatus)("todo"),
  type: "chore",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  creator: null,
  updater: null,
  body: "Before"
} satisfies TicketDetail

const encode = Schema.encodeSync(TicketDetail)
const encodeUpdate = (t: TicketDetail) =>
  Schema.encodeSync(TicketUpdateResult)({ ticket: t, orderKey: null })
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
    let served: TicketDetail = ticket
    const confirmed = {
      ...ticket,
      priority: "high" as const,
      type: "bug" as const
    }
    fetchStub.set(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const request =
          input instanceof Request ? input : new Request(input, init)
        const payload = Schema.decodeUnknownSync(UpdateTicketInput)(
          await request.json()
        )
        payloads.push(payload)
        if (payload.type !== undefined) {
          served = confirmed
          return Response.json(encodeUpdate(confirmed))
        }
        return new Promise<Response>(() => {})
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
      registry.set(mutation, { type: "bug" })
      expect(registry.get(view)).toMatchObject({
        value: { priority: "high", type: "bug" }
      })
      await vi.waitFor(() =>
        expect(payloads).toContainEqual({ priority: "high", type: "bug" })
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      expect(registry.get(view)).toMatchObject({
        value: { priority: "high", type: "bug" }
      })
    } finally {
      registry.dispose()
    }
  })
})

const scope = projectScope("acme", "web")

const probe = (name: string, key: string) =>
  Api.query("tickets", "count", {
    params: { orgSlug: "acme", slug: "web" },
    query: { q: name },
    timeToLive: "2 minutes",
    reactivityKeys: [key]
  })

const probeNames = [
  "ticketsIn",
  "ticketLists",
  "ticketPages",
  "titleQuery",
  "updatedQuery",
  "self"
] as const

type ProbeName = (typeof probeNames)[number]

const probes: Readonly<Record<ProbeName, ReturnType<typeof probe>>> = {
  ticketsIn: probe("ticketsIn", Keys.ticketsIn(scope)),
  ticketLists: probe("ticketLists", Keys.ticketLists(scope)),
  ticketPages: probe("ticketPages", Keys.ticketPages(scope)),
  titleQuery: probe("titleQuery", Keys.ticketTitleQuery(scope)),
  updatedQuery: probe("updatedQuery", Keys.ticketUpdatedQuery(scope)),
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
      patch: UpdateTicketInput,
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

  it("publishes ticketsIn and the title query for a title edit, but never the ticket's own key", async () => {
    const { registry, publishedBy } = await setup()
    try {
      const published = await publishedBy({ title: "After" }, [
        "ticketsIn",
        "titleQuery",
        "updatedQuery"
      ])
      expect(published).toEqual(
        new Set<ProbeName>(["ticketsIn", "titleQuery", "updatedQuery"])
      )
      expect(published.has("self")).toBe(false)
    } finally {
      registry.dispose()
    }
  })

  it("publishes the ticket list and updated query for a body-only edit", async () => {
    const { registry, publishedBy } = await setup()
    try {
      const published = await publishedBy({ body: "After" }, [
        "ticketsIn",
        "updatedQuery"
      ])
      expect(published).toEqual(
        new Set<ProbeName>(["ticketsIn", "updatedQuery"])
      )
      expect(published.has("titleQuery")).toBe(false)
      expect(published.has("self")).toBe(false)
    } finally {
      registry.dispose()
    }
  })

  it("publishes the list keys for a non-content edit, but never the ticket's own key", async () => {
    const { registry, publishedBy } = await setup()
    try {
      const published = await publishedBy({ priority: "high" }, [
        "ticketsIn",
        "ticketLists",
        "ticketPages"
      ])
      expect(published).toEqual(
        new Set<ProbeName>(["ticketsIn", "ticketLists", "ticketPages"])
      )
      expect(published.has("self")).toBe(false)
    } finally {
      registry.dispose()
    }
  })
})
