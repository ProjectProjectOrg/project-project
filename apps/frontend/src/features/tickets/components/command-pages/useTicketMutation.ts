import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import { commandScopes } from "@/features/command-menu/atoms/commandMenu"
import type {
  SelectedTicket,
  TicketContext
} from "@/features/command-menu/lib/commandMenu"
import { scopeSelectionUpdate } from "@/features/command-menu/lib/commandScopes"
import { bulkUpdateTickets } from "@/features/tickets/atoms/bulkTickets"
import {
  ticketDetail,
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import {
  applySelectedEdit,
  sharedTicketFields
} from "@/features/tickets/lib/sharedTicketFields"
import {
  toBulkPatch,
  type TicketEdit
} from "@/features/tickets/lib/ticketPatch"

export function useTicketMutation(
  ticket: TicketContext,
  selection: ReadonlyArray<SelectedTicket> = []
) {
  const req = ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
  const detail = useAtomValue(ticketDetail(req))
  const updateOne = useAtomSet(updateTicketDetail(req))
  const updateMany = useAtomSet(
    bulkUpdateTickets({ orgSlug: ticket.orgSlug, slug: ticket.slug })
  )
  const updateSelection = scopeSelectionUpdate(useAtomValue(commandScopes))
  const [edited, setEdited] = useState(selection)
  if (selection.length > 1) {
    const tickets = selection.map((each) => each.id)
    return {
      current: sharedTicketFields(edited),
      update: (edit: TicketEdit) => {
        setEdited((current) =>
          current.map((each) => applySelectedEdit(each, edit))
        )
        const patch = toBulkPatch(edit)
        if (updateSelection === null) updateMany({ tickets, patch })
        else updateSelection(ticket.slug, tickets, patch)
      }
    }
  }
  return {
    current: Result.isSuccess(detail) ? detail.value : null,
    update: updateOne
  }
}
