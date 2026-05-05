// InlineForm — compound-component primitive for "display + actions + forms"
// surfaces. The Root holds a small mode/busy context. Idle and Form children
// render conditionally based on `mode`. Triggers wire themselves to open(action).
//
// Forms own their submit semantics (the primitive does NOT provide a Submit
// component) but call into useInlineForm() for setBusy / close. While busy,
// triggers and the convenience Cancel button are disabled — the form's own
// submit button is responsible for its own disabled state.

import { createContext, useCallback, useMemo, useState, use } from "react"
import { X } from "lucide-react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface InlineFormContextValue<A extends string = string> {
  mode: "idle" | A
  open: (action: A) => void
  close: () => void
  busy: boolean
  setBusy: (b: boolean) => void
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
    () => ({ mode, open, close, busy, setBusy }),
    [mode, open, close, busy]
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

function Idle({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}) {
  const { mode } = useInlineForm()
  if (mode !== "idle") return null
  return (
    <div className={cn("flex items-center gap-2", className)}>{children}</div>
  )
}

function Display({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn("min-w-0", className)}>{children}</div>
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
  const { open, busy } = useInlineForm<A>()
  return (
    <Button
      {...rest}
      disabled={disabled || busy}
      onClick={() => open(action)}
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
  const { mode } = useInlineForm<A>()
  if (mode !== action) return null
  return <div className={cn("space-y-2", className)}>{children}</div>
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
