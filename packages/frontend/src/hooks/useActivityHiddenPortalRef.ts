import * as React from "react"

const noop = () => {}

export function useActivityHiddenPortalRef() {
  const restore = React.useRef<(() => void) | null>(null)
  return React.useCallback((element: HTMLElement | null) => {
    if (element === null) return noop
    restore.current?.()
    if (element.querySelector("[data-open]") !== null) {
      element.removeAttribute("data-retained-stale")
    }
    const display = element.style.getPropertyValue("display")
    const priority = element.style.getPropertyPriority("display")
    restore.current = () => {
      element.style.setProperty("display", display, priority)
    }
    return () => {
      element.style.setProperty("display", "none", "important")
      // Base UI re-runs this ref on ordinary re-renders, which re-attach in the same commit.
      requestAnimationFrame(() => {
        if (element.style.getPropertyValue("display") === "none") {
          element.setAttribute("data-retained-stale", "")
        }
      })
    }
  }, [])
}
