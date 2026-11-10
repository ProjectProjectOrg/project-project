import { motion, useReducedMotion } from "motion/react"

import { spring } from "@/lib/springs"

export function ProgressBar({
  ratio,
  label,
  size = "default"
}: Readonly<{
  ratio: number
  label: string
  size?: "default" | "compact"
}>) {
  const reduceMotion = useReducedMotion() ?? false
  const clamped = Math.min(1, Math.max(0, ratio))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={
        size === "compact"
          ? "h-1 w-12 overflow-hidden rounded-full bg-active"
          : "h-1 w-full overflow-hidden rounded-full bg-active"
      }
    >
      <motion.div
        className="h-full w-full origin-left rounded-full bg-foreground"
        initial={false}
        animate={{ scaleX: clamped }}
        transition={reduceMotion ? { duration: 0 } : spring.moderate}
      />
    </div>
  )
}
