import * as React from "react"

/*
 * How far the selection bar folds when its fields don't fit on one row:
 * first "Select all", then the fields' names (down to their icons, each
 * keeping its key); and back, a step at a time, once the lane has room
 * again. Only with both folded does the bar wrap onto a second row. The
 * keys never fold: they're how the bar is meant to be used.
 */

// `selectAllFolded`: "Select all" is hidden (⌘A still selects all).
// `folded`: the fields show only their icons and keys (each says its name
// in a tooltip), and the bar may wrap. `instant` when it changed before the
// bar was first painted, so it applies at once instead of animating.
export type Fold = Readonly<{
  selectAllFolded: boolean
  folded: boolean
  instant: boolean
}>

export const FoldedContext = React.createContext<Fold>({
  selectAllFolded: false,
  folded: false,
  instant: true
})

type Level = 0 | 1 | 2

const LEVELS = [
  { selectAllFolded: false, folded: false },
  { selectAllFolded: true, folded: false },
  { selectAllFolded: true, folded: true }
] as const

// What each step folds, marked on the part that keeps its full width
// (inside a wrapper that shrinks to nothing), and what else it gives back:
// a value its 6px gap and 8px of the field's padding.
const STEPS = [
  { selector: "[data-fold-select-all]", extra: 0 },
  { selector: "[data-fold-value]", extra: 14 }
] as const

// The level one step back from each.
const UNFOLD = [0, 0, 1] as const

// The bar's entrance (transitions.presence, 180ms) and a frame or two.
const SETTLE_MS = 250
// A step's own animation (transitions.morph, 260ms) and a frame: the next
// step waits for it, so it's judged on where this one ends.
const STEP_MS = 300

const partsOf = (element: HTMLElement, step: Level) => {
  const at = STEPS[step - 1]
  return at === undefined
    ? []
    : [...element.querySelectorAll<HTMLElement>(at.selector)].map((part) => {
        const shown = part.parentElement?.offsetWidth ?? 0
        // The width it takes unfolded, and what it still shows now.
        return {
          full: part.offsetWidth + at.extra,
          shown: shown > 0 ? shown + at.extra : 0
        }
      })
}

const sum = (values: ReadonlyArray<number>) =>
  values.reduce((total, each) => total + each, 0)

// Folds a step at a time whenever the fields don't fit on one row, and
// unfolds a step at a time once the lane has room again. Folded parts stay
// mounted at no width, so their full width can still be measured.
export function useFold(
  content: React.RefObject<HTMLDivElement | null>,
  laneWidth: number | null
) {
  const [state, setState] = React.useState<
    Readonly<{ level: Level; instant: boolean }>
  >({ level: 0, instant: true })
  // The content element watched, and when it mounted: a fold decided while
  // the bar rises in (or right after the selection swaps back in) applies
  // at once, so it never rises wide and then folds its values away.
  const watched = React.useRef<{
    element: HTMLDivElement
    since: number
    observer: ResizeObserver
  } | null>(null)
  // When the last animated step started, and the check waiting for it.
  const stepped = React.useRef(0)
  const later = React.useRef<number | undefined>(undefined)
  // Renders again once the wait is over, so the layout effect checks.
  const [, recheck] = React.useState(0)
  const check = React.useEffectEvent(() => {
    const element = content.current
    if (!element || laneWidth === null || element.closest("[data-swapping]"))
      return
    const now = performance.now()
    const wait = stepped.current + STEP_MS - now
    if (wait > 0) {
      window.clearTimeout(later.current)
      later.current = window.setTimeout(() => recheck((n) => n + 1), wait)
      return
    }
    const instant = now - (watched.current?.since ?? 0) < SETTLE_MS
    const go = (level: Level) => {
      if (!instant) stepped.current = now
      setState({ level, instant })
    }
    const { level } = state
    const deeper = ([1, 2] as const).filter((step) => step > level)
    // What's folded at this level but still showing (folded this very
    // render, before it animated) doesn't count against it.
    const leaving = sum(
      ([1, 2] as const)
        .filter((step) => step <= level)
        .flatMap((step) => partsOf(element, step).map((part) => part.shown))
    )
    const width = element.scrollWidth - leaving
    // Each level keeps the fields to one row (until the last), so not
    // fitting shows as overflow, never as a wrapped row, even for a frame.
    if (width > element.clientWidth + 1) {
      // The first deeper level that fits, judged up front from what each
      // step would give back; the last one if none does.
      let left = width
      const fits = deeper.find((step) => {
        left -= sum(partsOf(element, step).map((part) => part.full))
        return left <= element.clientWidth
      })
      if (level < 2) go(fits ?? 2)
      return
    }
    if (level === 0 || leaving > 0) return
    const back = sum(partsOf(element, level).map((part) => part.full))
    if (element.offsetWidth + back + 8 <= laneWidth) go(UNFOLD[level])
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
  React.useEffect(
    () => () => {
      watched.current?.observer.disconnect()
      window.clearTimeout(later.current)
    },
    []
  )
  return React.useMemo(
    () => ({ ...LEVELS[state.level], instant: state.instant }) satisfies Fold,
    [state]
  )
}
