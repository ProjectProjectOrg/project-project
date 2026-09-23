import { TicketDetail } from "@pp/shared"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  back: vi.fn(),
  navigate: vi.fn(),
  refreshSprints: vi.fn(),
  canGoBack: true
}))

vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: string) => mocks.values.get(atom),
  useAtomRefresh: () => mocks.refreshSprints
}))

vi.mock("@tanstack/react-router", () => ({
  useCanGoBack: () => mocks.canGoBack,
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: mocks.back } })
}))

vi.mock("@/features/comments/atoms/comments", () => ({
  commentsRequest: () => ({
    params: { orgSlug: "org", slug: "project", id: "T-1" }
  }),
  comments: () => "comments"
}))

vi.mock("@/features/sprints/atoms/sprintList", () => ({
  sprintListRequest: () => ({ params: { orgSlug: "org", slug: "project" } }),
  sprintMembership: () => "membership",
  sprintList: () => "sprints"
}))

vi.mock("@/components/ErrorPage", () => ({
  ErrorPage: () => <div>Metadata error</div>
}))

vi.mock("@/components/TicketPage/TicketPageHeader", () => ({
  TicketPageHeader: () => null
}))

vi.mock("@/components/TicketPage/TicketPageShell", () => ({
  TicketPageShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}))

vi.mock("@/forms/ticket-split", () => ({
  TicketSplitForm: ({
    onSplit,
    onCancel
  }: {
    onSplit: (created: ReadonlyArray<string>) => void
    onCancel: () => void
  }) => (
    <>
      <button onClick={() => onSplit(["T-2"])}>Complete split</button>
      <button onClick={onCancel}>Cancel split</button>
    </>
  )
}))

import { TicketSplitPage } from "./TicketSplitPage"

const ticket = Schema.decodeSync(TicketDetail)({
  id: "T-1",
  title: "Original ticket",
  status: "in_progress",
  type: "feat",
  priority: "high",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: "2026-09-13T00:00:00.000Z",
  updatedAt: "2026-09-13T00:00:00.000Z",
  creator: null,
  updater: null,
  body: ""
})

const renderPage = () =>
  render(
    <TicketSplitPage
      orgSlug="org"
      slug="project"
      ticket={ticket}
      members={[]}
    />
  )

beforeEach(() => {
  mocks.values.clear()
  mocks.values.set("membership", Result.success(new Map(), { waiting: false }))
  mocks.back.mockReset()
  mocks.navigate.mockReset()
  mocks.refreshSprints.mockReset()
  mocks.canGoBack = true
})

afterEach(cleanup)

it("waits for both comments and sprints before rendering the form", () => {
  mocks.values.set("comments", Result.initial())
  mocks.values.set("sprints", Result.success([], { waiting: false }))

  renderPage()

  expect(screen.queryByText("Complete split")).toBeNull()
})

it("renders metadata failures instead of the split form", () => {
  mocks.values.set("comments", Result.fail(new Error("comments failed")))
  mocks.values.set("sprints", Result.success([], { waiting: false }))

  renderPage()

  expect(screen.getByText("Metadata error")).toBeTruthy()
  expect(screen.queryByText("Complete split")).toBeNull()
})

it("replaces the split route with the result after success", () => {
  mocks.values.set("comments", Result.success([], { waiting: false }))
  mocks.values.set("sprints", Result.success([], { waiting: false }))

  renderPage()
  fireEvent.click(screen.getByText("Complete split"))

  expect(mocks.back).not.toHaveBeenCalled()
  expect(mocks.refreshSprints).toHaveBeenCalledOnce()
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
    params: { orgSlug: "org", slug: "project", id: ticket.id },
    search: { splitInto: ["T-2"] },
    replace: true
  })
})

it("uses browser back only when canceling", () => {
  mocks.values.set("comments", Result.success([], { waiting: false }))
  mocks.values.set("sprints", Result.success([], { waiting: false }))

  renderPage()
  fireEvent.click(screen.getByText("Cancel split"))

  expect(mocks.back).toHaveBeenCalledOnce()
  expect(mocks.navigate).not.toHaveBeenCalled()
})
