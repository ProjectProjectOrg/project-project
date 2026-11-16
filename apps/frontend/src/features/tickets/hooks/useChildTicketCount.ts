import { useAtomValue } from "@effect/atom-react"
import type { Ticket } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  childTickets,
  childTicketsRequest
} from "@/features/tickets/atoms/childTickets"

const notLoaded = Atom.make(Result.initial())

export function useChildTicketCount(
  parent: Pick<Ticket, "id" | "subTicketCount">,
  load: boolean
): number {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(
    load
      ? childTickets(childTicketsRequest(orgSlug, slug, parent.id))
      : notLoaded
  )
  return Result.isSuccess(result)
    ? result.value.length
    : (parent.subTicketCount ?? 0)
}
