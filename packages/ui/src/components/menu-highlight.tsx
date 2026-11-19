import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useLayoutEffect, useRef, useState } from "react"

import { spring } from "../lib/springs"
import { cn } from "../lib/utils"

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
const CHOICE_ROW = "[role=menuitemradio], [role=option]"
const CHOSEN_ROW =
  "[role=menuitemradio][data-checked]:not([data-disabled]), [role=option][data-selected]:not([data-disabled])"
const RESTING = "data-menu-resting"
const HELD = "data-menu-held"
const NO_HIGHLIGHT = "[data-menu-no-highlight]"
const HIGHLIGHT_INSET = 1

type Point = Readonly<{ x: number; y: number }>

const toneOf = (element: HTMLElement) =>
  element.dataset.variant === "destructive" ? "destructive" : "default"

const firstOwned = (container: HTMLElement, selector: string) =>
  Array.from(container.querySelectorAll<HTMLElement>(selector)).find(
    (candidate) => candidate.closest("[data-menu-highlight-host]") === container
  )

export const chosenRow = (container: HTMLElement) =>
  firstOwned(container, MENU_ROW)?.matches(CHOICE_ROW)
    ? firstOwned(container, CHOSEN_ROW)
    : undefined

const ownerOf = (element: Element) =>
  element.closest("[data-menu-highlight-host]")

// The row under the pointer, from one hit test instead of measuring every
// row. A submenu over the point hides this menu's rows, as it does on screen.
const ownedAt = (
  container: HTMLElement,
  selector: string,
  hit: Element | null
) => {
  const row = hit?.closest<HTMLElement>(selector)
  return row && ownerOf(row) === container ? row : undefined
}

// Base UI ignores the pointer on a menu while one of its submenus is open,
// and marks no row as highlighted until the pointer moves again after the
// submenu closes. The row under the pointer bridges that handoff, so the
// highlight slides on instead of fading out and in.
// While the pointer crosses a gap between rows (a separator, the padding) the
// highlight keeps its last spot (`"hold"`) instead of fading out or jumping to
// rest, so it slides straight on to the next row. Over a non-item row marked
// `data-menu-no-highlight` (an inline control such as a theme switcher) the
// highlight clears instead of holding on the row the pointer came from.
const measureHighlight = (
  container: HTMLElement,
  selector: string,
  pointer: Point | null,
  restOnFirst: boolean,
  shown: boolean
) => {
  const hit =
    pointer === null ? null : document.elementFromPoint(pointer.x, pointer.y)
  if (ownedAt(container, NO_HIGHLIGHT, hit)) return null
  const active =
    firstOwned(container, selector) ??
    (selector === HIGHLIGHTED
      ? (firstOwned(container, OPEN_SUBMENU_TRIGGER) ??
        ownedAt(container, MENU_ROW, hit))
      : undefined)
  if (active === undefined && hit !== null && ownerOf(hit) === container)
    return "hold" as const
  const resting =
    active === undefined
      ? (chosenRow(container) ??
        (restOnFirst ? firstOwned(container, MENU_ROW) : undefined))
      : undefined
  if (resting !== undefined && shown && pointer !== null) return "hold" as const
  for (const row of container.querySelectorAll(`[${RESTING}]`)) {
    if (row !== resting) row.removeAttribute(RESTING)
  }
  resting?.setAttribute(RESTING, "")
  const element = active ?? resting
  if (element === undefined) return null
  return {
    element,
    rect: {
      top: element.offsetTop + HIGHLIGHT_INSET,
      left: element.offsetLeft,
      width: element.offsetWidth,
      height: element.offsetHeight - HIGHLIGHT_INSET * 2,
      tone: toneOf(element)
    } satisfies HighlightRect
  }
}

const sameRect = (a: HighlightRect | null, b: HighlightRect | null) =>
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
) => {
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
    remeasure()
  }
  document.addEventListener("pointermove", track, {
    capture: true,
    passive: true
  })
  measure(pointer)
  // Row changes come in bursts (Base UI marks rows and opens submenus in
  // several steps), so they're measured once, in the frame they paint in.
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
) {
  const [state, setState] = useState<HighlightState>({
    rect: null,
    session: 0
  })

  // While the highlight holds on a row the pointer has left, the row keeps
  // its lit look (`data-menu-held`), so its text never dims under the fill.
  useLayoutEffect(() => {
    const container = anchorRef.current?.parentElement
    if (!container) return undefined
    let lit: HTMLElement | undefined
    // Measured outside setState: React runs updaters during render, where
    // every layout read is a forced one.
    const stop = observeHighlight(container, (pointer) => {
      const next = measureHighlight(
        container,
        selector,
        pointer,
        restOnFirst,
        lit !== undefined
      )
      if (next === "hold") {
        lit?.setAttribute(HELD, "")
        return
      }
      lit?.removeAttribute(HELD)
      lit = next?.element
      setState((previous) => nextHighlight(previous, next?.rect ?? null))
    })
    return () => {
      stop()
      lit?.removeAttribute(HELD)
    }
  }, [anchorRef, selector, restOnFirst])

  return state
}

// Fills live in theme.css ([data-slot=menu-highlight]): hover and press
// match the ghost and destructive buttons.

export function MenuHighlight({
  selector = HIGHLIGHTED,
  restOnFirst = false,
  className
}: Readonly<{ selector?: string; restOnFirst?: boolean; className?: string }>) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const { rect, session } = useHighlightRect(anchorRef, selector, restOnFirst)
  const reduceMotion = useReducedMotion() ?? false

  return (
    <span ref={anchorRef} aria-hidden data-menu-chrome className="contents">
      <AnimatePresence>
        {rect === null ? null : (
          <motion.span
            key={session}
            data-slot="menu-highlight"
            data-tone={rect.tone}
            className={cn(
              "pointer-events-none absolute top-0 left-0 block rounded-md [corner-shape:var(--button-corner)]",
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
            transition={reduceMotion ? { duration: 0 } : spring.snap}
          />
        )}
      </AnimatePresence>
    </span>
  )
}
