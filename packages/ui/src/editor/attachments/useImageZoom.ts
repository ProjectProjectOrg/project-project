import { animate, useReducedMotion } from "motion/react"
import { useRef, useEffect, useCallback, useState } from "react"
import { flushSync } from "react-dom"
export function useImageZoom() {
  const [zoom, setZoom] = useState(100)
  const viewport = useRef<HTMLDivElement>(null)
  const scale = useRef(100)
  const zoomAt = useCallback(
    (next: number, clientX: number, clientY: number) => {
      const el = viewport.current
      if (!el) return
      const value = Math.min(400, Math.max(100, next))
      const ratio = value / scale.current
      const rect = el.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const left = (el.scrollLeft + x) * ratio - x
      const top = (el.scrollTop + y) * ratio - y
      scale.current = value
      flushSync(() => setZoom(value))
      el.scrollTo(left, top)
    },
    []
  )

  const animation = useRef<ReturnType<typeof animate<number>> | null>(null)
  const reduceMotion = useReducedMotion()
  const toggleZoom = (x: number, y: number) => {
    animation.current?.stop()
    const target = scale.current > 100 ? 100 : 200
    if (reduceMotion) {
      zoomAt(target, x, y)
      return
    }
    animation.current = animate(scale.current, target, {
      duration: 0.18,
      ease: "easeOut",
      onUpdate: (value) => zoomAt(value, x, y)
    })
  }

  useEffect(() => {
    const el = viewport.current
    if (!el) return undefined
    let gestureStart = 0
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      animation.current?.stop()
      event.preventDefault()
      if (!gestureStart)
        zoomAt(
          scale.current * Math.exp(-event.deltaY / 100),
          event.clientX,
          event.clientY
        )
    }
    const gesture = (event: Event) => {
      animation.current?.stop()
      event.preventDefault()
      if (event.type === "gestureend") {
        gestureStart = 0
        return
      }
      if (event.type === "gesturestart") gestureStart = scale.current
      if (!("scale" in event)) return
      const factor = Number(event.scale)
      if (!Number.isFinite(factor) || factor <= 0) return
      const rect = el.getBoundingClientRect()
      const x = "clientX" in event ? Number(event.clientX) : NaN
      const y = "clientY" in event ? Number(event.clientY) : NaN
      zoomAt(
        gestureStart * factor,
        Number.isFinite(x) ? x : rect.left + rect.width / 2,
        Number.isFinite(y) ? y : rect.top + rect.height / 2
      )
    }
    el.addEventListener("wheel", wheel, { passive: false })
    const events = ["gesturestart", "gesturechange", "gestureend"]
    for (const name of events)
      el.addEventListener(name, gesture, { passive: false })
    return () => {
      animation.current?.stop()
      el.removeEventListener("wheel", wheel)
      for (const name of events) el.removeEventListener(name, gesture)
    }
  }, [zoomAt])
  return { zoom, viewport, scale, toggleZoom, animation, setZoom, reduceMotion }
}
