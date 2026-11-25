import { belowMenuBackdrop, isMenuBackdrop } from "@pp/ui/lib/menuBackdrop"
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
      if (!container) return
      // An open menu's backdrop takes the click; what's under it counts.
      // Capture, so this reads it before the menu closes and unmarks it.
      const target = isMenuBackdrop(e.target)
        ? (belowMenuBackdrop(e) ?? null)
        : e.target
      if (!ownsNode(container, target)) return leave()
      activeRef.current = true
      setActive(true)
    }
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => {
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("pointerdown", onPointerDown, true)
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
