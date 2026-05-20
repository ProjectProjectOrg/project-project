import { createContext, useCallback, useMemo, useState, use } from "react"
import { motion } from "motion/react"
import { X } from "lucide-react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { transitions } from "@/lib/springs"
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
      <span className={cn("relative inline-flex items-center", className)}>
        {children}
      </span>
    </ConfirmButtonContext>
  )
}

function Trigger({
  disabled,
  children,
  ...rest
}: Omit<ButtonProps, "onClick">) {
  const { state, open, busy } = useConfirmButton()
  if (state !== "idle") return null
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitions.fade}
    >
      <Button {...rest} disabled={disabled || busy} onClick={open}>
        {children}
      </Button>
    </motion.div>
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
  if (state !== "confirming") return null
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitions.fade}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy && !e.defaultPrevented) {
          e.preventDefault()
          close()
        }
      }}
    >
      <div className={cn("flex items-center gap-2", className)}>{children}</div>
    </motion.div>
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
