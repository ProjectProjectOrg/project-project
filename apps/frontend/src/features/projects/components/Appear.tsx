import { enter, exit, fadeOnly, hidden } from "@pp/ui/lib/widthPresence"
import { AnimatePresence, motion } from "motion/react"
import type { ReactNode } from "react"

export const morphFrom = { opacity: 0, filter: "blur(4px)" }
export const morphTo = { opacity: 1, filter: "blur(0px)" }

// A part only some pages show (the Sprints page's New sprint), coming and
// going like a breadcrumb. `className` carries its distance from the part
// before it: padding inside the part's width, not the row's gap, so the
// distance closes with it.
export function Appear({
  show,
  reduce,
  className,
  children
}: {
  show: boolean
  reduce: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={reduce ? fadeOnly.hidden : hidden}
          animate={reduce ? fadeOnly.enter : enter}
          exit={reduce ? fadeOnly.exit : exit}
          className="shrink-0 overflow-clip [overflow-clip-margin:4px]"
        >
          <div className={className}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
