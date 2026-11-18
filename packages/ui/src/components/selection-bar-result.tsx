import { AnimatePresence, motion } from "motion/react"
import * as React from "react"

import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { Button } from "./button"
import { CircleAlert, CircleCheck } from "./icons"
import { LogoLoader } from "./logo"
import { TextSwap } from "./text-swap"

/*
 * The selection bar's result: what the last change did, shown in place of
 * the selection ("Updated 11 tickets · Undo", "Couldn't update 3 tickets ·
 * Retry · Cancel"), and the swap between the two.
 */

export type SelectionBarResult = Readonly<{
  // Pending while the change is on its way, then what came of it. All three
  // share one place in the bar: the mark, message and actions change in it.
  tone: "pending" | "success" | "error"
  // "Updating 11 tickets…", "Updated 11 tickets", "Couldn't update 3
  // tickets".
  message: string
  // Undo after a change; Retry and Cancel after a failure; none while
  // pending. The first is the one to reach for.
  actions: ReadonlyArray<Readonly<{ label: string; onClick: () => void }>>
}>

// The selection and a result swap in place: the old fades up and out while
// the new fades up in (popLayout, so the new one sets the size at once).
export const swap = {
  initial: { opacity: 0, y: 6, filter: "blur(2px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -6, filter: "blur(2px)" },
  transition: transitions.morph
} as const

// When what the bar shows swaps (the selection for a result, or back), its
// size glides from the old content's to the new one's on the same curve,
// then lets go so the content sizes it again. If focus was in the bar, it
// moves to the new content's first button rather than falling to the page.
// The house curve (--ease-standard, cubic-bezier(0.22, 1, 0.36, 1)) as a
// function of time, for the frame loop below: x(t) is solved by bisection.
const standardEase = (progress: number) => {
  const [x1, y1, x2, y2] = [0.22, 1, 0.36, 1]
  const bezier = (t: number, a: number, b: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  let low = 0
  let high = 1
  for (let index = 0; index < 20; index++) {
    const mid = (low + high) / 2
    if (bezier(mid, x1, x2) < progress) low = mid
    else high = mid
  }
  return bezier((low + high) / 2, y1, y2)
}

export function useSwapResize(
  ref: React.RefObject<HTMLDivElement | null>,
  showing: string,
  // The bar is on the page (it waits for the lane's width first).
  mounted: boolean
) {
  const size = React.useRef<{ width: number; height: number } | null>(null)
  const shown = React.useRef(showing)
  React.useLayoutEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const measure = () => {
      size.current = {
        width: element.offsetWidth,
        height: element.offsetHeight
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, mounted])
  React.useLayoutEffect(() => {
    const element = ref.current
    const from = size.current
    if (!element || from === null || shown.current === showing) return undefined
    shown.current = showing
    const hadFocus = element.contains(document.activeElement)
    // The bar's own edges (its hairline), around the content.
    const edgeX = element.offsetWidth - element.clientWidth
    const edgeY = element.offsetHeight - element.clientHeight
    // While it glides the new content keeps its natural size (w-max, one
    // row), so it can be measured every frame: values may still be rolling
    // in it (an Undo puts the old ones back as it swaps), and the bar
    // follows them instead of gliding to a size taken once and then
    // snapping. It starts at the old size before the first paint.
    element.dataset.swapping = ""
    const target = () => {
      const next = element.querySelector<HTMLElement>(
        `[data-swap="${showing}"]`
      )
      return next === null
        ? null
        : {
            width: next.offsetWidth + edgeX,
            height: next.offsetHeight + edgeY
          }
    }
    const set = (width: number, height: number) => {
      element.style.width = `${width}px`
      element.style.height = `${height}px`
    }
    set(from.width, from.height)
    const start = performance.now()
    const duration = transitions.morph.duration * 1000
    let frame = 0
    const release = () => {
      element.style.width = ""
      element.style.height = ""
      delete element.dataset.swapping
    }
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = standardEase(progress)
      const to = target()
      if (to === null || progress === 1) {
        release()
        return
      }
      set(
        from.width + (to.width - from.width) * eased,
        from.height + (to.height - from.height) * eased
      )
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    // The new content's first button, or (a pending result has none yet)
    // the content itself, which hands focus on once its buttons arrive.
    const focusNew = () => {
      const next = element.querySelector<HTMLElement>(
        `[data-swap="${showing}"]`
      )
      ;(next?.querySelector<HTMLElement>("button") ?? next)?.focus()
    }
    if (hadFocus) focusNew()
    // A menu that started the swap hands focus back to its trigger as it
    // closes, by then in the content on its way out: pass it on.
    const onFocusIn = (event: FocusEvent) => {
      const from =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>("[data-swap]")
          : null
      if (from !== null && from.dataset.swap !== showing) focusNew()
    }
    element.addEventListener("focusin", onFocusIn)
    const settle = window.setTimeout(
      () => element.removeEventListener("focusin", onFocusIn),
      600
    )
    return () => {
      cancelAnimationFrame(frame)
      release()
      window.clearTimeout(settle)
      element.removeEventListener("focusin", onFocusIn)
    }
  }, [ref, showing])
}

// A result in the bar: its mark, what happened, and what you can do now.
// Pending, success and failure morph in place: the mark crossfades (a
// spinner, then a check or an alert), the message rolls, and the actions
// grow in and out.
export function ResultContent({
  result
}: Readonly<{ result: SelectionBarResult }>) {
  // Holding focus while pending (it has no buttons yet), the result passes
  // it to its first action as soon as it has one: Undo, or Retry.
  const anchor = React.useRef<HTMLSpanElement>(null)
  const hasActions = result.actions.length > 0
  // Pressing an action that makes it pending (Retry) removes that button,
  // so focus steps back to the result itself until the next one arrives.
  React.useLayoutEffect(() => {
    const area = anchor.current?.closest<HTMLElement>("[data-swap]")
    if (!area) return
    if (hasActions && document.activeElement === area)
      area.querySelector<HTMLElement>("button")?.focus()
    if (!hasActions && area.contains(document.activeElement)) area.focus()
  }, [hasActions])
  const mark = new Map([
    ["pending", <LogoLoader key="pending" tone="current" className="size-4" />],
    [
      "success",
      <CircleCheck
        key="success"
        className="size-4 text-state-success"
        strokeWidth={1.75}
      />
    ],
    [
      "error",
      <CircleAlert
        key="error"
        className="size-4 text-destructive"
        strokeWidth={1.75}
      />
    ]
  ]).get(result.tone)
  return (
    <>
      <span
        ref={anchor}
        className={cn(
          "flex h-8 items-center pr-2 pl-2.5 text-body transition-colors duration-[260ms] ease-standard",
          result.tone === "error" ? "text-destructive" : "text-foreground",
          result.tone === "pending" && "text-muted-foreground"
        )}
      >
        <TextSwap
          icon={<span className="mr-2 flex">{mark}</span>}
          iconKey={result.tone}
        >
          {result.message}
        </TextSwap>
      </span>
      <AnimatePresence initial={false}>
        {result.actions.map((action, index) => (
          <motion.span
            key={action.label}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={transitions.morph}
            className="flex shrink-0 overflow-hidden"
          >
            <Button
              type="button"
              variant={index === 0 ? "secondary" : "ghost"}
              size="sm"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          </motion.span>
        ))}
      </AnimatePresence>
    </>
  )
}
