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
  onLeave?: () => void
) {
  const [active, setActive] = useState(false)
  const activeRef = useRef(false)
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
    const onKeyDown = (e: KeyboardEvent) => {
      const container = containerRef.current
      if (e.key !== "Escape" || e.defaultPrevented || !activeRef.current) return
      if (!(e.target instanceof Node) || !container?.contains(e.target)) return
      e.preventDefault()
      if (e.target instanceof HTMLElement) e.target.blur()
      leave()
    }
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [containerRef, leave])

  return { active, leave }
}
