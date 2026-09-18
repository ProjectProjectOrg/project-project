import { RegistryContext } from "@effect/atom-react"
import { cleanup, renderHook, waitFor, act } from "@testing-library/react"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { afterEach, expect, it, vi } from "vitest"
import { stubFetch } from "@/api/testFetch"
import { backlog, backlogRequest } from "@/atoms/backlog"
import { projectGitStates } from "@/atoms/github"
import { projectRequest } from "@/atoms/projects"
import { useProjectGitStatePolling } from "./useProjectGitStatePolling"

const fetchStub = stubFetch()

const pathOf = (input: RequestInfo | URL): string =>
  new URL(
    input instanceof Request ? input.url : String(input),
    "http://localhost"
  ).pathname

const branchState = {
  states: {
    "T-1": { tag: "branch_no_pr", name: "feat/T-1", baseBranch: "main" }
  },
  transitioned: [],
  tokenStatus: "ok",
  repoStatus: "ok"
}

const prState = {
  ...branchState,
  states: {
    "T-1": {
      tag: "pr_open",
      branch: "feat/T-1",
      baseBranch: "main",
      number: 80,
      url: "https://github.com/acme/app/pull/80",
      draft: false,
      title: "Add the thing",
      checks: "passing"
    }
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it("coalesces focus and visibility events, skips in-flight reads, and stops while hidden or unmounted", async () => {
  const registry = Registry.make()
  const signals: Array<AbortSignal | null | undefined> = []
  fetchStub.set((input, init) => {
    if (!pathOf(input).endsWith("/git-states")) {
      return new Promise<Response>(() => {})
    }
    signals.push(
      init?.signal ?? (input instanceof Request ? input.signal : null)
    )
    if (signals.length === 1) return Promise.resolve(Response.json(branchState))
    return new Promise<Response>(() => {})
  })
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible")
  const atom = projectGitStates(projectRequest("org", "project"))
  registry.mount(atom)
  try {
    await waitFor(() =>
      expect(registry.get(atom)).toMatchObject({
        _tag: "Success",
        waiting: false
      })
    )
    vi.useFakeTimers()
    const { unmount } = renderHook(
      () => useProjectGitStatePolling("org", "project", true),
      {
        wrapper: ({ children }) => (
          <RegistryContext.Provider value={registry}>
            {children}
          </RegistryContext.Provider>
        )
      }
    )
    visibility.mockReturnValue("hidden")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_050)
    })
    expect(signals).toHaveLength(1)
    visibility.mockReturnValue("visible")
    await act(async () => {
      window.dispatchEvent(new Event("focus"))
      document.dispatchEvent(new Event("visibilitychange"))
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(signals).toHaveLength(2)
    await act(async () => {
      window.dispatchEvent(new Event("focus"))
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(signals).toHaveLength(2)
    expect(signals[1]?.aborted).toBe(false)
    visibility.mockReturnValue("hidden")
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(signals).toHaveLength(2)
    unmount()
    visibility.mockReturnValue("visible")
    await act(async () => {
      window.dispatchEvent(new Event("focus"))
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(signals).toHaveLength(2)
  } finally {
    cleanup()
    registry.dispose()
  }
})

it("invalidates the project's tickets when a poll changes a git state", async () => {
  const registry = Registry.make()
  const paths: Array<string> = []
  let gitStateCalls = 0
  fetchStub.set((input) => {
    const path = pathOf(input)
    paths.push(path)
    if (path.endsWith("/git-states")) {
      gitStateCalls += 1
      return Promise.resolve(
        Response.json(gitStateCalls === 1 ? branchState : prState)
      )
    }
    if (path.endsWith("/tickets/sections")) {
      return Promise.resolve(
        Response.json({ counts: { total: 0, byStatus: {} }, sections: {} })
      )
    }
    return new Promise<Response>(() => {})
  })
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  const view = projectGitStates(projectRequest("org", "project"))
  const sections = backlog(
    backlogRequest("org", "project", { sort: { key: "id", dir: "asc" } })
  )
  const sectionCalls = () =>
    paths.filter((path) => path.endsWith("/tickets/sections")).length
  registry.mount(view)
  registry.mount(sections)
  try {
    await waitFor(() =>
      expect(registry.get(view)).toMatchObject({
        _tag: "Success",
        waiting: false
      })
    )
    await waitFor(() => expect(sectionCalls()).toBe(1))
    renderHook(() => useProjectGitStatePolling("org", "project", true), {
      wrapper: ({ children }) => (
        <RegistryContext.Provider value={registry}>
          {children}
        </RegistryContext.Provider>
      )
    })
    await act(async () => {
      window.dispatchEvent(new Event("focus"))
    })
    await waitFor(() => expect(sectionCalls()).toBe(2), { timeout: 3000 })
  } finally {
    cleanup()
    registry.dispose()
  }
})

it("invalidates tickets when the first git-states response reports changes", async () => {
  const registry = Registry.make()
  const paths: Array<string> = []
  fetchStub.set((input) => {
    const path = pathOf(input)
    paths.push(path)
    if (path.endsWith("/git-states")) {
      return Promise.resolve(
        Response.json({ ...branchState, changedTicketIds: ["T-1"] })
      )
    }
    if (path.endsWith("/tickets/sections")) {
      return Promise.resolve(
        Response.json({ counts: { total: 0, byStatus: {} }, sections: {} })
      )
    }
    return new Promise<Response>(() => {})
  })
  const view = projectGitStates(projectRequest("org", "project"))
  const sections = backlog(
    backlogRequest("org", "project", { sort: { key: "id", dir: "asc" } })
  )
  const sectionCalls = () =>
    paths.filter((path) => path.endsWith("/tickets/sections")).length
  registry.mount(view)
  registry.mount(sections)
  try {
    await waitFor(() =>
      expect(registry.get(view)).toMatchObject({
        _tag: "Success",
        waiting: false
      })
    )
    await waitFor(() => expect(sectionCalls()).toBe(1))
    renderHook(() => useProjectGitStatePolling("org", "project", true), {
      wrapper: ({ children }) => (
        <RegistryContext.Provider value={registry}>
          {children}
        </RegistryContext.Provider>
      )
    })
    await waitFor(() => expect(sectionCalls()).toBe(2), { timeout: 3000 })
  } finally {
    cleanup()
    registry.dispose()
  }
})
