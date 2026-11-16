import { useHotkey } from "@tanstack/react-hotkeys"
import { useLayoutEffect, useRef } from "react"

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

  useHotkey("Escape", onExit, {
    enabled: reorderMode,
    preventDefault: false,
    conflictBehavior: "allow"
  })

  return groupRef
}
