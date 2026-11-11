import { animate, motionValue, type MotionValue } from "motion/react"

import { spring } from "@/lib/springs"

export type ScrollMargin = Readonly<{ top: number; bottom: number }>

export const rowScrollTarget = (
  viewport: HTMLElement,
  row: HTMLElement,
  margin: ScrollMargin
): number | null => {
  const viewportTop = viewport.getBoundingClientRect().top
  const rowRect = row.getBoundingClientRect()
  const top = rowRect.top - viewportTop + viewport.scrollTop - margin.top
  const bottom =
    rowRect.bottom - viewportTop + viewport.scrollTop + margin.bottom
  const visibleTop = viewport.scrollTop
  const wanted =
    top < visibleTop
      ? top
      : bottom > visibleTop + viewport.clientHeight
        ? bottom - viewport.clientHeight
        : null
  if (wanted === null) return null
  return Math.max(
    0,
    Math.min(wanted, viewport.scrollHeight - viewport.clientHeight)
  )
}

const positions = new WeakMap<HTMLElement, MotionValue<number>>()

const positionOf = (viewport: HTMLElement): MotionValue<number> => {
  const existing = positions.get(viewport)
  if (existing !== undefined) return existing
  const position = motionValue(viewport.scrollTop)
  position.on("change", (value) => {
    viewport.scrollTop = Math.round(value * devicePixelRatio) / devicePixelRatio
  })
  positions.set(viewport, position)
  return position
}

export const scrollViewportTo = (
  viewport: HTMLElement,
  target: number,
  instant: boolean
): (() => void) | null => {
  const position = positionOf(viewport)
  if (!position.isAnimating()) position.jump(viewport.scrollTop)
  if (target === position.get()) return null
  if (instant) {
    position.jump(target)
    return null
  }
  const controls = animate(position, target, spring.fast)
  return () => controls.stop()
}
