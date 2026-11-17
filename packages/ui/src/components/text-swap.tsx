import "@scritto/react"
import type { Scritto as ScrittoElement } from "@scritto/react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"

/*
 * TextSwap: a value that just changed, rolled into place.
 *
 *   <TextSwap icon={<TypeGlyph type={type} />}>{label}</TextSwap>
 *
 * The text goes through Scritto (https://scrit.to): it keeps the letters the
 * old and new value share and rolls the rest out and in, glyph by glyph,
 * easing the width as it goes. An optional icon beside it crossfades on the
 * same change.
 *
 * The rule: whenever a control shows a value the user just changed (a
 * select's chosen option, a toggle's label, a tooltip moving to the next
 * button), the change plays through TextSwap.
 */

// The house curve (--ease-standard), not Scritto's springy default: with it
// a growing value eases out evenly instead of landing half its width in the
// first frame.
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)"

const DURATION = {
  // A normal change of state.
  normal: transitions.morph.duration * 1000,
  // Paired with a 180ms move, like a tooltip gliding to the next trigger.
  fast: transitions.presence.duration * 1000
} as const

type TextSwapProps = Readonly<{
  // The value. Scritto animates text only, so it has to be a string.
  children: string
  // An icon before the text; it crossfades when `iconKey` changes.
  icon?: ReactNode
  // Which icon is showing. Defaults to the text, which suits icons that
  // follow the value (a ticket type's glyph, a sprint's state).
  iconKey?: string
  speed?: keyof typeof DURATION
  // Also announce the new text politely to screen readers. Scritto exposes
  // the value as a labelled image, which isn't read out when it changes;
  // use this for lines whose change matters on its own (a live hint).
  announce?: boolean
  className?: string
}>

function TextSwap({
  children,
  icon,
  iconKey,
  speed = "normal",
  announce = false,
  className
}: TextSwapProps) {
  const swap = (
    <span
      data-slot="text-swap"
      // Empty text (a value rolling out to nothing) has nothing to read.
      aria-hidden={announce || children === "" || undefined}
      className={cn(
        "inline-flex max-w-full min-w-0 items-center whitespace-nowrap",
        className
      )}
    >
      {icon != null && <IconSwap id={iconKey ?? children}>{icon}</IconSwap>}
      <SwapText value={children} duration={DURATION[speed]} />
    </span>
  )
  if (!announce) return swap
  return (
    <span aria-live="polite">
      <span className="sr-only">{children}</span>
      {swap}
    </span>
  )
}

// Scritto is a custom element with its own shadow root, costly to mount by
// the hundred (every row of a long list carries one). So a value shows as
// plain text until it first changes; only then does Scritto take over, put
// in with the old value and moved to the new one, so that change rolls too.
function SwapText({
  value,
  duration
}: Readonly<{ value: string; duration: number }>) {
  const [first] = useState(value)
  const [live, setLive] = useState(false)
  if (!live && value === first)
    return <span className="max-w-full min-w-0">{value}</span>
  if (!live) setLive(true)
  return <LiveText from={first} value={value} duration={duration} />
}

const isScritto = (element: HTMLElement | null): element is ScrittoElement =>
  element !== null && "update" in element && "setOptions" in element

function LiveText({
  from,
  value,
  duration
}: Readonly<{ from: string; value: string; duration: number }>) {
  const ref = useRef<HTMLElement>(null)
  const started = useRef(false)
  useLayoutEffect(() => {
    const element = ref.current
    if (!isScritto(element)) return
    element.setOptions({ transition: { duration, easing: EASING } })
    if (!started.current) {
      started.current = true
      element.update(from, false)
    }
    element.update(value, true)
  }, [from, value, duration])
  return (
    <scritto-text
      ref={ref}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Scritto hides its glyphs; the label is the value, as @scritto/react sets it
      role="img"
      aria-label={value}
      className="max-w-full min-w-0"
    />
  )
}

// The icon beside a value: the old one fades and shrinks out while the new
// one fades and grows in, stacked in one cell so nothing moves. With reduced
// motion it only fades (the app has no MotionConfig, so ask here).
function IconSwap({
  id,
  children
}: Readonly<{ id: string; children: ReactNode }>) {
  const scale = (useReducedMotion() ?? false) ? 1 : 0.8
  return (
    <span className="inline-grid shrink-0 place-items-center">
      <AnimatePresence initial={false}>
        <motion.span
          key={id}
          initial={{ opacity: 0, scale }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale }}
          transition={transitions.fade}
          className="col-start-1 row-start-1 inline-flex"
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export { TextSwap }
export type { TextSwapProps }
