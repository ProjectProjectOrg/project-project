import {
  GroupId,
  padNumericIdSort,
  SPRINT_SECTION_UNSCHEDULED,
  Ticket,
  TicketId,
  TicketStatus
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import {
  loadMoreSprintSections,
  sprintSections,
  sprintSectionsRequest,
  type SprintSectionsValue,
  updateSprintSectionsTicket
} from "./sprintSections"

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
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
} satisfies Ticket

const query = { sort: { key: "id", dir: "asc" } } as const
const groupId = Schema.decodeSync(GroupId)("G-1")
const req = sprintSectionsRequest("org", "project", query)
const encode = Schema.encodeSync(Ticket)
const orderKey = (sortValue: string, id: string) => `${sortValue}\u0000${id}`
const idKey = (t: Ticket) => orderKey(padNumericIdSort(t.id) ?? t.id, t.id)
const serverRow = (t: Ticket, key: string = idKey(t)) => ({
  ticket: encode(t),
  orderKey: key
})

function snapshot(
  items: ReadonlyArray<Ticket>,
  nextCursor: string | null = null
) {
  const byStatus: Record<string, number> = {}
  for (const item of items)
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1
  return Response.json({
    total: items.length,
    counts: { total: items.length, byStatus },
    sections: [
      {
        key: groupId,
        count: items.length,
        page: { items: items.map((item) => serverRow(item)), nextCursor }
      },
      {
        key: SPRINT_SECTION_UNSCHEDULED,
        count: 0,
        page: { items: [], nextCursor: null }
      }
    ]
  })
}

function sprintSection<E>(
  result: AsyncResult.AsyncResult<SprintSectionsValue, E>,
  key: GroupId
) {
  if (!AsyncResult.isSuccess(result)) return undefined
  return result.value.sections.find((section) => section.key === key)
}

const fetchStub = stubFetch()

describe("ticket sprint sections", () => {
  it("keeps appended pages scoped to their query", async () => {
    const second = { ...ticket, id: Schema.decodeSync(TicketId)("T-2") }
    fetchStub.set((input: RequestInfo | URL) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost"
      )
      if (url.pathname.endsWith("/sprint-sections"))
        return Promise.resolve(
          url.searchParams.has("q")
            ? snapshot([])
            : snapshot([ticket], "next-page")
        )
      return Promise.resolve(
        Response.json({ items: [serverRow(second)], nextCursor: null })
      )
    })
    const registry = AtomRegistry.make()
    const atom = sprintSections(req)
    registry.mount(atom)
    try {
      await vi.waitFor(() =>
        expect(registry.get(atom)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(loadMoreSprintSections({ req, key: groupId }), undefined)
      await vi.waitFor(() => {
        const g1 = sprintSection(registry.get(atom), groupId)
        expect(g1?.page.items.map((row) => row.ticket.id)).toEqual([
          "T-1",
          "T-2"
        ])
        expect(g1?.page.nextCursor).toBeNull()
      })
      const searched = sprintSections(
        sprintSectionsRequest("org", "project", { ...query, q: "missing" })
      )
      registry.mount(searched)
      await vi.waitFor(() => {
        const result = registry.get(searched)
        expect(
          AsyncResult.isSuccess(result) ? result.value.total : undefined
        ).toBe(0)
        expect(sprintSection(result, groupId)?.page.items).toEqual([])
      })
      expect(
        sprintSection(registry.get(atom), groupId)?.page.items.map(
          (row) => row.key
        )
      ).toEqual(["T-1", "T-2"])
    } finally {
      registry.dispose()
    }
  })

  it("sends the sprint filter with the snapshot request", () => {
    expect(
      sprintSectionsRequest("org", "project", { ...query, groupId: [groupId] })
        .query.groupId
    ).toEqual([groupId])
  })

  it("moves status counts with an optimistic status change", async () => {
    const doing = Schema.decodeSync(TicketStatus)("in_progress")
    fetchStub.set((_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Promise<Response>(() => {})
        : Promise.resolve(snapshot([ticket]))
    )
    const registry = AtomRegistry.make()
    const view = sprintSections(req)
    const mutation = updateSprintSectionsTicket({ req, id: ticket.id })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { status: doing })
      const moved = registry.get(view)
      if (!AsyncResult.isSuccess(moved)) throw new Error("no optimistic value")
      expect(moved.value.counts).toEqual({
        total: 1,
        byStatus: { [ticket.status]: 0, [doing]: 1 }
      })
    } finally {
      registry.dispose()
    }
  })
})
