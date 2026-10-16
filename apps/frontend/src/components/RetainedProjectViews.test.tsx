import { TicketListQuery, type EstimationMode } from "@pp/shared"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import * as Schema from "effect/Schema"
import type { ComponentProps } from "react"
import { afterEach, expect, it, vi } from "vitest"

import { RetainedProjectViews } from "./RetainedProjectViews"
import type { ProjectTicketLayout } from "./TicketList/ProjectTicketLayout"

const project = vi.hoisted(() => ({
  estimation: vi.fn<() => EstimationMode>(() => "points")
}))

vi.mock("@/routes/_authed/orgs/$orgSlug/projects/$slug/-context", () => ({
  useProject: () => ({ estimation: project.estimation() })
}))
vi.mock("@/hooks/useViewPreference", () => ({
  useProjectView: () => ({ view: "list" })
}))
vi.mock("./TicketList/BacklogView", () => ({ BacklogView: () => null }))
vi.mock("./sprints/SprintDetail", () => ({ SprintDetail: () => null }))
vi.mock("./TicketList/ProjectTicketLayout", () => ({
  ProjectTicketLayout: ({
    query,
    onQueryChange
  }: ComponentProps<typeof ProjectTicketLayout>) => (
    <>
      <button onClick={() => onQueryChange({ ...query, estimate: ["any"] })}>
        Filter estimated tickets
      </button>
      <output data-testid="query">{JSON.stringify(query)}</output>
    </>
  )
}))

const decodeQuery = Schema.decodeSync(TicketListQuery)

afterEach(cleanup)

const openView = async (view: "backlog" | "sprint", search = "") => {
  const root = createRootRoute()
  const authed = createRoute({ getParentRoute: () => root, id: "_authed" })
  const projectRoute = createRoute({
    getParentRoute: () => authed,
    path: "orgs/$orgSlug/projects/$slug",
    component: () => <RetainedProjectViews orgSlug="org" slug="project" />
  })
  const header = createRoute({
    getParentRoute: () => projectRoute,
    id: "_projectHeader"
  })
  const backlog = createRoute({
    getParentRoute: () => header,
    path: "/",
    validateSearch: decodeQuery
  })
  const sprint = createRoute({
    getParentRoute: () => header,
    path: "sprints/$groupId",
    validateSearch: decodeQuery
  })
  const pathname = `/orgs/org/projects/project${view === "sprint" ? "/sprints/G-1" : "/"}`
  const router = createRouter({
    routeTree: root.addChildren([
      authed.addChildren([
        projectRoute.addChildren([header.addChildren([backlog, sprint])])
      ])
    ]),
    history: createMemoryHistory({ initialEntries: [pathname + search] })
  })
  await router.load()
  render(<RouterProvider router={router} />)
  await screen.findByRole("button", { name: "Filter estimated tickets" })
  return router
}

it.each(["backlog", "sprint"] as const)(
  "retains estimate selections in the %s URL and rendered query",
  async (view) => {
    project.estimation.mockReturnValue("points")
    const router = await openView(view, "?q=hello")
    fireEvent.click(
      screen.getByRole("button", { name: "Filter estimated tickets" })
    )
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        estimate: ["any"],
        q: "hello"
      })
    )
    expect(screen.getByTestId("query").textContent).toContain(
      '"estimate":["any"]'
    )
  }
)

it("clears an old estimate filter when opening a project with estimation off", async () => {
  project.estimation.mockReturnValue("off")
  const router = await openView(
    "backlog",
    '?estimate=["any"]&q=hello&updatedAfter=2026-01-01T00%3A00%3A00.000Z&cursor=old'
  )
  await waitFor(() =>
    expect(router.state.location.search.estimate).toBeUndefined()
  )
  expect(router.state.location.search).toMatchObject({
    q: "hello",
    updatedAfter: "2026-01-01T00:00:00.000Z"
  })
  expect(router.state.location.search.cursor).toBeUndefined()
  expect(screen.getByTestId("query").textContent).not.toContain('"estimate"')
})

it("removes the active estimate filter when estimation is turned off", async () => {
  project.estimation.mockReturnValue("points")
  const router = await openView("sprint", '?estimate=["any"]')
  project.estimation.mockReturnValue("off")
  await act(async () => {
    await router.invalidate()
  })
  await waitFor(() =>
    expect(router.state.location.search.estimate).toBeUndefined()
  )
  expect(screen.getByTestId("query").textContent).not.toContain('"estimate"')
})
