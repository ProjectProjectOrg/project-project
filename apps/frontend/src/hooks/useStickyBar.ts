import { useLayoutEffect, type RefObject } from "react"

const toPixels = (height: number) => `${height}px`

/**
 * Sets `data-stuck` on a `position: sticky` element while it is pinned inside
 * the shell's scroll root, so it can paint a background or fade only once
 * content scrolls under it.
 *
 * Nothing runs per scroll: an IntersectionObserver watches the element
 * against the scroll root with its top edge pulled in to 1px below the
 * element's sticky `top`. A pinned element pokes past that edge, so it stops
 * being fully visible while sitting above it. The observer is rebuilt only
 * when the sticky offset changes, which happens on layout, not on scroll.
 */
export function useStuck(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const element = ref.current
    const root = element?.closest<HTMLElement>("[data-scroll-root]")
    const content = root?.querySelector(":scope > [data-scroll-content]")
    if (!element || !root) return undefined
    let offset: number | null = null
    let intersection: IntersectionObserver | null = null
    const observe = () => {
      const next = Number.parseFloat(getComputedStyle(element).top) || 0
      if (next === offset) return
      offset = next
      intersection?.disconnect()
      intersection = new IntersectionObserver(
        ([entry]) => {
          const bounds = entry.rootBounds
          element.toggleAttribute(
            "data-stuck",
            bounds !== null &&
              entry.intersectionRatio < 1 &&
              entry.boundingClientRect.top < bounds.top
          )
        },
        {
          root,
          rootMargin: `-${Math.floor(next) + 1}px 0px 0px 0px`,
          // 0 as well: a jump from off-screen straight to pinned goes from 0 to
          // just under 1 and would cross no threshold at 1 alone.
          threshold: [0, 1]
        }
      )
      intersection.observe(element)
    }
    observe()
    const layout = new ResizeObserver(observe)
    layout.observe(element)
    if (content) layout.observe(content)
    return () => {
      layout.disconnect()
      intersection?.disconnect()
    }
  }, [ref])
}

/**
 * A sticky bar that other sticky elements offset below: writes the bar's
 * border-box height into `variable` on the bar's parent, and flags
 * `data-stuck` like `useStuck`.
 */
export function useStickyBar(
  ref: RefObject<HTMLElement | null>,
  variable: string,
  toValue: (height: number) => string = toPixels
) {
  useStuck(ref)
  useLayoutEffect(() => {
    const bar = ref.current
    const scope = bar?.parentElement
    if (!bar || !scope) return undefined
    // Rounded down to whole pixels: fractional sticky offsets get snapped per
    // layer while scrolling, so stacked bars jitter by a pixel and open a
    // hairline gap. Flooring makes the next bar tuck a fraction under this one
    // instead, which sits above it.
    const measure = () => {
      scope.style.setProperty(
        variable,
        toValue(Math.floor(bar.getBoundingClientRect().height))
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => {
      observer.disconnect()
      scope.style.removeProperty(variable)
    }
  }, [ref, variable, toValue])
}
