import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TicketPagination } from "./SectionList"

describe("TicketPagination", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("loads again when a new query has the same first-page cursor", () => {
    const observers: Array<IntersectionObserverCallback> = []
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          observers.push(callback)
        }
        observe() {}
        disconnect() {}
      }
    )
    const loadMore = vi.fn<() => void>()
    const props = {
      nextCursor: "same-cursor",
      remaining: 60,
      collapsed: false,
      loadingMore: false,
      failed: false,
      loadMore
    }
    const { rerender } = render(
      <TicketPagination {...props} requestKey="filter-a" />
    )

    observers.at(-1)?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
    expect(loadMore).toHaveBeenCalledTimes(1)
    observers.at(-1)?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
    expect(loadMore).toHaveBeenCalledTimes(1)

    rerender(<TicketPagination {...props} requestKey="filter-b" />)
    observers.at(-1)?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
    expect(loadMore).toHaveBeenCalledTimes(2)
  })
})
