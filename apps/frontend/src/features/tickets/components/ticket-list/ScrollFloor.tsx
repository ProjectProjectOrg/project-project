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
    root.append(floor)
    const followScroll = () => {
      floor.style.top = `${Math.max(0, root.scrollTop + root.clientHeight - 1)}px`
    }
    let frame: number | undefined
    const onScroll = () => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        followScroll()
      })
    }
    const onResize = () => {
      if (root.scrollTop >= content.offsetTop + content.offsetHeight) {
        floor.style.top = "0px"
      }
      followScroll()
    }
    followScroll()
    const resizes = new ResizeObserver(onResize)
    resizes.observe(content)
    resizes.observe(root)
    root.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      resizes.disconnect()
      root.removeEventListener("scroll", onScroll)
      floor.remove()
    }
  }, [])

  return <span ref={marker} hidden />
}
