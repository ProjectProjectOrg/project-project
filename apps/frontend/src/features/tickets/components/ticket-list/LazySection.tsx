import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

const NEAR_PIXELS = 1500
const NEAR_MARGIN = `${NEAR_PIXELS}px 0px`

type Watch = Readonly<{
  observer: IntersectionObserver
  listeners: Map<Element, (near: boolean) => void>
}>

const watches = new Map<Element | null, Watch>()

const watchNearViewport = (
  element: Element,
  listener: (near: boolean) => void
) => {
  const root = element.closest("[data-scroll-root]")
  let watch = watches.get(root)
  if (watch === undefined) {
    const listeners = new Map<Element, (near: boolean) => void>()
    watch = {
      listeners,
      observer: new IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            listeners.get(entry.target)?.(entry.isIntersecting)
        },
        { root, rootMargin: NEAR_MARGIN }
      )
    }
    watches.set(root, watch)
  }
  const current = watch
  current.listeners.set(element, listener)
  current.observer.observe(element)
  return () => {
    current.observer.unobserve(element)
    current.listeners.delete(element)
    if (current.listeners.size > 0) return
    current.observer.disconnect()
    watches.delete(root)
  }
}

const nearNow = (element: Element) => {
  const root = element.closest("[data-scroll-root]")
  const box = element.getBoundingClientRect()
  const top = root === null ? 0 : root.getBoundingClientRect().top
  const bottom =
    root === null ? window.innerHeight : root.getBoundingClientRect().bottom
  return box.bottom >= top - NEAR_PIXELS && box.top <= bottom + NEAR_PIXELS
}

export function LazySection({
  estimatedHeight,
  children
}: Readonly<{ estimatedHeight: number; children: ReactNode }>) {
  const element = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [height, setHeight] = useState(estimatedHeight)

  useLayoutEffect(() => {
    const current = element.current
    if (current === null) return undefined
    if (nearNow(current)) setNear(true)
    return watchNearViewport(current, (isNear) => {
      if (!isNear && current.childElementCount > 0)
        setHeight(current.offsetHeight)
      setNear(isNear)
    })
  }, [])

  return (
    <div ref={element} style={near ? undefined : { height }}>
      {near ? children : null}
    </div>
  )
}
