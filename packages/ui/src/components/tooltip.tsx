// The tooltip store is module state (one host, many triggers) that the host
// reads while it renders. The React Compiler (on in the app) caches that read
// and the host never shows a tooltip, so this file opts out.
"use no memo"

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import type { AppHotkey } from "@tanstack/react-hotkeys"
import { AnimatePresence, motion, type Transition } from "motion/react"
import * as React from "react"
import { createPortal } from "react-dom"

import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { KbdShortcut, type KeyLabels } from "./kbd"
import { TextSwap } from "./text-swap"

/*
 * Our own tooltip, not Base UI's.
 *
 * Base UI's tooltip adds no ARIA of its own (no role, no aria-describedby);
 * what it gives is open-on-focus, Escape, a hover delay and edge flipping.
 * We replaced it because:
 *
 * - Every Base UI tooltip decides on its own, so a hovered one and a focused
 *   one could be open at once. Here a single host shows one tooltip for the
 *   whole app: the latest hover or keyboard focus wins, and when a hover
 *   ends the focused trigger's tooltip comes back.
 * - Gliding between triggers with a blur between labels needs control over
 *   the elements. Base UI's viewport turns transitions off while it measures,
 *   which swallowed the blur. Here the host measures the next label off
 *   screen first, then animates position, size and label on one clock.
 *
 * What we do ourselves: open on hover after 400ms (instant while a tooltip
 * is showing or just closed), open on keyboard focus (:focus-visible only),
 * close on click, Escape, scroll and resize, stay open while the pointer
 * moves onto the tooltip (WCAG 1.4.13), flip and clamp at the window edges,
 * role="tooltip", and aria-describedby when the tooltip says more than the
 * trigger's own label.
 */

type Side = "top" | "bottom" | "left" | "right"
type Align = "start" | "center" | "end"
type Placement = Readonly<{ side: Side; align: Align; sideOffset: number }>

const DEFAULT_PLACEMENT: Placement = {
  side: "top",
  align: "center",
  sideOffset: 6
}
const OPEN_DELAY = 400
// How long a tooltip waits after the pointer leaves before closing, so the
// pointer can cross the gap onto it, or onto the next trigger.
const CLOSE_GRACE = 100
// A card waits a little longer, so the pointer can travel into it.
const CARD_CLOSE_GRACE = 150
// After a tooltip closes, the next one opens without the delay for this long.
const WARM_FOR = 400
const EDGE = 8

type Kind = "tooltip" | "card"

type Registration = {
  element: HTMLElement | null
  // A tooltip's label. A card's content isn't passed here: its HoverCard
  // renders it into the host's slots (cardSlots), so it keeps the context of
  // where it was written.
  content: React.ReactNode
  placement: Placement
  className: string | undefined
  disabled: boolean
  kind: Kind
}

// "click": a card opened by clicking its trigger, which stays until Escape,
// a click outside, or another hover.
type Source = "hover" | "focus" | "click"

// ---------------------------------------------------------------- store

const registrations = new Map<string, { current: Registration }>()
const listeners = new Set<() => void>()
let version = 0
let activeId: string | null = null
let activeSource: Source | null = null
let focusedId: string | null = null
// A tooltip closed by a click or Escape stays closed until its trigger is
// left or blurred.
let suppressedId: string | null = null
let warmUntil = 0
// While the page scrolls (and briefly after), hovering opens nothing: content
// sliding under a still pointer fires hover events, which would reopen a
// tooltip on whatever passes and glide it along with the scroll.
const SCROLL_QUIET = 200
let scrollQuietUntil = 0
// Set when a scroll closes the tooltip, so it vanishes at once instead of
// fading out over content that has already moved on.
let closedByScroll = false
let showTimer: number | undefined
// The host's surface, so a hover inside an open card doesn't replace it.
let surfaceElement: HTMLElement | null = null
// Where an active card's content goes: an off-screen copy to measure, and
// the live one inside the surface.
type CardSlots = { measure: HTMLElement | null; live: HTMLElement | null }
const cardSlots: CardSlots = {
  measure: null,
  live: null
}
let hideTimer: number | undefined

const emit = () => {
  version += 1
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const getVersion = () => version

const clearTimers = () => {
  window.clearTimeout(showTimer)
  window.clearTimeout(hideTimer)
}

// A trigger whose menu or popover is open shows no tooltip: it would sit on
// top of the popup it opened.
const popupOpen = (id: string) =>
  registrations
    .get(id)
    ?.current.element?.matches("[data-popup-open], [aria-expanded='true']") ??
  false

const kindOf = (id: string | null) =>
  id === null ? null : (registrations.get(id)?.current.kind ?? null)

const graceFor = (id: string | null) =>
  kindOf(id) === "card" ? CARD_CLOSE_GRACE : CLOSE_GRACE

// A trigger inside an open card (a branch chip in a ticket's peek) doesn't
// take the host over: the card stays.
const insideSurface = (id: string) => {
  const element = registrations.get(id)?.current.element
  return element != null && surfaceElement?.contains(element) === true
}

const show = (id: string, source: Source) => {
  clearTimers()
  if (popupOpen(id)) return
  if (insideSurface(id)) return
  if (activeId === id && activeSource === source) return
  activeId = id
  activeSource = source
  emit()
}

const hide = (instant = false) => {
  clearTimers()
  closedByScroll = instant
  if (activeId === null) return
  warmUntil = performance.now() + WARM_FOR
  activeId = null
  activeSource = null
  emit()
}

const isWarm = () => activeId !== null || performance.now() < warmUntil

const tooltipStore = {
  hoverStart(id: string) {
    if (suppressedId === id) return
    if (performance.now() < scrollQuietUntil) return
    clearTimers()
    if (isWarm()) show(id, "hover")
    else showTimer = window.setTimeout(() => show(id, "hover"), OPEN_DELAY)
  },
  hoverEnd(id: string) {
    window.clearTimeout(showTimer)
    if (suppressedId === id) suppressedId = null
    if (activeId !== id || activeSource !== "hover") return
    hideTimer = window.setTimeout(() => {
      // A trigger that still has keyboard focus gets its tooltip back.
      if (focusedId !== null && focusedId !== id) show(focusedId, "focus")
      else hide()
    }, graceFor(id))
  },
  // A card trigger that opens on click (for keyboard and touch): it opens at
  // once and stays until Escape or a click outside.
  click(id: string) {
    if (suppressedId === id) suppressedId = null
    show(id, "click")
  },
  focusIn(id: string) {
    focusedId = id
    if (suppressedId !== id) show(id, "focus")
  },
  focusOut(id: string) {
    if (focusedId === id) focusedId = null
    if (suppressedId === id) suppressedId = null
    // Wait a tick: when focus moves straight to the next trigger (Tab
    // along a toolbar), its focusIn cancels this, and the tooltip glides
    // over just like it does for the pointer.
    if (activeId === id && activeSource === "focus") {
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => hide(), 0)
    }
  },
  dismiss() {
    window.clearTimeout(showTimer)
    suppressedId = activeId
    hide()
  },
  // The trigger opened a menu or popover: its tooltip goes away at once.
  popupOpened(id: string) {
    window.clearTimeout(showTimer)
    if (activeId === id) hide()
  },
  popupEnter() {
    window.clearTimeout(hideTimer)
  },
  popupLeave() {
    if (activeSource === "hover")
      hideTimer = window.setTimeout(() => hide(), graceFor(activeId))
  },
  touch(id: string) {
    if (activeId === id) emit()
  },
  scrolled() {
    scrollQuietUntil = performance.now() + SCROLL_QUIET
    warmUntil = 0
    clearTimeout(showTimer)
    if (activeId === null) return
    // A keyboard-focused tooltip, or a card opened by a click, stays and is
    // placed again by its trigger.
    if (activeSource === "focus" || activeSource === "click") emit()
    else {
      hide(true)
      warmUntil = 0
    }
  },
  unregister(id: string) {
    registrations.delete(id)
    if (focusedId === id) focusedId = null
    if (activeId === id) hide()
  }
}

// ------------------------------------------------------------ placement

type Rect = Readonly<{ x: number; y: number; width: number; height: number }>

const opposite: Record<Side, Side> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left"
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

// Where the tooltip's top-left corner goes, flipped to the other side when
// it doesn't fit and kept inside the window.
function place(
  trigger: DOMRect,
  size: Readonly<{ width: number; height: number }>,
  placement: Placement
): Rect & { side: Side } {
  const { sideOffset, align } = placement
  const vw = window.innerWidth
  const vh = window.innerHeight
  const fits = (side: Side) =>
    side === "top"
      ? trigger.top - sideOffset - size.height >= EDGE
      : side === "bottom"
        ? trigger.bottom + sideOffset + size.height <= vh - EDGE
        : side === "left"
          ? trigger.left - sideOffset - size.width >= EDGE
          : trigger.right + sideOffset + size.width <= vw - EDGE
  const side =
    fits(placement.side) || !fits(opposite[placement.side])
      ? placement.side
      : opposite[placement.side]
  const vertical = side === "top" || side === "bottom"
  const crossStart = vertical ? trigger.left : trigger.top
  const crossLength = vertical ? trigger.width : trigger.height
  const ownLength = vertical ? size.width : size.height
  const cross =
    align === "start"
      ? crossStart
      : align === "end"
        ? crossStart + crossLength - ownLength
        : crossStart + crossLength / 2 - ownLength / 2
  const main =
    side === "top"
      ? trigger.top - sideOffset - size.height
      : side === "bottom"
        ? trigger.bottom + sideOffset
        : side === "left"
          ? trigger.left - sideOffset - size.width
          : trigger.right + sideOffset
  const x = clamp(vertical ? cross : main, EDGE, vw - size.width - EDGE)
  const y = clamp(vertical ? main : cross, EDGE, vh - size.height - EDGE)
  return { x, y, width: size.width, height: size.height, side }
}

const origin: Record<Side, string> = {
  top: "50% 100%",
  bottom: "50% 0%",
  left: "100% 50%",
  right: "0% 50%"
}

// ---------------------------------------------------------------- styles

// Raised: light in light, dark in dark (--tooltip), with a hairline and a
// top light (--tooltip-edge), so a tooltip reads above any surface without
// the glare of an inverted label. Squircle corners at about half the
// height, no shadow.
const inkClass =
  "rounded-[9px] bg-(color:--tooltip) px-2 py-[5px] text-caption text-foreground shadow-(--tooltip-edge) [corner-shape:var(--button-corner)]"

// A hover card: the tooltip's fill and edge, at a card's corners. Shared
// with HoverCardContent and PopoverContent's "hover" surface.
export const hoverCardSurfaceClass =
  "rounded-[14px] bg-(color:--tooltip) text-foreground shadow-(--tooltip-edge) outline-none [corner-shape:var(--button-corner)]"

// A card's content box: its natural width up to 24rem, 10px by 8px of
// padding unless the card sets its own (p-1 around menu rows).
const cardContentClass = "w-max max-w-[min(24rem,calc(100vw-16px))] px-2.5 py-2"

// A label stays on one line; a caller that sets a max width (a longer hint)
// gets wrapping at that width.
const contentClass =
  "w-max whitespace-nowrap [&[class*='max-w-']]:whitespace-normal"

// The glide and the resize: 180ms on ease-standard (transitions.presence).
// A text label rolls over on the same clock (TextSwap speed="fast"). The box
// clips, so the label can't spill while it grows.
const glide: Transition = transitions.presence
// Opening and closing: a fade and a scale from 96% over 160ms ease-out.
// ease-standard over 100ms was 76% opaque after 60ms and read as a pop.
const appear: Transition = { duration: 0.16, ease: "easeOut" }

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

const onSurfaceEnter = () => tooltipStore.popupEnter()
const onSurfaceLeave = () => tooltipStore.popupLeave()

// ------------------------------------------------------------------ host

const TOOLTIP_ID = "pp-tooltip"
let primaryHost: symbol | null = null

/**
 * Renders the one tooltip. Mount it once near the root (`TooltipProvider`
 * does); extra hosts render nothing.
 */
function TooltipHost() {
  const [token] = React.useState(() => Symbol("tooltip-host"))
  const [primary, setPrimary] = React.useState(false)
  React.useEffect(() => {
    if (primaryHost !== null) return
    primaryHost = token
    setPrimary(true)
    return () => {
      if (primaryHost === token) primaryHost = null
    }
  }, [token])
  if (!primary) return null
  return <HostSurface />
}

type Layout = Rect & { side: Side; id: string; glide: boolean }

function HostSurface() {
  const storeVersion = React.useSyncExternalStore(
    subscribe,
    getVersion,
    getVersion
  )
  const id = activeId
  const registration = id === null ? null : registrations.get(id)?.current
  const card = registration?.kind === "card"
  // An empty label (a name that isn't set) has nothing to show. A card's
  // content lives in its slots, so it always has some.
  const raw = registration?.disabled
    ? null
    : card
      ? true
      : registration?.content
  const content = raw === "" ? null : raw
  // A card's size changes as its content loads; measure it again then.
  const [cardSize, setCardSize] = React.useState(0)
  // Stable refs: a new callback each render would detach and reattach the
  // slots, and every reattach tells the cards to render again.
  const setMeasureSlot = React.useCallback((element: HTMLDivElement | null) => {
    measureRef.current = element
    if (cardSlots.measure === element) return
    cardSlots.measure = element
    emit()
  }, [])
  const setLiveSlot = React.useCallback((element: HTMLDivElement | null) => {
    if (cardSlots.live === element) return
    cardSlots.live = element
    emit()
  }, [])
  // Native listeners, not React's: a card's content is portaled in from
  // its HoverCard, so React counts it as part of the trigger's tree and
  // would never report the pointer entering the surface through it.
  const setSurface = React.useCallback((element: HTMLDivElement | null) => {
    const previous = surfaceRef.current
    if (previous !== null && previous !== element) {
      previous.removeEventListener("pointerenter", onSurfaceEnter)
      previous.removeEventListener("pointerleave", onSurfaceLeave)
    }
    surfaceRef.current = element
    surfaceElement = element
    if (element !== null && previous !== element) {
      element.addEventListener("pointerenter", onSurfaceEnter)
      element.addEventListener("pointerleave", onSurfaceLeave)
    }
  }, [])
  const measureRef = React.useRef<HTMLDivElement>(null)
  const surfaceRef = React.useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = React.useState<Layout | null>(null)
  const describedRef = React.useRef<HTMLElement | null>(null)

  // Measure the next label off screen, then place the tooltip for it.
  React.useLayoutEffect(() => {
    const element = registration?.element
    const measure = measureRef.current
    if (id === null || !element || !measure || content == null) {
      setLayout(null)
      return
    }
    const box = measure.getBoundingClientRect()
    const next = place(
      element.getBoundingClientRect(),
      { width: Math.ceil(box.width), height: Math.ceil(box.height) },
      registration.placement
    )
    setLayout((previous) => {
      if (
        previous !== null &&
        previous.id === id &&
        previous.x === next.x &&
        previous.y === next.y &&
        previous.width === next.width &&
        previous.height === next.height
      )
        return previous
      return {
        ...next,
        id,
        // Glide only to a new trigger while a tooltip is on screen (or still
        // leaving); a scroll or a content change for the same trigger snaps.
        glide:
          surfaceRef.current !== null &&
          previous !== null &&
          previous.id !== id &&
          !prefersReducedMotion()
      }
    })
    // Re-measure whenever the store changes: a new trigger or new content.
  }, [storeVersion, id, content, registration, cardSize])

  // Watch the measured copy while a card shows: loading data grows it.
  React.useEffect(() => {
    const measure = measureRef.current
    if (!card || !measure) return undefined
    const observer = new ResizeObserver(() => setCardSize((n) => n + 1))
    observer.observe(measure)
    return () => observer.disconnect()
  }, [card, id])

  // A click outside an open card closes it.
  React.useEffect(() => {
    if (!card || id === null) return undefined
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (surfaceRef.current?.contains(target)) return
      if (registration?.element?.contains(target)) return
      hide()
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true)
  }, [card, id, registration])

  // Describe the trigger by the tooltip when it says more than the label.
  React.useEffect(() => {
    const element = registration?.element ?? null
    const previous = describedRef.current
    if (previous && previous !== element)
      previous.removeAttribute("aria-describedby")
    describedRef.current = null
    // A card isn't a description: its trigger keeps its own name.
    if (!element || content == null || card) return
    const label = element.getAttribute("aria-label")?.trim()
    const text = measureRef.current?.textContent?.trim()
    if (text && text !== label) {
      element.setAttribute("aria-describedby", TOOLTIP_ID)
      describedRef.current = element
    }
  })

  // Any scroll, anywhere, closes a hover tooltip at once and keeps hovers
  // from opening one until the scrolling stops. A keyboard-focused tooltip
  // stays, and follows its trigger.
  React.useEffect(() => {
    const onScroll = (event: Event) => {
      // Scrolling inside an open card (a long list) keeps it.
      if (surfaceRef.current?.contains(event.target as Node)) return
      tooltipStore.scrolled()
    }
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true
    })
    return () =>
      window.removeEventListener("scroll", onScroll, { capture: true })
  }, [])

  // Escape and resize close it.
  React.useEffect(() => {
    if (id === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") tooltipStore.dismiss()
    }
    const onResize = () => hide(true)
    document.addEventListener("keydown", onKey)
    window.addEventListener("resize", onResize)
    return () => {
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", onResize)
    }
  }, [id])

  // Stay mounted while the next label is measured (layout still holds the
  // previous trigger for that one render), so the label swap has an old
  // label to blur out instead of the tooltip remounting.
  const visible = id !== null && content != null && layout !== null
  const reduced = prefersReducedMotion()
  const move = layout?.glide ? glide : { duration: 0 }

  return createPortal(
    <>
      {/* Off-screen copy of the next label, measured before it shows. */}
      <div
        aria-hidden
        className="pointer-events-none invisible fixed top-0 left-0 -z-10"
      >
        {card ? (
          <div
            ref={setMeasureSlot}
            inert
            className={cn(cardContentClass, registration?.className)}
          />
        ) : (
          <div
            ref={measureRef}
            className={cn(inkClass, contentClass, registration?.className)}
          >
            {content}
          </div>
        )}
      </div>
      <AnimatePresence custom={closedByScroll}>
        {visible && layout && (
          <motion.div
            key="tooltip"
            ref={setSurface}
            id={card ? undefined : TOOLTIP_ID}
            role={card ? undefined : "tooltip"}
            data-slot={card ? "hover-card-content" : "tooltip-content"}
            data-side={layout.side}
            initial={{
              opacity: 0,
              scale: reduced ? 1 : 0.96,
              x: layout.x,
              y: layout.y,
              width: layout.width,
              height: layout.height
            }}
            animate={{
              opacity: 1,
              scale: 1,
              x: layout.x,
              y: layout.y,
              width: layout.width,
              height: layout.height
            }}
            custom={closedByScroll}
            exit="closed"
            variants={{
              closed: (instant: boolean) => ({
                opacity: 0,
                scale: reduced ? 1 : 0.96,
                transition: instant ? { duration: 0 } : appear
              })
            }}
            transition={{
              opacity: appear,
              scale: appear,
              x: move,
              y: move,
              width: move,
              height: move
            }}
            style={{ transformOrigin: origin[layout.side] }}
            // The corners ease between a label's and a card's with the glide.
            className={cn(
              card ? hoverCardSurfaceClass : inkClass,
              "fixed top-0 left-0 z-50 grid overflow-hidden p-0 transition-[border-radius] duration-180 ease-standard",
              // A card that only shows (git, a sprint's estimate) lets the
              // pointer through, so it never catches it on its way past.
              registration?.className?.includes("pointer-events-none") &&
                "pointer-events-none"
            )}
          >
            {card ? (
              // The card's content arrives through its slot; it fades in
              // while the box glides and grows to it.
              <motion.div
                key={id}
                ref={setLiveSlot}
                initial={layout.glide ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={appear}
                className={cn(
                  cardContentClass,
                  "col-start-1 row-start-1 self-start",
                  registration?.className
                )}
              />
            ) : (
              <div
                className={cn(
                  inkClass,
                  contentClass,
                  "col-start-1 row-start-1 bg-transparent shadow-none",
                  registration?.className
                )}
              >
                {/* A text label rolls to the next one with the glide; a
                    label with elements (a shortcut key) updates in place. */}
                {typeof content === "string" ? (
                  <TextSwap speed="fast">{content}</TextSwap>
                ) : (
                  content
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body
  )
}

/** Mounts the tooltip host next to an app or a gallery. */
function TooltipProvider({
  children
}: Readonly<{ children?: React.ReactNode }>) {
  return (
    <>
      {children}
      <TooltipHost />
    </>
  )
}

// --------------------------------------------------------------- trigger

type ContentSlot = {
  children: React.ReactNode
  placement: Placement
  className: string | undefined
}

type TooltipContextValue = {
  id: string
  open: boolean | undefined
  content: React.RefObject<ContentSlot | null>
  setTrigger: (element: HTMLElement | null) => void
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null)
const GroupPlacementContext = React.createContext<Placement | null>(null)

// The side every hover in a container opens on, tooltips and cards alike.
// One container never mixes sides: going from a tooltip above to a card below
// would make the box jump across its trigger instead of gliding.
const HoverSideContext = React.createContext<Side | null>(null)

/**
 * Sets the side for every tooltip and hover card inside it that doesn't
 * name its own (a row, a section header: everything below).
 */
function HoverSide({
  side,
  children
}: Readonly<{ side: Side; children: React.ReactNode }>) {
  return <HoverSideContext value={side}>{children}</HoverSideContext>
}

type TriggerProps = Omit<React.ComponentProps<"button">, "content"> &
  Readonly<{
    render?: useRender.RenderProp
    // Turns the tooltip off without touching the trigger.
    disabled?: boolean
  }>

type TriggerOptions = Readonly<{
  onElement?: (element: HTMLElement | null) => void
  // A card trigger that also opens on click (Enter for the keyboard, a tap
  // for touch), for cards that hold more than the trigger says.
  openOnClick?: boolean
  // A card's trigger is a link unless it renders something else.
  tagName?: "button" | "a"
  // A card stays open when its trigger is pressed (like Base UI's Preview
  // Card); a tooltip goes away, since the press is what the label was for.
  keepOnPress?: boolean
}>

function useTrigger(
  id: string,
  read: () => Omit<Registration, "element" | "disabled">,
  { render, disabled = false, ref, ...props }: TriggerProps,
  {
    onElement,
    openOnClick = false,
    tagName = "button",
    keepOnPress = false
  }: TriggerOptions = {}
) {
  const elementRef = React.useRef<HTMLElement | null>(null)
  const registration = React.useRef<Registration>({
    element: null,
    content: null,
    placement: DEFAULT_PLACEMENT,
    className: undefined,
    disabled,
    kind: "tooltip"
  })

  React.useLayoutEffect(() => {
    registration.current = {
      ...read(),
      element: elementRef.current,
      disabled
    }
    registrations.set(id, registration)
    tooltipStore.touch(id)
  })
  React.useEffect(() => () => tooltipStore.unregister(id), [id])
  // A popup trigger (menu, popover) marks itself open with data-popup-open or
  // aria-expanded. Watch for it rather than rely on our pointerdown: the
  // popup's own handler runs first and can stop ours.
  React.useEffect(() => {
    const element = elementRef.current
    if (element === null) return undefined
    const observer = new MutationObserver(() => {
      if (popupOpen(id)) tooltipStore.popupOpened(id)
    })
    observer.observe(element, {
      attributes: true,
      attributeFilter: ["data-popup-open", "aria-expanded"]
    })
    return () => observer.disconnect()
  }, [id])

  const setElement = React.useCallback(
    (element: HTMLElement | null) => {
      elementRef.current = element
      onElement?.(element)
    },
    [onElement]
  )

  const handlers: React.HTMLAttributes<HTMLElement> = disabled
    ? {}
    : {
        onPointerEnter: (event) => {
          if (event.pointerType !== "touch") tooltipStore.hoverStart(id)
        },
        onPointerLeave: (event) => {
          if (event.pointerType !== "touch") tooltipStore.hoverEnd(id)
        },
        onPointerDown: () => {
          if (!openOnClick && !keepOnPress) tooltipStore.dismiss()
        },
        ...(openOnClick ? { onClick: () => tooltipStore.click(id) } : {}),
        onFocus: (event) => {
          if (event.currentTarget.matches(":focus-visible"))
            tooltipStore.focusIn(id)
        },
        onBlur: () => tooltipStore.focusOut(id)
      }

  return useRender({
    defaultTagName: tagName,
    render,
    ref: ref ? [ref, setElement] : setElement,
    props: mergeProps<"button">(
      { "data-slot": "tooltip-trigger" } as React.ComponentProps<"button">,
      handlers,
      props
    )
  })
}

/** One tooltip: a `TooltipTrigger` and its `TooltipContent`. */
function Tooltip({
  open,
  children
}: Readonly<{
  // Pins this tooltip open in place (for docs and state galleries).
  open?: boolean
  children: React.ReactNode
}>) {
  const id = React.useId()
  const content = React.useRef<ContentSlot | null>(null)
  const [trigger, setTrigger] = React.useState<HTMLElement | null>(null)
  const value = React.useMemo(
    () => ({ id, open, content, setTrigger }),
    [id, open]
  )
  return (
    <TooltipContext value={value}>
      {children}
      {open && trigger && <PinnedTooltip trigger={trigger} content={content} />}
    </TooltipContext>
  )
}

function TooltipTrigger(props: TriggerProps) {
  const context = React.useContext(TooltipContext)
  if (context === null)
    throw new Error("TooltipTrigger must be inside a Tooltip")
  return useTrigger(
    context.id,
    () => ({
      content: context.content.current?.children ?? null,
      placement: context.content.current?.placement ?? DEFAULT_PLACEMENT,
      className: context.content.current?.className,
      kind: "tooltip"
    }),
    // A pinned tooltip is drawn by the Tooltip itself, not the host.
    context.open ? { ...props, disabled: true } : props,
    { onElement: context.setTrigger }
  )
}

type TooltipContentProps = Readonly<{
  children: React.ReactNode
  // Unset: the container's (HoverSide, TooltipGroup), else above for a
  // tooltip and below for a card.
  side?: Side
  align?: Align
  sideOffset?: number
  className?: string
}>

/** What the tooltip shows, and where. Renders nothing in place. */
function TooltipContent({
  children,
  side: ownSide,
  align = "center",
  sideOffset = 6,
  className
}: TooltipContentProps) {
  const context = React.useContext(TooltipContext)
  if (context === null)
    throw new Error("TooltipContent must be inside a Tooltip")
  const containerSide = React.useContext(HoverSideContext)
  const side = ownSide ?? containerSide ?? "top"
  React.useLayoutEffect(() => {
    context.content.current = {
      children,
      placement: { side, align, sideOffset },
      className
    }
    tooltipStore.touch(context.id)
  })
  return null
}

/**
 * Sets the placement for the triggers inside it, like a toolbar. Every
 * tooltip already shares the one host, so moving along a row glides.
 */
function TooltipGroup({
  children,
  side = "top",
  align = "center",
  sideOffset = 6
}: Readonly<{
  children: React.ReactNode
  side?: Side
  align?: Align
  sideOffset?: number
}>) {
  const placement = React.useMemo(
    () => ({ side, align, sideOffset }),
    [side, align, sideOffset]
  )
  return (
    <GroupPlacementContext value={placement}>
      <HoverSideContext value={side}>{children}</HoverSideContext>
    </GroupPlacementContext>
  )
}

/** A trigger that carries its own tooltip, for rows of icon buttons. */
function TooltipGroupTrigger({
  tooltip,
  ...props
}: TriggerProps & Readonly<{ tooltip: React.ReactNode }>) {
  const id = React.useId()
  const placement = React.useContext(GroupPlacementContext) ?? DEFAULT_PLACEMENT
  return useTrigger(
    id,
    () => ({
      content: tooltip,
      placement,
      className: undefined,
      kind: "tooltip"
    }),
    props
  )
}

// ---------------------------------------------------------------- pinned

function PinnedTooltip({
  trigger,
  content
}: Readonly<{
  trigger: HTMLElement
  content: TooltipContextValue["content"]
}>) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [layout, setLayout] = React.useState<
    (Rect & { side: Side; hidden: boolean }) | null
  >(null)
  const current = content.current
  // It's position: fixed like the live one, so it's placed again on every
  // scroll and resize, and hidden while its trigger is out
  // of view rather than pinned to the window edge.
  React.useLayoutEffect(() => {
    const element = ref.current
    if (!element || !current) return
    const update = () => {
      const box = element.getBoundingClientRect()
      const anchor = trigger.getBoundingClientRect()
      const next = place(
        anchor,
        { width: Math.ceil(box.width), height: Math.ceil(box.height) },
        current.placement
      )
      const hidden =
        anchor.bottom < 0 ||
        anchor.top > window.innerHeight ||
        anchor.right < 0 ||
        anchor.left > window.innerWidth
      setLayout((previous) =>
        previous &&
        previous.x === next.x &&
        previous.y === next.y &&
        previous.side === next.side &&
        previous.hidden === hidden
          ? previous
          : { ...next, hidden }
      )
    }
    // Scroll events already arrive once per frame; update straight away.
    update()
    window.addEventListener("scroll", update, { capture: true, passive: true })
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, { capture: true })
      window.removeEventListener("resize", update)
    }
  }, [trigger, current])
  if (!current) return null
  return createPortal(
    <div
      ref={ref}
      data-slot="tooltip-content"
      data-side={layout?.side}
      aria-hidden
      style={{
        visibility: layout?.hidden ? "hidden" : undefined,
        transform: layout
          ? `translate(${layout.x}px, ${layout.y}px)`
          : "translate(-9999px, 0)"
      }}
      className={cn(
        inkClass,
        contentClass,
        "pointer-events-none fixed top-0 left-0 z-40",
        current.className
      )}
    >
      {current.children}
    </div>,
    document.body
  )
}

/**
 * A trigger whose tooltip names an app hotkey and shows its keys: the
 * hotkey's own name (its meta.name) unless a label is given.
 */
function ShortcutTooltip({
  hotkey,
  label,
  keyLabels,
  children
}: Readonly<{
  hotkey: AppHotkey
  label?: string
  keyLabels: KeyLabels
  children: React.ReactElement
}>) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent className="flex items-center gap-2">
        {label ?? hotkey.meta?.name}
        {hotkey.hotkey !== null && (
          <KbdShortcut
            keys={hotkey.hotkey}
            keyLabels={keyLabels}
            size="sm"
            aria-hidden
          />
        )}
      </TooltipContent>
    </Tooltip>
  )
}

// ------------------------------------------------------------ hover card

type HoverCardContextValue = {
  id: string
  content: React.RefObject<ContentSlot | null>
}

const HoverCardContext = React.createContext<HoverCardContextValue | null>(null)

/**
 * One hover card: a `HoverCardTrigger` and its `HoverCardContent`, drawn by
 * the same host as the tooltips, so moving from a tooltip to a card (or
 * back) glides and grows instead of closing and opening. Its content renders
 * here, into the host's slots, so it keeps this spot's context.
 */
function HoverCard({ children }: Readonly<{ children: React.ReactNode }>) {
  const id = React.useId()
  const content = React.useRef<ContentSlot | null>(null)
  const value = React.useMemo(() => ({ id, content }), [id])
  return (
    <HoverCardContext value={value}>
      {children}
      <CardPortals id={id} content={content} />
    </HoverCardContext>
  )
}

// Only this part follows the store, so a hover elsewhere doesn't render the
// card's trigger (a row full of chips) again.
function CardPortals({
  id,
  content
}: Readonly<{ id: string; content: React.RefObject<ContentSlot | null> }>) {
  React.useSyncExternalStore(subscribe, getVersion, getVersion)
  const children = activeId === id ? content.current?.children : null
  if (children == null) return null
  // React events bubble through the React tree, so a click or right-click in
  // the card would reach the row it was written in (opening the row, its
  // context menu). They stop at the card.
  const body = (
    <div className="contents" {...stopAtCard}>
      {children}
    </div>
  )
  return (
    <>
      {cardSlots.measure !== null && createPortal(body, cardSlots.measure)}
      {cardSlots.live !== null && createPortal(body, cardSlots.live)}
    </>
  )
}

const stop = (event: React.SyntheticEvent) => event.stopPropagation()
const stopAtCard = {
  onClick: stop,
  onDoubleClick: stop,
  onContextMenu: stop,
  onPointerDown: stop,
  onPointerUp: stop,
  onMouseDown: stop,
  onMouseUp: stop,
  onKeyDown: stop,
  onFocus: stop,
  onBlur: stop
} as const

function HoverCardTrigger({
  openOnClick = false,
  ...props
}: TriggerProps & Readonly<{ openOnClick?: boolean }>) {
  const context = React.useContext(HoverCardContext)
  if (context === null)
    throw new Error("HoverCardTrigger must be inside a HoverCard")
  return useTrigger(
    context.id,
    () => ({
      content: null,
      placement: context.content.current?.placement ?? CARD_PLACEMENT,
      className: context.content.current?.className,
      kind: "card"
    }),
    { "data-slot": "hover-card-trigger", ...props } as TriggerProps,
    { openOnClick, tagName: "a", keepOnPress: true }
  )
}

const CARD_PLACEMENT: Placement = {
  side: "bottom",
  align: "start",
  sideOffset: 6
}

/**
 * What the card shows, and where: below its trigger and aligned to its start
 * unless set. Width and padding go in `className` (10px by 8px by default,
 * `p-1` around menu rows). Renders nothing in place.
 */
function HoverCardContent({
  children,
  side: ownSide,
  align = "start",
  sideOffset = 6,
  className
}: TooltipContentProps) {
  const context = React.useContext(HoverCardContext)
  if (context === null)
    throw new Error("HoverCardContent must be inside a HoverCard")
  const containerSide = React.useContext(HoverSideContext)
  const side = ownSide ?? containerSide ?? "bottom"
  React.useLayoutEffect(() => {
    context.content.current = {
      children,
      placement: { side, align, sideOffset },
      className
    }
    tooltipStore.touch(context.id)
  })
  return null
}

/** Closes whatever the host shows at once, e.g. after a click in a card. */
const closeHoverCard = () => hide(true)

export {
  closeHoverCard,
  HoverSide,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  ShortcutTooltip,
  Tooltip,
  TooltipProvider,
  TooltipHost,
  TooltipTrigger,
  TooltipContent,
  TooltipGroup,
  TooltipGroupTrigger
}
