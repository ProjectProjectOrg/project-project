import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Transition
} from "motion/react"
import { useState } from "react"

import type { ItemRect, UseFluidHoverReturn } from "@/hooks/useFluidHover"
import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

export type FluidHoverSource = Pick<
  UseFluidHoverReturn,
  "activeIndex" | "itemRects" | "isMeasured" | "sessionRef"
>

export type FluidHoverHighlightProps = Readonly<{
  hover: FluidHoverSource
  hidden?: boolean
  instant?: boolean
  fullWidth?: boolean
  className?: string
}>

const fade: Transition = { duration: 0.08 }
const snap: Transition = { duration: 0 }

const toTarget = (rect: ItemRect, fullWidth: boolean) =>
  fullWidth
    ? { y: rect.top, height: rect.height }
    : { x: rect.left, y: rect.top, width: rect.width, height: rect.height }

const activeRect = ({
  activeIndex,
  itemRects,
  isMeasured
}: FluidHoverSource): ItemRect | null =>
  isMeasured && activeIndex !== null ? (itemRects[activeIndex] ?? null) : null

export function FluidHoverHighlight({
  hover,
  hidden = false,
  instant = false,
  fullWidth = false,
  className
}: FluidHoverHighlightProps) {
  const rect = hidden ? null : activeRect(hover)
  const reduceMotion = useReducedMotion() ?? false
  const box =
    rect === null ? "" : `${rect.left}:${rect.top}:${rect.width}:${rect.height}`
  const [seen, setSeen] = useState({
    index: hover.activeIndex,
    box,
    moved: false
  })
  if (seen.index !== hover.activeIndex || seen.box !== box) {
    setSeen({
      index: hover.activeIndex,
      box,
      moved: seen.index !== hover.activeIndex
    })
  }
  const sameRow = !seen.moved
  return (
    <AnimatePresence>
      {rect && (
        <motion.div
          key={hover.sessionRef.current}
          data-slot="fluid-hover-highlight"
          className={cn(
            "pointer-events-none absolute top-0 left-0 bg-hover",
            className
          )}
          style={fullWidth ? { left: rect.left, right: rect.left } : undefined}
          initial={{ opacity: 0, ...toTarget(rect, fullWidth) }}
          animate={{ opacity: 1, ...toTarget(rect, fullWidth) }}
          exit={{ opacity: 0, transition: spring.fast.exit }}
          transition={{
            ...(reduceMotion || instant || sameRow ? snap : spring.fast),
            opacity: fade
          }}
        />
      )}
    </AnimatePresence>
  )
}
