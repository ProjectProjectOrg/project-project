import { createContext, useCallback, useMemo, useState, use } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface InlineFormContextValue<A extends string = string> {
  mode: "idle" | A
  open: (action: A) => void
  close: () => void
  busy: boolean
  setBusy: (b: boolean) => void
  hoveredAction: A | null
  setHoveredAction: (a: A | null) => void
}

const InlineFormContext = createContext<InlineFormContextValue | null>(null)

export function useInlineForm<A extends string = string>() {
  const ctx = use(InlineFormContext)
  if (!ctx) {
    throw new Error("useInlineForm must be used inside <InlineForm.Root>")
  }
  return ctx as unknown as InlineFormContextValue<A>
}

interface RootProps<A extends string> {
  defaultMode?: "idle" | A
  mode?: "idle" | A
  onModeChange?: (mode: "idle" | A) => void
  className?: string
  children: React.ReactNode
}

function Root<A extends string = string>({
  defaultMode = "idle",
  mode: controlledMode,
  onModeChange,
  className,
  children
}: RootProps<A>) {
  const [uncontrolled, setUncontrolled] = useState<"idle" | A>(defaultMode)
  const [busy, setBusy] = useState(false)
  const [hoveredAction, setHoveredAction] = useState<A | null>(null)
  const isControlled = controlledMode !== undefined
  const mode = isControlled ? controlledMode : uncontrolled

  const setMode = useCallback(
    (next: "idle" | A) => {
      if (!isControlled) setUncontrolled(next)
      onModeChange?.(next)
    },
    [isControlled, onModeChange]
  )

  const open = useCallback((action: A) => setMode(action), [setMode])
  const close = useCallback(() => {
    setBusy(false)
    setMode("idle")
  }, [setMode])

  const value = useMemo<InlineFormContextValue<A>>(
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
    <InlineFormContext value={value as unknown as InlineFormContextValue}>
      <div
        className={cn(
          "rounded-lg border border-border bg-background px-3 py-2",
          className
        )}
      >
        {children}
      </div>
    </InlineFormContext>
  )
}

const FADE_TRANSITION = { duration: 0.15, ease: "easeOut" } as const

function Idle({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}) {
  const { mode } = useInlineForm()
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {mode === "idle" && (
        <motion.div
          key="idle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={FADE_TRANSITION}
        >
          <div className={cn("flex items-center gap-2", className)}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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
  const { hoveredAction } = useInlineForm<A>()
  const preview = previews && hoveredAction ? previews[hoveredAction] : undefined
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

interface TriggerProps<A extends string>
  extends Omit<ButtonProps, "onClick"> {
  action: A
}

function Trigger<A extends string>({
  action,
  disabled,
  children,
  ...rest
}: TriggerProps<A>) {
  const { open, busy, setHoveredAction } = useInlineForm<A>()
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

function Form<A extends string>({
  action,
  className,
  children
}: {
  action: A
  className?: string
  children: React.ReactNode
}) {
  const { mode, close, busy } = useInlineForm<A>()
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {mode === action && (
        <motion.div
          key={`form-${action}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={FADE_TRANSITION}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy && !e.defaultPrevented) {
              e.preventDefault()
              close()
            }
          }}
        >
          <div className={cn("space-y-2", className)}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Cancel({
  children = "Cancel",
  ...rest
}: Omit<ButtonProps, "onClick">) {
  const { close, busy } = useInlineForm()
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

export const InlineForm = {
  Root,
  Idle,
  Display,
  Actions,
  Trigger,
  Form,
  Cancel
}
