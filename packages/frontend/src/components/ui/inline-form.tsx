// InlineForm — compound-component primitive for "display + actions + forms"
// surfaces. The Root holds a small mode/busy context. Idle and Form children
// render conditionally based on `mode`. Triggers wire themselves to open(action).
//
// Forms own their submit semantics (the primitive does NOT provide a Submit
// component) but call into useInlineForm() for setBusy / close. While busy,
// triggers and the convenience Cancel button are disabled — the form's own
// submit button is responsible for its own disabled state.

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
  // The action whose Trigger is currently hovered, or null. Display reads
  // this to show a per-action preview message — letting the user see what
  // a button will do before they commit.
  hoveredAction: A | null
  setHoveredAction: (a: A | null) => void
}

// Generic-erased shape lives in the runtime context. Components annotate the
// generic at the call site for type-narrowing; the runtime is permissive.
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

// Shared transition tuning so Idle and Form crossfade with the same cadence.
// Height + opacity together — opacity alone leaves the box height stuck on
// the larger of the two, which reads as a stutter; height alone leaves the
// outgoing content visible while it shrinks. 160ms easeOut sits just above
// the eye's snap threshold without dragging.
const FORM_TRANSITION = { duration: 0.16, ease: "easeOut" } as const

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
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={FORM_TRANSITION}
          // overflow-hidden keeps content clipped during the height
          // animation so it doesn't poke outside the collapsing box.
          className="overflow-hidden"
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
  // Per-action preview content. When a Trigger is hovered, the matching
  // entry takes over the Display surface so the user sees what the action
  // will do before they click. Crossfade keeps the swap calm — this is a
  // hint, not a flash. Omit `previews` to opt out.
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
  // Escape cancels the form. Children can still preventDefault + stopPropagation
  // to keep Esc for their own use (e.g. an inline editor reverting a draft) —
  // we only act when the event bubbles all the way up. Skipped while busy so
  // an in-flight submit can't be silently dropped.
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {mode === action && (
        <motion.div
          key={`form-${action}`}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={FORM_TRANSITION}
          className="overflow-hidden"
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
