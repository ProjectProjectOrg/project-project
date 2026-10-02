import { RegistryContext } from "@effect/atom-react"
import type { Statement } from "@pp/access"
import { Project as ProjectRoles } from "@pp/access/roles"
import { Project, ProjectDetail, TicketDetail, User } from "@pp/shared"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import type { ReactNode } from "react"
import { afterEach, expect, it } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { me } from "@/features/auth/atoms/auth"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import {
  orgTicketsRequest,
  updateMyTicket
} from "@/features/tickets/atoms/myTickets"

import { DashboardCard, DashboardRow } from "./DashboardTicket"

const viewer = Schema.decodeSync(User)({
  id: "user-1",
  email: "pm@example.com",
  name: "Pat",
  username: null,
  image: null,
  createdAt: "2026-01-01T00:00:00.000Z",
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

const ticket = Schema.decodeSync(TicketDetail)({
  id: "T-1",
  title: "Hover target",
  status: "todo",
  type: "feat",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch" },
  assignees: [],
  archivedAt: null,
  creator: null,
  updater: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  body: ""
})

const decodeProjectDetail = Schema.decodeSync(ProjectDetail)
const encodeProject = Schema.encodeSync(Project)

const listedProject = Schema.decodeSync(Project)({
  org: "org",
  slug: "project",
  key: "PRJ",
  name: "Project",
  icon: "P",
  color: "#123456",
  banner: null,
  iconImage: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z"
})

const detailWith = (
  permissions: Statement.Grants<ProjectRoles.ProjectResources>
) =>
  decodeProjectDetail({
    ...encodeProject(listedProject),
    github: null,
    setup: {
      workflowReviewedAt: null,
      invitePeopleDismissedAt: null,
      connectGithubDismissedAt: null
    },
    body: "",
    members: [],
    pendingMembers: [],
    permissions
  })

const fetchStub = stubFetch()

afterEach(() => {
  cleanup()
})

const renderOnDashboard = async (
  permissions: Statement.Grants<ProjectRoles.ProjectResources>,
  ui: ReactNode
) => {
  fetchStub.set(() => new Promise<Response>(() => {}))
  const registry = Registry.make({
    initialValues: [
      [me(), AsyncResult.success(viewer)],
      [
        project(projectRequest("org", "project")),
        AsyncResult.success(detailWith(permissions))
      ]
    ]
  })
  const root = createRootRoute()
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => ui
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
  return registry
}

const item = { project: listedProject, ticket, activity: null }

it("renders a dashboard card outside a project route with that project's grants", async () => {
  const registry = await renderOnDashboard(
    ProjectRoles.client.grants,
    <DashboardCard
      req={orgTicketsRequest("org")}
      item={item}
      update={updateMyTicket}
    />
  )
  const link = await screen.findByRole("link", { name: "Hover target" })
  expect(link).toBeTruthy()
  registry.dispose()
})

it("disables a dashboard row's editors when that project is read-only", async () => {
  const registry = await renderOnDashboard(
    { ticket: ["read"] },
    <DashboardRow
      req={orgTicketsRequest("org")}
      item={item}
      update={updateMyTicket}
      previewOpen={false}
      onPreviewPointerEnter={() => {}}
      onPreviewOpenChange={() => {}}
    />
  )
  await screen.findByText("Hover target")
  const fieldsets = document.querySelectorAll("fieldset")
  expect(fieldsets.length).toBeGreaterThan(0)
  expect([...fieldsets].every((fieldset) => fieldset.disabled)).toBe(true)
  registry.dispose()
})
