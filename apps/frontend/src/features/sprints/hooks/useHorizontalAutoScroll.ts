import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element"
import { useEffect, type RefObject } from "react"

export function useHorizontalAutoScroll(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean
) {
  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return undefined
    return autoScrollForElements({
      element,
      getAllowedAxis: () => "horizontal"
    })
  }, [ref, enabled])
}
