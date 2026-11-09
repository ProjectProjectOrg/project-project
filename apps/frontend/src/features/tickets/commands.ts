import {
  Archive,
  ArchiveRestore,
  CircleDot,
  Copy,
  Flag,
  Gauge,
  Layers,
  Link2,
  Plus,
  Shapes,
  SignalHigh,
  Tag,
  Timer,
  Trash2,
  UserCheck,
  UserMinus,
  UserRound
} from "lucide-react"

import type {
  Command,
  CommandContext
} from "@/features/command-menu/lib/commands"
import { createTicketDialog } from "@/features/tickets/atoms/createTicketDialog"
import {
  archiveTicket,
  ticketRequest,
  unarchiveTicket,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { MARK_KINDS } from "@/features/tickets/components/ticket-marks/markKinds"
import { m } from "@/paraglide/messages"

const onTicket = (context: CommandContext) => context.ticket !== null

const editable = (context: CommandContext) =>
  context.ticket !== null && context.canEditTickets

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
    id: "ticket.unassign-me",
    group: "ticket",
    label: m.tickets_command_unassign_me,
    icon: UserMinus,
    tool: "update_ticket",
    when: ({ ticketDetail, viewerId }) =>
      ticketDetail !== null &&
      viewerId !== null &&
      ticketDetail.assignees.includes(viewerId),
    run: ({ ticket, ticketDetail, viewerId }, env) => {
      if (ticket === null || ticketDetail === null || viewerId === null) return
      env.execute(
        updateTicketDetail(
          ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
        ),
        { assignees: ticketDetail.assignees.filter((id) => id !== viewerId) }
      )
      env.close()
    }
  },
  {
    id: "ticket.sprint",
    group: "ticket",
    label: m.tickets_command_move_to_sprint,
    icon: Timer,
    keywords: ["sprint", "cycle", "iteration", "remove"],
    tool: "update_ticket",
    when: ({ ticket, ticketDetail, canPlanSprints }) =>
      ticket !== null && canPlanSprints && ticketDetail?.type !== "epic",
    page: "ticketSprint"
  },
  {
    id: "ticket.estimate",
    group: "ticket",
    label: m.tickets_command_set_estimate,
    icon: Gauge,
    keywords: ["points", "size", "time"],
    tool: "update_ticket",
    when: ({ ticket, project, canEditTickets }) =>
      ticket !== null &&
      canEditTickets &&
      project !== null &&
      project.estimation !== "off",
    page: "ticketEstimate"
  },
  {
    id: "ticket.type",
    group: "ticket",
    label: m.tickets_command_change_type,
    icon: Shapes,
    keywords: ["bug", "feature", "chore", "epic"],
    tool: "update_ticket",
    when: editable,
    page: "ticketType"
  },
  {
    id: "ticket.tags",
    group: "ticket",
    label: m.tickets_command_tags,
    icon: Tag,
    keywords: ["labels"],
    tool: "update_ticket",
    when: editable,
    page: "ticketTags"
  },
  {
    id: "ticket.parent",
    group: "ticketRelations",
    label: ({ ticketDetail }) =>
      ticketDetail?.parent
        ? m.tickets_command_change_epic()
        : m.tickets_command_add_to_epic(),
    icon: Layers,
    keywords: ["epic"],
    tool: "update_ticket",
    when: (context) =>
      editable(context) && context.ticketDetail?.type !== "epic",
    page: "ticketParent"
  },
  {
    id: "ticket.mark",
    group: "ticketRelations",
    label: m.tickets_command_mark_as,
    icon: Flag,
    keywords: [
      "relation",
      "link",
      "blocked",
      "blocking",
      "related",
      "duplicate"
    ],
    when: onTicket,
    page: "ticketMarkAs"
  },
  ...MARK_KINDS.map(
    ({ kind, icon, command }): Command => ({
      id: `ticket.mark.${kind}`,
      group: "ticketRelations",
      searchOnly: true,
      label: command,
      icon,
      keywords: ["relation", "link"],
      tool: kind === "duplicateOf" ? "archive_ticket" : "mark_ticket",
      when: onTicket,
      page: `mark:${kind}`
    })
  ),
  {
    id: "ticket.copy-id",
    group: "ticketActions",
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
    group: "ticketActions",
    label: m.tickets_command_copy_link,
    icon: Link2,
    when: onTicket,
    run: (context, env) => {
      env.copy(ticketLink(context))
      env.close()
    }
  },
  {
    id: "ticket.archive",
    group: "ticketActions",
    label: m.tickets_command_archive,
    icon: Archive,
    tool: "archive_ticket",
    when: ({ ticket, ticketDetail, canArchiveTickets }) =>
      ticket !== null &&
      canArchiveTickets &&
      ticketDetail !== null &&
      ticketDetail.archivedAt === null,
    run: ({ ticket }, env) => {
      if (ticket === null) return
      env.execute(
        archiveTicket(
          ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
        ),
        {}
      )
      env.close()
    }
  },
  {
    id: "ticket.unarchive",
    group: "ticketActions",
    label: m.tickets_command_unarchive,
    icon: ArchiveRestore,
    tool: "restore_ticket",
    when: ({ ticket, ticketDetail, canArchiveTickets }) =>
      ticket !== null &&
      canArchiveTickets &&
      ticketDetail !== null &&
      ticketDetail.archivedAt !== null,
    run: ({ ticket }, env) => {
      if (ticket === null) return
      env.execute(
        unarchiveTicket(
          ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
        ),
        undefined
      )
      env.close()
    }
  },
  {
    id: "ticket.delete",
    group: "ticketActions",
    label: m.tickets_command_delete,
    icon: Trash2,
    keywords: ["remove"],
    searchOnly: true,
    when: ({ ticket, canDeleteTickets }) => ticket !== null && canDeleteTickets,
    page: "ticketDelete"
  },
  {
    id: "ticket.create",
    group: "create",
    label: m.tickets_command_create,
    icon: Plus,
    keywords: ["new", "add", "issue"],
    tool: "create_ticket",
    when: ({ sprint, canCreateTickets }) =>
      canCreateTickets &&
      (sprint === null || sprint.sprint.completedAt !== null),
    run: ({ orgSlug, projectSlug }, env) => {
      env.close()
      env.registry.set(createTicketDialog, { orgSlug, projectSlug })
    }
  }
]
