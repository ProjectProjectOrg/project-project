import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"

import type { TicketContext } from "@/features/command-menu/lib/commandMenu"
import {
  ticketDetail,
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"

export function useTicketMutation(ticket: TicketContext) {
  const req = ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
  const detail = useAtomValue(ticketDetail(req))
  const update = useAtomSet(updateTicketDetail(req))
  return {
    current: Result.isSuccess(detail) ? detail.value : null,
    update
  }
}
