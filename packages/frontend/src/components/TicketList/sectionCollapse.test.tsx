import { act, render, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import {
  resetSectionCollapseMemory,
  useCollapsedInRecord,
  useCollapsedInSet
} from "./sectionCollapse"

afterEach(() => {
  resetSectionCollapseMemory()
  window.localStorage.clear()
})

describe("useCollapsedInSet", () => {
  beforeEach(() => {
    resetSectionCollapseMemory()
    window.localStorage.clear()
  })

  it("does not re-render sibling sections or the parent when one id is toggled", () => {
    const renders = { parent: 0, todo: 0, done: 0 }
    function Section({ id }: { id: "todo" | "done" }) {
      const [collapsed, toggle] = useCollapsedInSet(
        "status-collapse",
        id,
        undefined
      )
      renders[id] += 1
      return (
        <button type="button" onClick={toggle}>
          {id}:{collapsed ? "in" : "out"}
        </button>
      )
    }
    function Parent() {
      renders.parent += 1
      return (
        <>
          <Section id="todo" />
          <Section id="done" />
        </>
      )
    }
    const { getByText } = render(<Parent />)
    expect(renders).toEqual({ parent: 1, todo: 1, done: 1 })
    act(() => {
      getByText("todo:out").click()
    })
    expect(renders).toEqual({ parent: 1, todo: 2, done: 1 })
    expect(getByText("todo:in")).toBeTruthy()
    expect(getByText("done:out")).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem("status-collapse")!)).toEqual(
      ["todo"]
    )
  })

  it("keeps search toggles out of localStorage", () => {
    const { result } = renderHook(() =>
      useCollapsedInSet("status-collapse", "todo", "needle")
    )
    act(() => {
      result.current[1]()
    })
    expect(result.current[0]).toBe(true)
    expect(window.localStorage.getItem("status-collapse")).toBeNull()
  })

  it("keeps search collapse when the query string changes", () => {
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useCollapsedInSet("status-collapse", "todo", q),
      { initialProps: { q: "foo" } }
    )
    act(() => {
      result.current[1]()
    })
    rerender({ q: "bar" })
    expect(result.current[0]).toBe(true)
  })
})

describe("useCollapsedInRecord", () => {
  beforeEach(() => {
    resetSectionCollapseMemory()
    window.localStorage.clear()
  })

  it("does not re-render sibling sections or the parent when one id is toggled", () => {
    const renders = { parent: 0, planned: 0, completed: 0 }
    function Section({
      id,
      defaultCollapsed
    }: {
      id: "planned" | "completed"
      defaultCollapsed: boolean
    }) {
      const [collapsed, toggle] = useCollapsedInRecord(
        "sprint-collapse",
        id,
        undefined,
        defaultCollapsed
      )
      renders[id] += 1
      return (
        <button type="button" onClick={toggle}>
          {id}:{collapsed ? "in" : "out"}
        </button>
      )
    }
    function Parent() {
      renders.parent += 1
      return (
        <>
          <Section id="planned" defaultCollapsed={false} />
          <Section id="completed" defaultCollapsed={true} />
        </>
      )
    }
    const { getByText } = render(<Parent />)
    expect(renders).toEqual({ parent: 1, planned: 1, completed: 1 })
    expect(getByText("completed:in")).toBeTruthy()
    act(() => {
      getByText("planned:out").click()
    })
    expect(renders).toEqual({ parent: 1, planned: 2, completed: 1 })
    expect(JSON.parse(window.localStorage.getItem("sprint-collapse")!)).toEqual(
      {
        planned: true
      }
    )
  })

  it("resets search collapse when the query string changes", () => {
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useCollapsedInRecord("sprint-collapse", "S-1", q, false),
      { initialProps: { q: "foo" } }
    )
    act(() => {
      result.current[1]()
    })
    expect(result.current[0]).toBe(true)
    rerender({ q: "bar" })
    expect(result.current[0]).toBe(false)
    expect(window.localStorage.getItem("sprint-collapse")).toBeNull()
  })
})
