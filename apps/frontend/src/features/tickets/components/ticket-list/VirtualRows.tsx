import { TICKET_LIST_LIMIT } from "@pp/shared"
import { listRowHeight } from "@pp/ui/list-row"
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react"

import { usePreparedRows } from "../../hooks/usePreparedRows"

const ROW_GAP = 4
const ROW_STRIDE = listRowHeight + ROW_GAP
const PAGE_HEIGHT = TICKET_LIST_LIMIT * ROW_STRIDE

export function VirtualRows({
  rowKeys,
  className,
  activeIndex,
  reveal,
  scrollTo = null,
  children
}: Readonly<{
  rowKeys: ReadonlyArray<string>
  className: string
  activeIndex: number
  reveal: Readonly<{ index: number }> | null
  // Brings a row into view without moving focus (a ticket just created
  // from a field that keeps it).
  scrollTo?: Readonly<{ index: number }> | null
  children: (index: number) => ReactNode
}>) {
  const listRef = useRef<HTMLUListElement>(null)
  const count = rowKeys.length
  const range = usePreparedRows(listRef, count, ROW_STRIDE)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const revealed = useRef<Readonly<{ index: number }> | null>(null)
  const revealIndex = reveal?.index ?? -1
  const scrolled = useRef<Readonly<{ index: number }> | null>(null)
  const scrollIndex = scrollTo?.index ?? -1

  useLayoutEffect(() => {
    if (reveal === null || reveal === revealed.current) return
    const row = listRef.current?.querySelector<HTMLElement>(
      `:scope > [aria-posinset="${reveal.index + 1}"]`
    )
    const link = row?.querySelector<HTMLElement>("[data-item-link]")
    if (!row || !link) return
    revealed.current = reveal
    link.focus({ preventScroll: true })
    row.scrollIntoView({ block: "nearest" })
  })

  useLayoutEffect(() => {
    if (scrollTo === null || scrollTo === scrolled.current) return
    const row = listRef.current?.querySelector<HTMLElement>(
      `:scope > [aria-posinset="${scrollTo.index + 1}"]`
    )
    if (!row) return
    scrolled.current = scrollTo
    const root = row.closest<HTMLElement>("[data-scroll-root]")
    if (root) bringIntoView(root, row)
  })

  const pinned = [activeIndex, focusedIndex, revealIndex, scrollIndex]
  const indexes = new Set<number>()
  for (let i = range.start; i < Math.min(range.end, count); i++) indexes.add(i)
  for (const i of pinned) {
    if (i >= 0 && i < count) indexes.add(i)
  }
  const rows = [...indexes].toSorted((a, b) => a - b)
  return (
    <ul
      ref={listRef}
      className={className}
      data-virtual-rows
      data-loaded-rows={rowKeys.length}
      data-mounted-rows={rows.length}
      style={{
        contain: "size layout",
        height: Math.max(0, count * ROW_STRIDE - ROW_GAP),
        gridTemplateRows: `${listRowHeight}px`
      }}
    >
      {rows.map((index) => (
        <RowSlot
          key={rowKeys[index]}
          index={index}
          count={count}
          onFocus={setFocusedIndex}
          render={children}
        />
      ))}
    </ul>
  )
}

// The part of the scroll area rows can be read in: below the pinned toolbar
// and the section header pinned under it.
const visibleBand = (root: HTMLElement, row: HTMLElement) => {
  const rootRect = root.getBoundingClientRect()
  const pinned =
    Number.parseFloat(
      getComputedStyle(row).getPropertyValue("--list-sticky-top")
    ) || 0
  return {
    top: rootRect.top + pinned + listRowHeight + ROW_GAP,
    bottom: rootRect.bottom
  }
}

// Jumps (no smooth scroll) so a row out of view lands about a third of the
// way down the readable band, with room around it, rather than flush against
// an edge.
const bringIntoView = (root: HTMLElement, row: HTMLElement) => {
  const band = visibleBand(root, row)
  const rect = row.getBoundingClientRect()
  if (rect.top >= band.top && rect.bottom <= band.bottom) return
  const target = band.top + (band.bottom - band.top) / 3
  root.scrollTop += rect.top - target
}

// The list re-renders on its own when its position or the viewport moves;
// rows whose data didn't change skip that render.
const RowSlot = memo(function RowSlot({
  index,
  count,
  onFocus,
  render
}: Readonly<{
  index: number
  count: number
  onFocus: (index: number) => void
  render: (index: number) => ReactNode
}>) {
  return (
    <li
      className="col-span-full grid grid-cols-subgrid"
      style={{
        gridRow: 1,
        position: "relative",
        transform: `translateY(${index * ROW_STRIDE}px)`,
        scrollMarginTop: `calc(var(--list-sticky-top, 0px) + ${listRowHeight + ROW_GAP}px)`
      }}
      aria-posinset={index + 1}
      aria-setsize={count}
      onFocusCapture={() => onFocus(index)}
    >
      {render(index)}
    </li>
  )
})

export function AutoLoad({
  cursor,
  enabled,
  loadMore,
  rootSelector = "[data-scroll-root]",
  children
}: {
  cursor: string | null
  enabled: boolean
  loadMore: () => void
  rootSelector?: string
  children: ReactNode
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  const requestedCursor = useRef<string | null>(null)
  useEffect(() => {
    const element = sentinel.current
    if (!element || !enabled || cursor === null) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || requestedCursor.current === cursor) return
        requestedCursor.current = cursor
        loadMore()
      },
      {
        root: element.closest(rootSelector),
        rootMargin: `0px 0px ${PAGE_HEIGHT}px 0px`
      }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [cursor, enabled, loadMore, rootSelector])
  return (
    <div ref={sentinel} className="flex justify-center py-2">
      {children}
    </div>
  )
}
