import type { TagName, Ticket } from "@pp/shared"
import { useCallback, useLayoutEffect, useRef } from "react"

import type { TicketEdit } from "../lib/ticketPatch"

export function useApplyCreatedTag(
  tags: Ticket["tags"],
  onPatch: (patch: TicketEdit) => void
): (name: TagName) => void {
  const latest = useRef({ tags, onPatch })
  useLayoutEffect(() => {
    latest.current = { tags, onPatch }
  }, [tags, onPatch])

  return useCallback((name) => {
    const current = latest.current
    if (current.tags.includes(name)) return
    const tags = [...current.tags, name]
    latest.current = { ...current, tags }
    current.onPatch({ tags })
  }, [])
}
