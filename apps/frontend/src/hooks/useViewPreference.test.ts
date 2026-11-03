import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"

import { readViewPreference, useProjectView } from "./useViewPreference"

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

it("persists backlog and sprint views independently across remounts", () => {
  const useViews = () => ({
    backlog: useProjectView("acme", "project", undefined, "backlog"),
    sprint: useProjectView("acme", "project", undefined, "sprints")
  })
  const first = renderHook(useViews)
  act(() => first.result.current.sprint.setPreference("board"))
  expect(first.result.current.backlog.view).toBe("list")
  first.unmount()
  const second = renderHook(useViews)
  expect(second.result.current.backlog.view).toBe("list")
  expect(second.result.current.sprint.view).toBe("board")
  act(() => second.result.current.backlog.setPreference("board"))
  act(() => second.result.current.sprint.setPreference("list"))
  expect(second.result.current.backlog.view).toBe("board")
})

it("adopts an explicit URL view separately when switching scopes", () => {
  const { result, rerender } = renderHook(
    ({ scope }: Readonly<{ scope: "backlog" | "sprints" }>) =>
      useProjectView("acme", "project", "board", scope),
    { initialProps: { scope: "backlog" as "backlog" | "sprints" } }
  )
  expect(result.current.view).toBe("board")
  rerender({ scope: "sprints" })
  expect(result.current.view).toBe("board")
})

it("reads the same view outside React that the hook renders", () => {
  expect(readViewPreference("acme", "project", "sprints")).toBe("list")
  const { result } = renderHook(() =>
    useProjectView("acme", "project", undefined, "sprints")
  )
  act(() => result.current.setPreference("board"))
  expect(readViewPreference("acme", "project", "sprints")).toBe("board")
  expect(readViewPreference("acme", "project", "backlog")).toBe("list")
})

const useLinkedBoard = () =>
  useProjectView("acme", "linked", "board", "backlog")

it("adopts a linked view once, so a remount still carrying that link keeps a newer choice made elsewhere", () => {
  const first = renderHook(useLinkedBoard)
  expect(first.result.current.view).toBe("board")
  first.unmount()

  const otherWindow = renderHook(() =>
    useProjectView("acme", "linked", undefined, "backlog")
  )
  act(() => otherWindow.result.current.setPreference("list"))

  const remounted = renderHook(useLinkedBoard)
  expect(remounted.result.current.view).toBe("list")
})
