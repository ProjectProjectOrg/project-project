import { useAtomSet } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"

import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import {
  openCommandMenu,
  type CommandPage
} from "@/features/command-menu/lib/commandMenu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useSelectedTickets } from "@/features/tickets/components/ticket-list/TicketSelection"
import { selectionKey } from "@/features/tickets/lib/ticketSelection"

export function useOpenTicketPage(
  ticketId: TicketId
): (page: CommandPage) => void {
  const { orgSlug, slug } = useProjectRoute()
  const setCommandMenu = useAtomSet(commandMenuState)
  const selected = useSelectedTickets(selectionKey(slug, ticketId))
  return (page) =>
    setCommandMenu(
      openCommandMenu({ orgSlug, slug, ticketId }, page, selected())
    )
}
