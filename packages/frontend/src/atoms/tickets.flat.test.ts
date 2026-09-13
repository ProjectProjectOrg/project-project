import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import * as Option from "effect/Option"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  TicketId,
  TicketStatus,
  TicketDetail,
  GroupId
} from "@projectproject/shared"
import {
  flatTicketsAtom,
  flatTicketsBaseAtom,
  ticketsListKey,
  loadMoreFlatTicketsAtom,
  flatTicketMutationKey,
  updateFlatTicketAtom,
  quickCreateFlatTicketAtom
} from "./tickets"

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
  body: "Before"
} satisfies TicketDetail

const query = {
  sort: { key: "id", dir: "asc" },
  filter: { groupId: [Schema.decodeSync(GroupId)("G-1")] }
} as const
const key = ticketsListKey("org", "project", query)
const encodeTicket = Schema.encodeSync(TicketDetail)
const second = {
  ...ticket,
  id: Schema.decodeSync(TicketId)("T-2"),
  status: Schema.decodeSync(TicketStatus)("done")
}
const page = (
  items: ReadonlyArray<TicketDetail>,
  nextCursor: string | null = null
) =>
  Response.json({ items: items.map((item) => encodeTicket(item)), nextCursor })
const counts = (total: number) =>
  Response.json({ total, byStatus: { todo: total } })
const urlOf = (input: RequestInfo | URL) =>
  new URL(input instanceof Request ? input.url : String(input))
const values = (registry: AtomRegistry.AtomRegistry) =>
  Option.getOrThrow(Result.value(registry.get(flatTicketsAtom(key))))
const ready = (registry: AtomRegistry.AtomRegistry) =>
  vi.waitFor(() =>
    expect(registry.get(flatTicketsAtom(key))).toMatchObject({
      _tag: "Success",
      waiting: false
    })
  )

afterEach(() => vi.unstubAllGlobals())

describe("flat ticket pagination", () => {
  it("preserves server order across statuses, shares requests, and stops at the last page", async () => {
    const requests: URL[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input)
        requests.push(url)
        return Promise.resolve(
          url.pathname.endsWith("/count")
            ? counts(2)
            : url.searchParams.has("cursor")
              ? page([second])
              : page([ticket], "next")
        )
      })
    )
    const registry = AtomRegistry.make()
    registry.mount(flatTicketsAtom(key))
    registry.mount(flatTicketsAtom(key))
    try {
      await ready(registry)
      expect(values(registry).items.map((row) => row.ticket.id)).toEqual([
        "T-1"
      ])
      registry.set(loadMoreFlatTicketsAtom(key), undefined)
      registry.set(loadMoreFlatTicketsAtom(key), undefined)
      await vi.waitFor(() => expect(values(registry).items).toHaveLength(2))
      expect(values(registry).items.map((row) => row.ticket.id)).toEqual([
        "T-1",
        "T-2"
      ])
      registry.set(loadMoreFlatTicketsAtom(key), undefined)
      expect(
        requests.filter((url) => !url.pathname.endsWith("/count"))
      ).toHaveLength(2)
      expect(
        requests.every((url) => url.searchParams.get("groupId") === "G-1")
      ).toBe(true)
    } finally {
      registry.dispose()
    }
  })

  it("keeps loaded rows on page failure and resets pagination on retry", async () => {
    let fail = true
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input)
        return Promise.resolve(
          url.pathname.endsWith("/count")
            ? counts(2)
            : url.searchParams.has("cursor")
              ? fail
                ? new Response("failed", { status: 500 })
                : page([second])
              : page([ticket], "next")
        )
      })
    )
    const registry = AtomRegistry.make()
    registry.mount(flatTicketsAtom(key))
    try {
      await ready(registry)
      registry.set(loadMoreFlatTicketsAtom(key), undefined)
      await vi.waitFor(() =>
        expect(Result.isFailure(registry.get(flatTicketsAtom(key)))).toBe(true)
      )
      expect(values(registry).items.map((row) => row.ticket.id)).toEqual([
        "T-1"
      ])
      fail = false
      registry.refresh(flatTicketsBaseAtom(key))
      await ready(registry)
      registry.set(loadMoreFlatTicketsAtom(key), undefined)
      await vi.waitFor(() => expect(values(registry).items).toHaveLength(2))
    } finally {
      registry.dispose()
    }
  })

  it("represents an empty sprint as a successful empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          urlOf(input).pathname.endsWith("/count") ? counts(0) : page([])
        )
      )
    )
    const registry = AtomRegistry.make()
    registry.mount(flatTicketsAtom(key))
    try {
      await ready(registry)
      expect(values(registry)).toEqual({
        count: 0,
        items: [],
        nextCursor: null
      })
    } finally {
      registry.dispose()
    }
  })

  it("isolates a new search from an older in-flight page", async () => {
    let finish = (_response: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input)
        if (url.pathname.endsWith("/count"))
          return Promise.resolve(counts(url.searchParams.has("q") ? 0 : 2))
        if (url.searchParams.has("q")) return Promise.resolve(page([]))
        if (url.searchParams.has("cursor"))
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        return Promise.resolve(page([ticket], "next"))
      })
    )
    const registry = AtomRegistry.make()
    registry.mount(flatTicketsAtom(key))
    try {
      await ready(registry)
      registry.set(loadMoreFlatTicketsAtom(key), undefined)
      const searched = flatTicketsAtom(
        ticketsListKey("org", "project", { ...query, q: "missing" })
      )
      registry.mount(searched)
      await vi.waitFor(() =>
        expect(registry.get(searched)).toMatchObject({
          value: { count: 0, items: [] }
        })
      )
      finish(page([second]))
      await vi.waitFor(() => expect(values(registry).items).toHaveLength(2))
      expect(registry.get(searched)).toMatchObject({
        value: { count: 0, items: [] }
      })
    } finally {
      registry.dispose()
    }
  })
})

describe("flat ticket mutations", () => {
  it.each([true, false])(
    "updates the visible row synchronously and commits or rolls back (success: %s)",
    async (success) => {
      let finish = (_response: Response) => {}
      let current: TicketDetail = ticket
      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method === "PATCH")
            return new Promise<Response>((resolve) => {
              finish = resolve
            })
          return Promise.resolve(
            urlOf(input).pathname.endsWith("/count")
              ? counts(1)
              : page([current])
          )
        })
      )
      const registry = AtomRegistry.make()
      registry.mount(flatTicketsAtom(key))
      const mutation = updateFlatTicketAtom(
        flatTicketMutationKey(key, ticket.id)
      )
      registry.mount(mutation)
      try {
        await ready(registry)
        registry.set(mutation, { priority: "high" })
        expect(values(registry).items[0].ticket.priority).toBe("high")
        expect(registry.get(flatTicketsAtom(key)).waiting).toBe(true)
        await vi.waitFor(() =>
          expect(registry.get(mutation).waiting).toBe(true)
        )
        if (success) current = { ...ticket, priority: "high" }
        finish(
          success
            ? Response.json(encodeTicket(current))
            : new Response("failed", { status: 500 })
        )
        await vi.waitFor(() =>
          expect(registry.get(mutation).waiting).toBe(false)
        )
        await ready(registry)
        expect(values(registry).items[0].ticket.priority).toBe(
          success ? "high" : "med"
        )
        expect(Result.isFailure(registry.get(mutation))).toBe(!success)
      } finally {
        registry.dispose()
      }
    }
  )

  it("does not invite duplicate creation when sprint assignment fails after creation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input)
        if (init?.method === "POST")
          return Promise.resolve(Response.json(encodeTicket(second)))
        if (url.pathname.includes("/groups/"))
          return Promise.resolve(new Response("failed", { status: 500 }))
        return Promise.resolve(
          url.pathname.endsWith("/count") ? counts(0) : page([])
        )
      })
    )
    const registry = AtomRegistry.make()
    registry.mount(flatTicketsAtom(key))
    const create = quickCreateFlatTicketAtom(key)
    registry.mount(create)
    try {
      await ready(registry)
      registry.set(create, {
        ticket: { title: second.title },
        viewerId: "user-1",
        projectPrefix: "T",
        clientId: "new-row"
      })
      expect(values(registry).items[0]).toMatchObject({
        key: "new-row",
        pending: true
      })
      await vi.waitFor(() =>
        expect(registry.get(create)).toMatchObject({
          _tag: "Success",
          value: { id: "T-2", sprintAssignmentFailed: true }
        })
      )
    } finally {
      registry.dispose()
    }
  })
})
