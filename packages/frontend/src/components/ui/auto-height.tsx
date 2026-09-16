import { motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"

export function AutoHeight({
  children,
  className
}: {
  children: ReactNode
  className?: string
}) {
  const content = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()
  const reduce = useReducedMotion() ?? false

  useEffect(() => {
    const node = content.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.contentRect.height)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <motion.div
      initial={false}
      animate={{ height: height ?? "auto" }}
      transition={reduce ? { duration: 0 } : transitions.morph}
      className={cn("relative overflow-hidden", className)}
    >
      <div ref={content}>{children}</div>
    </motion.div>
  )
}
