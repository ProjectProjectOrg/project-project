import { useAtomSet } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"

import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import {
  openCommandMenu,
  type CommandPage
} from "@/features/command-menu/lib/commandMenu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"

export function useOpenTicketPage(
  ticketId: TicketId
): (page: CommandPage) => void {
  const { orgSlug, slug } = useProjectRoute()
  const setCommandMenu = useAtomSet(commandMenuState)
  return (page) =>
    setCommandMenu(openCommandMenu({ orgSlug, slug, ticketId }, page))
}
