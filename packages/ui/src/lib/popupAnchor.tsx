import * as React from "react"

// A popup positions itself from its trigger's box. Triggers scale to 97% on
// press, and a scaled box is smaller, so a popup measured mid-press would
// open (or re-measure while closing) a pixel or two off. Instead of turning
// the press off on popup triggers, the popup measures the trigger through a
// virtual anchor that divides the current scale back out.

type VirtualAnchor = {
  getBoundingClientRect: () => DOMRect
  contextElement: Element
}

const unscaledRect = (element: Element) => {
  const rect = element.getBoundingClientRect()
  // `scale` is "none", "0.97" or "0.97 0.97"; mid-transition it reads the
  // current animated value.
  const scale = Number.parseFloat(getComputedStyle(element).scale)
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return rect
  const width = rect.width / scale
  const height = rect.height / scale
  // Press scales around the centre, so grow the box back around it.
  return new DOMRect(
    rect.x - (width - rect.width) / 2,
    rect.y - (height - rect.height) / 2,
    width,
    height
  )
}

const anchors = new WeakMap<Element, VirtualAnchor>()

const anchorFor = (element: Element) => {
  const cached = anchors.get(element)
  if (cached) return cached
  const anchor = {
    getBoundingClientRect: () => unscaledRect(element),
    contextElement: element
  }
  anchors.set(element, anchor)
  return anchor
}

const TriggerElementContext =
  React.createContext<React.RefObject<Element | null> | null>(null)

/** Wraps a popup root so its trigger and its positioner can find each other. */
function PopupAnchorProvider({ children }: { children: React.ReactNode }) {
  const trigger = React.useRef<Element | null>(null)
  return (
    <TriggerElementContext value={trigger}>{children}</TriggerElementContext>
  )
}

/** A ref for the trigger, merged with any ref the caller passed. */
function useTriggerAnchorRef<T extends Element>(ref: React.Ref<T> | undefined) {
  const trigger = React.useContext(TriggerElementContext)
  return React.useCallback(
    (element: T | null) => {
      if (trigger) trigger.current = element
      if (typeof ref === "function") {
        const cleanup = ref(element)
        return typeof cleanup === "function" ? cleanup : undefined
      }
      if (ref) ref.current = element
      return undefined
    },
    [trigger, ref]
  )
}

// Anything Base UI's positioners take as an anchor.
type Anchor =
  | Element
  | null
  | { getBoundingClientRect: () => unknown; contextElement?: Element }
  | React.RefObject<Element | null>
  | (() => unknown)

/**
 * The anchor for a positioner, measured without any press scale: the
 * trigger by default, or the caller's element when they pass one (a gutter
 * grip, say). Refs, functions and virtual anchors pass through unchanged.
 */
function usePopupAnchor<A extends Anchor | undefined>(anchor: A) {
  const trigger = React.useContext(TriggerElementContext)
  const unscaled = React.useCallback(() => {
    const element = trigger?.current
    return element ? anchorFor(element) : null
  }, [trigger])
  if (anchor instanceof Element) return anchorFor(anchor)
  return anchor ?? (trigger ? unscaled : undefined)
}

export {
  PopupAnchorProvider,
  unscaledRect,
  usePopupAnchor,
  useTriggerAnchorRef
}
