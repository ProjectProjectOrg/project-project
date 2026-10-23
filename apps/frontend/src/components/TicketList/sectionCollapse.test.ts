import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  resetSectionCollapseMemory,
  useCollapsedInRecord,
  useCollapsedInSet
} from "./sectionCollapse"

afterEach(() => {
  cleanup()
  resetSectionCollapseMemory()
  window.localStorage.clear()
})

describe("useCollapsedInSet", () => {
  it("persists toggles independently for each section", () => {
    const todo = renderHook(() =>
      useCollapsedInSet("status-collapse", "todo", undefined)
    )
    const done = renderHook(() =>
      useCollapsedInSet("status-collapse", "done", undefined)
    )
    act(() => todo.result.current[1]())
    expect(todo.result.current[0]).toBe(true)
    expect(done.result.current[0]).toBe(false)
    expect(JSON.parse(window.localStorage.getItem("status-collapse")!)).toEqual(
      ["todo"]
    )
  })

  it("keeps search toggles out of localStorage", () => {
    const { result } = renderHook(() =>
      useCollapsedInSet("status-collapse", "todo", "needle")
    )
    act(() => result.current[1]())
    expect(result.current[0]).toBe(true)
    expect(window.localStorage.getItem("status-collapse")).toBeNull()
  })

  it("keeps search collapse when the query string changes", () => {
    const { result, rerender } = renderHook(
      ({ q }) => useCollapsedInSet("status-collapse", "todo", q),
      { initialProps: { q: "foo" } }
    )
    act(() => result.current[1]())
    rerender({ q: "bar" })
    expect(result.current[0]).toBe(true)
  })
})

describe("useCollapsedInRecord", () => {
  it("persists one section's toggle without changing another's default", () => {
    const planned = renderHook(() =>
      useCollapsedInRecord("sprint-collapse", "planned", undefined, false)
    )
    const completed = renderHook(() =>
      useCollapsedInRecord("sprint-collapse", "completed", undefined, true)
    )
    expect(planned.result.current[0]).toBe(false)
    expect(completed.result.current[0]).toBe(true)
    act(() => planned.result.current[1]())
    expect(planned.result.current[0]).toBe(true)
    expect(completed.result.current[0]).toBe(true)
    expect(JSON.parse(window.localStorage.getItem("sprint-collapse")!)).toEqual(
      { planned: true }
    )
  })

  it("resets search collapse when the query string changes", () => {
    const { result, rerender } = renderHook(
      ({ q }) => useCollapsedInRecord("sprint-collapse", "S-1", q, false),
      { initialProps: { q: "foo" } }
    )
    act(() => result.current[1]())
    expect(result.current[0]).toBe(true)
    rerender({ q: "bar" })
    expect(result.current[0]).toBe(false)
    expect(window.localStorage.getItem("sprint-collapse")).toBeNull()
  })
})
