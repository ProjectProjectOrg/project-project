import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useLayoutEffect, useRef, useState } from "react"

import { springs } from "@/lib/springs"
import { cn } from "@/lib/utils"

export type HighlightTone = "default" | "destructive"

export type HighlightRect = Readonly<{
  top: number
  left: number
  width: number
  height: number
  tone: HighlightTone
}>

type HighlightState = Readonly<{
  rect: HighlightRect | null
  session: number
}>

const HIGHLIGHTED = "[data-highlighted]:not(input)"
const OPEN_SUBMENU_TRIGGER =
  "[data-slot=dropdown-menu-sub-trigger][data-popup-open]"
const MENU_ROW =
  "[role^=menuitem]:not([data-disabled]), [role=option]:not([data-disabled])"
const RESTING = "data-menu-resting"
const HIGHLIGHT_INSET = 1

type Point = Readonly<{ x: number; y: number }>

const toneOf = (element: HTMLElement): HighlightTone =>
  element.dataset.variant === "destructive" ? "destructive" : "default"

const firstOwned = (
  container: HTMLElement,
  selector: string
): HTMLElement | undefined =>
  Array.from(container.querySelectorAll<HTMLElement>(selector)).find(
    (candidate) => candidate.closest("[data-menu-highlight-host]") === container
  )

const contains = (element: HTMLElement, pointer: Point): boolean => {
  const box = element.getBoundingClientRect()
  return (
    pointer.x >= box.left &&
    pointer.x <= box.right &&
    pointer.y >= box.top &&
    pointer.y <= box.bottom
  )
}

const ownedRowAt = (
  container: HTMLElement,
  pointer: Point
): HTMLElement | undefined =>
  Array.from(container.querySelectorAll<HTMLElement>(MENU_ROW)).find(
    (row) =>
      row.closest("[data-menu-highlight-host]") === container &&
      contains(row, pointer)
  )

// Base UI ignores the pointer on a menu while one of its submenus is open,
// and marks no row as highlighted until the pointer moves again after the
// submenu closes. The row under the pointer bridges that handoff, so the
// highlight slides on instead of fading out and in.
// With `restOnFirst`, a menu with no highlighted row shows the highlight on
// its first row, so a submenu opened by hover shows what its rows offer.
// While the pointer crosses a gap between rows (a separator, the padding) the
// highlight keeps its last spot (`"hold"`) instead of fading out or jumping to
// rest, so it slides straight on to the next row.
const measureHighlight = (
  container: HTMLElement,
  selector: string,
  pointer: Point | null,
  restOnFirst: boolean
): HighlightRect | null | "hold" => {
  const active =
    firstOwned(container, selector) ??
    (selector === HIGHLIGHTED
      ? (firstOwned(container, OPEN_SUBMENU_TRIGGER) ??
        (pointer === null ? undefined : ownedRowAt(container, pointer)))
      : undefined)
  if (active === undefined && pointer !== null && contains(container, pointer))
    return "hold"
  const resting =
    active === undefined && restOnFirst
      ? firstOwned(container, MENU_ROW)
      : undefined
  for (const row of container.querySelectorAll(`[${RESTING}]`)) {
    if (row !== resting) row.removeAttribute(RESTING)
  }
  resting?.setAttribute(RESTING, "")
  const element = active ?? resting
  if (element === undefined) return null
  return {
    top: element.offsetTop + HIGHLIGHT_INSET,
    left: element.offsetLeft,
    width: element.offsetWidth,
    height: element.offsetHeight - HIGHLIGHT_INSET * 2,
    tone: toneOf(element)
  }
}

const sameRect = (a: HighlightRect | null, b: HighlightRect | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height &&
    a.tone === b.tone)

export const nextHighlight = (
  previous: HighlightState,
  rect: HighlightRect | null
): HighlightState => {
  if (sameRect(previous.rect, rect)) return previous
  const fresh = previous.rect === null && rect !== null
  return { rect, session: fresh ? previous.session + 1 : previous.session }
}

function observeHighlight(
  container: HTMLElement,
  measure: (pointer: Point | null) => void
) {
  container.setAttribute("data-menu-highlight-host", "")
  let pointer: Point | null = null
  let frame = 0
  const remeasure = () => {
    if (frame !== 0) return
    frame = requestAnimationFrame(() => {
      frame = 0
      measure(pointer)
    })
  }
  const track = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY }
  }
  document.addEventListener("pointermove", track, {
    capture: true,
    passive: true
  })
  measure(pointer)
  const mutations = new MutationObserver(remeasure)
  mutations.observe(container, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-highlighted", "data-popup-open"]
  })
  const resizes =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(remeasure)
  resizes?.observe(container)
  return () => {
    cancelAnimationFrame(frame)
    document.removeEventListener("pointermove", track, { capture: true })
    mutations.disconnect()
    resizes?.disconnect()
    container.removeAttribute("data-menu-highlight-host")
  }
}

function useHighlightRect(
  anchorRef: React.RefObject<HTMLElement | null>,
  selector: string,
  restOnFirst: boolean
): HighlightState {
  const [state, setState] = useState<HighlightState>({
    rect: null,
    session: 0
  })

  useLayoutEffect(() => {
    const container = anchorRef.current?.parentElement
    return container
      ? observeHighlight(container, (pointer) =>
          setState((previous) => {
            const rect = measureHighlight(
              container,
              selector,
              pointer,
              restOnFirst
            )
            return rect === "hold" ? previous : nextHighlight(previous, rect)
          })
        )
      : undefined
  }, [anchorRef, selector, restOnFirst])

  return state
}

const TONES: Record<HighlightTone, string> = {
  default: "bg-hover",
  destructive: "bg-destructive/10 dark:bg-destructive/20"
}

export function MenuHighlight({
  selector = HIGHLIGHTED,
  restOnFirst = false,
  className
}: Readonly<{ selector?: string; restOnFirst?: boolean; className?: string }>) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const { rect, session } = useHighlightRect(anchorRef, selector, restOnFirst)
  const reduceMotion = useReducedMotion() ?? false

  return (
    <span ref={anchorRef} aria-hidden className="contents">
      <AnimatePresence>
        {rect === null ? null : (
          <motion.span
            key={session}
            data-slot="menu-highlight"
            data-tone={rect.tone}
            className={cn(
              "pointer-events-none absolute top-0 left-0 block rounded-md",
              TONES[rect.tone],
              className
            )}
            initial={{
              opacity: 1,
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            }}
            animate={{
              opacity: 1,
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            }}
            exit={{
              opacity: 0,
              transition: { duration: restOnFirst ? 0 : 0.15 }
            }}
            transition={reduceMotion ? { duration: 0 } : springs.fast}
          />
        )}
      </AnimatePresence>
    </span>
  )
}
