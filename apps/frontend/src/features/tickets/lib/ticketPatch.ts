import type {
  Ticket,
  TicketDetail,
  TicketParent,
  UpdateTicketInput
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

/** Apply a server patch to a list row. Fields absent from the patch are kept. */
export function applyTicketPatch(ticket: Ticket, patch: TicketEdit): Ticket {
  return {
    ...ticket,
    title: patch.title ?? ticket.title,
    status: patch.status ?? ticket.status,
    type: patch.type === undefined ? ticket.type : patch.type,
    priority: patch.priority ?? ticket.priority,
    estimate: patch.estimate !== undefined ? patch.estimate : ticket.estimate,
    tags: patch.tags ?? ticket.tags,
    assignees: patch.assignees ?? ticket.assignees,
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
