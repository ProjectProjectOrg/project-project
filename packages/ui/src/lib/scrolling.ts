const SETTLE = 150

export const trackScrolling = (element: HTMLElement | null) => {
  if (!element) return undefined
  let settle: number | undefined
  let dragging = false
  const onScroll = () => {
    // Drop targets must stay hit-testable during any drag, files included.
    if (dragging) return
    element.dataset.scrolling = ""
    window.clearTimeout(settle)
    settle = window.setTimeout(() => {
      delete element.dataset.scrolling
    }, SETTLE)
  }
  const onDragStart = () => {
    dragging = true
  }
  const onDragEnd = () => {
    dragging = false
  }
  element.addEventListener("scroll", onScroll, { passive: true })
  document.addEventListener("dragstart", onDragStart, true)
  document.addEventListener("dragenter", onDragStart, true)
  document.addEventListener("dragend", onDragEnd, true)
  document.addEventListener("drop", onDragEnd, true)
  document.addEventListener("mousemove", onDragEnd, true)
  return () => {
    element.removeEventListener("scroll", onScroll)
    document.removeEventListener("dragstart", onDragStart, true)
    document.removeEventListener("dragenter", onDragStart, true)
    document.removeEventListener("dragend", onDragEnd, true)
    document.removeEventListener("drop", onDragEnd, true)
    document.removeEventListener("mousemove", onDragEnd, true)
    window.clearTimeout(settle)
    delete element.dataset.scrolling
  }
}
