import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform
} from "motion/react"
import * as React from "react"
import { createPortal } from "react-dom"

import { unscaledRect } from "../lib/popupAnchor"
import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { Button } from "./button"
import { X } from "./icons"
import { TextSwap } from "./text-swap"
import { PinnedCard, Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

/*
 * A guide teaches in place: it blurs and dims everything but one part of
 * the screen, and says what to do with it beside that part. The part stays
 * live (the overlay has a hole over it), so people try it right there. It
 * closes only through its own buttons (and Escape, the keyboard's Skip).
 *
 *   <Guide open={teach} steps={[{ target: () => row, title: "…", body: "…" }]}
 *     onClose={() => setTeach(false)} labels={labels} />
 *
 * A series is several steps: Next and Back move the spotlight, which glides
 * from part to part with the card (drawn by the tooltip host, like hover
 * cards), and Skip ends it. A step on another page says how to get there
 * (`onShow`, which navigates); until its part is on screen the guide waits,
 * so mount it above the pages and keep `step` where a page change keeps it.
 *
 * Show it once per person, right when what it teaches first applies.
 */

export type GuideStep = Readonly<{
  // The part it teaches: a ref, or a function that finds it.
  target: React.RefObject<Element | null> | (() => Element | null | undefined)
  // What to do, in a few words: "Edit all 4 tickets at once".
  title: string
  // How, in a sentence or two.
  body: React.ReactNode
  // Which side of the part the card takes (below by default).
  side?: "top" | "bottom" | "left" | "right"
  // Runs as the step comes up: open the page or panel its part is on.
  onShow?: () => void
}>

export type GuideLabels = Readonly<{
  // Closes a single guide, and the last step of a series: "Got it", "Done".
  done: string
  next: string
  back: string
  // Ends it early: the ✕'s name and tooltip ("Skip the guide").
  skip: string
  // "2 of 3"
  progress: (step: number, total: number) => string
}>

// Why it closed: the last step's button ("Got it", "Done"), or Skip (Escape
// too, for the keyboard). A click beside it doesn't close it: a guide ends
// only through its own buttons.
export type GuideCloseReason = "done" | "skip"

type Rect = Readonly<{ x: number; y: number; width: number; height: number }>

// The room around the spotlight's hole, and its corners.
const PAD = 6
const RADIUS = 16
// The card's gap from the spotlight.
const GAP = 12

const find = (target: GuideStep["target"]) =>
  (typeof target === "function" ? target() : target.current) ?? null

// The current step's part and its padded box, followed every frame while
// open (scrolling, layout, a page that hasn't rendered it yet).
function useTarget(step: GuideStep | undefined, open: boolean) {
  const [found, setFound] = React.useState<{
    element: Element
    rect: Rect
  } | null>(null)
  const read = React.useEffectEvent(() => {
    const element = step === undefined ? null : find(step.target)
    // Without its press scale (buttons shrink to 97% while pressed), so
    // pressing the part doesn't nudge the spotlight or the card.
    const box = element === null ? undefined : unscaledRect(element)
    if (element === null || box === undefined || box.width === 0) {
      setFound(null)
      return
    }
    const rect = {
      x: Math.round(box.x - PAD),
      y: Math.round(box.y - PAD),
      width: Math.round(box.width + PAD * 2),
      height: Math.round(box.height + PAD * 2)
    }
    setFound((current) =>
      current !== null &&
      current.element === element &&
      current.rect.x === rect.x &&
      current.rect.y === rect.y &&
      current.rect.width === rect.width &&
      current.rect.height === rect.height
        ? current
        : { element, rect }
    )
  })
  React.useLayoutEffect(() => {
    if (!open) return undefined
    let frame = 0
    const tick = () => {
      read()
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [open])
  return open ? found : null
}

// The overlay's shape: the window, less a rounded hole.
const holePath = (x: number, y: number, w: number, h: number) => {
  const r = Math.max(0, Math.min(RADIUS, w / 2, h / 2))
  const W = window.innerWidth
  const H = window.innerHeight
  return `path(evenodd, "M0 0H${W}V${H}H0Z M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z")`
}

// The blur with its hole and the ring around it. The hole glides from part
// to part on the morph; the blur itself fades in (its radius grows with the
// tint), so it never pops in at full strength. The blur takes the pointer
// (a click there does nothing); the hole lets it through to the part.
function Spotlight({ rect }: Readonly<{ rect: Rect }>) {
  const reduced = useReducedMotion() ?? false
  const x = useMotionValue(rect.x)
  const y = useMotionValue(rect.y)
  const width = useMotionValue(rect.width)
  const height = useMotionValue(rect.height)
  React.useEffect(() => {
    const move = reduced ? { duration: 0 } : transitions.morph
    const runs = [
      animate(x, rect.x, move),
      animate(y, rect.y, move),
      animate(width, rect.width, move),
      animate(height, rect.height, move)
    ]
    return () => {
      for (const run of runs) run.stop()
    }
  }, [rect, reduced, x, y, width, height])
  const clipPath = useTransform(() =>
    holePath(x.get(), y.get(), width.get(), height.get())
  )
  return (
    <>
      <motion.div
        aria-hidden
        initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
        animate={{ opacity: 1, backdropFilter: "blur(3px)" }}
        exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
        transition={transitions.morph}
        className="pointer-events-auto absolute inset-0 bg-(--guide-scrim)"
        style={{ clipPath }}
      />
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitions.morph}
        className="pointer-events-none absolute top-0 left-0 rounded-[16px] shadow-[0_0_0_2px_var(--ring)] [corner-shape:var(--button-corner)]"
        style={{ x, y, width, height }}
      />
    </>
  )
}

// Ends the guide: an ✕ in the card's corner. The card is the tooltip
// host's (one surface), so the ✕'s tooltip is our Tooltip pinned open over
// it, with the host's delay and its fade.
const TIP_DELAY = 400

function SkipButton({
  label,
  onSkip
}: Readonly<{ label: string; onSkip: () => void }>) {
  const [tip, setTip] = React.useState(false)
  // The host's open delay for a hover; keyboard focus shows it at once.
  const timer = React.useRef<number | undefined>(undefined)
  React.useEffect(() => () => window.clearTimeout(timer.current), [])
  const hover = (on: boolean) => {
    window.clearTimeout(timer.current)
    if (on) timer.current = window.setTimeout(() => setTip(true), TIP_DELAY)
    else setTip(false)
  }
  return (
    <Tooltip open={tip}>
      <TooltipTrigger
        render={
          <Button
            size="square-6"
            variant="ghost"
            aria-label={label}
            onClick={onSkip}
            onPointerEnter={() => hover(true)}
            onPointerLeave={() => hover(false)}
            onFocus={(event) =>
              setTip(event.currentTarget.matches(":focus-visible"))
            }
            onBlur={() => setTip(false)}
            className="-mt-0.5 -mr-1.5 shrink-0 text-muted-foreground"
          />
        }
      >
        <X className="size-3.5" strokeWidth={1.75} />
      </TooltipTrigger>
      <TooltipContent side="top" className="z-[80]">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function Guide({
  open,
  steps,
  step: at = 0,
  onStepChange,
  onClose,
  labels,
  className
}: Readonly<{
  open: boolean
  // One step for a single guide; several for a series.
  steps: ReadonlyArray<GuideStep>
  // Which step shows (a series); changes through `onStepChange`.
  step?: number
  onStepChange?: (step: number) => void
  onClose: (reason: GuideCloseReason) => void
  labels: GuideLabels
  // The card's width and padding (w-80 p-4 by default).
  className?: string
}>) {
  const step = steps[at]
  const series = steps.length > 1
  const last = at >= steps.length - 1
  const found = useTarget(step, open)
  const shown = open && found !== null
  // One card for the whole series: the host glides it to each step's part,
  // and its content rolls to the step's words instead of remounting.
  const cardId = React.useId()

  // A step comes up: it may need its page or panel first.
  const showStep = React.useEffectEvent(() => step?.onShow?.())
  React.useEffect(() => {
    if (open) showStep()
  }, [open, at])

  const close = React.useEffectEvent((reason: GuideCloseReason) =>
    onClose(reason)
  )
  // Escape is the keyboard's Skip.
  React.useEffect(() => {
    if (!shown) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      close("skip")
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [shown])

  // Focus goes to the card's main button as each step shows, and back where
  // it was when the guide closes.
  React.useEffect(() => {
    if (!open) return undefined
    const before = document.activeElement
    return () => {
      if (before instanceof HTMLElement) before.focus({ preventScroll: true })
    }
  }, [open])
  React.useEffect(() => {
    if (!shown) return undefined
    const frame = requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          "[data-slot=hover-card-content] [data-guide-primary]"
        )
        ?.focus({ preventScroll: true })
    )
    return () => cancelAnimationFrame(frame)
  }, [shown, at])

  if (typeof document === "undefined") return null
  return (
    <>
      {createPortal(
        <AnimatePresence>
          {shown && (
            <motion.div
              key="guide"
              data-slot="guide"
              // Only the blur and the card take the pointer; the spotlight
              // passes it through to the page.
              className="pointer-events-none fixed inset-0 z-[60]"
            >
              <Spotlight rect={found.rect} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
      {shown && step !== undefined && (
        <PinnedCard
          id={cardId}
          anchor={found.element}
          side={step.side ?? "bottom"}
          sideOffset={PAD + GAP}
          className={cn("w-80 max-w-[calc(100vw-24px)] p-4", className)}
        >
          <div
            role="dialog"
            aria-modal="false"
            aria-label={step.title}
            className="flex flex-col gap-1.5"
          >
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-subtitle font-semibold text-foreground">
                <TextSwap>{step.title}</TextSwap>
              </p>
              <SkipButton label={labels.skip} onSkip={() => onClose("skip")} />
            </div>
            {/* A step's words cross-fade while the card resizes to them. */}
            <motion.div
              key={at}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={transitions.morph}
              className="text-body text-muted-foreground"
            >
              {step.body}
            </motion.div>
            <div className="mt-2 flex items-center gap-1.5">
              {series && (
                <span className="text-caption text-muted-foreground tabular-nums">
                  <TextSwap speed="fast">
                    {labels.progress(at + 1, steps.length)}
                  </TextSwap>
                </span>
              )}
              <span className="flex-1" />
              <AnimatePresence initial={false}>
                {series && at > 0 && (
                  <motion.span
                    key="back"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: "auto", opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={transitions.morph}
                    className="-my-1 flex shrink-0 justify-end overflow-hidden py-1"
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onStepChange?.(at - 1)}
                    >
                      {labels.back}
                    </Button>
                  </motion.span>
                )}
              </AnimatePresence>
              <Button
                data-guide-primary
                size="sm"
                variant="primary"
                onClick={() =>
                  last ? onClose("done") : onStepChange?.(at + 1)
                }
              >
                <TextSwap speed="fast">
                  {last ? labels.done : labels.next}
                </TextSwap>
              </Button>
            </div>
          </div>
        </PinnedCard>
      )}
    </>
  )
}
