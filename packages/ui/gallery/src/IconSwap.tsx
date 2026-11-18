import { AnimatePresence, motion } from "motion/react"
import type { ReactNode } from "react"

const shown = {
  opacity: 1,
  filter: "blur(0px)",
  scale: 1,
  transition: { type: "tween", duration: 0.08, ease: "easeOut" }
} as const

const hidden = {
  opacity: 0,
  filter: "blur(4px)",
  scale: 0.6,
  transition: { type: "tween", duration: 0.06, ease: "easeIn" }
} as const

export function IconSwap({
  swapKey,
  children
}: Readonly<{ swapKey: string; children: ReactNode }>) {
  return (
    <span className="grid size-3.5 place-items-center [&>*]:col-start-1 [&>*]:row-start-1">
      <AnimatePresence initial={false}>
        <motion.span
          key={swapKey}
          className="grid place-items-center"
          initial={hidden}
          animate={shown}
          exit={hidden}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
