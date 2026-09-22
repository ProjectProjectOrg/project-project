import { TicketDetail } from "@pp/shared"
import { cleanup, render, screen } from "@testing-library/react"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { afterEach, expect, it, vi } from "vitest"

vi.mock("@effect/atom-react", () => ({
  useAtomSet: () => vi.fn(),
  useAtomValue: () => Result.initial(true)
}))

vi.mock("@/features/tickets/atoms/ticketDetail", () => ({
  ticketRequest: () => ({
    params: { orgSlug: "org", slug: "project", id: "T-1" }
  }),
  splitTicket: () => "split-atom"
}))

vi.mock("@/components/TicketList/AssigneeField", () => ({
  AssigneeSelect: () => null
}))

vi.mock("@/components/TicketList/PriorityField", () => ({
  PrioritySelect: () => null
}))

vi.mock("@/components/TicketList/SprintField", () => ({
  SprintSelect: () => null
}))

vi.mock("@/components/TicketList/StatusField", () => ({
  StatusSelect: () => null
}))

vi.mock("@/components/TicketList/TypeField", () => ({
  TypeSelect: () => null
}))

vi.mock("@/components/TicketSplit/SplitResults", () => {
  const SplitResults = ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
  SplitResults.Row = () => null
  SplitResults.Add = () => null
  return { SplitResults }
})

vi.mock("@/components/TicketSplit/SplitWarnings", () => ({
  SplitWarnings: () => null
}))

import { TicketSplitForm } from "."

afterEach(cleanup)

it("disables cancellation while the split request is pending", () => {
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

  render(
    <TicketSplitForm
      orgSlug="org"
      slug="project"
      ticket={ticket}
      members={[]}
      commentCount={0}
      sprintId={null}
      onSplit={vi.fn()}
      onCancel={vi.fn()}
    />
  )

  expect(
    screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled")
  ).toBe(true)
})
