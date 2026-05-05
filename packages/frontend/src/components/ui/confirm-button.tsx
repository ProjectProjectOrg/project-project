// ConfirmButton — compound primitive for "click → reveal a small inline
// confirm row → submit or cancel". Lighter than InlineForm: there's no
// Idle/Actions/Display split, no multiple form modes; just one button that
// crossfades into one confirm UI. Use it when the action needs a moment of
// "are you sure?" or a quick parameter (e.g. draft vs ready PR) without
// pulling out the full InlineForm shape.
//
// Compound API:
//
//   <ConfirmButton.Root>
//     <ConfirmButton.Trigger leadingIcon={GitPullRequest} size="sm">
//       Open PR
//     </ConfirmButton.Trigger>
//     <ConfirmButton.Confirm>
//       <PrConfirmContent />   // calls useConfirmButton() for close/busy
//     </ConfirmButton.Confirm>
//   </ConfirmButton.Root>
//
// The transition between states is the same 160ms easeOut height+opacity
// crossfade InlineForm uses, so the two primitives feel like one design
// language.

import { createContext, useCallback, useMemo, useState, use } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ConfirmButtonContextValue {
  state: "idle" | "confirming"
  open: () => void
  close: () => void
  busy: boolean
  setBusy: (b: boolean) => void
}

const ConfirmButtonContext = createContext<ConfirmButtonContextValue | null>(
  null
)

export function useConfirmButton() {
  const ctx = use(ConfirmButtonContext)
  if (!ctx) {
    throw new Error("useConfirmButton must be used inside <ConfirmButton.Root>")
  }
  return ctx
}

const TRANSITION = { duration: 0.16, ease: "easeOut" } as const

function Root({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}) {
  const [state, setState] = useState<"idle" | "confirming">("idle")
  const [busy, setBusy] = useState(false)
  const open = useCallback(() => setState("confirming"), [])
  const close = useCallback(() => {
    setBusy(false)
    setState("idle")
  }, [])
  const value = useMemo<ConfirmButtonContextValue>(
    () => ({ state, open, close, busy, setBusy }),
    [state, open, close, busy]
  )
  return (
    <ConfirmButtonContext value={value}>
      <div className={cn("inline-flex", className)}>{children}</div>
    </ConfirmButtonContext>
  )
}

function Trigger({
  disabled,
  children,
  ...rest
}: Omit<ButtonProps, "onClick">) {
  const { state, open, busy } = useConfirmButton()
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {state === "idle" && (
        <motion.div
          key="trigger"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={TRANSITION}
          className="overflow-hidden"
        >
          <Button
            {...rest}
            disabled={disabled || busy}
            onClick={open}
          >
            {children}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Confirm({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}) {
  const { state, close, busy } = useConfirmButton()
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {state === "confirming" && (
        <motion.div
          key="confirm"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={TRANSITION}
          className="overflow-hidden"
          onKeyDown={(e) => {
            // Esc cancels — same behavior as InlineForm. Children can claim
            // Esc by preventDefault'ing first.
            if (e.key === "Escape" && !busy && !e.defaultPrevented) {
              e.preventDefault()
              close()
            }
          }}
        >
          <div className={cn("flex items-center gap-2", className)}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Cancel({
  children = "Cancel",
  ...rest
}: Omit<ButtonProps, "onClick">) {
  const { close, busy } = useConfirmButton()
  return (
    <Button
      size="sm"
      variant="ghost"
      leadingIcon={X}
      {...rest}
      disabled={rest.disabled || busy}
      onClick={close}
    >
      {children}
    </Button>
  )
}

export const ConfirmButton = {
  Root,
  Trigger,
  Confirm,
  Cancel
}
