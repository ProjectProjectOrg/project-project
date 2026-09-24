"use client"

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SetStateAction
} from "react"

export type ItemRect = Readonly<{
  top: number
  height: number
  left: number
  width: number
}>

export type UseFluidHoverReturn = Readonly<{
  activeIndex: number | null
  setActiveIndex: Dispatch<SetStateAction<number | null>>
  itemRects: ReadonlyArray<ItemRect | undefined>
  isMeasured: boolean
  sessionRef: RefObject<number>
  handlers: Readonly<{
    onMouseMove: (e: ReactMouseEvent) => void
    onMouseEnter: () => void
    onMouseLeave: () => void
    onClick: (e: ReactMouseEvent) => void
  }>
  registerItem: (index: number, element: HTMLElement | null) => void
}>

type PickNearestInput = Readonly<{
  pointY: number
  rects: ReadonlyArray<ItemRect | undefined>
  containerTop: number
  containerHeight: number
  scrollTop: number
  borderTop: number
  layoutHeight: number
}>

const pickNearest = ({
  pointY,
  rects,
  containerTop,
  containerHeight,
  scrollTop,
  borderTop,
  layoutHeight
}: PickNearestInput): number | null => {
  const scale = layoutHeight > 0 ? containerHeight / layoutHeight : 1
  let closestIndex: number | null = null
  let closestDistance = Infinity
  let containingIndex: number | null = null

  for (let index = 0; index < rects.length; index++) {
    const r = rects[index]
    if (!r) continue
    const itemStart = containerTop + (borderTop + r.top - scrollTop) * scale
    const itemSize = r.height * scale
    if (pointY >= itemStart && pointY <= itemStart + itemSize) {
      containingIndex = index
    }
    const distance = Math.abs(pointY - (itemStart + itemSize / 2))
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index
    }
  }

  return containingIndex ?? closestIndex
}

const ACTIVE_ATTR = "data-fluid-hover-active"
const ACTIVE_INDEX_ATTR = "data-fluid-hover-active-index"

const ACTIVATOR_SELECTOR =
  "a[href], button, [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], [role='option'], [role='radio'], [role='checkbox'], [role='tab'], [role='link'], [role='button']"

const GAP_CONTROL_SELECTOR =
  "input, textarea, select, button, a, summary, [contenteditable], [role='textbox'], [role='searchbox'], [role='button']"

const resolveActivator = (element: HTMLElement): HTMLElement =>
  element.matches(ACTIVATOR_SELECTOR) || element.hasAttribute("tabindex")
    ? element
    : (element.querySelector<HTMLElement>(ACTIVATOR_SELECTOR) ?? element)

const measurementAttempts = 3

const hasLayoutBox = (element: HTMLElement): boolean =>
  element.offsetParent !== null ||
  element.offsetWidth > 0 ||
  element.offsetHeight > 0

const rectWithin = (element: HTMLElement, container: HTMLElement): ItemRect => {
  let top = element.offsetTop
  let left = element.offsetLeft
  let ancestor = element.offsetParent as HTMLElement | null
  while (ancestor && ancestor !== container && container.contains(ancestor)) {
    top += ancestor.offsetTop + ancestor.clientTop
    left += ancestor.offsetLeft + ancestor.clientLeft
    ancestor = ancestor.offsetParent as HTMLElement | null
  }
  return {
    top,
    height: element.offsetHeight,
    left,
    width: element.offsetWidth
  }
}

const sameRects = (
  prev: ReadonlyArray<ItemRect | undefined>,
  next: ReadonlyArray<ItemRect | undefined>
): boolean => {
  if (prev.length !== next.length) return false
  for (let i = 0; i < next.length; i++) {
    const p = prev[i]
    const r = next[i]
    if (p === r) continue
    if (
      p === undefined ||
      r === undefined ||
      p.top !== r.top ||
      p.left !== r.left ||
      p.width !== r.width ||
      p.height !== r.height
    )
      return false
  }
  return true
}

export function useFluidHover<T extends HTMLElement>(
  containerRef: RefObject<T | null>
): UseFluidHoverReturn {
  const itemsRef = useRef(new Map<number, HTMLElement>())
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const activeIndexRef = useRef<number | null>(null)
  activeIndexRef.current = activeIndex

  useEffect(() => {
    const container = containerRef.current
    if (activeIndex === null) container?.removeAttribute(ACTIVE_INDEX_ATTR)
    else container?.setAttribute(ACTIVE_INDEX_ATTR, String(activeIndex))
    const active =
      activeIndex === null ? undefined : itemsRef.current.get(activeIndex)
    active?.setAttribute(ACTIVE_ATTR, "")
    return () => {
      active?.removeAttribute(ACTIVE_ATTR)
      if (activeIndex !== null)
        // oxlint-disable-next-line react-hooks/exhaustive-deps -- reads the element registered now, by design
        itemsRef.current.get(activeIndex)?.removeAttribute(ACTIVE_ATTR)
    }
  }, [activeIndex, containerRef])
  const [itemRects, setItemRects] = useState<
    ReadonlyArray<ItemRect | undefined>
  >([])
  const [isMeasured, setIsMeasured] = useState(false)
  const itemRectsRef = useRef<ReadonlyArray<ItemRect | undefined>>([])
  const sessionRef = useRef(0)
  const rafIdRef = useRef<number | null>(null)
  const remeasureRafIdRef = useRef<number | null>(null)

  const runMeasurement = useCallback(() => {
    const container = containerRef.current
    if (!container) return false
    const elements = [...itemsRef.current]
    if (!elements.every(([, element]) => hasLayoutBox(element))) return false
    const rects: Array<ItemRect | undefined> = []
    for (const [index, element] of elements)
      rects[index] = rectWithin(element, container)
    if (!sameRects(itemRectsRef.current, rects)) {
      itemRectsRef.current = rects
      setItemRects(rects)
    }
    return true
  }, [containerRef])

  const scheduleMeasurement = useCallback(
    (attemptsLeft: number) => {
      if (remeasureRafIdRef.current !== null) {
        cancelAnimationFrame(remeasureRafIdRef.current)
      }
      remeasureRafIdRef.current = requestAnimationFrame(() => {
        remeasureRafIdRef.current = null
        if (runMeasurement()) {
          setIsMeasured(true)
        } else if (attemptsLeft > 1) {
          scheduleMeasurement(attemptsLeft - 1)
        }
      })
    },
    [runMeasurement]
  )

  const remeasure = useCallback(() => {
    setIsMeasured(false)
    scheduleMeasurement(measurementAttempts)
  }, [scheduleMeasurement])

  const itemRoRef = useRef<ResizeObserver | null>(null)
  const getItemRo = useCallback(() => {
    if (itemRoRef.current === null && typeof ResizeObserver !== "undefined") {
      itemRoRef.current = new ResizeObserver(() =>
        scheduleMeasurement(measurementAttempts)
      )
    }
    return itemRoRef.current
  }, [scheduleMeasurement])

  const registerItem = useCallback(
    (index: number, element: HTMLElement | null) => {
      if (element) {
        itemsRef.current.set(index, element)
        getItemRo()?.observe(element)
        if (index === activeIndexRef.current)
          element.setAttribute(ACTIVE_ATTR, "")
      } else {
        const previous = itemsRef.current.get(index)
        if (previous) itemRoRef.current?.unobserve(previous)
        previous?.removeAttribute(ACTIVE_ATTR)
        itemsRef.current.delete(index)
        if (index === activeIndexRef.current) {
          setActiveIndex((current) =>
            current === index && !itemsRef.current.has(index) ? null : current
          )
        }
      }
      remeasure()
    },
    [remeasure, getItemRo]
  )

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      const pointY = e.clientY

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        const container = containerRef.current
        if (!container) return
        const bounds = container.getBoundingClientRect()
        setActiveIndex(
          pickNearest({
            pointY,
            rects: itemRectsRef.current,
            containerTop: bounds.top,
            containerHeight: bounds.height,
            scrollTop: container.scrollTop,
            borderTop: container.clientTop,
            layoutHeight: container.offsetHeight
          })
        )
      })
    },
    [containerRef]
  )

  const handleMouseEnter = useCallback(() => {
    sessionRef.current += 1
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    setActiveIndex(null)
  }, [])

  const handleClick = useCallback((e: ReactMouseEvent) => {
    const target = e.target as Node | null
    if (!target) return
    for (const element of itemsRef.current.values()) {
      if (element.contains(target)) return
    }
    if (!target.isConnected) return
    if ((target as Element).closest?.(GAP_CONTROL_SELECTOR)) return
    const index = activeIndexRef.current
    if (index === null) return
    const element = itemsRef.current.get(index)
    if (!element) return
    resolveActivator(element).click()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() =>
      scheduleMeasurement(measurementAttempts)
    )
    ro.observe(container)
    return () => ro.disconnect()
  }, [containerRef, scheduleMeasurement])

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
      if (remeasureRafIdRef.current !== null) {
        cancelAnimationFrame(remeasureRafIdRef.current)
      }
      itemRoRef.current?.disconnect()
      itemRoRef.current = null
    }
  }, [])

  return {
    activeIndex,
    setActiveIndex,
    itemRects,
    isMeasured,
    sessionRef,
    handlers: {
      onMouseMove: handleMouseMove,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onClick: handleClick
    },
    registerItem
  }
}

export function useRegisterFluidHoverItem(
  registerItem:
    | ((index: number, element: HTMLElement | null) => void)
    | undefined,
  index: number | undefined,
  ref: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!registerItem || index === undefined) return
    registerItem(index, ref.current)
    return () => registerItem(index, null)
  }, [index, registerItem, ref])
}
