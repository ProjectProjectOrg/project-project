import { useHotkey } from "@tanstack/react-hotkeys"
import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

const ownsNode = (container: HTMLElement, node: EventTarget | null) => {
  if (!(node instanceof Node)) return false
  if (container.contains(node)) return true
  return Array.from(container.querySelectorAll("[aria-controls]")).some(
    (control) =>
      document
        .getElementById(control.getAttribute("aria-controls") ?? "")
        ?.contains(node) ?? false
  )
}

export function useCreatorFocus(
  containerRef: RefObject<HTMLElement | null>,
  onLeave?: () => void,
  startActive = false
) {
  const [active, setActive] = useState(startActive)
  const activeRef = useRef(startActive)
  const onLeaveRef = useRef(onLeave)

  useEffect(() => {
    onLeaveRef.current = onLeave
  })

  const leave = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    setActive(false)
    onLeaveRef.current?.()
  }, [])

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const container = containerRef.current
      if (!container) return
      if (!ownsNode(container, e.target)) return leave()
      activeRef.current = true
      setActive(true)
    }
    const onPointerDown = (e: PointerEvent) => {
      const container = containerRef.current
      if (container && !ownsNode(container, e.target)) leave()
    }
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [containerRef, leave])

  useHotkey(
    "Escape",
    (event) => {
      if (event.target instanceof HTMLElement) event.target.blur()
      leave()
    },
    { target: containerRef, enabled: active, conflictBehavior: "allow" }
  )

  return { active, leave }
}
