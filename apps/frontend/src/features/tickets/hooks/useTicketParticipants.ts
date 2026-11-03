import { useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { useMemo } from "react"

import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import {
  commenterIds,
  ticketParticipants
} from "@/features/tickets/lib/ticketParticipants"

export function useTicketParticipants(
  ticketId: TicketId
): ReadonlyArray<string> {
  const { orgSlug, slug } = useProjectRoute()
  const ticket = useAtomValue(
    ticketDetail(ticketRequest(orgSlug, slug, ticketId))
  )
  const thread = useAtomValue(
    comments(commentsRequest(orgSlug, slug, ticketId))
  )
  const current = Result.isSuccess(ticket) ? ticket.value : null
  const rows = Result.isSuccess(thread) ? thread.value : null
  const ids = ticketParticipants(
    current,
    rows === null ? [] : commenterIds(rows.map((row) => row.comment))
  )
  const key = ids.join(",")
  return useMemo(() => key.split(",").filter(Boolean), [key])
}
