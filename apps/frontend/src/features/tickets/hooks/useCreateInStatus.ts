import { useAtomSet } from "@effect/atom-react"
import type { GroupId, TicketStatus } from "@pp/shared"

import { useOpenCommandMenu } from "@/features/command-menu/hooks/useOpenCommandMenu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { newTicketRequest } from "@/features/tickets/atoms/createTicket"
import { useProjectActor } from "@/hooks/useActor"

export function useCreateInStatus(sprint?: GroupId) {
  const { orgSlug, slug } = useProjectRoute()
  const actor = useProjectActor()
  const setNewTicket = useAtomSet(newTicketRequest)
  const openCommandMenu = useOpenCommandMenu(orgSlug)
  if (!actor.call("tickets", "create")) return undefined
  return (status: TicketStatus) => {
    setNewTicket({
      orgSlug,
      projectSlug: slug,
      status,
      sprint,
      from: "inline"
    })
    openCommandMenu("createTicket")
  }
}
