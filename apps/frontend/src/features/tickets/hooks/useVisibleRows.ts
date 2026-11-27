import {
  startTransition,
  useLayoutEffect,
  useState,
  type RefObject
} from "react"

import { noRows, visibleRows, type RowRange } from "../lib/visibleRows"

const same = (a: RowRange, b: RowRange) =>
  a.start === b.start && a.end === b.end

export function useVisibleRows(
  listRef: RefObject<HTMLDivElement | null>,
  count: number,
  stride: number
) {
  const [visible, setVisible] = useState(noRows)
  const [ahead, setAhead] = useState(noRows)
  useLayoutEffect(() => {
    const list = listRef.current
    const root = list?.closest<HTMLElement>("[data-scroll-root]")
    const content = list?.closest("[data-scroll-content]")
    if (!list || !root || !content) return undefined
    let offset = 0
    let height = 0
    let hidden = false
    const rows = (overscan: number) =>
      hidden
        ? noRows
        : visibleRows({
            top: root.scrollTop - offset,
            height,
            overscan,
            stride,
            count
          })
    const update = () => {
      const next = rows(0)
      setVisible((current) => (same(current, next) ? current : next))
      const wide = rows(height)
      startTransition(() =>
        setAhead((current) => (same(current, wide) ? current : wide))
      )
    }
    const measure = () => {
      hidden = list.getClientRects().length === 0
      offset =
        list.getBoundingClientRect().top -
        root.getBoundingClientRect().top +
        root.scrollTop
      height = root.clientHeight
      update()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    observer.observe(content)
    observer.observe(root)
    root.addEventListener("scroll", update, { passive: true })
    return () => {
      observer.disconnect()
      root.removeEventListener("scroll", update)
    }
  }, [listRef, count, stride])
  return ahead.start <= visible.start && ahead.end >= visible.end
    ? ahead
    : visible
}
