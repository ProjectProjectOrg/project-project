import { TicketListQuery } from "@pp/shared"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as Schema from "effect/Schema"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BacklogGroupingControl } from "../BacklogGroupingControl"
import { TicketToolbar } from "./TicketToolbar"

vi.mock("@/features/projects/atoms/projectStatuses", async () => {
  const DateTime = await import("effect/DateTime")
  const Atom = await import("effect/unstable/reactivity/Atom")
  const Result = await import("effect/unstable/reactivity/AsyncResult")
  return {
    statusesRequest: (orgSlug: string, slug: string) => ({
      params: { orgSlug, slug }
    }),
    statusesFor: Atom.family(() =>
      Atom.make(
        Result.success([
          {
            slug: "todo",
            label: "Todo",
            icon: "Circle",
            color: "#94a3b8",
            orderKey: "a0",
            createdBy: "user",
            createdAt: DateTime.toDate(DateTime.makeUnsafe(0))
          }
        ])
      )
    )
  }
})

const decodeTicketListQuery = Schema.decodeSync(TicketListQuery)
const commit = vi.fn<(query: TicketListQuery) => void>()
function Toolbar({
  variant = "panel"
}: Readonly<{ variant?: "legacy" | "panel" }>) {
  const [grouping, setGrouping] = useState<"status" | "sprint">("status")
  const [query, setQuery] = useState(
    decodeTicketListQuery({
      type: ["bug"],
      sort: { key: "title", dir: "asc" }
    })
  )
  return (
    <TicketToolbar
      orgSlug="org"
      slug="project"
      query={query}
      onQueryChange={(next) => {
        commit(next)
        setQuery(next)
      }}
      members={[]}
      counts={{ all: 0 }}
      filters={["type"]}
      showSort
      viewOptionsVariant={variant}
    >
      <BacklogGroupingControl value={grouping} onChange={setGrouping} />
    </TicketToolbar>
  )
}

describe("toolbar search ownership", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 800, 40)
    )
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    )
    commit.mockClear()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("changes grouping without clearing filters, sort or pending search", () => {
    render(<Toolbar />)
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "pending" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Group by: Status" }))
    expect(
      screen
        .getByRole("menuitemradio", { name: "Status" })
        .getAttribute("aria-checked")
    ).toBe("true")
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Sprint" }))
    expect(
      screen.getByRole("button", { name: "Group by: Sprint" })
    ).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(commit.mock.lastCall?.[0]).toMatchObject({
      q: "pending",
      type: ["bug"],
      sort: { key: "title", dir: "asc" }
    })
  })

  it("changes ordering and direction while keeping the panel open and filters intact", () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole("button", { name: "View options" }))
    fireEvent.click(screen.getByRole("button", { name: "Ordering: Title" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Updated" }))
    expect(commit.mock.lastCall?.[0]).toMatchObject({
      type: ["bug"],
      sort: { key: "updated", dir: "asc" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Sort descending" }))
    expect(commit.mock.lastCall?.[0]).toMatchObject({
      type: ["bug"],
      sort: { key: "updated", dir: "desc" }
    })
    expect(
      screen.getByRole("button", { name: "Ordering: Updated" })
    ).toBeTruthy()
  })

  it("filters by status inside the panel and clears it through the status picker", () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole("button", { name: "View options" }))
    fireEvent.click(screen.getByRole("button", { name: "Status: All" }))
    fireEvent.click(screen.getByRole("menuitem", { name: /^Todo/ }))
    expect(commit.mock.lastCall?.[0]).toMatchObject({
      status: ["todo"],
      type: ["bug"]
    })
    expect(screen.getByRole("button", { name: "Status: Todo" })).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Status: Todo. Click to change." })
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Status: Todo" }))
    fireEvent.click(screen.getByRole("menuitem", { name: /^All/ }))
    expect(commit.mock.lastCall?.[0].status).toBeUndefined()
    expect(screen.getByRole("button", { name: "Status: All" })).toBeTruthy()
  })

  it("keeps draft typing local until the debounced query commits", () => {
    render(<Toolbar />)
    const input = screen.getByRole("textbox")
    fireEvent.change(input, { target: { value: "first" } })
    fireEvent.change(input, { target: { value: "latest" } })
    expect(commit).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.lastCall?.[0].q).toBe("latest")
    expect(commit.mock.lastCall?.[0].type).toEqual(["bug"])
  })

  it("clears an uncommitted draft, preserves sort, and cancels its pending commit", () => {
    render(<Toolbar />)
    const input = screen.getByRole("textbox")
    fireEvent.change(input, { target: { value: "pending" } })
    fireEvent.click(screen.getByTitle("Clear all filters"))
    expect(screen.getByRole("textbox")).toBe(input)
    expect(input).toHaveProperty("value", "")
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(commit).toHaveBeenCalledExactlyOnceWith({
      sort: { key: "title", dir: "asc" }
    })
  })

  it("flushes the latest search on blur without a second debounced commit", () => {
    render(<Toolbar />)
    const input = screen.getByRole("textbox")
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "latest" } })
    fireEvent.blur(input)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.lastCall?.[0].q).toBe("latest")
  })
  it.each(["legacy", "panel"] as const)(
    "applies a %s filter change without losing a pending search",
    (variant) => {
      render(<Toolbar variant={variant} />)
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "pending" }
      })
      fireEvent.click(
        screen.getByRole("button", {
          name:
            variant === "legacy"
              ? "Filters (1 active)"
              : "View options (1 active filters)"
        })
      )
      if (variant === "panel")
        fireEvent.click(screen.getByRole("button", { name: "Type: Bug" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "All types" }))
      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(commit.mock.lastCall?.[0].q).toBe("pending")
      expect(commit.mock.lastCall?.[0].type).toBeUndefined()
    }
  )
})
