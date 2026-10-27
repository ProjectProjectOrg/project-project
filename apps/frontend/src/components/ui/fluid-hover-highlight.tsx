import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Transition
} from "motion/react"

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
  className?: string
}>

const fade: Transition = { duration: 0.08 }
const snap: Transition = { duration: 0 }

const toTarget = (rect: ItemRect) => ({
  x: rect.left,
  y: rect.top,
  width: rect.width,
  height: rect.height
})

const activeRect = ({
  activeIndex,
  itemRects,
  isMeasured
}: FluidHoverSource): ItemRect | null =>
  isMeasured && activeIndex !== null ? (itemRects[activeIndex] ?? null) : null

export function FluidHoverHighlight({
  hover,
  hidden = false,
  className
}: FluidHoverHighlightProps) {
  const rect = hidden ? null : activeRect(hover)
  const reduceMotion = useReducedMotion() ?? false
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
          initial={{ opacity: 0, ...toTarget(rect) }}
          animate={{ opacity: 1, ...toTarget(rect) }}
          exit={{ opacity: 0, transition: spring.fast.exit }}
          transition={{
            ...(reduceMotion ? snap : spring.fast),
            opacity: fade
          }}
        />
      )}
    </AnimatePresence>
  )
}
