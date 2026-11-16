import { useRouter } from "@tanstack/react-router"
import { useCallback } from "react"

const opensElsewhere = (event: MouseEvent): boolean =>
  event.button !== 0 ||
  event.metaKey ||
  event.ctrlKey ||
  event.shiftKey ||
  event.altKey

export function useInAppLink() {
  const router = useRouter()
  return useCallback(
    (anchor: HTMLAnchorElement | null) => {
      if (anchor === null) return undefined
      const onClick = (event: MouseEvent) => {
        event.stopPropagation()
        const href = anchor.getAttribute("href")
        if (href === null || opensElsewhere(event)) return
        event.preventDefault()
        void router.navigate({ href })
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
    [router]
  )
}
