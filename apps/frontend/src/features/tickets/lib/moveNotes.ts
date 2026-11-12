import type { TicketDetail } from "@pp/shared"

import { m } from "@/paraglide/messages"

export type MoveDrops = Readonly<{
  type: string | null
  tags: ReadonlyArray<string>
  assignees: ReadonlyArray<string>
  estimate: boolean
}>

export const moveNotes = (
  ticket: Pick<TicketDetail, "branch" | "subTicketCount">,
  dropped: MoveDrops,
  sourceMembers: ReadonlyArray<Readonly<{ id: string; name: string }>>
): ReadonlyArray<string> => {
  const names = dropped.assignees.map(
    (id) => sourceMembers.find((member) => member.id === id)?.name ?? id
  )
  const subTickets = ticket.subTicketCount ?? 0
  return [
    dropped.type === null
      ? null
      : m.tickets_move_drops_type({ type: dropped.type }),
    dropped.tags.length > 0
      ? m.tickets_move_drops_tags({ tags: dropped.tags.join(", ") })
      : null,
    names.length > 0
      ? m.tickets_move_drops_assignees({ names: names.join(", ") })
      : null,
    dropped.estimate ? m.tickets_move_drops_estimate() : null,
    ticket.branch === null ? null : m.tickets_move_branch_note(),
    subTickets > 0
      ? m.tickets_move_sub_tickets_note({ count: subTickets })
      : null,
    m.tickets_move_groups_note()
  ].filter((note) => note !== null)
}
