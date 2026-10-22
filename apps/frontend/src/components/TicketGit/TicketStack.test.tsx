import { RegistryContext } from "@effect/atom-react"
import { TicketDetail, type StackLayerState } from "@pp/shared"
import { cleanup, renderHook } from "@testing-library/react"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { afterEach, expect, it, vi } from "vitest"

import { projectGitStates } from "@/features/github/atoms/github"
import { projectRequest } from "@/features/projects/atoms/projects"

import { useGitStack } from "./TicketStack"

const ticket = Schema.decodeSync(TicketDetail)({
  id: "T-1",
  title: "Ticket",
  status: "todo",
  type: "other",
  priority: "med",
  tags: [],
  branch: "feat/T-1",
  pr: 80,
  prState: "closed",
  lastTransitionedPr: null,
  gitState: { tag: "no_branch" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: "2026-09-15T10:00:00.000Z",
  updatedAt: "2026-09-15T10:00:00.000Z",
  creator: null,
  updater: null,
  body: ""
})
let registry: Registry.AtomRegistry | undefined

afterEach(() => {
  cleanup()
  registry?.dispose()
  vi.restoreAllMocks()
})

it("clears the cached stack when the live response omits its final layer", () => {
  registry = Registry.make({
    initialValues: [
      [
        projectGitStates(projectRequest("acme", "app")),
        Result.success({ states: {} })
      ]
    ]
  })
  const activeRegistry = registry
  const layer: StackLayerState = {
    branch: "feature/removed",
    base: "main",
    depth: 1,
    deleted: false,
    pr: null
  }
  const { result } = renderHook(
    () => useGitStack("acme", "app", { ...ticket, stack: [layer] }),
    {
      wrapper: ({ children }) => (
        <RegistryContext.Provider value={activeRegistry}>
          {children}
        </RegistryContext.Provider>
      )
    }
  )
  expect(result.current).toEqual([])
})
