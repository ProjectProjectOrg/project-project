// @vitest-environment jsdom
import { type FigmaLinkMetadata, type FigmaRef } from "@pp/shared"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useFigmaMetadata } from "./figma-metadata"

const refA: FigmaRef = {
  kind: "design",
  fileKey: "a",
  nodeId: "1:1",
  slug: "a"
}
const refB: FigmaRef = {
  kind: "design",
  fileKey: "b",
  nodeId: "1:1",
  slug: "b"
}

const advanceSeconds = (seconds: number) => {
  for (let i = 0; i < seconds; i++) {
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
  }
}

const setup = () => {
  const refresh = vi.fn()
  return { links: [], refresh }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useFigmaMetadata", () => {
  it("stops polling unresolved metadata after fifteen refreshes", () => {
    vi.useFakeTimers()
    const source = setup()
    const { refresh } = source
    renderHook(() => useFigmaMetadata(refA, source))

    advanceSeconds(30)

    expect(refresh).toHaveBeenCalledTimes(15)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("polls again after switching to another reference and back", () => {
    vi.useFakeTimers()
    const source = setup()
    const { refresh } = source
    const { rerender } = renderHook<
      FigmaLinkMetadata | null,
      Readonly<{ ref: FigmaRef | null }>
    >(({ ref }) => useFigmaMetadata(ref, source), {
      initialProps: { ref: refA }
    })
    advanceSeconds(30)
    refresh.mockClear()

    rerender({ ref: null })
    rerender({ ref: refA })
    advanceSeconds(3)

    expect(refresh).toHaveBeenCalledTimes(4)
  })

  it("gives a new reference its own refresh budget", () => {
    vi.useFakeTimers()
    const source = setup()
    const { refresh } = source
    const { rerender } = renderHook(
      ({ ref }) => useFigmaMetadata(ref, source),
      {
        initialProps: { ref: refA }
      }
    )
    advanceSeconds(30)
    refresh.mockClear()

    rerender({ ref: refB })
    advanceSeconds(30)

    expect(refresh).toHaveBeenCalledTimes(15)
  })
})
