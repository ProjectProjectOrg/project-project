import Scritto from "@scritto/react"
import { AnimatePresence, motion } from "motion/react"
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { blurSwap, transitions } from "../lib/springs"
import { cn } from "../lib/utils"

// Shows a value changing: the old one blurs out while the new one blurs in,
// stacked in one grid cell, and the width eases from the old value's width
// to the new one's, so whatever holds it (a badge, a ghost button, a compact
// trigger) resizes smoothly instead of jumping. Give it the value's identity
// as `id`; a new id starts a swap, and a new id mid-swap simply starts the
// next one (each value is its own keyed span), so it is safe to change as
// fast as people click.
//
// The rule: whenever a control shows a value that the user just changed (a
// select's chosen option, for now), the change plays through BlurSwap.
function BlurSwap({
  id,
  children,
  className
}: Readonly<{ id: string; children: ReactNode; className?: string }>) {
  // EXPERIMENT (exp/scritto): plain-text values roll per glyph through
  // Scritto (https://scrit.to), which also eases the width. Values with
  // icons or other elements keep the blur swap below.
  if (typeof children === "string" || typeof children === "number")
    return (
      <Scritto
        value={String(children)}
        // A normal change of state: transitions.morph (260ms).
        transition={{ duration: transitions.morph.duration * 1000 }}
        className={cn("max-w-full min-w-0", className)}
      />
    )
  return (
    <BlurSwapNodes id={id} className={className}>
      {children}
    </BlurSwapNodes>
  )
}

function BlurSwapNodes({
  id,
  children,
  className
}: Readonly<{ id: string; children: ReactNode; className?: string }>) {
  const current = useRef<HTMLSpanElement | null>(null)
  const [width, setWidth] = useState<
    Readonly<{ value: number | "auto"; instant: boolean }>
  >({ value: "auto", instant: true })
  const measured = useRef(false)

  // Follow the incoming value's own content width (scrollWidth, so it can grow
  // past the current width); a long value still truncates inside a parent
  // that has less room.
  useLayoutEffect(() => {
    const node = current.current
    if (!node) return undefined
    const update = () => {
      const next = Math.ceil(node.scrollWidth)
      setWidth({ value: next, instant: !measured.current })
      measured.current = true
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- each new id is a new node to measure
  }, [id])

  return (
    <motion.span
      initial={false}
      animate={{ width: width.value }}
      transition={
        width.instant ? { duration: 0 } : { width: transitions.presence }
      }
      className={cn(
        "inline-grid max-w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center overflow-hidden",
        className
      )}
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={id}
          ref={(node: HTMLSpanElement | null) => {
            if (node) current.current = node
          }}
          variants={blurSwap}
          initial="hidden"
          animate="shown"
          exit="hidden"
          className="col-start-1 row-start-1 flex max-w-full min-w-0 items-center gap-[inherit] justify-self-start truncate whitespace-nowrap"
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}

export { BlurSwap }
