import { useReducedMotion } from "motion/react"
import { useLayoutEffect, useRef } from "react"

// One motion for everything that moves in a segmented control: the pill's
// slide and the labels that open and close with it. A light overshoot, so
// the pill settles like a spring.
export const SEGMENT_MOTION = {
  durationMs: 280,
  ease: [0.34, 1.3, 0.5, 1] as const
}

const SEGMENT_EASING = `cubic-bezier(${SEGMENT_MOTION.ease.join(", ")})`

export function SegmentedIndicator({
  activeIndex,
  className
}: {
  activeIndex: number
  className: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const previous = useRef<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const animation = useRef<Animation | null>(null)
  // When the current slide ends. Labels that open and close alongside the
  // pill keep moving its target; each resize retargets the slide to land at
  // this same moment instead of starting a fresh one that trails behind.
  const endsAt = useRef(0)
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    const node = ref.current
    const root = node?.parentElement
    if (!root || !node) return undefined
    const tabs = Array.from(root.children).filter(
      (child) => !child.hasAttribute("data-native-tab-indicator")
    )
    const target = tabs[activeIndex]
    if (!(target instanceof HTMLElement)) {
      animation.current?.cancel()
      node.style.visibility = "hidden"
      previous.current = null
      return undefined
    }
    const update = (fresh: boolean) => {
      const next = {
        left: target.offsetLeft,
        top: target.offsetTop,
        width: target.offsetWidth,
        height: target.offsetHeight
      }
      if (!next.width || !next.height) return
      const before = previous.current
      if (reducedMotion) animation.current?.cancel()
      if (
        before &&
        next.left === before.left &&
        next.top === before.top &&
        next.width === before.width &&
        next.height === before.height
      )
        return
      const transform = getComputedStyle(node).transform
      const current =
        transform === "none"
          ? new DOMMatrixReadOnly()
          : new DOMMatrixReadOnly(transform)
      animation.current?.cancel()
      const destination = `translate(${next.left}px, ${next.top}px)`
      node.style.width = `${next.width}px`
      node.style.height = `${next.height}px`
      node.style.transform = destination
      node.style.visibility = "visible"
      previous.current = next
      if (!before || reducedMotion) return
      const now = performance.now()
      if (fresh) endsAt.current = now + SEGMENT_MOTION.durationMs
      const remaining = endsAt.current - now
      if (remaining < 16) return
      animation.current = node.animate(
        [
          {
            transform: `translate(${current.m41}px, ${current.m42}px) scaleX(${(before.width * current.m11) / next.width})`
          },
          { transform: destination }
        ],
        {
          duration: remaining,
          easing: fresh ? SEGMENT_EASING : "cubic-bezier(0.22, 1, 0.36, 1)"
        }
      )
    }
    update(true)
    const observer = new ResizeObserver(() => update(false))
    observer.observe(root)
    for (const tab of tabs) observer.observe(tab)
    return () => observer.disconnect()
  }, [activeIndex, reducedMotion])

  useLayoutEffect(() => () => animation.current?.cancel(), [])

  return (
    <span
      ref={ref}
      aria-hidden
      data-native-tab-indicator
      className={className}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transformOrigin: "top left",
        pointerEvents: "none",
        visibility: "hidden"
      }}
    />
  )
}
