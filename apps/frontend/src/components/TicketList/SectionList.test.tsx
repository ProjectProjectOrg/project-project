import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TicketPagination } from "./SectionList"

describe("TicketPagination", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it.each([
    ["query change", "org/project:filter-a", "org/project:filter-b"],
    ["project change", "org/project-a:filter", "org/project-b:filter"]
  ])("loads again after a %s with the same cursor", (_, firstKey, nextKey) => {
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
    const observer = new IntersectionObserver(() => {})
    const entry: IntersectionObserverEntry = {
      boundingClientRect: new DOMRect(),
      intersectionRatio: 1,
      intersectionRect: new DOMRect(),
      isIntersecting: true,
      rootBounds: null,
      target: document.createElement("div"),
      time: 0
    }
    const intersect = () => observers.at(-1)?.([entry], observer)
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
      <TicketPagination {...props} requestKey={firstKey} />
    )

    intersect()
    expect(loadMore).toHaveBeenCalledTimes(1)
    intersect()
    expect(loadMore).toHaveBeenCalledTimes(1)

    rerender(<TicketPagination {...props} requestKey={nextKey} />)
    intersect()
    expect(loadMore).toHaveBeenCalledTimes(2)
  })
})
