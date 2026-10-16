import { RegistryContext } from "@effect/atom-react"
import { Project as Roles } from "@pp/access/roles"
import { Forbidden, ProjectDetail, User } from "@pp/shared"
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
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { afterAll, beforeAll, afterEach, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { me } from "@/features/auth/atoms/auth"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import { staleEstimateCount } from "@/features/tickets/atoms/staleEstimates"
import { m } from "@/paraglide/messages"
import { ProjectContext } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"
import { Route as WorkflowRoute } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/settings/workflow"

vi.mock("@/components/ui/dither", () => ({ Dither: () => null }))

const req = projectRequest("org", "project")
const detail = Schema.decodeSync(ProjectDetail)({
  org: "org",
  slug: "project",
  key: "PRJ",
  name: "Project",
  icon: "P",
  color: "#123456",
  banner: null,
  iconImage: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00Z",
  github: null,
  estimation: "points",
  setup: {
    workflowReviewedAt: null,
    invitePeopleDismissedAt: null,
    connectGithubDismissedAt: null
  },
  body: "",
  members: [],
  pendingMembers: [],
  permissions: Roles.pm.grants
})
const viewer = Schema.decodeSync(User)({
  id: "user-1",
  email: "pm@example.com",
  name: "Pat",
  username: null,
  image: null,
  createdAt: "2026-01-01T00:00:00Z",
  activeOrgSlug: "org",
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
const fetchStub = stubFetch()
let registry: Registry.AtomRegistry | undefined
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})
afterAll(() => vi.unstubAllGlobals())

afterEach(() => {
  cleanup()
  registry?.dispose()
  vi.restoreAllMocks()
})

const openSettings = async () => {
  vi.spyOn(WorkflowRoute, "useParams").mockReturnValue({
    orgSlug: "org",
    slug: "project"
  })
  registry = Registry.make({
    initialValues: [
      [project(req), AsyncResult.success(detail)],
      [me(), AsyncResult.success(viewer)]
    ]
  })
  const Component = WorkflowRoute.options.component
  if (!Component) throw new Error("Workflow settings component missing")
  const root = createRootRoute()
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: Component
  })
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ["/"] })
  })
  await router.load()
  render(
    <RegistryContext.Provider value={registry}>
      <ProjectContext.Provider value={req}>
        <RouterProvider router={router} />
      </ProjectContext.Provider>
    </RegistryContext.Provider>
  )
  return registry
}

it("keeps optimistic cleanup mounted through failure and allows a successful retry", async () => {
  let active = 1
  let archived = 2
  let finishClear = (_response: Response) => {}
  const response = new Promise<Response>((resolve) => {
    finishClear = resolve
  })
  let clears = 0
  fetchStub.set((input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    )
    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET")
    if (method === "POST") {
      clears++
      if (clears === 1) return response
      active = 0
      archived = 0
      return Promise.resolve(Response.json({ cleared: 2 }))
    }
    if (url.pathname.endsWith("/statuses"))
      return Promise.resolve(Response.json([]))
    if (url.pathname.endsWith("/tickets/count")) {
      const total = url.searchParams.has("estimate")
        ? url.searchParams.get("archived") === "true"
          ? archived
          : active
        : 0
      return Promise.resolve(Response.json({ total, byStatus: {} }))
    }
    return new Promise<Response>(() => {})
  })
  const registry = await openSettings()
  await waitFor(() =>
    expect(registry.get(staleEstimateCount(req))).toMatchObject({ value: 3 })
  )
  fireEvent.click(
    await screen.findByRole("button", { name: "Clear 3 old estimates" })
  )
  fireEvent.click(screen.getByRole("button", { name: "Clear" }))
  await waitFor(() => expect(clears).toBe(1))
  expect(registry.get(staleEstimateCount(req))).toMatchObject({
    value: 0,
    waiting: true
  })
  expect(
    screen.getByRole("button", { name: "Clear" }).hasAttribute("disabled")
  ).toBe(true)
  expect(
    screen.getByText(m.project_settings_estimation_clear_stale_confirm())
  ).toBeTruthy()

  active = 0
  await act(async () => {
    finishClear(
      Response.json(Schema.encodeSync(Forbidden)(new Forbidden()), {
        status: 403
      })
    )
  })
  expect(await screen.findByText(m.error_forbidden())).toBeTruthy()
  await waitFor(() =>
    expect(registry.get(staleEstimateCount(req))).toMatchObject({
      value: 2,
      waiting: false
    })
  )
  const retry = screen.getByRole("button", { name: "Clear" })
  expect(retry.hasAttribute("disabled")).toBe(false)
  fireEvent.click(retry)
  await waitFor(() => expect(clears).toBe(2))
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull()
  )
  expect(registry.get(staleEstimateCount(req))).toMatchObject({
    value: 0,
    waiting: false
  })
})

it("shows a failed stale count and retries both count sources", async () => {
  let failing = true
  const archivedReads: Array<string | null> = []
  fetchStub.set((input) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    )
    if (url.pathname.endsWith("/statuses"))
      return Promise.resolve(Response.json([]))
    if (url.pathname.endsWith("/tickets/count")) {
      if (!url.searchParams.has("estimate"))
        return Promise.resolve(Response.json({ total: 0, byStatus: {} }))
      archivedReads.push(url.searchParams.get("archived"))
      if (failing)
        return Promise.resolve(
          Response.json(Schema.encodeSync(Forbidden)(new Forbidden()), {
            status: 403
          })
        )
      return Promise.resolve(Response.json({ total: 1, byStatus: {} }))
    }
    return new Promise<Response>(() => {})
  })
  await openSettings()
  expect(await screen.findByText(m.error_forbidden())).toBeTruthy()
  failing = false
  fireEvent.click(
    screen.getByRole("button", { name: m.error_page_retry_button() })
  )
  expect(
    await screen.findByRole("button", { name: "Clear 2 old estimates" })
  ).toBeTruthy()
  expect(
    archivedReads.filter((value) => value === "true").length
  ).toBeGreaterThanOrEqual(2)
  expect(
    archivedReads.filter((value) => value === "false").length
  ).toBeGreaterThanOrEqual(2)
})
