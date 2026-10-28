import { useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  childTickets,
  childTicketsRequest
} from "@/features/tickets/atoms/childTickets"

export function useChildTicketCount(parent: TicketId): number {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(
    childTickets(childTicketsRequest(orgSlug, slug, parent))
  )
  return Result.isSuccess(result) ? result.value.length : 0
}
