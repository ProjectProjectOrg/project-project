import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react"

import { useDeferredOverscan } from "./useDeferredOverscan"

const OVERSCAN = 12
const MOUNT_MARGIN = 336
const UNMOUNT_MARGIN = 3000

export function VirtualRows({
  rowKeys,
  className,
  activeIndex,
  children
}: {
  rowKeys: ReadonlyArray<string>
  className: string
  activeIndex: number
  children: (index: number) => ReactNode
}) {
  "use no memo"

  const listRef = useRef<HTMLUListElement>(null)
  const [scrollMargin, setScrollMargin] = useState<number | null>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
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
    estimateSize: () => 52,
    gap: 4,
    overscan,
    enabled: scrollMargin !== null,
    scrollMargin: scrollMargin ?? 0,
    rangeExtractor: useCallback(
      (range) => {
        const indexes = new Set(
          nearViewport ? defaultRangeExtractor(range) : []
        )
        for (const index of [focusedIndex, activeIndex]) {
          if (index >= 0 && index < rowKeys.length) indexes.add(index)
        }
        return [...indexes].toSorted((a, b) => a - b)
      },
      [focusedIndex, activeIndex, rowKeys.length, nearViewport]
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
    const updateNearViewport = () => {
      setNearViewport((current) => {
        const band = current ? UNMOUNT_MARGIN : MOUNT_MARGIN
        return (
          margin < root.scrollTop + viewportHeight + band &&
          margin + height > root.scrollTop - band
        )
      })
    }
    const measure = () => {
      const listRect = list.getBoundingClientRect()
      const rootRect = root.getBoundingClientRect()
      margin = listRect.top - rootRect.top + root.scrollTop
      height = listRect.height
      viewportHeight = root.clientHeight
      setScrollMargin(margin)
      updateNearViewport()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    observer.observe(root)
    root.addEventListener("scroll", updateNearViewport, { passive: true })
    return () => {
      observer.disconnect()
      root.removeEventListener("scroll", updateNearViewport)
    }
  }, [getScrollElement])

  const rows = virtualizer.getVirtualItems()
  return (
    <ul
      ref={listRef}
      className={className}
      data-virtual-rows
      data-loaded-rows={rowKeys.length}
      data-mounted-rows={rows.length}
      style={{ gridTemplateRows: `repeat(${rowKeys.length}, 52px)` }}
    >
      {rows.map((row) => (
        <li
          key={row.key}
          className="col-span-full grid grid-cols-subgrid"
          style={{ gridRow: row.index + 1 }}
          aria-posinset={row.index + 1}
          aria-setsize={rowKeys.length}
          onFocusCapture={() => setFocusedIndex(row.index)}
        >
          {children(row.index)}
        </li>
      ))}
    </ul>
  )
}

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
