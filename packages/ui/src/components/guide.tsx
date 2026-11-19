import { AnimatePresence, motion } from "motion/react"
import * as React from "react"
import { createPortal } from "react-dom"

import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { Button } from "./button"
import { popupSurfaceClass } from "./menu-styles"

/*
 * A guide teaches one thing in place: it blurs and dims everything but one
 * part of the screen, and says what to do with it beside that part. The
 * part stays live (the overlay has a hole over it), so people try it right
 * there; doing it, "Got it", Escape or a click elsewhere closes the guide.
 *
 *   <Guide open={teach} onClose={() => setTeach(false)} target={row}
 *     title="Change them all from any row" doneLabel="Got it">
 *     With several tickets selected, a row's status, assignee, … change
 *     every selected ticket.
 *   </Guide>
 *
 * Show it once per person (the app remembers who has seen it), right when
 * the thing it teaches first applies, never as a tour.
 */

type Rect = Readonly<{ x: number; y: number; width: number; height: number }>

// The space around the spotlight's hole, and its corners.
const PAD = 6
const RADIUS = 16
// The callout's gap from the spotlight, and from the window's edges.
const GAP = 12
const EDGE = 12
const CALLOUT_WIDTH = 320

const sameRect = (a: Rect | null, b: Rect) =>
  a !== null &&
  a.x === b.x &&
  a.y === b.y &&
  a.width === b.width &&
  a.height === b.height

// The target's box, padded, followed every frame while open (it may move
// with scrolling, layout or animation).
function useTargetRect(
  target: () => Element | null | undefined,
  open: boolean
) {
  const [rect, setRect] = React.useState<Rect | null>(null)
  const read = React.useEffectEvent(() => {
    const box = target()?.getBoundingClientRect()
    if (box === undefined) return
    const next = {
      x: Math.round(box.x - PAD),
      y: Math.round(box.y - PAD),
      width: Math.round(box.width + PAD * 2),
      height: Math.round(box.height + PAD * 2)
    }
    setRect((current) => (sameRect(current, next) ? current : next))
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
  return rect
}

// The overlay's shape: the whole window, less a rounded hole at `rect`.
const holePath = (rect: Rect) => {
  const { x, y, width: w, height: h } = rect
  const r = Math.min(RADIUS, w / 2, h / 2)
  const W = window.innerWidth
  const H = window.innerHeight
  return `path(evenodd, "M0 0H${W}V${H}H0Z M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z")`
}

// Below the spotlight when there's room, else above; lined up with its
// start, kept inside the window.
const calloutPlace = (rect: Rect, height: number) => {
  const below = rect.y + rect.height + GAP
  const fitsBelow = below + height + EDGE <= window.innerHeight
  const top = fitsBelow ? below : Math.max(EDGE, rect.y - GAP - height)
  const width = Math.min(CALLOUT_WIDTH, window.innerWidth - EDGE * 2)
  const left = Math.min(
    Math.max(EDGE, rect.x),
    window.innerWidth - EDGE - width
  )
  return { top, left, width, side: fitsBelow ? "bottom" : "top" } as const
}

export function Guide({
  open,
  onClose,
  target,
  title,
  doneLabel,
  step,
  children,
  className
}: Readonly<{
  open: boolean
  onClose: () => void
  // The part it teaches: a ref, or a function that finds it.
  target: React.RefObject<Element | null> | (() => Element | null | undefined)
  // What to do, in a few words: "Change them all from any row".
  title: string
  // The button that closes it: "Got it".
  doneLabel: string
  // Where this guide sits in a short series: "1 of 2".
  step?: string
  // How, in a sentence or two.
  children: React.ReactNode
  className?: string
}>) {
  const find = () => (typeof target === "function" ? target() : target.current)
  const rect = useTargetRect(find, open)
  const callout = React.useRef<HTMLDivElement>(null)
  const done = React.useRef<HTMLButtonElement>(null)
  const titleId = React.useId()
  const [height, setHeight] = React.useState(0)
  React.useLayoutEffect(() => {
    if (open) setHeight(callout.current?.offsetHeight ?? 0)
  }, [open, rect])
  // Focus moves to "Got it" once it's shown, and back where it was after.
  const shown = open && rect !== null
  React.useEffect(() => {
    if (!shown) return undefined
    const before = document.activeElement
    done.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
      }
    }
    // Doing what it teaches closes it: a press in the spotlight goes on to
    // the target (a menu it opens shows over the page, not under the blur).
    const onPress = (event: PointerEvent) => {
      const spot = find()
      if (spot && event.target instanceof Node && spot.contains(event.target))
        onClose()
    }
    window.addEventListener("keydown", onKey, true)
    window.addEventListener("pointerdown", onPress, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      window.removeEventListener("pointerdown", onPress, true)
      if (before instanceof HTMLElement) before.focus({ preventScroll: true })
    }
    // `find` changes every render; the guide reads it as it is.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, onClose])
  if (typeof document === "undefined") return null
  const place = rect === null ? null : calloutPlace(rect, height)
  return createPortal(
    <AnimatePresence>
      {open && rect !== null && place !== null && (
        <motion.div
          key="guide"
          data-slot="guide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transitions.presence}
          // Only the blur and the callout take the pointer; the spotlight
          // passes it through to the page.
          className="pointer-events-none fixed inset-0 z-[60]"
        >
          {/* Everything but the spotlight: blurred, dimmed, and a click on
              it closes the guide. The spotlight stays live. */}
          <div
            aria-hidden
            onClick={onClose}
            className="pointer-events-auto absolute inset-0 bg-(--guide-scrim) backdrop-blur-[3px]"
            style={{ clipPath: holePath(rect) }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-[16px] shadow-[0_0_0_2px_var(--ring)] [corner-shape:var(--button-corner)]"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height
            }}
          />
          <motion.div
            ref={callout}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: place.side === "bottom" ? -6 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transitions.morph}
            className={cn(
              popupSurfaceClass,
              "pointer-events-auto absolute flex flex-col gap-1.5 p-4",
              className
            )}
            style={{ left: place.left, top: place.top, width: place.width }}
          >
            <p
              id={titleId}
              className="text-subtitle font-semibold text-foreground"
            >
              {title}
            </p>
            <div className="text-body text-muted-foreground">{children}</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-caption text-muted-foreground tabular-nums">
                {step}
              </span>
              <Button ref={done} size="sm" variant="primary" onClick={onClose}>
                {doneLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
