import { cleanup, render, screen } from "@testing-library/react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { afterEach, expect, it, vi } from "vitest"
import type { ProjectDetail } from "@projectproject/shared"

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
  useMatches: () => []
}))
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => AsyncResult.success([], { waiting: false }),
  useAtomSet: () => async () => ({})
}))
vi.mock("@/atoms/projects", () => ({
  projectKey: (org: string, slug: string) => `${org}/${slug}`,
  updateProjectAtom: () => "atom"
}))
vi.mock("@/atoms/sprints", () => ({
  projectKey: (org: string, slug: string) => `${org}/${slug}`,
  sprintsListAtom: () => "atom"
}))
vi.mock("@/components/sprints/ActiveSprintLine", () => ({
  ActiveSprintLine: () => <p>/proj</p>
}))
vi.mock("@/components/sprints/SprintHeaderFields", () => ({
  SprintDeleteMenu: () => null,
  SprintNameField: () => null,
  SprintStatusSelect: () => null,
  SprintSubtitle: () => null
}))
vi.mock("@/components/GithubChip", () => ({
  GithubChip: () => null
}))
vi.mock("@/lib/projectRole", () => ({
  useProjectRole: () => ({ role: "owner" })
}))

import { ProjectHeader } from "./ProjectHeader"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
)

afterEach(cleanup)

const project = {
  banner: null,
  iconImage: null,
  org: "acme",
  slug: "proj",
  key: "T",
  name: "Test project",
  icon: "🌵",
  color: "#336699",
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  github: null,
  setup: {
    workflowReviewedAt: null,
    invitePeopleDismissedAt: null,
    connectGithubDismissedAt: null
  },
  body: "",
  members: [],
  pendingMembers: []
} as unknown as ProjectDetail

it("renders the project tile as a display-only element, not an interactive trigger", () => {
  const { container } = render(
    <ProjectHeader
      orgSlug="acme"
      slug="proj"
      name="Test project"
      project={project}
    />
  )

  const emoji = screen.queryByText("🌵")
  expect(emoji).not.toBeNull()
  expect(emoji?.closest("button")).toBeNull()
  expect(container.querySelector('[data-slot="popover-trigger"]')).toBeNull()
})
