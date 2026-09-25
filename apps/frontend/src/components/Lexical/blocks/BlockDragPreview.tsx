import { motion, useReducedMotion, type MotionValue } from "motion/react"

import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"

import type { BlockDrag } from "./useBlockDrag"

const LIFTED_SCALE = 1.015

export function BlockDragPreview({
  drag,
  y
}: Readonly<{ drag: BlockDrag; y: MotionValue<number> }>) {
  const reduceMotion = useReducedMotion() ?? false
  const lifted = !drag.settling && !reduceMotion
  return (
    <motion.div
      aria-hidden
      data-block-drag-preview
      ref={(node) => node?.replaceChildren(drag.clone)}
      initial={{ scale: 1, opacity: 1 }}
      animate={{ scale: lifted ? LIFTED_SCALE : 1, opacity: lifted ? 0.95 : 1 }}
      transition={reduceMotion ? { duration: 0 } : transitions.pop}
      style={{ y, left: drag.left, width: drag.width }}
      className={cn(
        "absolute top-0 z-20 max-h-80 origin-top overflow-hidden rounded-md bg-popover transition-shadow duration-150",
        drag.settling ? "shadow-none" : "shadow-md",
        drag.clamped &&
          "[mask-image:linear-gradient(to_bottom,black_80%,transparent)]"
      )}
    />
  )
}
