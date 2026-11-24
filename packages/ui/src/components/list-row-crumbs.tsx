import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "../lib/utils"

/*
 * The parents in front of a row's title (epic / parent / title), each
 * followed by a slash. When the row gets too narrow to show the title in
 * full, the highest parent folds to its key first (ATL-3), then the next
 * one, so the title keeps its room; the key's preview tells what it is.
 * Once every parent is a key and the title would still shrink below 8rem,
 * the keys drop out, highest first: a title never disappears behind its
 * parents.
 *
 *   <ListRowCrumbs
 *     crumbs={parents.map((parent) => ({
 *       id: parent.id,
 *       full: <ParentLink parent={parent}>{parent.title}</ParentLink>,
 *       short: <ParentLink parent={parent}><TicketKey value={parent.id} /></ParentLink>
 *     }))}
 *   />
 *   <ListRowTitle>…</ListRowTitle>
 *
 * Sits in ListRow's `title` slot, before the title. It measures the slot:
 * the free room after the title and its chips, or how far the title
 * (ListRowTitle) is cut. Every form of every crumb stays rendered; the ones
 * not shown are out of the flow, invisible and inert, so they can be
 * measured.
 */

export type ListRowCrumb = Readonly<{
  id: string
  // The parent's title, as a link or preview trigger.
  full: ReactNode
  // Its key, the same trigger.
  short: ReactNode
}>

const titleSelector = '[data-slot="list-row-title"]'

const width = (element: Element | null | undefined) =>
  element ? element.getBoundingClientRect().width : 0

// The narrowest a title gets before its parents' keys drop out.
const TITLE_MIN = 128
// Sub-pixel rounding.
const EPSILON = 0.5

type Measured = Readonly<{
  // Room left in the slot; negative when the title is cut by that much.
  free: number
  // The title's shown width.
  title: number
  // Per crumb: what folding to its key saves, and what dropping the key
  // (and its slash) saves.
  fold: ReadonlyArray<number>
  drop: ReadonlyArray<number>
}>

function measureSlot(trail: HTMLElement, slot: HTMLElement) {
  const style = getComputedStyle(slot)
  const contentRight =
    slot.getBoundingClientRect().right -
    Number.parseFloat(style.paddingRight) -
    Number.parseFloat(style.borderRightWidth)
  let lastRight = trail.getBoundingClientRect().left
  for (const child of slot.children) {
    const right =
      child.getBoundingClientRect().right +
      Number.parseFloat(getComputedStyle(child).marginRight)
    lastRight = Math.max(lastRight, right)
  }
  const title = slot.querySelector(titleSelector)
  const cut = title ? title.scrollWidth - title.clientWidth : 0
  const items = [...trail.querySelectorAll("[data-crumb]")]
  const part = (item: Element, name: string) =>
    width(item.querySelector(`[data-crumb-${name}]`))
  return {
    free: contentRight - lastRight - cut,
    title: title ? title.clientWidth : 0,
    fold: items.map((item) => part(item, "full") - part(item, "short")),
    drop: items.map((item) => part(item, "short") + part(item, "sep"))
  }
}

// The trail's level: 0 shows every parent in full, up to `count` folds
// that many (highest first) to keys, past `count` drops that many keys.
function nextLevel(level: number, count: number, slot: Measured) {
  const room = { free: slot.free, title: slot.title }
  let next = level
  // Room a crumb gives back goes to the title while it's cut, then sits
  // free; taking room back works the other way round.
  const give = (gain: number) => {
    room.title += Math.min(gain, Math.max(0, -room.free))
    room.free += gain
  }
  const take = (gain: number) => {
    room.title -= Math.max(0, gain - Math.max(0, room.free))
    room.free -= gain
  }
  while (room.free < -EPSILON && next < count) {
    give(slot.fold[next] ?? 0)
    next += 1
  }
  while (
    room.free < -EPSILON &&
    next >= count &&
    next < count * 2 &&
    room.title < TITLE_MIN
  ) {
    give(slot.drop[next - count] ?? 0)
    next += 1
  }
  if (next !== level) return next
  while (next > count) {
    const gain = slot.drop[next - count - 1] ?? 0
    const shrunk = room.title - Math.max(0, gain - Math.max(0, room.free))
    if (shrunk < TITLE_MIN && room.free - gain < -EPSILON) break
    take(gain)
    next -= 1
  }
  while (next > 0 && next <= count) {
    const gain = slot.fold[next - 1] ?? 0
    if (room.free - gain < -EPSILON) break
    take(gain)
    next -= 1
  }
  return next
}

function useLevel(
  trail: React.RefObject<HTMLSpanElement | null>,
  count: number
) {
  const [level, setLevel] = useState(0)
  const current = useRef(0)
  useLayoutEffect(() => {
    const element = trail.current
    const slot = element?.parentElement
    if (!element || !slot) return undefined
    const measure = () => {
      const next = nextLevel(
        Math.min(current.current, count * 2),
        count,
        measureSlot(element, slot)
      )
      if (next === current.current) return
      current.current = next
      setLevel(next)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(slot)
    const title = slot.querySelector(titleSelector)
    if (title) observer.observe(title)
    return () => observer.disconnect()
  }, [trail, count])
  return level
}

const hiddenClass =
  "pointer-events-none invisible absolute top-0 left-0 w-max select-none"

export function ListRowCrumbs({
  crumbs,
  className
}: Readonly<{ crumbs: ReadonlyArray<ListRowCrumb>; className?: string }>) {
  const trail = useRef<HTMLSpanElement>(null)
  const count = crumbs.length
  const level = useLevel(trail, count)
  if (count === 0) return null
  const folded = Math.min(level, count)
  const dropped = Math.max(0, level - count)
  return (
    <span
      ref={trail}
      data-slot="list-row-crumbs"
      className={cn(
        "flex shrink-0 items-center text-body [&_[data-slot=ticket-key]]:text-body",
        className
      )}
    >
      {crumbs.map((crumb, index) => {
        const gone = index < dropped
        const short = !gone && index < folded
        const full = !gone && !short
        return (
          <span
            key={crumb.id}
            data-crumb=""
            className="relative flex items-center"
          >
            <Part name="full" shown={full}>
              {crumb.full}
            </Part>
            <Part name="short" shown={short}>
              {crumb.short}
            </Part>
            <span
              aria-hidden
              data-crumb-sep=""
              className={cn(
                "px-1.5 text-muted-foreground before:content-['/']",
                gone && hiddenClass
              )}
            />
          </span>
        )
      })}
    </span>
  )
}

// One form of a crumb: in the flow when shown, otherwise measured only.
function Part({
  name,
  shown,
  children
}: Readonly<{ name: "full" | "short"; shown: boolean; children: ReactNode }>) {
  return (
    <span
      {...{ [`data-crumb-${name}`]: "" }}
      inert={!shown}
      aria-hidden={!shown || undefined}
      className={cn("flex min-w-0 items-center", !shown && hiddenClass)}
    >
      {children}
    </span>
  )
}
