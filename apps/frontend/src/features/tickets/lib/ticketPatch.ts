import {
  applyListEdit,
  type BulkTicketPatch,
  composeListEdit,
  type ListEdit,
  type Ticket,
  type TicketDetail,
  type TicketFlag,
  type TicketParent,
  type TicketPosition,
  type TicketRank,
  type UpdateTicketInput
} from "@pp/shared"
import * as DateTime from "effect/DateTime"

import { flagFor } from "./ticketFlag"

export const parentRef = ({
  id,
  title,
  type
}: Pick<Ticket, "id" | "title" | "type">) => ({
  id,
  title,
  type
})

export type TicketMove = Readonly<{
  to: TicketPosition
  rank: TicketRank | null
}>

export type TicketEdit = Omit<
  UpdateTicketInput,
  "parent" | "flag" | "position"
> &
  Readonly<{
    parent?: TicketParent | null
    flag?: TicketFlag | null
    position?: TicketMove
  }>

export type TicketPrediction = TicketEdit &
  Readonly<{
    incrementRelation?:
      | "openBlockerCount"
      | "openBlockingCount"
      | "relatedCount"
      | "duplicateCount"
  }>

const flagInput = (flag: TicketFlag | null | undefined) => {
  if (flag === undefined) return {}
  if (flag === null) return { flag: null }
  return { flag: flag.reason === undefined ? {} : { reason: flag.reason } }
}

export const toUpdateInput = ({
  parent,
  flag,
  position,
  ...edit
}: TicketEdit) => ({
  ...edit,
  ...(parent === undefined ? {} : { parent: parent?.id ?? null }),
  ...(position === undefined ? {} : { position: position.to }),
  ...flagInput(flag)
})

const composed = <A>(
  pending: ListEdit<A> | undefined,
  next: ListEdit<A> | undefined
) =>
  pending === undefined || next === undefined
    ? (next ?? pending)
    : composeListEdit(pending, next)

export const mergeTicketEdit = (pending: TicketEdit, next: TicketEdit) => {
  return {
    ...pending,
    ...next,
    tags: composed(pending.tags, next.tags),
    assignees: composed(pending.assignees, next.assignees)
  }
}

export const toBulkPatch = (edit: TicketEdit) => {
  const {
    title: _title,
    body: _body,
    blockedBy: _blockedBy,
    relatedTo: _relatedTo,
    ...patch
  } = toUpdateInput(edit)
  return patch
}

export const fromBulkPatch = (
  { parent, position: _position, flag, ...edit }: BulkTicketPatch,
  viewerId?: string
) => ({
  ...edit,
  ...(parent === null ? { parent: null } : {}),
  ...(flag === null
    ? { flag: null }
    : flag && viewerId
      ? {
          flag: flagFor(
            flag.reason ?? "",
            viewerId,
            DateTime.toDate(DateTime.nowUnsafe())
          )
        }
      : {})
})

/** Apply a server patch to a list row. Fields absent from the patch are kept. */
export function applyTicketPatch(ticket: Ticket, patch: TicketPrediction) {
  const count = patch.incrementRelation
  if (count !== undefined)
    return { ...ticket, [count]: (ticket[count] ?? 0) + 1 }
  return {
    ...ticket,
    title: patch.title ?? ticket.title,
    status: patch.status ?? ticket.status,
    type: patch.type === undefined ? ticket.type : patch.type,
    priority: patch.priority ?? ticket.priority,
    rank: patch.position?.rank ?? ticket.rank,
    estimate: patch.estimate !== undefined ? patch.estimate : ticket.estimate,
    tags:
      patch.tags === undefined
        ? ticket.tags
        : applyListEdit(ticket.tags, patch.tags),
    assignees:
      patch.assignees === undefined
        ? ticket.assignees
        : applyListEdit(ticket.assignees, patch.assignees),
    parent: patch.parent === undefined ? ticket.parent : patch.parent,
    flag: patch.flag === undefined ? ticket.flag : patch.flag
  }
}

/** Same, for the detail view, which also owns `body`. */
export function applyTicketDetailPatch(
  ticket: TicketDetail,
  patch: TicketEdit
) {
  return {
    ...ticket,
    ...applyTicketPatch(ticket, patch),
    body: patch.body ?? ticket.body
  }
}
