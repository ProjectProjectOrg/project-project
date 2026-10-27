import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import { Trash2, X } from "lucide-react"
import { motion } from "motion/react"
import {
  createContext,
  useCallback,
  useId,
  useMemo,
  useState,
  use,
  type ComponentProps,
  type ReactNode,
  type RefObject
} from "react"

import { Button, type ButtonProps } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { errorMessage } from "@/lib/errorMessage"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const DEFAULT_KEY = "default"

type ConfirmButtonContextValue = Readonly<{
  state: "idle" | "confirming"
  active: string | null
  open: (key?: string) => void
  close: () => void
  busy: boolean
  setBusy: (b: boolean) => void
}>

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
  bare = false,
  children
}: Readonly<{
  className?: string
  bare?: boolean
  children: ReactNode
}>) {
  const [active, setActive] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const open = useCallback((key: string = DEFAULT_KEY) => setActive(key), [])
  const close = useCallback(() => {
    setBusy(false)
    setActive(null)
  }, [])
  const value = useMemo<ConfirmButtonContextValue>(
    () => ({
      state: active === null ? "idle" : "confirming",
      active,
      open,
      close,
      busy,
      setBusy
    }),
    [active, open, close, busy]
  )
  return (
    <ConfirmButtonContext value={value}>
      {bare ? (
        children
      ) : (
        <span className={cn("relative inline-flex items-center", className)}>
          {children}
        </span>
      )}
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
      <Button {...rest} disabled={disabled || busy} onClick={() => open()}>
        {children}
      </Button>
    </motion.div>
  )
}

function DeleteTrigger({
  className,
  dense = false,
  ...rest
}: Omit<ButtonProps, "onClick" | "children"> & Readonly<{ dense?: boolean }>) {
  return (
    <Trigger
      variant="ghost"
      size="icon-sm"
      {...rest}
      className={cn(
        "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        dense && "-my-2",
        className
      )}
    >
      <Trash2 strokeWidth={1.75} />
    </Trigger>
  )
}

function MenuItem({
  confirm = DEFAULT_KEY,
  onClick,
  ...rest
}: ComponentProps<typeof DropdownMenuItem> & Readonly<{ confirm?: string }>) {
  const { open } = useConfirmButton()
  return (
    <DropdownMenuItem
      {...rest}
      onClick={(event) => {
        onClick?.(event)
        open(confirm)
      }}
    />
  )
}

function Idle({ children }: Readonly<{ children: ReactNode }>) {
  const { state } = useConfirmButton()
  return state === "idle" ? children : null
}

function Confirm({
  when = DEFAULT_KEY,
  className,
  children
}: Readonly<{
  when?: string
  className?: string
  children: ReactNode
}>) {
  const { active, close, busy } = useConfirmButton()
  if (active !== when) return null
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

function ConfirmPopover({
  when = DEFAULT_KEY,
  anchor,
  className,
  children
}: Readonly<{
  when?: string
  anchor: RefObject<HTMLElement | null>
  className?: string
  children: ReactNode
}>) {
  const { active, close } = useConfirmButton()
  return (
    <Popover
      open={active === when}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <PopoverContent
        anchor={anchor}
        align="end"
        sideOffset={6}
        className={className}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </PopoverContent>
    </Popover>
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

type ActionProps<E> = Readonly<{
  prompt: ReactNode
  description?: ReactNode
  label: ReactNode
  busyLabel?: ReactNode
  onConfirm: () => Promise<ConfirmOutcome<E>> | ConfirmOutcome<E>
  describeError?: (cause: Cause.Cause<E>) => string
  disabled?: boolean
  size?: keyof typeof CONFIRM_SIZES
  layout?: "inline" | "stacked" | "menu"
  cancelLabel?: ReactNode
  waiting?: boolean
  error?: ReactNode
  typed?: string
  children?: ReactNode
}>

function Action<E = unknown>({
  prompt,
  description,
  label,
  busyLabel = label,
  onConfirm,
  describeError = describeFailure,
  disabled = false,
  size = "sm",
  layout = "inline",
  cancelLabel = m.common_cancel_button(),
  waiting,
  error: externalError,
  typed,
  children
}: ActionProps<E>) {
  const { close, busy: internalBusy, setBusy } = useConfirmButton()
  const [internalError, setInternalError] = useState<string | null>(null)
  const [typedValue, setTypedValue] = useState("")
  const typedId = useId()
  const busy = waiting ?? internalBusy
  const error = externalError === undefined ? internalError : externalError
  const typedMatches = typed === undefined || typedValue.trim() === typed
  const blocked = busy || disabled || !typedMatches

  async function run() {
    if (blocked) return
    setBusy(true)
    setInternalError(null)
    const outcome = await Promise.resolve()
      .then(onConfirm)
      .catch(() => false as const)
    if (outcome === false) return setBusy(false)
    if (Exit.isExit(outcome) && Exit.isFailure(outcome)) {
      setBusy(false)
      return setInternalError(describeError(outcome.cause))
    }
    close()
  }

  const confirmButton = (
    <Button
      type="button"
      size={layout === "inline" ? size : "sm"}
      variant="destructive"
      disabled={blocked}
      onClick={() => void run()}
      className={layout === "menu" ? "flex-1" : undefined}
    >
      {busy ? busyLabel : label}
    </Button>
  )

  if (layout === "inline") {
    const styles = CONFIRM_SIZES[size]
    return (
      <>
        <span
          role={error === null || error === undefined ? undefined : "alert"}
          className={cn(
            styles.prompt,
            error === null || error === undefined
              ? "text-muted-foreground"
              : "text-destructive"
          )}
        >
          {error ?? prompt}
        </span>
        {children}
        {confirmButton}
        {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the click that opened the prompt */}
        <Cancel {...styles.cancel} autoFocus>
          {cancelLabel}
        </Cancel>
      </>
    )
  }

  const menu = layout === "menu"
  const cancelButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={menu && busy}
      onClick={close}
    >
      {cancelLabel}
    </Button>
  )
  const errorLine =
    error === null || error === undefined ? null : (
      <p
        role="alert"
        className={cn("text-xs text-destructive", menu && "px-2")}
      >
        {error}
      </p>
    )

  if (typed !== undefined)
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void run()
        }}
      >
        <label htmlFor={typedId} className="text-xs text-muted-foreground">
          {prompt}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id={typedId}
            value={typedValue}
            onChange={(event) => setTypedValue(event.target.value)}
            disabled={busy}
            placeholder={typed}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-64 font-mono"
          />
          {confirmButton}
          {cancelButton}
        </div>
        {errorLine}
      </form>
    )

  return (
    <div className={cn("flex flex-col", menu ? "gap-2 p-1" : "gap-3")}>
      <div className={cn("flex flex-col gap-1", menu && "px-2 pt-1")}>
        <p
          className={
            menu ? "text-xs text-muted-foreground" : "text-sm font-medium"
          }
        >
          {prompt}
        </p>
        {description === undefined ? null : (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
      {errorLine}
      <div
        className={cn(
          "flex items-center gap-2",
          menu ? "gap-1 px-1 pb-1" : "justify-end"
        )}
      >
        {menu ? confirmButton : cancelButton}
        {menu ? cancelButton : confirmButton}
      </div>
    </div>
  )
}

export const ConfirmButton = {
  Root,
  Trigger,
  DeleteTrigger,
  MenuItem,
  Idle,
  Confirm,
  Popover: ConfirmPopover,
  Cancel,
  Action
}
