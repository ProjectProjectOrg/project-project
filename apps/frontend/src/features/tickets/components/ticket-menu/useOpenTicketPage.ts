import { useAtomSet } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import { useContext } from "react"

import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import {
  openCommandMenu,
  type PointedTicket,
  type CommandPage
} from "@/features/command-menu/lib/commandMenu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useSelectedTickets } from "@/features/tickets/components/ticket-list/TicketSelection"
import { TicketViewSourceContext } from "@/features/tickets/hooks/ticketViewSource"
import { selectionKey } from "@/features/tickets/lib/ticketSelection"

export function useOpenTicketPage(
  ticketId: TicketId,
  row?: Pick<PointedTicket, "row" | "patch" | "remove" | "mark">
) {
  const { orgSlug, slug } = useProjectRoute()
  const search = useContext(TicketViewSourceContext)
  const ticket = { orgSlug, slug, ticketId }
  const setCommandMenu = useAtomSet(commandMenuState)
  const selected = useSelectedTickets(selectionKey(slug, ticketId))
  return (page: CommandPage) =>
    setCommandMenu(
      openCommandMenu(
        ticket,
        page,
        selected(),
        row ? { ...ticket, ...row, search } : null
      )
    )
}
