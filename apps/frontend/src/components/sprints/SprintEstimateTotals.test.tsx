import { RegistryContext } from "@effect/atom-react"
import { Forbidden, GroupDetail, GroupId, Ticket, TicketId } from "@pp/shared"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from "@tanstack/react-router"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as Schema from "effect/Schema"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { afterEach, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { m } from "@/paraglide/messages"

import { SprintEstimateTotals } from "./SprintEstimateTotals"

vi.mock("@/hooks/useEstimationMode", () => ({
  useEstimationMode: () => "points"
}))
vi.mock("@/components/ui/dither", () => ({ Dither: () => null }))

const groupId = Schema.decodeSync(GroupId)("G-1")
const ticketId = Schema.decodeSync(TicketId)("T-1")
const ticket = Schema.decodeSync(Ticket)({
  id: ticketId,
  title: "Done",
  status: "done",
  type: "feat",
  priority: "med",
  estimate: { unit: "points", value: 5 },
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z"
})
const group = Schema.decodeSync(GroupDetail)({
  id: groupId,
  name: "Sprint",
  kind: "sprint",
  tickets: [ticketId],
  color: "#123456",
  startsAt: null,
  endsAt: null,
  completedAt: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  body: ""
})
const encodeGroup = Schema.encodeSync(GroupDetail)
const encodeTicket = Schema.encodeSync(Ticket)
const encodeForbidden = Schema.encodeSync(Forbidden)
const fetchStub = stubFetch()
let registry: Registry.AtomRegistry | undefined

afterEach(() => {
  cleanup()
  registry?.dispose()
})

it.each([
  ["group", "typed"],
  ["tickets", "typed"],
  ["group", "decode"],
  ["tickets", "decode"]
] as const)(
  "shows and retries a %s source %s failure",
  async (source, failure) => {
    let failing = true
    let groupReads = 0
    let ticketReads = 0
    fetchStub.set((input) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost"
      )
      const tickets = url.pathname.endsWith("/tickets")
      if (tickets) ticketReads++
      else groupReads++
      if (failing && (source === "tickets") === tickets) {
        return Promise.resolve(
          failure === "typed"
            ? Response.json(encodeForbidden(new Forbidden()), { status: 403 })
            : Response.json({ invalid: true })
        )
      }
      return Promise.resolve(
        Response.json(tickets ? [encodeTicket(ticket)] : encodeGroup(group))
      )
    })
    registry = Registry.make()
    const root = createRootRoute()
    const home = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => (
        <SprintEstimateTotals orgSlug="org" slug="project" groupId={groupId} />
      )
    })
    const router = createRouter({
      routeTree: root.addChildren([home]),
      history: createMemoryHistory({ initialEntries: ["/"] })
    })
    await router.load()
    render(
      <RegistryContext.Provider value={registry}>
        <RouterProvider router={router} />
      </RegistryContext.Provider>
    )
    expect(await screen.findByText(m.error_page_title())).toBeTruthy()
    if (failure === "typed")
      expect(screen.getByText(m.error_forbidden())).toBeTruthy()
    failing = false
    fireEvent.click(
      screen.getByRole("button", { name: m.error_page_retry_button() })
    )
    expect(
      await screen.findByText(
        m.tickets_estimate_totals_points({ done: "5", committed: "5" })
      )
    ).toBeTruthy()
    expect(groupReads).toBeGreaterThanOrEqual(2)
    expect(ticketReads).toBeGreaterThanOrEqual(2)
  }
)
