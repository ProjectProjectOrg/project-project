// How long scrolling has to stop before hover comes back.
const SETTLE = 150

/*
 * A ref callback for a scroll container: it carries `data-scrolling` while
 * it scrolls and for a moment after. Hover follows the pointer, not the
 * content, so while the content moves under a still pointer, rows and
 * controls show no hover (ListHoverScope pauses, and the content can drop
 * pointer events with `in-data-scrolling:pointer-events-none`); it all
 * comes back on the row under the pointer once scrolling settles.
 */
export const trackScrolling = (element: HTMLElement | null) => {
  if (!element) return undefined
  let settle: number | undefined
  const onScroll = () => {
    element.dataset.scrolling = ""
    window.clearTimeout(settle)
    settle = window.setTimeout(() => {
      delete element.dataset.scrolling
    }, SETTLE)
  }
  element.addEventListener("scroll", onScroll, { passive: true })
  return () => {
    element.removeEventListener("scroll", onScroll)
    window.clearTimeout(settle)
    delete element.dataset.scrolling
  }
}
