import { spring } from "@pp/ui/lib/springs"
import { cn } from "@pp/ui/lib/utils"
import { m as motion, useReducedMotion } from "motion/react"
import { useEffect, useState, type ReactNode } from "react"

import { isFresh } from "@/features/tickets/lib/createdRow"

import { LandingFlash } from "./ListRowDrag"

// A row that mounts as a new ticket fades and drops into place; rows that
// mount because the list scrolled show at once.
export function RowEnter({
  enter: initialEnter,
  className,
  children
}: Readonly<{ enter: boolean; className?: string; children: ReactNode }>) {
  const reduceMotion = useReducedMotion() ?? false

  const [animateOnMount] = useState(() => initialEnter)
  if (!animateOnMount)
    return <div className={cn("relative isolate", className)}>{children}</div>
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.moderate}
      className={cn("relative isolate", className)}
    >
      {children}
    </motion.div>
  )
}

// The landing flash of a dropped row, played once on a just-created one.
export function CreatedFlash({
  at,
  className = "rounded-lg",
  onDone
}: Readonly<{ at: number; className?: string; onDone: () => void }>) {
  const [start] = useState(() => (isFresh(at) ? performance.now() : null))
  useEffect(() => {
    if (start === null) onDone()
  }, [start, onDone])
  if (start === null) return null
  return <LandingFlash at={start} className={className} onDone={onDone} />
}
