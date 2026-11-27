export type FlyoutExit = "fade" | "instant"

export type FlyoutLevel = Readonly<{
  active: () => string | null
  subscribe: (listener: () => void) => () => void
  open: (id: string) => boolean
  close: (exit: FlyoutExit) => boolean
  release: (id: string, exit: FlyoutExit) => boolean
  watch: (id: string, onOpenChange: (open: boolean) => void) => () => void
}>

export function createFlyoutLevel(
  isHeld: () => boolean,
  markExit: (exit: FlyoutExit) => void
) {
  let active: string | null = null
  const listeners = new Set<() => void>()
  const watchers = new Map<string, (open: boolean) => void>()
  const set = (next: string | null, exit: FlyoutExit) => {
    if (next === active || (active !== null && isHeld())) return false
    const previous = active
    active = next
    markExit(exit)
    for (const listener of listeners) listener()
    if (previous !== null) watchers.get(previous)?.(false)
    if (next !== null) watchers.get(next)?.(true)
    return true
  }
  const level: FlyoutLevel = {
    active: () => active,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    open: (id) => set(id, "instant"),
    close: (exit) => set(null, exit),
    release: (id, exit) => active === id && set(null, exit),
    watch: (id, onOpenChange) => {
      watchers.set(id, onOpenChange)
      return () => {
        if (watchers.get(id) === onOpenChange) watchers.delete(id)
      }
    }
  }
  return level
}

type Box = Readonly<{
  left: number
  top: number
  width: number
  height: number
}>

type Size = Readonly<{ width: number; height: number }>

export type FlyoutPlacement = Readonly<{
  side: "left" | "right"
  top: number
  maxHeight: number
}>

// In viewport pixels: the side the panel opens on, its top edge and its cap.
export function placeFlyout({
  popup,
  trigger,
  panel,
  viewport,
  gap,
  inset,
  margin
}: Readonly<{
  popup: Box
  trigger: Readonly<{ top: number }>
  panel: Size
  viewport: Size
  gap: number
  inset: number
  margin: number
}>) {
  const maxHeight = Math.max(0, viewport.height - margin * 2)
  const height = Math.min(panel.height, maxHeight)
  const roomRight = viewport.width - margin - (popup.left + popup.width + gap)
  const roomLeft = popup.left - gap - margin
  const side =
    panel.width <= roomRight || roomRight >= roomLeft ? "right" : "left"
  const lowest = viewport.height - margin - height
  return {
    side,
    top: Math.max(margin, Math.min(trigger.top - inset, lowest)),
    maxHeight
  } satisfies FlyoutPlacement
}

const collators = new Map<string, Intl.Collator>()

const collatorFor = (locale: Intl.LocalesArgument) => {
  const key = String(locale ?? "")
  const cached = collators.get(key)
  if (cached !== undefined) return cached
  const collator = new Intl.Collator(locale, {
    usage: "search",
    sensitivity: "base",
    ignorePunctuation: true
  })
  collators.set(key, collator)
  return collator
}

// Base UI's Menu.FilterProvider rule: the text contains the trimmed query,
// ignoring case, accents and punctuation.
export function matchesQuery(
  text: string,
  query: string,
  locale?: Intl.LocalesArgument
) {
  const needle = query.trim()
  if (needle === "") return true
  const collator = collatorFor(locale)
  for (let start = 0; start <= text.length - needle.length; start += 1) {
    if (
      collator.compare(text.slice(start, start + needle.length), needle) === 0
    )
      return true
  }
  return false
}

export function typeaheadIndex(
  labels: ReadonlyArray<string>,
  current: number,
  query: string
) {
  const needle = query.toLocaleLowerCase()
  const from = needle.length === 1 ? current + 1 : Math.max(current, 0)
  for (let step = 0; step < labels.length; step += 1) {
    const index = (from + step) % labels.length
    if (labels[index]?.trim().toLocaleLowerCase().startsWith(needle))
      return index
  }
  return -1
}
