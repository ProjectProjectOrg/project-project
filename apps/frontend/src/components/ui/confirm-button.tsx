import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import { X } from "lucide-react"
import { motion } from "motion/react"
import {
  createContext,
  useCallback,
  useMemo,
  useState,
  use,
  type ReactNode
} from "react"

import { Button, type ButtonProps } from "@/components/ui/button"
import { errorMessage } from "@/lib/errorMessage"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

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
      className="flex"
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

type ConfirmOutcome<E> = void | boolean | Exit.Exit<unknown, E>

const describeFailure = (cause: Cause.Cause<unknown>): string =>
  errorMessage(Cause.squash(cause))

const CONFIRM_SIZES = {
  sm: {
    prompt: "text-[13px] whitespace-nowrap",
    cancel: { size: "sm", variant: "ghost", leadingIcon: X }
  },
  xs: {
    prompt: "min-w-0 flex-1 truncate text-xs",
    cancel: { size: "xs", variant: "raised" }
  }
} as const

function Action<E = unknown>({
  prompt,
  label,
  busyLabel = label,
  onConfirm,
  describeError = describeFailure,
  disabled = false,
  size = "sm",
  cancelLabel = m.common_cancel_button()
}: {
  prompt: ReactNode
  label: ReactNode
  busyLabel?: ReactNode
  onConfirm: () => Promise<ConfirmOutcome<E>> | ConfirmOutcome<E>
  describeError?: (cause: Cause.Cause<E>) => string
  disabled?: boolean
  size?: keyof typeof CONFIRM_SIZES
  cancelLabel?: ReactNode
}) {
  const { close, busy, setBusy } = useConfirmButton()
  const [error, setError] = useState<string | null>(null)
  const styles = CONFIRM_SIZES[size]

  async function run() {
    setBusy(true)
    setError(null)
    const outcome = await Promise.resolve()
      .then(onConfirm)
      .catch(() => false as const)
    if (outcome === false) return setBusy(false)
    if (Exit.isExit(outcome) && Exit.isFailure(outcome)) {
      setBusy(false)
      return setError(describeError(outcome.cause))
    }
    close()
  }

  return (
    <>
      <span
        role={error === null ? undefined : "alert"}
        className={cn(
          styles.prompt,
          error === null ? "text-muted-foreground" : "text-destructive"
        )}
      >
        {error ?? prompt}
      </span>
      <Button
        type="button"
        size={size}
        variant="destructive"
        disabled={busy || disabled}
        onClick={() => void run()}
      >
        {busy ? busyLabel : label}
      </Button>
      {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the click that opened the prompt */}
      <Cancel {...styles.cancel} autoFocus>
        {cancelLabel}
      </Cancel>
    </>
  )
}

export const ConfirmButton = {
  Root,
  Trigger,
  Confirm,
  Cancel,
  Action
}
