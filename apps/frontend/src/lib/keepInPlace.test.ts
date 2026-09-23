import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { keepInPlace } from "./keepInPlace"

const VIEWPORT = 500

// jsdom has no layout, so model the shell's scroll root by hand: content of a
// given height, the spacer's inline height, and the browser's scrollTop clamp.
function shell(contentHeight: number, anchorOffset: number) {
  const layout = { contentHeight, anchorOffset, sticky: false }
  const root = document.createElement("div")
  root.dataset.scrollRoot = ""
  const content = document.createElement("div")
  content.dataset.scrollContent = ""
  const spacer = document.createElement("div")
  spacer.dataset.scrollSpacer = ""
  const anchor = document.createElement("div")
  content.append(anchor)
  root.append(content, spacer)
  document.body.append(root)

  const spacerHeight = () => Number.parseFloat(spacer.style.height) || 0
  const scrollHeight = () =>
    Math.max(VIEWPORT, layout.contentHeight + spacerHeight())
  let rawScrollTop = 0
  const scrollTop = () =>
    Math.min(Math.max(0, rawScrollTop), scrollHeight() - VIEWPORT)

  Object.defineProperties(root, {
    clientHeight: { get: () => VIEWPORT },
    scrollHeight: { get: scrollHeight },
    scrollTop: {
      get: scrollTop,
      set: (value: number) => {
        rawScrollTop = value
      }
    }
  })
  Object.defineProperty(spacer, "offsetHeight", { get: spacerHeight })
  anchor.getBoundingClientRect = () => {
    const top = layout.anchorOffset - scrollTop()
    const y = layout.sticky ? Math.max(0, top) : top
    return DOMRect.fromRect({ y, height: 40 })
  }

  const scrollTo = (value: number) => {
    root.scrollTop = value
    root.dispatchEvent(new Event("scroll"))
  }
  return { root, anchor, layout, spacerHeight, scrollTo }
}

class NoopResizeObserver {
  observe() {}
  disconnect() {}
}

describe("keepInPlace", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", NoopResizeObserver)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it("keeps a header in place when collapsing at the page end would clamp the scroll", () => {
    const { root, anchor, layout, spacerHeight } = shell(2000, 1600)
    root.scrollTop = 1500
    expect(anchor.getBoundingClientRect().top).toBe(100)

    keepInPlace(anchor, () => {
      layout.contentHeight = 1700
    })

    expect(anchor.getBoundingClientRect().top).toBe(100)
    expect(root.scrollTop).toBe(1500)
    expect(spacerHeight()).toBe(300)
  })

  it("gives the spacer back as the reader scrolls up", () => {
    const { root, anchor, layout, spacerHeight, scrollTo } = shell(2000, 1600)
    root.scrollTop = 1500
    keepInPlace(anchor, () => {
      layout.contentHeight = 1700
    })

    scrollTo(1300)
    expect(spacerHeight()).toBe(100)
    scrollTo(1400)
    expect(spacerHeight()).toBe(100)
    scrollTo(1000)
    expect(spacerHeight()).toBe(0)
    expect(
      root.querySelector<HTMLElement>("[data-scroll-spacer]")?.style.height
    ).toBe("")
  })

  it("scrolls a stuck sticky header back into view instead of dropping into later sections", () => {
    const { root, anchor, layout, spacerHeight } = shell(5000, 1000)
    layout.sticky = true
    root.scrollTop = 1800
    expect(anchor.getBoundingClientRect().top).toBe(0)

    // Once its body is gone the section is just the header, so it unsticks.
    keepInPlace(anchor, () => {
      layout.contentHeight = 3500
      layout.sticky = false
    })

    expect(root.scrollTop).toBe(1000)
    expect(anchor.getBoundingClientRect().top).toBe(0)
    expect(spacerHeight()).toBe(0)
  })

  it("pins the bottom edge for show-less so the button stays under the cursor", () => {
    const { root, anchor, layout } = shell(4000, 1400)
    root.scrollTop = 1000
    const bottom = anchor.getBoundingClientRect().bottom

    keepInPlace(
      anchor,
      () => {
        layout.anchorOffset = 900
        layout.contentHeight = 3500
      },
      "bottom"
    )

    expect(root.scrollTop).toBe(500)
    expect(anchor.getBoundingClientRect().bottom).toBe(bottom)
  })

  it("leaves the scroll alone when the header did not move", () => {
    const { root, anchor, layout, spacerHeight } = shell(4000, 600)
    root.scrollTop = 300

    keepInPlace(anchor, () => {
      layout.contentHeight = 3000
    })

    expect(root.scrollTop).toBe(300)
    expect(spacerHeight()).toBe(0)
  })
})
