import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useJiraMigrationPolling } from "./useJiraMigrationPolling"

const state = vi.hoisted(() => ({ refresh: vi.fn(), invalidate: vi.fn() }))

vi.mock("@effect/atom-react", () => ({
  useAtomRefresh: (atom: string) =>
    atom === "migration:org/migration" ? state.refresh : undefined,
  useAtomSet: (atom: string) =>
    atom === "invalidate:org" ? state.invalidate : undefined
}))

vi.mock("@/features/jira/atoms/jiraMigration", () => ({
  invalidateAfterImport: (req: { params: { orgSlug: string } }) =>
    `invalidate:${req.params.orgSlug}`,
  jiraMigrations: (req: { params: { orgSlug: string } }) =>
    `migrations:${req.params.orgSlug}`,
  jiraMigration: (req: { params: { orgSlug: string; migrationId: string } }) =>
    `migration:${req.params.orgSlug}/${req.params.migrationId}`,
  jiraMigrationRequest: (orgSlug: string, migrationId: string) => ({
    params: { orgSlug, migrationId }
  }),
  jiraOrgRequest: (orgSlug: string) => ({ params: { orgSlug } })
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  state.refresh.mockReset()
  state.invalidate.mockReset()
})

describe("useJiraMigrationPolling", () => {
  it("refreshes active migrations while visible", () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() =>
      useJiraMigrationPolling("org", "migration", "scanning")
    )

    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(state.refresh).toHaveBeenCalledOnce()

    unmount()
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(state.refresh).toHaveBeenCalledOnce()
  })

  it.each(["cancelled", "succeeded"] as const)(
    "does not poll a %s migration",
    (status) => {
      vi.useFakeTimers()
      renderHook(() => useJiraMigrationPolling("org", "migration", status))
      act(() => {
        vi.advanceTimersByTime(4_000)
      })
      expect(state.refresh).not.toHaveBeenCalled()
    }
  )

  it("refreshes the project list when completion is observed", () => {
    const { rerender } = renderHook(
      ({ status }) => useJiraMigrationPolling("org", "migration", status),
      { initialProps: { status: "migrating" as "migrating" | "succeeded" } }
    )
    expect(state.invalidate).not.toHaveBeenCalled()
    rerender({ status: "succeeded" })
    expect(state.invalidate).toHaveBeenCalledOnce()
  })

  it("does not refresh the project list when opening a finished import", () => {
    renderHook(() => useJiraMigrationPolling("org", "migration", "succeeded"))
    expect(state.invalidate).not.toHaveBeenCalled()
  })
})
