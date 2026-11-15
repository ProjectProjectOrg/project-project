import { motion, type Transition } from "motion/react"
import type { ReactNode } from "react"
import { useLayoutEffect, useRef, useState } from "react"

import { transitions } from "../lib/springs"

// Collapses a label to nothing and back (a toolbar trigger going compact),
// easing its width and fading it. To animate a change of the label's text,
// put a TextSwap inside.
export function CollapsingLabel({
  show,
  children,
  gap = 8,
  transition = transitions.presence
}: Readonly<{
  show: boolean
  children: ReactNode
  gap?: number
  /** Width and fade timing; defaults to the presence transition. */
  transition?: Transition
}>) {
  const innerRef = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState<
    Readonly<{ width: number | "auto"; instant: boolean }>
  >({ width: "auto", instant: true })

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    setSize({ width: el.offsetWidth, instant: true })
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({
          width: Math.ceil(
            entry.borderBoxSize[0]?.inlineSize ?? el.offsetWidth
          ),
          instant: false
        })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <motion.span
      initial={false}
      animate={
        show
          ? { width: size.width, opacity: 1, marginLeft: 0 }
          : { width: 0, opacity: 0, marginLeft: -gap }
      }
      transition={{
        ...transition,
        width: size.instant ? { duration: 0 } : transition
      }}
      aria-hidden={!show}
      className="inline-flex items-center overflow-hidden whitespace-nowrap"
    >
      <span ref={innerRef} className="inline-flex shrink-0 items-center">
        {children}
      </span>
    </motion.span>
  )
}
