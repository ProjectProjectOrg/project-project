import {
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform
} from "motion/react"
import { useState } from "react"

const PEEK_MIN_VIEWPORT = 720
const WIPE = { type: "spring", visualDuration: 0.16, bounce: 0 } as const
const OPEN_WIDTH = 42
const CLOSED_WIDTH = 100

export const peekFits = () => window.innerWidth >= PEEK_MIN_VIEWPORT

export function usePeekWipe() {
  const reduceMotion = useReducedMotion() ?? false
  const width = useMotionValue(CLOSED_WIDTH)
  const listWidth = useTransform(width, (value) => `${value}%`)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const toggle = (next: boolean) => {
    if (next === open) return
    setOpen(next)
    if (next) setMounted(true)
    const target = next ? OPEN_WIDTH : CLOSED_WIDTH
    if (reduceMotion) {
      width.jump(target)
      if (!next) setMounted(false)
      return
    }
    void animate(width, target, WIPE).then(() => {
      if (width.get() === CLOSED_WIDTH) setMounted(false)
    })
  }

  return {
    mounted,
    active: open,
    style: { width: listWidth },
    open: () => toggle(true),
    close: () => toggle(false)
  }
}
