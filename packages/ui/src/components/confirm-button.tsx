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
import { Input } from "./input"
import { TextSwap } from "./text-swap"

const DEFAULT_KEY = "default"
// How long an inline confirm stays open before it closes by itself.
const CONFIRM_SECONDS = 4

export { useConfirmButton }

// `flow`: the inline confirm step takes the trigger's place in the layout
// (and may wrap), for long prompts in narrow places. Without it the step
// slides out over the row as a capsule and nothing reflows.
function Root({
  className,
  flow = false,
  children
}: Readonly<{
  className?: string
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
      <span
        ref={rootRef}
        className={cn("relative inline-flex items-center", className)}
      >
        {children}
      </span>
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

// The first solid background behind an element: what the capsule's edge
// fade blends into.
function backgroundUnder(el: HTMLElement): string {
  for (let node = el.parentElement; node !== null; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor
    if (color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color
  }
  return "transparent"
}

// The capsule: 4px taller than a 28px trigger and pinned to its end edge,
// over the row, on the popup surface. It always lays out at its full width,
// so nothing inside it squeezes; a clip from the start edge reveals it,
// from the trigger's width to all of it. Closing clips it back down to the
// trigger and fades it out, then unmounts it.
//
// The clip is in layout pixels (offsetWidth), which also keeps it right
// inside a CSS `zoom` (the gallery's large specimens). `w-max`: as an
// absolute box inside the small trigger span it would otherwise shrink to
// its min-content width, and TextSwap's text may shrink to nothing.
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
    // Only the start edge is cut; the other three sit 2px outside the
    // capsule, so its own squircle corners render. The cut is softened by
    // a mask ramp up to 12px wide, narrowing as the reveal ends so the
    // capsule's start corners never pop. The clip-path also keeps the
    // hidden part from catching the pointer.
    const clip = (px: number) => {
      hidden.current = px
      const soft = Math.min(12, px)
      el.style.clipPath = px <= 0 ? "" : `inset(-2px -2px -2px ${px}px)`
      el.style.maskImage =
        px <= 0
          ? ""
          : `linear-gradient(to right, transparent ${px}px, #000 ${px + soft}px)`
    }
    // Start from wherever the clip is now, so a quick reopen or close
    // reverses instead of jumping.
    const start = hidden.current ?? covered
    const target = open ? 0 : covered
    if (open) el.style.setProperty("--confirm-under", backgroundUnder(el))
    delete el.dataset.settled
    clip(start)
    // Opening takes the morph timing (260ms); closing is quicker
    // (presence, 180ms): the clip snaps back to the trigger and the capsule
    // stays solid until the last ~80ms, then fades, so there's no long
    // crossfade over the trigger.
    const timing = open ? transitions.morph : transitions.presence
    const reveal = animate(start, target, {
      ...(reduce ? { duration: 0 } : timing),
      onUpdate: clip
    })
    const fade = open
      ? animate(el, { opacity: 1 }, transitions.morph)
      : animate(
          el,
          { opacity: [1, 1, 0] },
          { duration: timing.duration, times: [0, 0.55, 1], ease: "linear" }
        )
    if (open)
      void reveal.then(() => {
        el.dataset.settled = ""
      })
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

  // The theme can change while the capsule is open (the overview opens its
  // capsules on mount); read the colour under it again when <html>'s class
  // changes, which is how the app and gallery switch themes.
  useEffect(() => {
    const el = ref.current
    if (!shown || el === null) return undefined
    const observer = new MutationObserver(() =>
      el.style.setProperty("--confirm-under", backgroundUnder(el))
    )
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"]
    })
    return () => observer.disconnect()
  }, [shown])

  if (!shown) return null
  return (
    // The frame holds the position, clip and the edge fade (in its 24px
    // start padding, reaching under the surface's rounded corners); the
    // surface paints on top of the fade.
    <div
      ref={ref}
      role="group"
      data-countdown-hold
      onKeyDown={onKeyDown}
      className="confirm-capsule-frame absolute -end-0.5 top-1/2 z-20 flex w-max -translate-y-1/2 ps-6"
    >
      <div
        className={cn(
          "confirm-capsule relative flex h-8 items-center justify-end gap-1 rounded-[16px] border border-border/60 bg-card pe-[3px] whitespace-nowrap [corner-shape:var(--button-corner)] *:shrink-0",
          className
        )}
      >
        {children}
      </div>
    </div>
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
  layout?: "inline" | "stacked"
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
      // Busy: Button's loader over the label, which keeps the width;
      // busyLabel is what screen readers hear.
      loading={busy}
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
      className={cn(capsule && "rounded-[12px] px-2.5")}
    >
      {busy && busyLabel !== label ? (
        <>
          <span aria-hidden>{label}</span>
          <span className="sr-only">{busyLabel}</span>
        </>
      ) : (
        label
      )}
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
        <PromptLine
          text={error ?? prompt}
          failed={error !== null && error !== undefined}
          muted
          className={styles.prompt}
        />
        {children}
        {confirmButton}
        {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the click that opened the prompt */}
        <Cancel {...styles.cancel} autoFocus>
          {cancelLabel}
        </Cancel>
      </>
    )
  }

  const cancelButton = (
    <Button type="button" variant="ghost" size="sm" onClick={close}>
      {cancelLabel}
    </Button>
  )
  const errorLine =
    error === null || error === undefined ? null : (
      <p role="alert" className="text-caption text-destructive">
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-subtitle font-semibold">{prompt}</p>
        {description === undefined ? null : (
          <p className={"text-caption text-muted-foreground"}>{description}</p>
        )}
      </div>
      {children}
      {errorLine}
      <div className="flex items-center justify-end gap-2">
        {cancelButton}
        {confirmButton}
      </div>
    </div>
  )
}

// The prompt, or the error in its place. Plain strings roll from one to the
// other through TextSwap (the capsule follows the width, growing from its
// end edge), and the colour eases along. The error is also read out as an
// alert, since TextSwap's text isn't announced when it changes.
function PromptLine({
  text,
  failed,
  muted = false,
  className
}: Readonly<{
  text: ReactNode
  failed: boolean
  muted?: boolean
  className?: string
}>) {
  return (
    <span
      className={cn(
        "transition-colors duration-260 ease-standard",
        failed
          ? "text-destructive"
          : muted
            ? "text-muted-foreground"
            : "text-foreground",
        className
      )}
    >
      {typeof text === "string" ? <TextSwap>{text}</TextSwap> : text}
      {failed ? (
        <span role="alert" className="sr-only">
          {text}
        </span>
      ) : null}
    </span>
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
      <PromptLine
        text={failed ? error : prompt}
        failed={failed}
        className="ps-3.5 pe-1.5 text-body"
      />
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
  Idle,
  Confirm,
  Cancel,
  Action
}
