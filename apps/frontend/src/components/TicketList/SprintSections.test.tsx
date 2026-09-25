import type { TicketListQuery } from "@pp/shared"
import { render, cleanup } from "@testing-library/react"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import type { ComponentProps } from "react"
import { afterEach, expect, it, vi } from "vitest"

import type { SprintSectionsValue } from "@/features/tickets/atoms/sprintSections"

import { SprintSections } from "./SprintSections"

const state = vi.hoisted(() => ({ snapshot: {} as unknown }))
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: unknown) => atom,
  useAtomRefresh: () => vi.fn<() => void>(),
  useAtomSet: () => vi.fn<() => void>()
}))
vi.mock("@/features/sprints/atoms/sprintList", () => ({
  sprintListRequest: () => ({}),
  sprintList: () => Result.success([])
}))
vi.mock("@/features/tickets/atoms/sprintSections", () => ({
  sprintSectionsRequest: (orgSlug: string, slug: string, query: unknown) => ({
    params: { orgSlug, slug },
    query
  }),
  sprintSections: () => state.snapshot,
  loadMoreSprintSections: vi.fn<() => void>(),
  updateSprintSectionsTicket: vi.fn<() => void>()
}))
vi.mock("./SectionList", () => ({
  SectionList: ({
    count,
    query
  }: Readonly<{ count: number; query: TicketListQuery }>) => (
    <div data-testid="section" data-sort={query.sort?.key}>
      {count}
    </div>
  ),
  TicketPagination: () => null
}))
vi.mock("./Row", () => ({ Row: () => null }))
vi.mock("./useTicketPreview", () => ({ useTicketPreview: () => ({}) }))
vi.mock("./sectionCollapse", () => ({
  sprintCollapseKey: (key: string) => key,
  useCollapsedInRecord: () => [false, vi.fn<() => void>()]
}))
vi.mock("@/components/ErrorPage", () => ({
  ErrorPage: () => <div>Failed</div>
}))

const snapshot = (count: number): SprintSectionsValue => ({
  total: count,
  counts: { total: count, byStatus: {} },
  sections: [
    { key: "unscheduled", count, page: { items: [], nextCursor: null } }
  ]
})
const props: ComponentProps<typeof SprintSections> = {
  orgSlug: "org",
  slug: "project",
  preferencesKey: "project",
  query: { sort: { key: "priority", dir: "desc" } },
  members: [],
  extraRowActions: () => null
}

afterEach(cleanup)

it("keeps the section mounted with its matching query until the new sort arrives", () => {
  state.snapshot = Result.success(snapshot(2))
  const view = render(<SprintSections {...props} />)
  const section = view.getByTestId("section")
  state.snapshot = Result.initial()
  const next: ComponentProps<typeof SprintSections> = {
    ...props,
    query: { sort: { key: "title", dir: "asc" } }
  }
  view.rerender(<SprintSections {...next} />)
  expect(view.getByTestId("section")).toBe(section)
  expect(section.dataset.sort).toBe("priority")
  expect(section.textContent).toBe("2")
  state.snapshot = Result.success(snapshot(3))
  view.rerender(<SprintSections {...next} />)
  expect(view.getByTestId("section")).toBe(section)
  expect(section.dataset.sort).toBe("title")
  expect(section.textContent).toBe("3")
})

it("does not retain sections when switching projects", () => {
  state.snapshot = Result.success(snapshot(2))
  const view = render(<SprintSections {...props} />)
  state.snapshot = Result.initial()
  view.rerender(<SprintSections {...props} slug="another-project" />)
  expect(view.queryByTestId("section")).toBeNull()
})

it("shows a failed sort request instead of silently retaining the old result", () => {
  state.snapshot = Result.success(snapshot(2))
  const view = render(<SprintSections {...props} />)
  state.snapshot = Result.fail("Request failed")
  view.rerender(
    <SprintSections {...props} query={{ sort: { key: "title", dir: "asc" } }} />
  )
  expect(view.getByText("Failed")).toBeTruthy()
  expect(view.queryByTestId("section")).toBeNull()
})
