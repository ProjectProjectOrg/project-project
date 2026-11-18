import { motion, useReducedMotion, type MotionValue } from "motion/react"

import { transitions } from "../../lib/springs"
import { cn } from "../../lib/utils"
import type { BlockDrag } from "./use-block-drag"

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
        "absolute top-0 z-20 max-h-80 origin-top overflow-hidden rounded-md bg-(color:--tooltip) transition-shadow duration-150",
        // The popup skin; while it's carried, the soft lift the selection
        // bar uses too.
        drag.settling
          ? "shadow-(--tooltip-edge)"
          : "shadow-[shadow:var(--tooltip-edge),var(--shadow-surface-4)]",
        drag.clamped &&
          "[mask-image:linear-gradient(to_bottom,black_80%,transparent)]"
      )}
    />
  )
}
