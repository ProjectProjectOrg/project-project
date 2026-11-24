const SETTLE = 150

export const trackScrolling = (element: HTMLElement | null) => {
  if (!element) return undefined
  let settle: number | undefined
  let dragging = false
  const onScrollEnd = () => {
    window.clearTimeout(settle)
    element.removeAttribute("data-scrolling")
  }
  const onScroll = () => {
    // Drop targets must stay hit-testable during any drag, files included.
    if (dragging) return
    element.toggleAttribute("data-scrolling", true)
    window.clearTimeout(settle)
    settle = window.setTimeout(onScrollEnd, SETTLE)
  }
  const onDragStart = () => {
    dragging = true
    onScrollEnd()
  }
  const onDragEnd = () => {
    dragging = false
  }
  element.addEventListener("scroll", onScroll, { passive: true })
  element.addEventListener("scrollend", onScrollEnd)
  document.addEventListener("dragstart", onDragStart, true)
  document.addEventListener("dragenter", onDragStart, true)
  document.addEventListener("dragend", onDragEnd, true)
  document.addEventListener("drop", onDragEnd, true)
  document.addEventListener("mousemove", onDragEnd, true)
  return () => {
    element.removeEventListener("scroll", onScroll)
    element.removeEventListener("scrollend", onScrollEnd)
    document.removeEventListener("dragstart", onDragStart, true)
    document.removeEventListener("dragenter", onDragStart, true)
    document.removeEventListener("dragend", onDragEnd, true)
    document.removeEventListener("drop", onDragEnd, true)
    document.removeEventListener("mousemove", onDragEnd, true)
    window.clearTimeout(settle)
    delete element.dataset.scrolling
  }
}
