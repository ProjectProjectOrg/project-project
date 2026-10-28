import { useAtomValue } from "@effect/atom-react"
import { canHoldChildren, type Ticket, type TicketDetail } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"

type ParentResult = Result.AsyncResult<TicketDetail | null, unknown>

const noParent: Atom.Atom<ParentResult> = Atom.make(Result.success(null))

export type TicketHierarchy = Readonly<{
  loaded: boolean
  subTicketOf: TicketDetail | null
  holdsChildren: boolean
}>

export function useTicketHierarchy(
  ticket: Pick<Ticket, "type" | "parent">
): TicketHierarchy {
  const { orgSlug, slug } = useProjectRoute()
  const parentId = ticket.parent ?? null
  const atom: Atom.Atom<ParentResult> =
    parentId === null
      ? noParent
      : ticketDetail(ticketRequest(orgSlug, slug, parentId))
  const result = useAtomValue(atom)
  const parent = Result.isSuccess(result) ? result.value : null
  return {
    loaded: !Result.isInitial(result),
    subTicketOf: parent !== null && parent.type !== "epic" ? parent : null,
    holdsChildren: Result.isSuccess(result) && canHoldChildren(ticket, parent)
  }
}
