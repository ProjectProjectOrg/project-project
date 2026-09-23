import {
  OrgTicketPage,
  OrgTicketRow,
  Project,
  ProjectStatus,
  RecentTicketRow,
  Ticket,
  TicketDetail,
  TicketId,
  TicketUpdateResult
} from "@pp/shared"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import {
  myTicketBoard,
  myTickets,
  orgTicketsRequest,
  myTicketsByProject,
  recentTickets,
  updateMyTicket
} from "./myTickets"
import { ticketRequest, updateTicketDetail } from "./ticketDetail"

const fetchStub = stubFetch()

const projectJson = (slug: string, key: string) => ({
  banner: null,
  iconImage: null,
  org: "acme",
  slug,
  key,
  name: slug,
  icon: "📁",
  color: "#123456",
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z"
})

const ticketJson = (id: string, status: string) => ({
  id,
  title: id,
  status,
  type: "feat" as const,
  priority: "med" as const,
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch" as const, baseBranch: "main" },
  assignees: ["user-1"],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z"
})

const statusJson = (slug: string, label: string, orderKey: string) => ({
  slug,
  label,
  icon: "Circle",
  color: "#123456",
  orderKey,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z"
})

const decodeProjects = Schema.decodeSync(Schema.Array(Project))
const decodeStatuses = Schema.decodeSync(Schema.Array(ProjectStatus))
const decodeRow = Schema.decodeSync(OrgTicketRow)
const decodeDetail = Schema.decodeSync(TicketDetail)
const webTicketId = Schema.decodeSync(TicketId)("WEB-1")

const projects = decodeProjects([
  projectJson("web", "WEB"),
  projectJson("api", "API")
])

const baselineStatuses = [
  statusJson("todo", "Todo", "a0"),
  statusJson("in_progress", "In progress", "a1"),
  statusJson("done", "Done", "a2")
]

const statusesBySlug = new Map([
  [
    "web",
    decodeStatuses([
      ...baselineStatuses,
      statusJson("review", "In Review", "a1V")
    ])
  ],
  [
    "api",
    decodeStatuses([
      ...baselineStatuses,
      statusJson("in_review", "In-review", "a1V")
    ])
  ]
])

const row = (projectSlug: string, id: string, status: string): OrgTicketRow =>
  decodeRow({
    projectSlug,
    ticket: ticketJson(id, status)
  })

const encodeProjects = Schema.encodeSync(Schema.Array(Project))
const encodePage = Schema.encodeSync(OrgTicketPage)
const encodeRecent = Schema.encodeSync(Schema.Array(RecentTicketRow))
const encodeStatuses = Schema.encodeSync(Schema.Array(ProjectStatus))
const encodeUpdate = Schema.encodeSync(TicketUpdateResult)

type Served = {
  mine: ReadonlyArray<OrgTicketRow>
  nextCursor: string | null
  recent: ReadonlyArray<OrgTicketRow>
}

const serve = (
  served: Served,
  calls: Array<string>,
  patch?: (url: URL) => Promise<Response>
) =>
  fetchStub.set((input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : input,
      "http://localhost"
    )
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`)
    if (init?.method === "PATCH" && patch) return patch(url)
    if (init?.method === "PATCH") {
      const ticket = decodeDetail({
        ...ticketJson("WEB-1", "in_progress"),
        creator: null,
        updater: null,
        body: ""
      })
      return Promise.resolve(
        Response.json(encodeUpdate({ ticket, orderKey: null }))
      )
    }
    if (url.pathname === "/api/orgs/acme/projects") {
      return Promise.resolve(Response.json(encodeProjects(projects)))
    }
    if (url.pathname === "/api/orgs/acme/tickets/mine") {
      return Promise.resolve(
        Response.json(
          encodePage({ items: served.mine, nextCursor: served.nextCursor })
        )
      )
    }
    if (url.pathname === "/api/orgs/acme/tickets/recent") {
      return Promise.resolve(
        Response.json(
          encodeRecent(
            served.recent.map((recent) => ({
              ...recent,
              activity: { tag: "assigned" as const }
            }))
          )
        )
      )
    }
    const statuses = /^\/api\/orgs\/acme\/projects\/([^/]+)\/statuses$/.exec(
      url.pathname
    )
    if (statuses) {
      return Promise.resolve(
        Response.json(encodeStatuses(statusesBySlug.get(statuses[1]) ?? []))
      )
    }
    return Promise.resolve(new Response(null, { status: 404 }))
  })

const successOf = <A, E>(result: AsyncResult.AsyncResult<A, E>): A => {
  if (!AsyncResult.isSuccess(result)) throw new Error("not ready")
  return result.value
}

const req = orgTicketsRequest("acme")

describe("myTickets", () => {
  it("shares one atom between structurally equal requests", () => {
    expect(myTickets(orgTicketsRequest("acme"))).toBe(myTickets(req))
    expect(myTicketBoard(orgTicketsRequest("acme"))).toBe(myTicketBoard(req))
  })

  it("pairs each row with its project and drops rows it cannot see", async () => {
    const calls: Array<string> = []
    serve(
      {
        mine: [
          row("web", "WEB-1", "todo"),
          row("api", "API-1", "done"),
          row("gone", "GONE-1", "todo")
        ],
        nextCursor: "next",
        recent: []
      },
      calls
    )
    const registry = AtomRegistry.make()
    const view = myTickets(req)
    registry.mount(view)
    try {
      await vi.waitFor(() => {
        const value = successOf(registry.get(view))
        expect(
          value.tickets.map(({ project, ticket }) => [project.key, ticket.id])
        ).toEqual([
          ["WEB", "WEB-1"],
          ["API", "API-1"]
        ])
        expect(value.hasMore).toBe(true)
      })
    } finally {
      registry.dispose()
    }
  })

  it("refetches when a visible project publishes its ticket key", async () => {
    const calls: Array<string> = []
    const served: Served = {
      mine: [row("web", "WEB-1", "todo")],
      nextCursor: null,
      recent: []
    }
    serve(served, calls)
    const registry = AtomRegistry.make()
    const view = myTickets(req)
    const mutation = updateTicketDetail(
      ticketRequest("acme", "web", webTicketId)
    )
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(successOf(registry.get(view)).tickets).toHaveLength(1)
      )
      served.mine = [row("web", "WEB-1", "in_progress")]
      registry.set(mutation, {
        status: Ticket.fields.status.make("in_progress")
      })
      await vi.waitFor(() =>
        expect(successOf(registry.get(view)).tickets[0]?.ticket.status).toBe(
          "in_progress"
        )
      )
      expect(
        calls.filter((call) => call === "GET /api/orgs/acme/tickets/mine")
      ).toHaveLength(2)
    } finally {
      registry.dispose()
    }
  })
})

describe("recentTickets", () => {
  it("pairs recent rows with their projects", async () => {
    serve(
      {
        mine: [],
        nextCursor: null,
        recent: [row("api", "API-2", "todo"), row("web", "WEB-3", "done")]
      },
      []
    )
    const registry = AtomRegistry.make()
    const view = recentTickets(req)
    registry.mount(view)
    try {
      await vi.waitFor(() =>
        expect(
          successOf(registry.get(view)).tickets.map(({ ticket, activity }) => [
            ticket.id,
            activity?.tag
          ])
        ).toEqual([
          ["API-2", "assigned"],
          ["WEB-3", "assigned"]
        ])
      )
    } finally {
      registry.dispose()
    }
  })
})

describe("myTicketBoard", () => {
  it("merges each project's statuses into shared columns", async () => {
    serve(
      {
        mine: [
          row("web", "WEB-1", "review"),
          row("api", "API-1", "in_review"),
          row("api", "API-2", "todo")
        ],
        nextCursor: null,
        recent: []
      },
      []
    )
    const registry = AtomRegistry.make()
    const view = myTicketBoard(req)
    registry.mount(view)
    try {
      await vi.waitFor(() =>
        expect(
          successOf(registry.get(view)).columns.map((column) => [
            column.key,
            column.items.map(({ ticket }) => ticket.id)
          ])
        ).toEqual([
          ["todo", ["API-2"]],
          ["in_progress", []],
          ["label:inreview", ["WEB-1", "API-1"]],
          ["done", []]
        ])
      )
    } finally {
      registry.dispose()
    }
  })
})

describe("updateMyTicket", () => {
  it("paints an edit on the list and the board before the server answers", async () => {
    const calls: Array<string> = []
    const served: Served = {
      mine: [row("web", "WEB-1", "todo"), row("api", "WEB-1", "todo")],
      nextCursor: null,
      recent: []
    }
    let finish = (_r: Response) => {}
    serve(
      served,
      calls,
      () => new Promise<Response>((resolve) => (finish = resolve))
    )
    const registry = AtomRegistry.make()
    const list = myTickets(req)
    const board = myTicketBoard(req)
    const mutation = updateMyTicket({
      req,
      viewerId: "user-1",
      projectSlug: "web",
      id: webTicketId
    })
    registry.mount(list)
    registry.mount(board)
    registry.mount(mutation)
    const statusOf = (projectSlug: string) =>
      successOf(registry.get(list)).tickets.find(
        (item) => item.project.slug === projectSlug
      )?.ticket.status
    try {
      await vi.waitFor(() =>
        expect(successOf(registry.get(board)).columns.length).toBeGreaterThan(0)
      )

      registry.set(mutation, {
        status: Ticket.fields.status.make("in_progress")
      })

      expect(statusOf("web")).toBe("in_progress")
      expect(statusOf("api")).toBe("todo")
      expect(
        successOf(registry.get(board))
          .columns.find((column) => column.key === "in_progress")
          ?.items.map((item) => item.project.slug)
      ).toEqual(["web"])
      expect(calls).toContain("PATCH /api/orgs/acme/projects/web/tickets/WEB-1")

      served.mine = [
        row("web", "WEB-1", "in_progress"),
        row("api", "WEB-1", "todo")
      ]
      finish(
        Response.json(
          encodeUpdate({
            ticket: decodeDetail({
              ...ticketJson("WEB-1", "in_progress"),
              creator: null,
              updater: null,
              body: ""
            }),
            orderKey: null
          })
        )
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      await vi.waitFor(() =>
        expect(registry.get(list)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      expect(statusOf("web")).toBe("in_progress")
    } finally {
      registry.dispose()
    }
  })
})

describe("myTicketsByProject", () => {
  it("groups rows per project, ordered by project name, keeping row order", async () => {
    serve(
      {
        mine: [
          row("web", "WEB-2", "todo"),
          row("api", "API-1", "done"),
          row("web", "WEB-1", "todo")
        ],
        nextCursor: null,
        recent: []
      },
      []
    )
    const registry = AtomRegistry.make()
    const view = myTicketsByProject(req)
    registry.mount(view)
    try {
      await vi.waitFor(() =>
        expect(
          successOf(registry.get(view)).groups.map(({ project, tickets }) => [
            project.slug,
            tickets.map(({ ticket }) => ticket.id)
          ])
        ).toEqual([
          ["api", ["API-1"]],
          ["web", ["WEB-2", "WEB-1"]]
        ])
      )
    } finally {
      registry.dispose()
    }
  })
})

describe("updateMyTicket unassignment", () => {
  it("drops a ticket from my tickets as soon as I unassign myself", async () => {
    serve(
      { mine: [row("web", "WEB-1", "todo")], nextCursor: null, recent: [] },
      [],
      () => new Promise<Response>(() => {})
    )
    const registry = AtomRegistry.make()
    const list = myTickets(req)
    const mutation = updateMyTicket({
      req,
      viewerId: "user-1",
      projectSlug: "web",
      id: webTicketId
    })
    registry.mount(list)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(successOf(registry.get(list)).tickets).toHaveLength(1)
      )
      registry.set(mutation, { assignees: [] })
      expect(successOf(registry.get(list)).tickets).toEqual([])
    } finally {
      registry.dispose()
    }
  })
})
