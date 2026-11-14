import { AnimatePresence, motion, type Transition } from "motion/react"
import type { ReactNode } from "react"
import { useLayoutEffect, useRef, useState } from "react"

import { transitions } from "../lib/springs"

export function CollapsingLabel({
  show,
  children,
  contentKey,
  gap = 8,
  transition = transitions.presence
}: Readonly<{
  show: boolean
  children: ReactNode
  contentKey?: string | number
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
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={contentKey ?? "content"}
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)" }}
            transition={transitions.presence}
            className="inline-flex items-center"
          >
            {children}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.span>
  )
}
