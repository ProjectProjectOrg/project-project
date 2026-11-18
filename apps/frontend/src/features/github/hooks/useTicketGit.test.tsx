import { RegistryContext } from "@effect/atom-react"
import { type StackLayerState } from "@pp/shared"
import { makeTicketDetail } from "@pp/shared/tickets/testing"
import { cleanup, renderHook } from "@testing-library/react"
import * as Result from "effect/reactivity/AsyncResult"
import * as Registry from "effect/reactivity/AtomRegistry"
import { afterEach, expect, it, vi } from "vitest"

import { projectGitStates } from "@/features/github/atoms/github"
import { projectRequest } from "@/features/projects/atoms/projects"

import { useTicketGit } from "./useTicketGit"

const ticket = makeTicketDetail({
  branch: "feat/T-1",
  pr: 80,
  prState: "closed"
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
    () => useTicketGit("acme", "app", { ...ticket, stack: [layer] }).stack,
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
