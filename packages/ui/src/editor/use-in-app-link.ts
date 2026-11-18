import { useCallback } from "react"

const opensElsewhere = (event: MouseEvent) =>
  event.button !== 0 ||
  event.metaKey ||
  event.ctrlKey ||
  event.shiftKey ||
  event.altKey

import { useEditorServices } from "./services"

// Ref callback for an in-app <a>: a plain click navigates without a page
// load (EditorServices navigate); modified and middle clicks open as usual.
export function useInAppLink() {
  const { navigate } = useEditorServices()
  return useCallback(
    (anchor: HTMLAnchorElement | null) => {
      if (anchor === null) return undefined
      const onClick = (event: MouseEvent) => {
        event.stopPropagation()
        const href = anchor.getAttribute("href")
        if (href === null || opensElsewhere(event)) return
        event.preventDefault()
        navigate(href)
      }
      const onMouseUp = (event: MouseEvent) => {
        if (event.button === 1) event.stopPropagation()
      }
      anchor.addEventListener("click", onClick)
      anchor.addEventListener("mouseup", onMouseUp)
      return () => {
        anchor.removeEventListener("click", onClick)
        anchor.removeEventListener("mouseup", onMouseUp)
      }
    },
    [navigate]
  )
}
