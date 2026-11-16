import { isEpic } from "@pp/shared"
import type { TicketDetail } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
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
  SquareArrowOutUpRight,
  Tag,
  Timer,
  Trash2,
  Type,
  UserCheck,
  UserMinus,
  UserRound
} from "lucide-react"
import { createElement } from "react"

import {
  commandMenuState,
  pointedTicket
} from "@/features/command-menu/atoms/commandMenu"
import {
  pointedAt,
  type TicketContext
} from "@/features/command-menu/lib/commandMenu"
import type {
  Command,
  CommandContext,
  CommandEnv
} from "@/features/command-menu/lib/commands"
import {
  removeTicketFromSprint,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { SprintChip } from "@/features/sprints/components/SprintChip"
import {
  setSubscribed,
  ticketSubscribers,
  ticketSubscribersRequest
} from "@/features/subscriptions/atoms/ticketSubscribers"
import { canSubscribe } from "@/features/subscriptions/lib/canSubscribe"
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
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { appHotkeys } from "@/lib/appHotkeys"
import type { IconComponent } from "@/lib/icon"
import { m } from "@/paraglide/messages"

const onTicket = (context: CommandContext) => context.ticket !== null

export const editTicket = (
  ticket: TicketContext,
  env: CommandEnv,
  edit: TicketEdit
) => {
  const row = pointedAt(env.registry.get(pointedTicket), ticket)
  if (row !== null) row.patch(edit)
  else {
    env.execute(
      updateTicketDetail(
        ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
      ),
      edit
    )
  }
}

export const openTicket = (ticket: TicketContext, env: CommandEnv) => {
  const row =
    pointedAt(env.registry.get(pointedTicket), ticket) ??
    pointedAt(env.registry.get(commandMenuState).row, ticket)
  env.close()
  env.navigate(
    `/orgs/${ticket.orgSlug}/projects/${ticket.slug}/tickets/${ticket.ticketId}`,
    row?.search
  )
}

export const onLiveTicket = ({ ticket, ticketData }: CommandContext) =>
  ticket !== null && (ticketData === null || ticketData.archivedAt === null)

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
    hotkey: appHotkeys["tickets.status"],
    bulk: true,
    group: "ticket",
    label: m.tickets_command_change_status,
    icon: CircleDot,
    tool: "update_ticket",
    when: editable,
    page: "ticketStatus"
  },
  {
    id: "ticket.priority",
    hotkey: appHotkeys["tickets.priority"],
    bulk: true,
    group: "ticket",
    label: m.tickets_command_set_priority,
    icon: SignalHigh,
    tool: "update_ticket",
    when: editable,
    page: "ticketPriority"
  },
  {
    id: "ticket.assign",
    hotkey: appHotkeys["tickets.assign"],
    bulk: true,
    group: "ticket",
    label: m.tickets_command_assign,
    icon: UserRound,
    tool: "update_ticket",
    when: assignable,
    page: "ticketAssignee"
  },
  {
    id: "ticket.assign-me",
    hotkey: appHotkeys["tickets.assign-me"],
    group: "ticket",
    label: m.tickets_command_assign_me,
    icon: UserCheck,
    tool: "update_ticket",
    when: (context) =>
      assignable(context) &&
      context.ticketData !== null &&
      context.viewerId !== null &&
      !context.ticketData.assignees.includes(context.viewerId),
    run: ({ ticket, ticketData, viewerId }, env) => {
      if (ticket === null || ticketData === null || viewerId === null) return
      editTicket(ticket, env, { assignees: { add: [viewerId] } })
      env.close()
    }
  },
  {
    id: "ticket.unassign-me",
    hotkey: appHotkeys["tickets.assign-me"],
    group: "ticket",
    label: m.tickets_command_unassign_me,
    icon: UserMinus,
    tool: "update_ticket",
    when: (context) =>
      assignable(context) &&
      context.ticketData !== null &&
      context.viewerId !== null &&
      context.ticketData.assignees.includes(context.viewerId),
    run: ({ ticket, ticketData, viewerId }, env) => {
      if (ticket === null || ticketData === null || viewerId === null) return
      editTicket(ticket, env, { assignees: { remove: [viewerId] } })
      env.close()
    }
  },
  {
    id: "ticket.sprint",
    hotkey: appHotkeys["tickets.sprint"],
    bulk: true,
    group: "ticket",
    label: m.tickets_command_move_to_sprint,
    icon: Timer,
    keywords: ["sprint", "cycle", "iteration", "remove"],
    tool: "update_ticket",
    when: (context) =>
      onLiveTicket(context) &&
      context.tickets.planSprints &&
      !isEpic(context.ticketData),
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
    hotkey: appHotkeys["tickets.estimate"],
    bulk: true,
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
    hotkey: appHotkeys["tickets.type"],
    bulk: true,
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
    hotkey: appHotkeys["tickets.tags"],
    bulk: true,
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
    hotkey: appHotkeys["tickets.copy-id"],
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
    hotkey: appHotkeys["tickets.copy-link"],
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
      listed: "search",
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
    id: "ticket.open",
    hotkey: appHotkeys["tickets.open"],
    group: "ticketActions",
    label: m.tickets_shortcut_open,
    icon: SquareArrowOutUpRight,
    listed: "search",
    when: onTicket,
    run: ({ ticket }, env) => {
      if (ticket === null) return
      openTicket(ticket, env)
    }
  },
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
    hotkey: appHotkeys["tickets.archive"],
    bulk: true,
    group: "ticketActions",
    label: m.tickets_command_archive,
    icon: Archive,
    tool: "archive_ticket",
    when: ({ ticket, ticketData, tickets }) =>
      ticket !== null &&
      tickets.archive &&
      ticketData !== null &&
      ticketData.archivedAt === null,
    page: "ticketArchive"
  },
  {
    id: "ticket.unarchive",
    group: "ticketActions",
    label: m.tickets_command_unarchive,
    icon: ArchiveRestore,
    tool: "restore_ticket",
    when: ({ ticket, ticketData, tickets }) =>
      ticket !== null &&
      tickets.archive &&
      ticketData !== null &&
      ticketData.archivedAt !== null,
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
    id: "ticket.subscribe",
    group: "ticketActions",
    label: m.tickets_subscribe_command,
    icon: Bell,
    tool: "subscribe_ticket",
    when: ({ ticket, ticketSubscribed, project, viewerId }) =>
      ticket !== null &&
      canSubscribe(project, viewerId) &&
      ticketSubscribed === false,
    run: ({ ticket }, env) => {
      if (ticket === null) return
      env.execute(
        setSubscribed(
          ticketSubscribersRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
        ),
        true
      )
      env.close()
    }
  },
  {
    id: "ticket.unsubscribe",
    group: "ticketActions",
    label: m.tickets_unsubscribe_command,
    icon: BellOff,
    tool: "unsubscribe_ticket",
    when: ({ ticket, ticketSubscribed, project, viewerId }) =>
      ticket !== null &&
      canSubscribe(project, viewerId) &&
      ticketSubscribed === true,
    run: ({ ticket }, env) => {
      if (ticket === null) return
      env.execute(
        setSubscribed(
          ticketSubscribersRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
        ),
        false
      )
      env.close()
    }
  },
  {
    id: "ticket.toggle-subscription",
    hotkey: appHotkeys["tickets.subscribe"],
    group: "ticketActions",
    label: m.tickets_shortcut_subscribe,
    icon: Bell,
    listed: "never",
    when: ({ ticket, project, viewerId }) =>
      ticket !== null && canSubscribe(project, viewerId),
    run: ({ ticket, ticketSubscribed }, env) => {
      if (ticket === null) return
      const req = ticketSubscribersRequest(
        ticket.orgSlug,
        ticket.slug,
        ticket.ticketId
      )
      const view = ticketSubscribers(req)
      const toggle = (subscribed: boolean) =>
        env.execute(setSubscribed(req), !subscribed)
      if (ticketSubscribed !== null) {
        toggle(ticketSubscribed)
        return
      }
      void Effect.runPromise(AtomRegistry.getResult(env.registry, view)).then(
        () => {
          const current = env.registry.get(view)
          if (AsyncResult.isSuccess(current)) toggle(current.value.subscribed)
        },
        () => undefined
      )
    }
  },
  {
    id: "ticket.delete",
    bulk: true,
    group: "ticketActions",
    label: m.tickets_command_delete,
    icon: Trash2,
    keywords: ["remove"],
    listed: "search",
    when: ({ ticket, tickets }) => ticket !== null && tickets.delete,
    page: "ticketDelete"
  },
  {
    id: "ticket.create",
    hotkey: appHotkeys["tickets.create-anywhere"],
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
