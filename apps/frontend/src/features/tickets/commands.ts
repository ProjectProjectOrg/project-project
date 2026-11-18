import {
  CircleDot,
  Plus,
  Copy,
  Link2,
  SignalHigh,
  UserCheck,
  UserRound
} from "lucide-react"

import type {
  Command,
  CommandContext
} from "@/features/command-menu/lib/commands"
import { createTicketDialog } from "@/features/tickets/atoms/createTicketDialog"
import {
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { m } from "@/paraglide/messages"

const onTicket = (context: CommandContext) => context.ticket !== null

const ticketLink = (context: CommandContext) =>
  context.ticket === null
    ? ""
    : `${window.location.origin}/orgs/${context.ticket.orgSlug}/projects/${context.ticket.slug}/tickets/${context.ticket.ticketId}`

export const ticketCommands: ReadonlyArray<Command> = [
  {
    id: "ticket.status",
    group: "ticket",
    label: m.tickets_command_change_status,
    icon: CircleDot,
    tool: "update_ticket",
    when: onTicket,
    page: "ticketStatus"
  },
  {
    id: "ticket.priority",
    group: "ticket",
    label: m.tickets_command_set_priority,
    icon: SignalHigh,
    tool: "update_ticket",
    when: onTicket,
    page: "ticketPriority"
  },
  {
    id: "ticket.assign",
    group: "ticket",
    label: m.tickets_command_assign,
    icon: UserRound,
    tool: "update_ticket",
    when: onTicket,
    page: "ticketAssignee"
  },
  {
    id: "ticket.assign-me",
    group: "ticket",
    label: m.tickets_command_assign_me,
    icon: UserCheck,
    tool: "update_ticket",
    when: ({ ticketDetail, viewerId }) =>
      ticketDetail !== null &&
      viewerId !== null &&
      !ticketDetail.assignees.includes(viewerId),
    run: ({ ticket, ticketDetail, viewerId }, env) => {
      if (ticket === null || ticketDetail === null || viewerId === null) return
      env.execute(
        updateTicketDetail(
          ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
        ),
        { assignees: [...ticketDetail.assignees, viewerId] }
      )
      env.close()
    }
  },
  {
    id: "ticket.copy-id",
    group: "ticket",
    label: m.tickets_command_copy_id,
    icon: Copy,
    when: onTicket,
    run: ({ ticket }, env) => {
      if (ticket !== null) env.copy(ticket.ticketId)
      env.close()
    }
  },
  {
    id: "ticket.copy-link",
    group: "ticket",
    label: m.tickets_command_copy_link,
    icon: Link2,
    when: onTicket,
    run: (context, env) => {
      env.copy(ticketLink(context))
      env.close()
    }
  },
  {
    id: "ticket.create",
    group: "create",
    label: m.tickets_command_create,
    icon: Plus,
    keywords: ["new", "add", "issue"],
    tool: "create_ticket",
    run: ({ orgSlug, projectSlug }, env) => {
      env.close()
      env.registry.set(createTicketDialog, { orgSlug, projectSlug })
    }
  }
]
