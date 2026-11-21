// @vitest-environment jsdom
import { TicketId, type FigmaLinkMetadata, type FigmaRef } from "@pp/shared"
import { act, cleanup, renderHook } from "@testing-library/react"
import * as Schema from "effect/Schema"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  EditorServicesProvider,
  type EditorServices,
  type TicketTarget
} from "../services"
import { useFigmaMetadata } from "./figma-metadata"

const request: TicketTarget = {
  orgSlug: "org",
  slug: "project",
  ticketId: Schema.decodeSync(TicketId)("T-1")
}
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
  // Only Figma links are used here; Figma hasn't answered for any of them.
  const services = {
    useFigmaLinks: () => ({ links: [], refresh })
  } as unknown as EditorServices
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <EditorServicesProvider services={services}>
      {children}
    </EditorServicesProvider>
  )
  return { refresh, wrapper }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useFigmaMetadata", () => {
  it("stops polling unresolved metadata after fifteen refreshes", () => {
    vi.useFakeTimers()
    const { refresh, wrapper } = setup()
    renderHook(() => useFigmaMetadata(refA, request), { wrapper })

    advanceSeconds(30)

    expect(refresh).toHaveBeenCalledTimes(15)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("polls again after switching to another reference and back", () => {
    vi.useFakeTimers()
    const { refresh, wrapper } = setup()
    const { rerender } = renderHook<
      FigmaLinkMetadata | null,
      Readonly<{ ref: FigmaRef | null }>
    >(({ ref }) => useFigmaMetadata(ref, request), {
      initialProps: { ref: refA },
      wrapper
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
    const { refresh, wrapper } = setup()
    const { rerender } = renderHook(
      ({ ref }) => useFigmaMetadata(ref, request),
      {
        initialProps: { ref: refA },
        wrapper
      }
    )
    advanceSeconds(30)
    refresh.mockClear()

    rerender({ ref: refB })
    advanceSeconds(30)

    expect(refresh).toHaveBeenCalledTimes(15)
  })
})
