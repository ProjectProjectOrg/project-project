import * as React from "react"

/*
 * When the selection bar's fields fold to their icons: whenever they don't
 * fit on one row, and back once the lane has room for them again.
 */

// Whether the fields show only their icons (each then says its name and
// value in a tooltip), and whether that changed before the bar was first
// painted, so it applies at once instead of animating.
export type Fold = Readonly<{ folded: boolean; instant: boolean }>

export const FoldedContext = React.createContext<Fold>({
  folded: false,
  instant: true
})

// Each folded value gives back its width, the 6px gap before it and 8px of
// the field's padding when it unfolds.
const VALUE_EXTRA = 14
// The bar's entrance (transitions.presence, 180ms) and a frame or two.
const SETTLE_MS = 250

// Folds the fields to their icons whenever they don't fit on one row, and
// unfolds them once the lane has room for them again. Folded values stay
// mounted at no width, so their full width can still be measured.
export function useFold(
  content: React.RefObject<HTMLDivElement | null>,
  laneWidth: number | null
) {
  const [fold, setFold] = React.useState<Fold>({
    folded: false,
    instant: true
  })
  // The content element watched, and when it mounted: a fold decided while
  // the bar rises in (or right after the selection swaps back in) applies
  // at once, so it never rises wide and then folds its values away.
  const watched = React.useRef<{
    element: HTMLDivElement
    since: number
    observer: ResizeObserver
  } | null>(null)
  const check = React.useEffectEvent(() => {
    const element = content.current
    if (!element || laneWidth === null || element.closest("[data-swapping]"))
      return
    const instant =
      performance.now() - (watched.current?.since ?? 0) < SETTLE_MS
    // Unfolded, the fields keep to one row, so not fitting shows as
    // overflow (never as a wrapped row, even for a frame).
    if (!fold.folded) {
      if (element.scrollWidth > element.clientWidth + 1)
        setFold({ folded: true, instant })
      return
    }
    const values = element.querySelectorAll<HTMLElement>("[data-fold-value]")
    const unfolded = [...values].reduce(
      (width, value) => width + value.offsetWidth + VALUE_EXTRA,
      element.offsetWidth
    )
    if (unfolded + 8 <= laneWidth) setFold({ folded: false, instant })
  })
  React.useLayoutEffect(() => {
    const element = content.current
    if (element !== (watched.current?.element ?? null)) {
      watched.current?.observer.disconnect()
      watched.current = null
      if (element) {
        const observer = new ResizeObserver(() => check())
        observer.observe(element)
        watched.current = { element, since: performance.now(), observer }
      }
    }
    check()
  })
  React.useEffect(() => () => watched.current?.observer.disconnect(), [])
  return fold
}
