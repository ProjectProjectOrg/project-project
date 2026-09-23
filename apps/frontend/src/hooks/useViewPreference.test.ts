import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"

import { useProjectView } from "./useViewPreference"

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
