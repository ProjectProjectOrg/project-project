import { listRowHeight } from "@pp/ui/list-row"
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual"
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react"
import { flushSync } from "react-dom"

import { useDeferredOverscan } from "./useDeferredOverscan"

const OVERSCAN = 12
const MOUNT_MARGIN = 336
const UNMOUNT_MARGIN = 3000
const ROW_GAP = 4

export function VirtualRows({
  rowKeys,
  className,
  activeIndex,
  reveal,
  scrollTo = null,
  children
}: {
  rowKeys: ReadonlyArray<string>
  className: string
  activeIndex: number
  reveal: Readonly<{ index: number }> | null
  // Brings a row into view without moving focus (a ticket just created
  // from a field that keeps it).
  scrollTo?: Readonly<{ index: number }> | null
  children: (index: number) => ReactNode
}) {
  "use no memo"

  const listRef = useRef<HTMLUListElement>(null)
  const [scrollMargin, setScrollMargin] = useState<number | null>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const revealed = useRef<Readonly<{ index: number }> | null>(null)
  const revealIndex = reveal?.index ?? -1
  const scrolled = useRef<Readonly<{ index: number }> | null>(null)
  const scrollIndex = scrollTo?.index ?? -1
  const getScrollElement = useCallback(
    () => listRef.current?.closest<HTMLElement>("[data-scroll-root]") ?? null,
    []
  )
  const getItemKey = useCallback((index: number) => rowKeys[index], [rowKeys])
  const overscan = useDeferredOverscan(getScrollElement, OVERSCAN)
  // oxlint-disable-next-line react/incompatible-library -- This component opts out of React Compiler.
  const virtualizer = useVirtualizer<HTMLElement, HTMLLIElement>({
    count: rowKeys.length,
    getScrollElement,
    getItemKey,
    estimateSize: () => listRowHeight,
    gap: ROW_GAP,
    overscan,
    enabled: scrollMargin !== null,
    scrollMargin: scrollMargin ?? 0,
    rangeExtractor: useCallback(
      (range) => {
        const indexes = new Set(
          nearViewport ? defaultRangeExtractor(range) : []
        )
        for (const index of [
          focusedIndex,
          activeIndex,
          revealIndex,
          scrollIndex
        ]) {
          if (index >= 0 && index < rowKeys.length) indexes.add(index)
        }
        return [...indexes].toSorted((a, b) => a - b)
      },
      [
        focusedIndex,
        activeIndex,
        revealIndex,
        scrollIndex,
        rowKeys.length,
        nearViewport
      ]
    )
  })

  useLayoutEffect(() => {
    const list = listRef.current
    const root = getScrollElement()
    const content = list?.closest("[data-scroll-content]")
    if (!list || !root || !content) return undefined
    let margin = 0
    let height = 0
    let viewportHeight = 0
    let hidden = false
    // Layout is read here, before React writes anything; reading scrollTop
    // inside the state updater forced a layout on every scroll frame.
    const updateNearViewport = () => {
      if (hidden) return
      const scrollTop = root.scrollTop
      setNearViewport((current) => {
        const band = current ? UNMOUNT_MARGIN : MOUNT_MARGIN
        return (
          margin < scrollTop + viewportHeight + band &&
          margin + height > scrollTop - band
        )
      })
    }
    // A list in a collapsed (display: none) section has no box: it keeps the
    // rows it has, so opening it again is instant, and mounts none until then.
    const measure = () => {
      hidden = list.getClientRects().length === 0
      if (hidden) return
      const listRect = list.getBoundingClientRect()
      const rootRect = root.getBoundingClientRect()
      margin = listRect.top - rootRect.top + root.scrollTop
      height = listRect.height
      viewportHeight = root.clientHeight
      setScrollMargin(margin)
      updateNearViewport()
    }
    measure()
    const observer = new ResizeObserver(() => flushSync(measure))
    observer.observe(content)
    observer.observe(root)
    root.addEventListener("scroll", updateNearViewport, { passive: true })
    return () => {
      observer.disconnect()
      root.removeEventListener("scroll", updateNearViewport)
    }
  }, [getScrollElement])

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
    const root = getScrollElement()
    if (root) bringIntoView(root, row)
  })

  const rows = virtualizer.getVirtualItems()
  return (
    <ul
      ref={listRef}
      className={className}
      data-virtual-rows
      data-loaded-rows={rowKeys.length}
      data-mounted-rows={rows.length}
      style={{
        gridTemplateRows: `repeat(${rowKeys.length}, ${listRowHeight}px)`
      }}
    >
      {rows.map((row) => (
        <li
          key={row.key}
          className="col-span-full grid grid-cols-subgrid"
          style={{
            gridRow: row.index + 1,
            scrollMarginTop: `calc(var(--list-sticky-top, 0px) + ${listRowHeight + ROW_GAP}px)`
          }}
          aria-posinset={row.index + 1}
          aria-setsize={rowKeys.length}
          onFocusCapture={() => setFocusedIndex(row.index)}
        >
          <RowSlot index={row.index} render={children} />
        </li>
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
  render
}: Readonly<{ index: number; render: (index: number) => ReactNode }>) {
  return render(index)
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
        rootMargin: "0px 0px 1200px 0px"
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
