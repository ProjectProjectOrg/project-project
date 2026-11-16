import { RegistryContext } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import { useContext, useEffect } from "react"

import { fireMutation } from "@/api/viewMutation"
import { markInbox } from "@/features/inbox/atoms/localInbox"
import { useProjectRoute } from "@/features/projects/hooks/useProject"

export function useMarkTicketRead(ticketId: TicketId, loaded: boolean) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)
  useEffect(() => {
    if (!loaded) return
    void fireMutation(registry, markInbox, {
      kind: "read",
      orgSlug,
      projectSlug: slug,
      ticketId
    })
  }, [registry, orgSlug, slug, ticketId, loaded])
}
