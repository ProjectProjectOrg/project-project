import { useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
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

const notLoaded = Atom.make(Result.initial())

export function useTicketParticipants(
  ticketId: TicketId,
  load: boolean
): ReadonlyArray<string> {
  const { orgSlug, slug } = useProjectRoute()
  const ticket = useAtomValue(
    ticketDetail(ticketRequest(orgSlug, slug, ticketId))
  )
  const thread = useAtomValue(
    load ? comments(commentsRequest(orgSlug, slug, ticketId)) : notLoaded
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
