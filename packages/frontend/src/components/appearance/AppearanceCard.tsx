import { motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

function useSharedTransition() {
  const reduce = useReducedMotion() ?? false
  return reduce ? { duration: 0 } : transitions.morph
}

export function AppearanceCard({
  children,
  className
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg border border-border bg-card",
        className
      )}
    >
      {children}
    </div>
  )
}

export function AppearanceRow({
  thumb,
  label,
  detail,
  action,
  shareId
}: {
  thumb: ReactNode
  label: string
  detail: string
  action?: ReactNode
  shareId?: string
}) {
  const shared = useSharedTransition()
  return (
    <div className="flex items-center gap-3 p-3">
      {thumb}
      <span className="flex min-w-0 flex-1 flex-col">
        <motion.span
          layoutId={shareId && `${shareId}-label`}
          transition={shared}
          className="w-fit truncate text-[13px] font-medium"
        >
          {label}
        </motion.span>
        <span className="truncate text-[13px] text-muted-foreground">
          {detail}
        </span>
      </span>
      {action ? (
        <motion.span
          layoutId={shareId && `${shareId}-action`}
          transition={shared}
          className="inline-flex"
        >
          {action}
        </motion.span>
      ) : null}
    </div>
  )
}

export function EditorHeader({
  title,
  onCancel,
  shareId
}: {
  title: string
  onCancel: () => void
  shareId?: string
}) {
  const shared = useSharedTransition()
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
      <motion.span
        layoutId={shareId && `${shareId}-label`}
        transition={shared}
        className="w-fit text-[13px] font-medium"
      >
        {title}
      </motion.span>
      <motion.span
        layoutId={shareId && `${shareId}-action`}
        transition={shared}
        className="inline-flex"
      >
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {m.project_appearance_cancel()}
        </Button>
      </motion.span>
    </div>
  )
}

export function StepSummaryRow({
  thumb,
  label,
  value,
  onChange
}: {
  thumb: ReactNode
  label: string
  value: string
  onChange: () => void
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
      {thumb}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate text-[13px]">{value}</span>
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onChange}>
        {m.project_appearance_change()}
      </Button>
    </div>
  )
}

export function StepHeading({
  current,
  total,
  children
}: {
  current: number
  total: number
  children: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [current])

  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-xs text-muted-foreground">
        {m.project_appearance_step_of({ current, total })}
      </span>
      <h3
        ref={heading}
        tabIndex={-1}
        className="text-[13px] font-medium outline-none"
      >
        {children}
      </h3>
    </div>
  )
}
