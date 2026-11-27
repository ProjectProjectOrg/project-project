import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion
} from "motion/react"
import { useLayoutEffect, useRef, useState, type RefObject } from "react"

import { transitions } from "../lib/springs"
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
const SUBMENU_POPUP = "[data-slot=dropdown-menu-sub-content]"
const AIMING = "data-menu-aiming"
const AIM_REST_MS = 100
const HIGHLIGHT_INSET = 1

type Point = Readonly<{ x: number; y: number }>

type Place = (rect: HighlightRect) => void

type Edges = Readonly<{
  left: number
  right: number
  top: number
  bottom: number
}>

export const aimsAt = (from: Point, to: Point, target: Edges) => {
  const reach = (target.left >= from.x ? target.left : target.right) - from.x
  const travelled = to.x - from.x
  if (reach === 0 || travelled * reach <= 0) return false
  const progress = travelled / reach
  return (
    to.y >= from.y + (target.top - from.y) * progress &&
    to.y <= from.y + (target.bottom - from.y) * progress
  )
}

const submenuOf = (trigger: HTMLElement) => {
  const id = trigger.getAttribute("aria-controls")
  return id === null ? null : document.getElementById(id)
}

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
  const pointed =
    selector === HIGHLIGHTED ? ownedAt(container, MENU_ROW, hit) : undefined
  const active =
    pointed ??
    firstOwned(container, selector) ??
    (selector === HIGHLIGHTED
      ? firstOwned(container, OPEN_SUBMENU_TRIGGER)
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
    pointed: element === pointed,
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
  let aimRest = 0
  const stopAiming = () => container.removeAttribute(AIMING)
  // Rows other than the open submenu's own ignore the pointer while it
  // heads for that submenu, so crossing them neither lights nor opens them.
  const aim = (from: Point | null, to: Point, over: EventTarget | null) => {
    clearTimeout(aimRest)
    const trigger =
      from !== null && over instanceof Node && container.contains(over)
        ? firstOwned(container, OPEN_SUBMENU_TRIGGER)
        : undefined
    const submenu = trigger === undefined ? null : submenuOf(trigger)
    const aiming =
      from !== null &&
      submenu !== null &&
      aimsAt(from, to, submenu.getBoundingClientRect())
    container.toggleAttribute(AIMING, aiming)
    if (aiming) aimRest = window.setTimeout(stopAiming, AIM_REST_MS)
  }
  const track = (event: PointerEvent) => {
    const next = { x: event.clientX, y: event.clientY }
    aim(pointer, next, event.target)
    pointer = next
    remeasure()
  }
  const yieldToKeys = () => {
    pointer = null
  }
  document.addEventListener("pointermove", track, {
    capture: true,
    passive: true
  })
  document.addEventListener("keydown", yieldToKeys, { capture: true })
  measure(pointer)
  // Row changes come in bursts (Base UI marks rows and opens submenus in
  // several steps), so they're measured once, in the frame they paint in.
  const mutations = new MutationObserver(() => {
    cancelAnimationFrame(frame)
    frame = 0
    measure(pointer)
  })
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
    clearTimeout(aimRest)
    stopAiming()
    document.removeEventListener("pointermove", track, { capture: true })
    document.removeEventListener("keydown", yieldToKeys, { capture: true })
    mutations.disconnect()
    resizes?.disconnect()
    container.removeAttribute("data-menu-highlight-host")
  }
}

export function whileOpen(element: HTMLElement, start: () => () => void) {
  const popup = element.closest<HTMLElement>(SUBMENU_POPUP)
  if (popup === null) return start()
  let stop: (() => void) | null = null
  const sync = () => {
    const open = popup.hasAttribute("data-open")
    if (open && stop === null) stop = start()
    if (!open && stop !== null) {
      stop()
      stop = null
    }
  }
  const openness = new MutationObserver(sync)
  openness.observe(popup, { attributes: true, attributeFilter: ["data-open"] })
  sync()
  return () => {
    openness.disconnect()
    stop?.()
  }
}

function useHighlightRect(
  anchorRef: RefObject<HTMLElement | null>,
  placeRef: RefObject<Place | null>,
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
    return whileOpen(container, () => {
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
        if (next && lit !== undefined) placeRef.current?.(next.rect)
        lit = next?.element
        if (next?.pointed && !next.element.matches(selector))
          next.element.setAttribute(HELD, "")
        setState((previous) => nextHighlight(previous, next?.rect ?? null))
      })
      return () => {
        stop()
        lit?.removeAttribute(HELD)
        setState((previous) => nextHighlight(previous, null))
      }
    })
  }, [anchorRef, placeRef, selector, restOnFirst])

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
  const placeRef = useRef<Place | null>(null)
  const { rect, session } = useHighlightRect(
    anchorRef,
    placeRef,
    selector,
    restOnFirst
  )
  const reduceMotion = useReducedMotion() ?? false

  return (
    <span ref={anchorRef} aria-hidden data-menu-chrome className="contents">
      <AnimatePresence>
        {rect === null ? null : (
          <HighlightShape
            key={session}
            rect={rect}
            placeRef={placeRef}
            reduceMotion={reduceMotion}
            restOnFirst={restOnFirst}
            className={className}
          />
        )}
      </AnimatePresence>
    </span>
  )
}

// Moves between rows are animated from the measurement itself, not from a
// render, so the fill sets off in the frame its row lights up.
function HighlightShape({
  rect,
  placeRef,
  reduceMotion,
  restOnFirst,
  className
}: Readonly<{
  rect: HighlightRect
  placeRef: RefObject<Place | null>
  reduceMotion: boolean
  restOnFirst: boolean
  className: string | undefined
}>) {
  const x = useMotionValue(rect.left)
  const y = useMotionValue(rect.top)
  const width = useMotionValue(rect.width)
  const height = useMotionValue(rect.height)

  useLayoutEffect(() => {
    const transition = reduceMotion ? { duration: 0 } : transitions.snap
    const place: Place = (next) => {
      animate(x, next.left, transition)
      animate(y, next.top, transition)
      animate(width, next.width, transition)
      animate(height, next.height, transition)
    }
    placeRef.current = place
    return () => {
      if (placeRef.current === place) placeRef.current = null
    }
  }, [placeRef, reduceMotion, x, y, width, height])

  return (
    <motion.span
      data-slot="menu-highlight"
      data-tone={rect.tone}
      className={cn(
        "pointer-events-none absolute top-0 left-0 block rounded-md [corner-shape:var(--button-corner)]",
        className
      )}
      style={{ x, y, width, height }}
      exit={{
        opacity: 0,
        transition: { duration: restOnFirst ? 0 : 0.15 }
      }}
    />
  )
}
