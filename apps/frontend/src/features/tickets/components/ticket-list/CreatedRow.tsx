import { spring } from "@pp/ui/lib/springs"
import { cn } from "@pp/ui/lib/utils"
import { m as motion, useReducedMotion } from "motion/react"
import { useEffect, useState, type ComponentProps } from "react"

import { isFresh } from "@/features/tickets/lib/createdRow"

const LANDING_MS = 900

// A row that mounts as a new ticket fades and drops into place; rows that
// mount because the list scrolled show at once.
export function RowEnter({
  enter: initialEnter,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"
> &
  Readonly<{ enter: boolean }>) {
  const reduceMotion = useReducedMotion() ?? false

  const [animateOnMount] = useState(() => initialEnter)
  if (!animateOnMount)
    return <div className={cn("relative isolate", className)} {...props} />
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.moderate}
      className={cn("relative isolate", className)}
      {...props}
    />
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

export function LandingFlash({
  at,
  className,
  onDone
}: Readonly<{ at: number; className?: string; onDone: () => void }>) {
  const [left] = useState(() =>
    Math.max(0, 1 - (performance.now() - at) / LANDING_MS)
  )
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: left }}
      animate={{ opacity: 0 }}
      transition={{ duration: (left * LANDING_MS) / 1000, ease: "easeOut" }}
      onAnimationComplete={onDone}
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-md bg-foreground/10",
        className
      )}
    />
  )
}
