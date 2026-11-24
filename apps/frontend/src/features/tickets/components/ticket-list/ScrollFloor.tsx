import { useLayoutEffect, useRef } from "react"

// Scrolled to the bottom, a list that loses a row (deleted, archived, moved
// out of the view) would pull the page down by that row: the browser clamps
// the scroll to the shorter page. The floor holds the page's old extent with
// an invisible marker in the scroll root, so the rows below slide up into
// the space instead, and gives the space back as you scroll up. It only
// holds while some of the content stays in view, so a filter that empties
// the list doesn't leave you facing a blank page.
export function ScrollFloor() {
  const marker = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const root = marker.current?.closest<HTMLElement>("[data-scroll-root]")
    const content = root?.querySelector<HTMLElement>("[data-scroll-content]")
    if (!root || !content) return undefined
    const floor = document.createElement("div")
    floor.setAttribute("aria-hidden", "")
    floor.style.cssText =
      "position:absolute;left:0;width:1px;height:1px;visibility:hidden;pointer-events:none"
    const contentBottom = () => content.offsetTop + content.offsetHeight
    let held = 0
    let lastTop = root.scrollTop
    let lastBottom = contentBottom()
    const hold = (extent: number) => {
      held = extent
      if (extent === 0) return floor.remove()
      floor.style.top = `${extent - 1}px`
      if (!floor.isConnected) root.append(floor)
    }
    const sync = () => {
      const bottom = contentBottom()
      const view = root.clientHeight
      if (bottom < lastBottom && root.scrollTop < lastTop && bottom > lastTop) {
        hold(Math.max(held, lastTop + view))
        root.scrollTop = lastTop
      } else if (held > 0) {
        const extent = Math.min(held, root.scrollTop + view)
        hold(extent > bottom ? extent : 0)
      }
      lastTop = root.scrollTop
      lastBottom = bottom
    }
    const onScroll = () => {
      const top = root.scrollTop
      if (held || top < lastTop) sync()
      else lastTop = top
    }
    const resizes = new ResizeObserver(sync)
    resizes.observe(content)
    resizes.observe(root)
    root.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => {
      resizes.disconnect()
      root.removeEventListener("scroll", onScroll, true)
      floor.remove()
    }
  }, [])

  return <span ref={marker} hidden />
}
