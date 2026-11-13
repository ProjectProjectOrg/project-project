import { RegistryContext } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import { useContext, useEffect } from "react"

import { fireMutation } from "@/api/viewMutation"
import { markTicketRead } from "@/features/inbox/atoms/inbox"
import { useProjectRoute } from "@/features/projects/hooks/useProject"

export function useMarkTicketRead(ticketId: TicketId) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)
  useEffect(() => {
    void fireMutation(
      registry,
      markTicketRead({ orgSlug, slug, id: ticketId }),
      undefined
    )
  }, [registry, orgSlug, slug, ticketId])
}
