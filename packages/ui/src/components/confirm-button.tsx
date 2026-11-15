import type * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import { Trash2, X } from "lucide-react"
import { animate, motion, useReducedMotion } from "motion/react"
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode
} from "react"

import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { Button, type ButtonProps } from "./button"
import {
  ConfirmButtonContext,
  type ConfirmButtonContextValue,
  useConfirmButton
} from "./confirm-button-context"
import { DropdownMenuItem } from "./dropdown-menu"
import { Input } from "./input"
import { Popover, PopoverContent } from "./popover"

const DEFAULT_KEY = "default"
// How long an inline confirm stays open before it closes by itself.
const CONFIRM_SECONDS = 4

export { useConfirmButton }

// `flow`: the inline confirm step takes the trigger's place in the layout
// (and may wrap), for long prompts in narrow places. Without it the step
// slides out over the row as a capsule and nothing reflows.
function Root({
  className,
  bare = false,
  flow = false,
  children
}: Readonly<{
  className?: string
  bare?: boolean
  flow?: boolean
  children: ReactNode
}>) {
  const [active, setActive] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fromWidth, setFromWidth] = useState(0)
  const rootRef = useRef<HTMLSpanElement>(null)
  const open = useCallback((key: string = DEFAULT_KEY) => {
    setFromWidth(rootRef.current?.offsetWidth ?? 0)
    setActive(key)
  }, [])
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
      setBusy,
      flow,
      fromWidth
    }),
    [active, open, close, busy, flow, fromWidth]
  )
  return (
    <ConfirmButtonContext value={value}>
      {bare ? (
        children
      ) : (
        <span
          ref={rootRef}
          className={cn("relative inline-flex items-center", className)}
        >
          {children}
        </span>
      )}
    </ConfirmButtonContext>
  )
}

function Trigger({
  disabled,
  persist = false,
  children,
  ...rest
}: Omit<ButtonProps, "onClick"> & Readonly<{ persist?: boolean }>) {
  const { state, open, busy, flow } = useConfirmButton()
  const ref = useRef<HTMLButtonElement>(null)
  const confirming = state !== "idle"
  // The step held focus; when it closes, focus comes back here instead of
  // falling to the page.
  const wasConfirming = useRef(false)
  useEffect(() => {
    if (wasConfirming.current && !confirming) {
      // Focus is on the page, or still in the closing step (the capsule
      // leaves after its exit animation).
      const active = document.activeElement
      const root = ref.current?.parentElement?.parentElement
      const lost =
        active === null ||
        active === document.body ||
        (root?.contains(active) === true && active !== ref.current)
      if (lost) ref.current?.focus({ preventScroll: true })
    }
    wasConfirming.current = confirming
  }, [confirming])
  if (flow && !persist && confirming) return null
  // Under the capsule the trigger keeps its slot, so nothing reflows.
  const covered = !flow && !persist && confirming
  return (
    <motion.div
      // inert, not visibility: focus has to land back here in the same
      // commit that uncovers it.
      inert={covered}
      className="flex"
      initial={flow ? { opacity: 0 } : false}
      animate={{ opacity: covered ? 0 : 1 }}
      transition={transitions.fade}
    >
      <Button
        {...rest}
        ref={ref}
        disabled={disabled || busy}
        onClick={() => open()}
      >
        {children}
      </Button>
    </motion.div>
  )
}

function DeleteTrigger({
  className,
  dense = false,
  ...rest
}: Omit<ButtonProps, "onClick" | "children"> &
  Readonly<{ dense?: boolean; persist?: boolean }>) {
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
  const { active, close, busy, flow, fromWidth } = useConfirmButton()
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !busy && !e.defaultPrevented) {
      e.preventDefault()
      close()
    }
  }
  if (flow) {
    if (active !== when) return null
    return (
      <motion.div
        data-countdown-hold
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={transitions.fade}
        onKeyDown={onKeyDown}
      >
        <div className={cn("flex items-center gap-2", className)}>
          {children}
        </div>
      </motion.div>
    )
  }
  return (
    <Capsule
      open={active === when}
      from={fromWidth + 4}
      className={className}
      onKeyDown={onKeyDown}
    >
      {children}
    </Capsule>
  )
}

// The capsule: 4px taller than a 28px trigger and pinned to its end edge,
// over the row, on the popup surface. It always lays out at its full width,
// so nothing inside it squeezes; a clip from the start edge reveals it,
// from the trigger's width to all of it. Closing clips it back down to the
// trigger and fades it out, then unmounts it.
//
// The clip is in layout pixels (offsetWidth), which also keeps it right
// inside a CSS `zoom` (the gallery's large specimens). While it moves the
// clip's corners are round; at rest the clip is dropped, so the capsule's
// own squircle corners show.
function Capsule({
  open,
  from,
  className,
  onKeyDown,
  children
}: Readonly<{
  open: boolean
  from: number
  className?: string
  onKeyDown: (e: KeyboardEvent) => void
  children: ReactNode
}>) {
  const ref = useRef<HTMLDivElement>(null)
  // How much of the start side is clipped away right now, in px.
  const hidden = useRef<number | null>(null)
  const reduce = useReducedMotion() ?? false
  const [shown, setShown] = useState(open)
  if (open && !shown) setShown(true)

  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return undefined
    const covered = Math.max(0, el.offsetWidth - from)
    const clip = (px: number) => {
      hidden.current = px
      el.style.clipPath =
        px <= 0 ? "" : `inset(0 0 0 ${px}px round ${el.offsetHeight / 2}px)`
    }
    // Start from wherever the clip is now, so a quick reopen or close
    // reverses instead of jumping.
    const start = hidden.current ?? covered
    const target = open ? 0 : covered
    clip(start)
    const reveal = animate(start, target, {
      ...(reduce ? { duration: 0 } : transitions.morph),
      onUpdate: clip
    })
    // Closing fades in step with the clip (ease-in), so the shrink back to
    // the trigger stays visible instead of vanishing in the first frames.
    const fade = animate(
      el,
      { opacity: open ? 1 : 0 },
      open ? transitions.morph : { duration: 0.26, ease: "easeIn" }
    )
    if (!open)
      void Promise.all([reveal, fade]).then(() => {
        hidden.current = null
        setShown(false)
      })
    return () => {
      reveal.stop()
      fade.stop()
    }
  }, [open, from, reduce])

  if (!shown) return null
  return (
    <div
      ref={ref}
      role="group"
      data-countdown-hold
      onKeyDown={onKeyDown}
      className={cn(
        "confirm-capsule absolute -end-0.5 top-1/2 z-20 flex h-8 -translate-y-1/2 items-center justify-end gap-1 rounded-[16px] border border-border/60 bg-card pe-[3px] whitespace-nowrap [corner-shape:var(--button-corner)] *:shrink-0",
        className
      )}
    >
      {children}
    </div>
  )
}

function ConfirmPopover({
  when = DEFAULT_KEY,
  anchor,
  className,
  children
}: Readonly<{
  when?: string
  anchor: ComponentProps<typeof PopoverContent>["anchor"]
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
  children,
  ...rest
}: Omit<ButtonProps, "onClick" | "children"> &
  Readonly<{ children: ReactNode }>) {
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

const CONFIRM_SIZES = {
  sm: {
    prompt: "text-body whitespace-nowrap",
    cancel: { size: "sm", variant: "ghost", leadingIcon: X }
  },
  xs: {
    prompt: "min-w-0 flex-1 truncate text-caption",
    cancel: { size: "xs", variant: "tertiary" }
  }
} as const

type ActionProps<E> = Readonly<{
  prompt: ReactNode
  description?: ReactNode
  label: ReactNode
  busyLabel?: ReactNode
  onConfirm: () => Promise<ConfirmOutcome<E>> | ConfirmOutcome<E>
  describeError: (cause: Cause.Cause<E>) => string
  disabled?: boolean
  size?: keyof typeof CONFIRM_SIZES
  layout?: "inline" | "stacked" | "menu"
  cancelLabel: ReactNode
  waiting?: boolean
  error?: ReactNode
  typed?: string
  tone?: "destructive" | "neutral"
  timeout?: number | false
  children?: ReactNode
}>

function Action<E = unknown>({
  prompt,
  description,
  label,
  busyLabel = label,
  onConfirm,
  describeError,
  disabled = false,
  size = "sm",
  layout = "inline",
  cancelLabel,
  waiting,
  error: externalError,
  typed,
  tone = "destructive",
  timeout = CONFIRM_SECONDS,
  children
}: ActionProps<E>) {
  const { close, busy: internalBusy, setBusy, flow } = useConfirmButton()
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

  const inline = layout === "inline"
  const capsule = inline && !flow
  // An inline destructive confirm closes by itself unless it is busy or
  // showing an error; its fill shows the time left.
  const timed =
    timeout !== false &&
    inline &&
    tone === "destructive" &&
    (error === null || error === undefined)
  const confirmButton = (
    <Button
      type="button"
      size={capsule ? "compact" : inline ? size : "sm"}
      variant={tone === "destructive" ? "destructive" : "primary"}
      disabled={blocked}
      onClick={() => void run()}
      countdown={
        timed
          ? {
              seconds: timeout,
              delay: capsule ? 0.26 : 0,
              onElapsed: close
            }
          : undefined
      }
      className={cn(
        layout === "menu" && "flex-1",
        capsule && "rounded-[12px] px-2.5"
      )}
    >
      {busy ? busyLabel : label}
    </Button>
  )

  if (capsule)
    return (
      <CapsuleAction
        prompt={prompt}
        error={error}
        confirmButton={confirmButton}
        cancelLabel={cancelLabel}
        busy={busy}
        onCancel={close}
      >
        {children}
      </CapsuleAction>
    )

  if (inline) {
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
        className={cn("text-caption", "text-destructive", menu && "px-2")}
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
        <label
          htmlFor={typedId}
          className={"text-caption text-muted-foreground"}
        >
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
            menu
              ? "text-caption text-muted-foreground"
              : "text-subtitle font-semibold"
          }
        >
          {prompt}
        </p>
        {description === undefined ? null : (
          <p className={"text-caption text-muted-foreground"}>{description}</p>
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

// The inline step inside the capsule: prompt (or the error in its place),
// the confirm button with its countdown, and an icon-only Cancel that takes
// focus, so Enter cancels and Esc goes back.
function CapsuleAction({
  prompt,
  error,
  confirmButton,
  cancelLabel,
  busy,
  onCancel,
  children
}: Readonly<{
  prompt: ReactNode
  error: ReactNode
  confirmButton: ReactNode
  cancelLabel: ReactNode
  busy: boolean
  onCancel: () => void
  children?: ReactNode
}>) {
  const failed = error !== null && error !== undefined
  return (
    <>
      <span
        role={failed ? "alert" : undefined}
        className={cn(
          "ps-3.5 pe-1.5 text-body",
          failed ? "text-destructive" : "text-foreground"
        )}
      >
        {failed ? error : prompt}
      </span>
      {children}
      {confirmButton}
      <Button
        type="button"
        variant="ghost"
        size="square-6"
        disabled={busy}
        onClick={onCancel}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the click that opened the prompt
        autoFocus
        className="rounded-[12px]"
      >
        <X aria-hidden />
        <span className="sr-only">{cancelLabel}</span>
      </Button>
    </>
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
