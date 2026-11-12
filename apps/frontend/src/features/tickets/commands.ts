import { isEpic } from "@pp/shared"
import type { TicketDetail } from "@pp/shared"
import {
  Archive,
  ArchiveRestore,
  Bot,
  CircleDot,
  CircleSlash,
  Copy,
  FileText,
  FolderInput,
  Gauge,
  Link2,
  Plus,
  Shapes,
  SignalHigh,
  Split,
  Tag,
  Timer,
  Trash2,
  Type,
  UserCheck,
  UserMinus,
  UserRound
} from "lucide-react"
import { createElement } from "react"

import type { TicketContext } from "@/features/command-menu/lib/commandMenu"
import type {
  Command,
  CommandContext
} from "@/features/command-menu/lib/commands"
import {
  removeTicketFromSprint,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { SprintChip } from "@/features/sprints/components/SprintChip"
import { createTicketDialog } from "@/features/tickets/atoms/createTicketDialog"
import {
  ticketRequest,
  unarchiveTicket,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import {
  ticketMarkdown,
  ticketPrompt
} from "@/features/tickets/lib/ticketClipboard"
import type { IconComponent } from "@/lib/icon"
import { m } from "@/paraglide/messages"

const onTicket = (context: CommandContext) => context.ticket !== null

export const onLiveTicket = ({ ticket, ticketDetail }: CommandContext) =>
  ticket !== null && (ticketDetail === null || ticketDetail.archivedAt === null)

export const editable = (context: CommandContext) =>
  onLiveTicket(context) && context.tickets.edit

const assignable = (context: CommandContext) =>
  onLiveTicket(context) && context.tickets.assign

const COPY_FORMATS: ReadonlyArray<
  Readonly<{
    id: string
    label: () => string
    icon: IconComponent
    keywords?: ReadonlyArray<string>
    text: (detail: TicketDetail, ticket: TicketContext, url: string) => string
  }>
> = [
  {
    id: "title",
    label: m.tickets_menu_copy_title,
    icon: Type,
    text: (detail) => detail.title
  },
  {
    id: "markdown",
    label: m.tickets_menu_copy_markdown,
    icon: FileText,
    text: (detail, _ticket, url) => ticketMarkdown(detail, url)
  },
  {
    id: "prompt",
    label: m.tickets_menu_copy_prompt,
    icon: Bot,
    keywords: ["agent", "ai"],
    text: (detail, ticket, url) => ticketPrompt(detail, url, ticket)
  }
]

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
    when: editable,
    page: "ticketStatus"
  },
  {
    id: "ticket.priority",
    group: "ticket",
    label: m.tickets_command_set_priority,
    icon: SignalHigh,
    tool: "update_ticket",
    when: editable,
    page: "ticketPriority"
  },
  {
    id: "ticket.assign",
    group: "ticket",
    label: m.tickets_command_assign,
    icon: UserRound,
    tool: "update_ticket",
    when: assignable,
    page: "ticketAssignee"
  },
  {
    id: "ticket.assign-me",
    group: "ticket",
    label: m.tickets_command_assign_me,
    icon: UserCheck,
    tool: "update_ticket",
    when: (context) =>
      assignable(context) &&
      context.ticketDetail !== null &&
      context.viewerId !== null &&
      !context.ticketDetail.assignees.includes(context.viewerId),
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
    when: (context) =>
      assignable(context) &&
      context.ticketDetail !== null &&
      context.viewerId !== null &&
      context.ticketDetail.assignees.includes(context.viewerId),
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
    when: (context) =>
      onLiveTicket(context) &&
      context.tickets.planSprints &&
      !isEpic(context.ticketDetail),
    page: "ticketSprint"
  },
  {
    id: "ticket.unplan",
    group: "ticket",
    label: m.tickets_command_remove_from_sprint,
    aside: ({ ticketSprint }) =>
      ticketSprint === null
        ? null
        : createElement(SprintChip, { sprint: ticketSprint }),
    icon: CircleSlash,
    keywords: ["sprint", "cycle", "iteration", "unplan"],
    tool: "update_ticket",
    when: (context) =>
      onLiveTicket(context) &&
      context.tickets.planSprints &&
      context.ticketSprint !== null,
    run: ({ ticket, ticketSprint }, env) => {
      if (ticket === null || ticketSprint === null) return
      removeTicketFromSprint(
        env.registry,
        sprintListRequest(ticket.orgSlug, ticket.slug),
        ticket.ticketId,
        ticketSprint.id
      )
      env.close()
    }
  },
  {
    id: "ticket.move",
    group: "ticket",
    label: m.tickets_command_move_to_project,
    icon: FolderInput,
    keywords: ["project", "transfer", "inbox"],
    tool: "move_ticket",
    when: (context) => onLiveTicket(context) && context.tickets.move,
    page: "ticketMove"
  },
  {
    id: "ticket.estimate",
    group: "ticket",
    label: m.tickets_command_set_estimate,
    icon: Gauge,
    keywords: ["points", "size", "time"],
    tool: "update_ticket",
    when: (context) =>
      editable(context) &&
      context.project !== null &&
      context.project.estimation !== "off",
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
  ...COPY_FORMATS.map(
    ({ id, label, icon, keywords, text }): Command => ({
      id: `ticket.copy-${id}`,
      group: "ticketActions",
      label,
      icon,
      keywords,
      searchOnly: true,
      when: ({ ticketDetail }) => ticketDetail !== null,
      run: (context, env) => {
        const { ticket, ticketDetail } = context
        if (ticket !== null && ticketDetail !== null) {
          env.copy(text(ticketDetail, ticket, ticketLink(context)))
        }
        env.close()
      }
    })
  ),
  {
    id: "ticket.split",
    group: "ticketActions",
    label: m.tickets_split_menu_item,
    icon: Split,
    keywords: ["break up", "divide"],
    when: (context) => onLiveTicket(context) && context.tickets.split,
    run: ({ ticket }, env) => {
      if (ticket === null) return
      env.close()
      env.navigate(
        `/orgs/${ticket.orgSlug}/projects/${ticket.slug}/tickets/${ticket.ticketId}/split`
      )
    }
  },
  {
    id: "ticket.archive",
    group: "ticketActions",
    label: m.tickets_command_archive,
    icon: Archive,
    tool: "archive_ticket",
    when: ({ ticket, ticketDetail, tickets }) =>
      ticket !== null &&
      tickets.archive &&
      ticketDetail !== null &&
      ticketDetail.archivedAt === null,
    page: "ticketArchive"
  },
  {
    id: "ticket.unarchive",
    group: "ticketActions",
    label: m.tickets_command_unarchive,
    icon: ArchiveRestore,
    tool: "restore_ticket",
    when: ({ ticket, ticketDetail, tickets }) =>
      ticket !== null &&
      tickets.archive &&
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
    when: ({ ticket, tickets }) => ticket !== null && tickets.delete,
    page: "ticketDelete"
  },
  {
    id: "ticket.create",
    group: "create",
    label: m.tickets_command_create,
    icon: Plus,
    keywords: ["new", "add", "issue"],
    tool: "create_ticket",
    when: ({ sprint, tickets }) =>
      tickets.create && (sprint === null || sprint.sprint.completedAt !== null),
    run: ({ orgSlug, projectSlug }, env) => {
      env.close()
      env.registry.set(createTicketDialog, { orgSlug, projectSlug })
    }
  }
]
