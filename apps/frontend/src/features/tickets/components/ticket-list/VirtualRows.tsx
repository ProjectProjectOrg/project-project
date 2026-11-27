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

import { useVisibleRows } from "../../hooks/useVisibleRows"

const ROW_GAP = 4
const ROW_STRIDE = listRowHeight + ROW_GAP
const PAGE_HEIGHT = TICKET_LIST_LIMIT * ROW_STRIDE

export function VirtualRows({
  rowKeys,
  className,
  reveal,
  scrollTo = null,
  total = 0,
  footer = null,
  children
}: Readonly<{
  rowKeys: ReadonlyArray<string>
  className: string
  total?: number
  footer?: ReactNode
  reveal: Readonly<{ index: number }> | null
  // Brings a row into view without moving focus (a ticket just created
  // from a field that keeps it).
  scrollTo?: Readonly<{ index: number }> | null
  children: (index: number) => ReactNode
}>) {
  const listRef = useRef<HTMLDivElement>(null)
  const count = rowKeys.length
  const range = useVisibleRows(listRef, count, ROW_STRIDE)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const revealed = useRef<Readonly<{ index: number }> | null>(null)
  const revealIndex = reveal?.index ?? -1
  const scrolled = useRef<Readonly<{ index: number }> | null>(null)
  const scrollIndex = scrollTo?.index ?? -1

  useLayoutEffect(() => {
    if (reveal === null || reveal === revealed.current) return
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>(
      `:scope > ul > li[aria-posinset="${reveal.index + 1}"]`
    )
    const link = row?.querySelector<HTMLElement>("[data-item-link]")
    if (!list || !row || !link) return
    revealed.current = reveal
    link.focus({ preventScroll: true })
    bringIntoView(list, row, reveal.index, "nearest")
  })

  useLayoutEffect(() => {
    if (scrollTo === null || scrollTo === scrolled.current) return
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>(
      `:scope > ul > li[aria-posinset="${scrollTo.index + 1}"]`
    )
    if (!list || !row) return
    scrolled.current = scrollTo
    bringIntoView(list, row, scrollTo.index, "created")
  })

  const pinned = [focusedIndex, revealIndex, scrollIndex]
  const indexes = new Set<number>()
  for (let i = range.start; i < Math.min(range.end, count); i++) indexes.add(i)
  for (const i of pinned) {
    if (i >= 0 && i < count) indexes.add(i)
  }
  const rows = [...indexes].toSorted((a, b) => a - b)
  const first = Math.min(range.start, count)
  const length = Math.min(range.end, count) - first
  const reserved = total > count
  return (
    <>
      <div
        ref={listRef}
        data-virtual-rows
        data-loaded-rows={count}
        data-mounted-rows={rows.length}
        style={{
          height: Math.max(0, Math.max(count, total) * ROW_STRIDE - ROW_GAP),
          overflow: "clip",
          position: "relative"
        }}
      >
        <div aria-hidden style={{ height: first * ROW_STRIDE }} />
        <ul
          className={className}
          style={{
            gridTemplateRows: rows.length > length ? "0px" : undefined,
            gridAutoRows: ROW_STRIDE,
            rowGap: 0,
            alignContent: "start"
          }}
        >
          {rows.map((index) => (
            <RowSlot
              key={rowKeys[index]}
              index={index}
              count={count}
              pinnedOffset={
                index < first || index >= first + length
                  ? (index - first) * ROW_STRIDE
                  : undefined
              }
              onFocus={setFocusedIndex}
              render={children}
            />
          ))}
        </ul>
        {reserved && (
          <div
            className="absolute inset-x-0 grid"
            style={{ top: count * ROW_STRIDE, bottom: 0 }}
          >
            {footer}
          </div>
        )}
      </div>
      {!reserved && footer}
    </>
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

const bringIntoView = (
  list: HTMLElement,
  row: HTMLElement,
  index: number,
  placement: "nearest" | "created"
) => {
  const root = list.closest<HTMLElement>("[data-scroll-root]")
  if (!root) return
  const band = visibleBand(root, row)
  const top = list.getBoundingClientRect().top + index * ROW_STRIDE
  if (top >= band.top && top + listRowHeight <= band.bottom) return
  const target =
    placement === "created"
      ? band.top + (band.bottom - band.top) / 3
      : top < band.top
        ? band.top
        : band.bottom - listRowHeight
  root.scrollTop += top - target
}

// The list re-renders on its own when its position or the viewport moves;
// rows whose data didn't change skip that render.
const RowSlot = memo(function RowSlot({
  index,
  pinnedOffset,
  count,
  onFocus,
  render
}: Readonly<{
  index: number
  pinnedOffset: number | undefined
  count: number
  onFocus: (index: number) => void
  render: (index: number) => ReactNode
}>) {
  return (
    <li
      className="col-span-full grid grid-cols-subgrid"
      style={{
        height: listRowHeight,
        gridRow: pinnedOffset === undefined ? undefined : 1,
        position: "relative",
        transform:
          pinnedOffset === undefined
            ? undefined
            : `translateY(${pinnedOffset}px)`,
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
