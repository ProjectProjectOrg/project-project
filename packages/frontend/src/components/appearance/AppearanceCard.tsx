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
  onActivate,
  shareId,
  thumbShareId
}: {
  thumb: ReactNode
  label: string
  detail: string
  action?: ReactNode
  onActivate?: () => void
  shareId?: string
  thumbShareId?: string
}) {
  const shared = useSharedTransition()
  const content = (
    <>
      <motion.span
        layoutId={thumbShareId}
        transition={shared}
        className="inline-flex"
      >
        {thumb}
      </motion.span>
      <span className="flex min-w-0 flex-1 flex-col text-left">
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
    </>
  )

  if (!onActivate)
    return <div className="flex items-center gap-3 p-3">{content}</div>

  return (
    <button
      type="button"
      onClick={onActivate}
      className="flex w-full cursor-pointer items-center gap-3 rounded-lg p-3 outline-none transition-all duration-100 hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      {content}
    </button>
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
  onChange,
  shareId,
  thumbShareId
}: {
  thumb: ReactNode
  label: string
  value: string
  onChange: () => void
  shareId?: string
  thumbShareId?: string
}) {
  const shared = useSharedTransition()
  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
      <motion.span
        layoutId={thumbShareId ?? (shareId && `${shareId}-thumb`)}
        transition={shared}
        className="inline-flex"
      >
        {thumb}
      </motion.span>
      <span className="flex min-w-0 flex-1 flex-col">
        <motion.span
          layoutId={shareId && `${shareId}-eyebrow`}
          transition={shared}
          className="w-fit text-xs text-muted-foreground"
        >
          {label}
        </motion.span>
        <motion.span
          layoutId={shareId && `${shareId}-title`}
          transition={shared}
          className="truncate text-[13px]"
        >
          {value}
        </motion.span>
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
  children,
  shareId
}: {
  current: number
  total: number
  children: ReactNode
  shareId?: string
}) {
  const shared = useSharedTransition()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [current])

  return (
    <div className="flex items-baseline gap-2.5">
      <motion.span
        layoutId={shareId && `${shareId}-eyebrow`}
        transition={shared}
        className="w-fit text-xs text-muted-foreground"
      >
        {m.project_appearance_step_of({ current, total })}
      </motion.span>
      <motion.h3
        ref={heading}
        layoutId={shareId && `${shareId}-title`}
        transition={shared}
        tabIndex={-1}
        className="text-[13px] font-medium outline-none"
      >
        {children}
      </motion.h3>
    </div>
  )
}
