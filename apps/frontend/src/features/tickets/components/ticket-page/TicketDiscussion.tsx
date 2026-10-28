import type { Member, Ticket } from "@pp/shared"

import { CommentsSection } from "@/features/comments/components/CommentsSection"
import { useChildTicketCount } from "@/features/tickets/hooks/useChildTicketCount"
import { m } from "@/paraglide/messages"

import { ChildTicketList } from "./ChildTicketList"

type Props = Readonly<{
  ticket: Ticket
  members: ReadonlyArray<Member>
  editable: boolean
  holdsChildren: boolean
}>

export function TicketDiscussion({
  ticket,
  members,
  editable,
  holdsChildren
}: Props) {
  return holdsChildren ? (
    <ChildrenDiscussion parent={ticket} members={members} editable={editable} />
  ) : (
    <CommentsSection ticketId={ticket.id} />
  )
}

function ChildrenDiscussion({
  parent,
  members,
  editable
}: Readonly<{
  parent: Ticket
  members: ReadonlyArray<Member>
  editable: boolean
}>) {
  const count = useChildTicketCount(parent.id)
  return (
    <CommentsSection
      ticketId={parent.id}
      extraTab={{
        placement: parent.type === "epic" ? "first" : "last",
        label:
          parent.type === "epic"
            ? m.tickets_epic_tickets_heading()
            : m.tickets_sub_tickets_heading(),
        badge: count > 0 ? count : null,
        content: (
          <ChildTicketList
            parent={parent}
            members={members}
            editable={editable}
          />
        )
      }}
    />
  )
}
