import { useAtomSet } from "@effect/atom-react"
import { useEffect } from "react"

import { openInteractions } from "@/lib/interactions"

export function useHoldInteraction(active: boolean) {
  const setOpen = useAtomSet(openInteractions)
  useEffect(() => {
    if (!active) return
    setOpen((open) => open + 1)
    return () => setOpen((open) => open - 1)
  }, [active, setOpen])
}
