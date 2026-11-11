import { useLayoutEffect, useRef, type ReactNode } from "react"

function translateYOf(node: HTMLElement) {
  const transform = getComputedStyle(node).transform
  return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42
}

export function SprintCardMotion({
  index,
  start,
  offset,
  hidden,
  reducedMotion,
  filterKey,
  children
}: {
  index: number
  start: number
  offset: number
  hidden: boolean
  reducedMotion: boolean
  filterKey: string
  children: ReactNode
}) {
  const element = useRef<HTMLDivElement>(null)
  const previous = useRef<Readonly<{
    index: number
    start: number
    offset: number
    hidden: boolean
    filterKey: string
  }> | null>(null)
  const animation = useRef<Animation | null>(null)

  useLayoutEffect(() => {
    const node = element.current
    if (!node) return
    const before = previous.current
    if (
      before &&
      before.start === start &&
      before.offset === offset &&
      before.hidden === hidden &&
      before.filterKey === filterKey
    ) {
      if (reducedMotion) animation.current?.cancel()
      return
    }
    const currentOffset =
      animation.current?.playState === "running"
        ? translateYOf(node)
        : (before?.offset ?? offset)
    const from = before ? before.start + currentOffset - start : offset
    animation.current?.cancel()
    node.style.transform = `translateY(${offset}px)`
    previous.current = { index, start, offset, hidden, filterKey }
    if (
      !before ||
      (before.index === index &&
        before.offset === offset &&
        before.hidden === hidden) ||
      before.hidden ||
      before.filterKey !== filterKey ||
      hidden ||
      reducedMotion ||
      Math.abs(from - offset) < 0.5
    )
      return
    animation.current = node.animate(
      [
        { transform: `translateY(${from}px)` },
        { transform: `translateY(${offset}px)` }
      ],
      { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    )
  }, [index, start, offset, hidden, reducedMotion, filterKey])

  useLayoutEffect(() => () => animation.current?.cancel(), [])

  return (
    <div
      ref={element}
      data-sprint-card-motion
      style={{
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : undefined
      }}
    >
      {children}
    </div>
  )
}
