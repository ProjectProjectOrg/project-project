import {
  TicketDetail,
  TicketId,
  TicketUpdateResult,
  UpdateTicketInput,
  TypeKey
} from "@pp/shared"
import { makeTicketDetail } from "@pp/shared/tickets/testing"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { describe, expect, it, vi } from "vitest"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { stubFetch } from "@/api/testFetch"
import { fireMutation } from "@/api/viewMutation"
import { invalidateProjectKeys } from "@/features/projects/atoms/projectChanges"
import { changeKeys } from "@/features/projects/lib/projectChanges"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"

import { ticketDetail, ticketRequest, updateTicketDetail } from "./ticketDetail"

const encodeTicketUpdateResultSync = Schema.encodeSync(TicketUpdateResult)

const decodeUnknownUpdateTicketInputSync =
  Schema.decodeUnknownSync(UpdateTicketInput)

const ticket = makeTicketDetail()

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
    reactivityKeys: [key]
  })

const probeNames = [
  "projectResync",
  "ticketLists",
  "ticketPages",
  "titleQuery",
  "updatedQuery",
  "self"
] as const

type ProbeName = (typeof probeNames)[number]

const probes: Readonly<Record<ProbeName, ReturnType<typeof probe>>> = {
  projectResync: probe("projectResync", Keys.projectResync(scope)),
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

  it("refreshes the edited ticket and lists without publishing the project-wide key", async () => {
    const { registry, publishedBy } = await setup()
    try {
      const expected = probeNames.filter((name) => name !== "projectResync")
      expect(await publishedBy({ title: "After" }, expected)).toEqual(
        new Set(expected)
      )
    } finally {
      registry.dispose()
    }
  })
})

it("refreshes only named retained ticket details and the list after viewing thirty tickets", async () => {
  const registry = AtomRegistry.make()
  const ids = Array.from({ length: 30 }, (_, i) => TicketId.make(`T-${i + 1}`))
  const requests: Array<string> = []
  fetchStub.set((input) => {
    const path = new URL(input instanceof Request ? input.url : String(input))
      .pathname
    const name = path.split("/").at(-1)
    if (!name) throw new Error("Missing ticket path")
    requests.push(name)
    return Promise.resolve(
      Response.json(
        name === "count"
          ? { total: 0, byStatus: {} }
          : encode(makeTicketDetail({ id: TicketId.make(name) }))
      )
    )
  })
  try {
    const views = ids.map((id) =>
      ticketDetail(ticketRequest("acme", "web", id))
    )
    const releases = views.map((view) => registry.mount(view))
    registry.mount(probes.ticketLists)
    await vi.waitFor(() =>
      expect(
        views.every((view) => AsyncResult.isSuccess(registry.get(view))) &&
          AsyncResult.isSuccess(registry.get(probes.ticketLists))
      ).toBe(true)
    )
    releases.forEach((release) => release())
    requests.length = 0
    await fireMutation(registry, invalidateProjectKeys, [
      Keys.projectResync(scope),
      Keys.ticketLists(scope)
    ])
    await vi.waitFor(() => expect(requests).toHaveLength(31))
    requests.length = 0
    const affected = ids.slice(0, 2)
    const keys = affected.flatMap((id) =>
      changeKeys(req.params, { kind: "tickets", id })
    )
    await fireMutation(registry, invalidateProjectKeys, [...new Set(keys)])
    await vi.waitFor(() =>
      expect(requests.toSorted()).toEqual(["T-1", "T-2", "count"])
    )
  } finally {
    registry.dispose()
  }
})
