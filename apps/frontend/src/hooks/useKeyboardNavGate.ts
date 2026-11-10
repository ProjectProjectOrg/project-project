import { useCallback, useEffect, useRef, type KeyboardEvent } from "react"

const POPUP_NAV_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Tab"
])

export function useKeyboardNavGate() {
  const keyboardNavRef = useRef(false)

  useEffect(() => {
    const active = document.activeElement
    keyboardNavRef.current =
      active instanceof HTMLElement && active.matches(":focus-visible")
  }, [])

  const trackKeyboardNav = useCallback((e: KeyboardEvent) => {
    if (POPUP_NAV_KEYS.has(e.key)) keyboardNavRef.current = true
  }, [])

  return { keyboardNavRef, trackKeyboardNav }
}
