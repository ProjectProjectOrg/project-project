import { useCallback, useState } from "react"
import type { TicketId } from "@projectproject/shared"

export function useTicketPreview() {
  const [activePreviewId, setActivePreviewId] = useState<TicketId | null>(null)
  const onPreviewPointerEnter = useCallback((ticketId: TicketId) => {
    setActivePreviewId((current) => (current === ticketId ? current : null))
  }, [])
  const onPreviewOpenChange = useCallback(
    (ticketId: TicketId, open: boolean) => {
      setActivePreviewId((current) =>
        open ? ticketId : current === ticketId ? null : current
      )
    },
    []
  )
  return { activePreviewId, onPreviewPointerEnter, onPreviewOpenChange }
}
