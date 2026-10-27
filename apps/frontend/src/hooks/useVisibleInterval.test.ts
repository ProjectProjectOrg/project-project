import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { useVisibleInterval } from "./useVisibleInterval"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it("runs on the interval, focus and visibility only while visible and enabled", () => {
  vi.useFakeTimers()
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible")
  const callback = vi.fn<() => void>()
  const { rerender, unmount } = renderHook(
    ({ enabled }) => useVisibleInterval(callback, 1_000, enabled),
    { initialProps: { enabled: true } }
  )
  expect(callback).not.toHaveBeenCalled()

  act(() => {
    vi.advanceTimersByTime(1_000)
  })
  expect(callback).toHaveBeenCalledTimes(1)

  act(() => {
    window.dispatchEvent(new Event("focus"))
    document.dispatchEvent(new Event("visibilitychange"))
  })
  expect(callback).toHaveBeenCalledTimes(3)

  visibility.mockReturnValue("hidden")
  act(() => {
    vi.advanceTimersByTime(2_000)
  })
  expect(callback).toHaveBeenCalledTimes(3)

  visibility.mockReturnValue("visible")
  rerender({ enabled: false })
  act(() => {
    vi.advanceTimersByTime(2_000)
    window.dispatchEvent(new Event("focus"))
  })
  expect(callback).toHaveBeenCalledTimes(3)

  rerender({ enabled: true })
  unmount()
  act(() => {
    vi.advanceTimersByTime(2_000)
  })
  expect(callback).toHaveBeenCalledTimes(3)
})

it("runs immediately when asked, and calls the latest callback", () => {
  vi.useFakeTimers()
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  const first = vi.fn<() => void>()
  const second = vi.fn<() => void>()
  const { rerender } = renderHook(
    ({ callback }) =>
      useVisibleInterval(callback, 1_000, true, { immediate: true }),
    { initialProps: { callback: first } }
  )
  expect(first).toHaveBeenCalledTimes(1)

  rerender({ callback: second })
  act(() => {
    vi.advanceTimersByTime(1_000)
  })
  expect(first).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledTimes(1)
})

it("skips focus when asked, but still runs on visibility changes", () => {
  vi.useFakeTimers()
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  const callback = vi.fn<() => void>()
  renderHook(() =>
    useVisibleInterval(callback, 1_000, true, { onFocus: false })
  )

  act(() => {
    window.dispatchEvent(new Event("focus"))
  })
  expect(callback).not.toHaveBeenCalled()

  act(() => {
    document.dispatchEvent(new Event("visibilitychange"))
  })
  expect(callback).toHaveBeenCalledTimes(1)
})
