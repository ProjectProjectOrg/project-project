import { useLayoutEffect, useRef, useState, type RefObject } from "react"
import { flushSync } from "react-dom"

import { emptyWindow, preparedRows, requiredRows } from "../lib/preparedRows"

const UNMOUNT_MARGIN = 3000

export function usePreparedRows(
  listRef: RefObject<HTMLDivElement | null>,
  count: number,
  stride: number
) {
  const [mounted, setMounted] = useState(emptyWindow)
  const mountedRef = useRef(mounted)
  useLayoutEffect(() => {
    const list = listRef.current
    const root = list?.closest<HTMLElement>("[data-scroll-root]")
    const content = list?.closest("[data-scroll-content]")
    if (!list || !root || !content) return undefined
    let margin = 0
    let height = 0
    let viewportHeight = 0
    let hidden = false
    let lastTop = root.scrollTop
    let forward = true
    let required = emptyWindow
    let cancelIdle: (() => void) | undefined
    const publish = (next: typeof emptyWindow, sync: boolean) => {
      if (next === mountedRef.current) return
      mountedRef.current = next
      if (sync) flushSync(() => setMounted(next))
      else setMounted(next)
    }
    const stopIdle = () => {
      cancelIdle?.()
      cancelIdle = undefined
    }
    const prepare = (deadline?: IdleDeadline) => {
      cancelIdle = undefined
      const next = preparedRows(
        mountedRef.current,
        required,
        count,
        forward,
        true
      )
      if (next === mountedRef.current) return
      if (deadline && deadline.timeRemaining() < 6) {
        scheduleIdle()
        return
      }
      publish(next, false)
      scheduleIdle()
    }
    const scheduleIdle = () => {
      if (cancelIdle) return
      if (window.requestIdleCallback !== undefined) {
        const id = requestIdleCallback(prepare)
        cancelIdle = () => cancelIdleCallback(id)
      } else {
        const id = window.setTimeout(prepare, 32)
        cancelIdle = () => window.clearTimeout(id)
      }
    }
    const update = (event: "scroll" | "resize" | "rest") => {
      const scrolling = event === "scroll"
      const sync = event === "resize"
      const top = root.scrollTop
      if (lastTop !== top) forward = top > lastTop
      lastTop = top
      const distance = Math.max(
        margin - top - viewportHeight,
        top - margin - height
      )
      if (hidden || distance > Math.min(UNMOUNT_MARGIN, viewportHeight * 2)) {
        stopIdle()
        if (distance > UNMOUNT_MARGIN) publish(emptyWindow, false)
        return
      }
      required = requiredRows({
        offset: top - margin,
        height: viewportHeight,
        stride,
        count,
        forward
      })
      const next = preparedRows(
        mountedRef.current,
        required,
        count,
        forward,
        false
      )
      publish(next, sync)
      if (
        required.end > required.start &&
        (!scrolling || !("onscrollend" in root))
      ) {
        scheduleIdle()
      } else {
        stopIdle()
      }
    }
    const onScroll = () => update("scroll")
    const onScrollEnd = () => update("rest")
    const measure = (event: "resize" | "rest") => {
      hidden = list.getClientRects().length === 0
      if (hidden) {
        publish(emptyWindow, event === "resize")
        stopIdle()
        return
      }
      const listRect = list.getBoundingClientRect()
      const rootRect = root.getBoundingClientRect()
      margin = listRect.top - rootRect.top + root.scrollTop
      height = listRect.height
      if (viewportHeight !== root.clientHeight) {
        viewportHeight = root.clientHeight
        list.style.setProperty(
          "--scroll-viewport-height",
          `${viewportHeight}px`
        )
      }
      update(event)
    }
    measure("rest")
    const observer = new ResizeObserver(() => measure("resize"))
    observer.observe(list)
    observer.observe(content)
    observer.observe(root)
    root.addEventListener("scroll", onScroll, { passive: true })
    root.addEventListener("scrollend", onScrollEnd)
    return () => {
      root.removeEventListener("scrollend", onScrollEnd)
      cancelIdle?.()
      observer.disconnect()
      root.removeEventListener("scroll", onScroll)
    }
  }, [listRef, count, stride])

  return mounted
}
