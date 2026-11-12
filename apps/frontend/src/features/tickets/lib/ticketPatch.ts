import {
  applyListEdit,
  composeListEdit,
  type ListEdit,
  type Ticket,
  type TicketDetail,
  type TicketParent,
  type UpdateTicketInput
} from "@pp/shared"

export const parentRef = ({
  id,
  title,
  type
}: Pick<Ticket, "id" | "title" | "type">): TicketParent => ({ id, title, type })

export type TicketEdit = Omit<UpdateTicketInput, "parent"> &
  Readonly<{ parent?: TicketParent | null }>

export const toUpdateInput = ({
  parent,
  ...edit
}: TicketEdit): UpdateTicketInput =>
  parent === undefined ? edit : { ...edit, parent: parent?.id ?? null }

const composed = <A>(
  pending: ListEdit<A> | undefined,
  next: ListEdit<A> | undefined
) =>
  pending === undefined || next === undefined
    ? (next ?? pending)
    : composeListEdit(pending, next)

export const mergeTicketEdit = (
  pending: TicketEdit,
  next: TicketEdit
): TicketEdit => {
  return {
    ...pending,
    ...next,
    tags: composed(pending.tags, next.tags),
    assignees: composed(pending.assignees, next.assignees)
  }
}

/** Apply a server patch to a list row. Fields absent from the patch are kept. */
export function applyTicketPatch(ticket: Ticket, patch: TicketEdit): Ticket {
  return {
    ...ticket,
    title: patch.title ?? ticket.title,
    status: patch.status ?? ticket.status,
    type: patch.type ?? ticket.type,
    priority: patch.priority ?? ticket.priority,
    estimate: patch.estimate !== undefined ? patch.estimate : ticket.estimate,
    tags:
      patch.tags === undefined
        ? ticket.tags
        : applyListEdit(ticket.tags, patch.tags),
    assignees:
      patch.assignees === undefined
        ? ticket.assignees
        : applyListEdit(ticket.assignees, patch.assignees),
    parent: patch.parent === undefined ? ticket.parent : patch.parent
  }
}

/** Same, for the detail view, which also owns `body`. */
export function applyTicketDetailPatch(
  ticket: TicketDetail,
  patch: TicketEdit
): TicketDetail {
  return {
    ...ticket,
    ...applyTicketPatch(ticket, patch),
    body: patch.body ?? ticket.body
  }
}
