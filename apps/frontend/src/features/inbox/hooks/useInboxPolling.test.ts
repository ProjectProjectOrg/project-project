// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useInboxCountPolling, useInboxPolling } from "./useInboxPolling"

const state = vi.hoisted(() => ({
  refresh: vi.fn(),
  atoms: [] as ReadonlyArray<unknown>
}))

// oxlint-disable-next-line typescript/no-floating-promises -- bun hoists vi.mock above the imports, where it cannot be awaited
vi.mock("@effect/atom-react", () => ({
  useAtomRefresh: (atom: unknown) => {
    state.atoms = [...state.atoms, atom]
    return state.refresh
  }
}))

type OrgRequest = Readonly<{ params: Readonly<{ orgSlug: string }> }>

// oxlint-disable-next-line typescript/no-floating-promises -- bun hoists vi.mock above the imports, where it cannot be awaited
vi.mock("@/features/inbox/atoms/inbox", () => ({
  inboxEntries: (req: OrgRequest) => `entries:${req.params.orgSlug}`,
  inboxRequest: (orgSlug: string) => ({ params: { orgSlug } }),
  inboxCount: (req: OrgRequest) => `count:${req.params.orgSlug}`,
  inboxCountRequest: (orgSlug: string) => ({ params: { orgSlug } })
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  state.refresh.mockReset()
  state.atoms = []
})

describe("useInboxPolling", () => {
  it("refreshes the organization's entries every minute", () => {
    vi.useFakeTimers()
    renderHook(() => useInboxPolling("igne"))
    expect(state.atoms).toContain("entries:igne")
    act(() => {
      vi.advanceTimersByTime(59_000)
    })
    expect(state.refresh).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(state.refresh).toHaveBeenCalledOnce()
  })
})

describe("useInboxCountPolling", () => {
  it("refreshes the unread count every minute", () => {
    vi.useFakeTimers()
    renderHook(() => useInboxCountPolling("igne"))
    expect(state.atoms).toContain("count:igne")
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(state.refresh).toHaveBeenCalledOnce()
  })
})
