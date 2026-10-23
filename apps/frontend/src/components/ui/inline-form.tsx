import { X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { createContext, useCallback, useMemo, useState, use } from "react"

import { Button, type ButtonProps } from "@/components/ui/button"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"

type InlineFormContextValue = Readonly<{
  mode: string
  open: (action: string) => void
  close: () => void
  busy: boolean
  setBusy: (b: boolean) => void
  hoveredAction: string | null
  setHoveredAction: (a: string | null) => void
}>

const InlineFormContext = createContext<InlineFormContextValue | null>(null)

export function useInlineForm() {
  const ctx = use(InlineFormContext)
  if (!ctx) {
    throw new Error("useInlineForm must be used inside <InlineForm.Root>")
  }
  return ctx
}

type RootProps<A extends string> = Readonly<{
  actions: ReadonlyArray<A>
  defaultMode?: "idle" | NoInfer<A>
  mode?: "idle" | NoInfer<A>
  onModeChange?: (mode: "idle" | NoInfer<A>) => void
  className?: string
  variant?: "bordered" | "ghost"
  children: React.ReactNode
}>

function Root<const A extends string = string>({
  actions,
  defaultMode = "idle",
  mode: controlledMode,
  onModeChange,
  className,
  variant = "bordered",
  children
}: RootProps<A>) {
  const [uncontrolled, setUncontrolled] = useState<"idle" | A>(defaultMode)
  const [busy, setBusy] = useState(false)
  const [hoveredAction, setHoveredAction] = useState<string | null>(null)
  const isControlled = controlledMode !== undefined
  const mode = isControlled ? controlledMode : uncontrolled

  const setMode = useCallback(
    (next: "idle" | A) => {
      if (!isControlled) setUncontrolled(next)
      onModeChange?.(next)
    },
    [isControlled, onModeChange]
  )

  const open = useCallback(
    (action: string) => {
      const allowed = actions.find((candidate) => candidate === action)
      if (allowed !== undefined) setMode(allowed)
    },
    [actions, setMode]
  )
  const close = useCallback(() => {
    setBusy(false)
    setMode("idle")
  }, [setMode])

  const value = useMemo<InlineFormContextValue>(
    () => ({
      mode,
      open,
      close,
      busy,
      setBusy,
      hoveredAction,
      setHoveredAction
    }),
    [mode, open, close, busy, hoveredAction]
  )

  return (
    <InlineFormContext value={value}>
      <div
        data-mode={mode === "idle" ? "idle" : "active"}
        className={cn(
          variant === "bordered" &&
            "rounded-lg border border-border bg-background px-3 py-2",
          className
        )}
      >
        {children}
      </div>
    </InlineFormContext>
  )
}

function Idle({
  className,
  children,
  block = false
}: {
  className?: string
  children: React.ReactNode
  block?: boolean
}) {
  const { mode } = useInlineForm()
  if (mode !== "idle") return null
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitions.fade}
    >
      <div
        className={cn(block ? "block" : "flex items-center gap-2", className)}
      >
        {children}
      </div>
    </motion.div>
  )
}

function Display<A extends string = string>({
  className,
  children,
  previews
}: {
  className?: string
  children: React.ReactNode
  previews?: Partial<Record<A, React.ReactNode>>
}) {
  const { hoveredAction } = useInlineForm()
  const preview =
    previews && hoveredAction
      ? Object.entries<React.ReactNode>(previews).find(
          ([action]) => action === hoveredAction
        )?.[1]
      : undefined
  return (
    <div className={cn("relative min-w-0", className)}>
      <AnimatePresence initial={false} mode="wait">
        {preview !== undefined ? (
          <motion.div
            key={`preview-${hoveredAction}`}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            {preview}
          </motion.div>
        ) : (
          <motion.div
            key="default"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Actions({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("ml-auto flex items-center gap-2", className)}>
      {children}
    </div>
  )
}

type TriggerProps<A extends string> = Omit<ButtonProps, "onClick"> &
  Readonly<{
    action: A
  }>

function Trigger<A extends string>({
  action,
  disabled,
  children,
  ...rest
}: TriggerProps<A>) {
  const { open, busy, setHoveredAction } = useInlineForm()
  return (
    <Button
      {...rest}
      disabled={disabled || busy}
      onClick={() => open(action)}
      onMouseEnter={() => setHoveredAction(action)}
      onMouseLeave={() => setHoveredAction(null)}
      onFocus={() => setHoveredAction(action)}
      onBlur={() => setHoveredAction(null)}
    >
      {children}
    </Button>
  )
}

function Form({
  action,
  className,
  children
}: {
  action: string
  className?: string
  children: React.ReactNode
}) {
  const { mode, close, busy } = useInlineForm()
  if (mode !== action) return null
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
      <div className={cn("space-y-2", className)}>{children}</div>
    </motion.div>
  )
}

function Cancel({
  children = "Cancel",
  ...rest
}: Omit<ButtonProps, "onClick">) {
  const { close, busy } = useInlineForm()
  return (
    <Button
      type="button"
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

export const InlineForm = {
  Root,
  Idle,
  Display,
  Actions,
  Trigger,
  Form,
  Cancel
}
