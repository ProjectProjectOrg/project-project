import { useAtomValue } from "@effect/atom-react"
import type { Ticket } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  childTickets,
  childTicketsRequest
} from "@/features/tickets/atoms/childTickets"

export function useChildTicketCount(
  parent: Pick<Ticket, "id" | "subTicketCount">
): number {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(
    childTickets(childTicketsRequest(orgSlug, slug, parent.id))
  )
  return Result.isSuccess(result)
    ? result.value.length
    : (parent.subTicketCount ?? 0)
}
