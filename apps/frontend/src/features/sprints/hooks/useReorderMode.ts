import { useEffect, useLayoutEffect, useRef } from "react"

export function useReorderMode(reorderMode: boolean, onExit: () => void) {
  const groupRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group) return
    if (!reorderMode) {
      group.style.width = ""
      return
    }
    if (group.scrollWidth) group.style.width = `${group.scrollWidth}px`
  }, [reorderMode])

  useEffect(() => {
    if (!reorderMode) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [reorderMode, onExit])

  return groupRef
}
