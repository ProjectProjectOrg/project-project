import { motion } from "motion/react"
import type { ReactNode } from "react"

import { spring } from "@/lib/springs"

const shown = { opacity: 1, scale: 1, filter: "blur(0px)" }
const hidden = { opacity: 0, scale: 0.6, filter: "blur(4px)" }
const enter = {
  type: "tween" as const,
  duration: spring.fast.duration,
  ease: "easeOut" as const
}
const leave = {
  type: "tween" as const,
  ...spring.fast.exit,
  ease: "easeIn" as const
}

export function IconSwap({
  showSecond,
  first,
  second
}: Readonly<{ showSecond: boolean; first: ReactNode; second: ReactNode }>) {
  return (
    <span className="grid size-4 shrink-0 place-items-center">
      <motion.span
        aria-hidden={showSecond}
        className="col-start-1 row-start-1 flex"
        initial={false}
        animate={showSecond ? hidden : shown}
        transition={showSecond ? leave : enter}
      >
        {first}
      </motion.span>
      <motion.span
        aria-hidden={!showSecond}
        className="col-start-1 row-start-1 flex"
        initial={false}
        animate={showSecond ? shown : hidden}
        transition={showSecond ? enter : leave}
      >
        {second}
      </motion.span>
    </span>
  )
}
