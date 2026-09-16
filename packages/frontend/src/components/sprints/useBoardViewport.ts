import { useEffect, useLayoutEffect, useState, type RefObject } from "react"

export function useBoardViewport(ref: RefObject<HTMLDivElement | null>): {
  readonly height: number | null
  readonly hasRightOverflow: boolean
} {
  const [height, setHeight] = useState<number | null>(null)
  const [hasRightOverflow, setHasRightOverflow] = useState(true)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const scrollRoot = el.closest("[data-scroll-root]")
    const scrollContent = el.closest("[data-scroll-content]")
    const container =
      scrollRoot instanceof HTMLElement ? scrollRoot : document.body
    const paddingSource =
      scrollContent instanceof HTMLElement ? scrollContent : container
    const update = () => {
      const rect = el.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const style = window.getComputedStyle(paddingSource)
      const paddingBottom = Number.parseFloat(style.paddingBottom) || 0
      setHeight(Math.max(240, containerRect.bottom - rect.top - paddingBottom))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container, { box: "border-box" })
    for (let node: Element | null = el; node && node !== paddingSource;) {
      for (let prev = node.previousElementSibling; prev;) {
        ro.observe(prev, { box: "border-box" })
        prev = prev.previousElementSibling
      }
      node = node.parentElement
    }
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      setHasRightOverflow(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }
    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [ref])

  return { height, hasRightOverflow }
}
