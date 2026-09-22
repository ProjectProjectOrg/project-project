import { TicketListQuery } from "@pp/shared"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as Schema from "effect/Schema"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BacklogGroupingControl } from "../BacklogGroupingControl"
import { TicketToolbar } from "./TicketToolbar"

vi.mock("@/features/projects/atoms/projectStatuses", async () => {
  const Atom = await import("effect/unstable/reactivity/Atom")
  const Result = await import("effect/unstable/reactivity/AsyncResult")
  return {
    statusesRequest: (orgSlug: string, slug: string) => ({
      params: { orgSlug, slug }
    }),
    statusesFor: Atom.family(() => Atom.make(Result.success([])))
  }
})

const decodeTicketListQuery = Schema.decodeSync(TicketListQuery)
const commit = vi.fn<(query: TicketListQuery) => void>()
function Toolbar() {
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
  it("applies a filter change to the query without losing a pending search", () => {
    render(<Toolbar />)
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "pending" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Filters (1 active)" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "All types" }))
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(commit.mock.lastCall?.[0].q).toBe("pending")
    expect(commit.mock.lastCall?.[0].type).toBeUndefined()
  })
})
