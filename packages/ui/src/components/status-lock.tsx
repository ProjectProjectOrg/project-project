import { AnimatePresence, motion } from "motion/react"
import type { ReactNode } from "react"

import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { Button } from "./button"
import { Lock } from "./icons"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

export type StatusLockRefusal = "dragging" | "over" | null

export function StatusLock({
  label,
  reason,
  open,
  className
}: Readonly<{
  label: string
  reason: ReactNode
  open?: boolean
  className?: string
}>) {
  return (
    <Tooltip open={open}>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="square-6"
            aria-label={label}
            className={cn("text-muted-foreground", className)}
          />
        }
        onClick={(event) => event.stopPropagation()}
      >
        <Lock className="size-3.5" strokeWidth={1.75} />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <span className="flex flex-col gap-0.5 text-left">
          <span className="font-semibold">{label}</span>
          <span>{reason}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

export function StatusLockNote({
  refusal,
  title,
  reason,
  className
}: Readonly<{
  refusal: StatusLockRefusal
  title: string
  reason: ReactNode
  className?: string
}>) {
  return (
    <AnimatePresence initial={false}>
      {refusal !== null ? (
        <motion.div
          key="note"
          role="status"
          initial={{ opacity: 0, y: -4, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
          transition={transitions.presence}
          data-over={refusal === "over" || undefined}
          className={cn(
            "status-lock-note flex items-start gap-2 rounded-[14px] px-3 py-2.5 text-caption [corner-shape:var(--button-corner)]",
            className
          )}
        >
          <Lock className="mt-px size-3.5 shrink-0" strokeWidth={1.75} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold">{title}</span>
            <span className="text-pretty">{reason}</span>
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
