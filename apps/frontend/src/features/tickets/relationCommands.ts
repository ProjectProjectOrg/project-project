import { Flag, Layers, ListPlus, Unlink } from "lucide-react"

import type { Command } from "@/features/command-menu/lib/commands"
import {
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { SquarePlusCorner } from "@/features/tickets/components/ticket-marks/blockingIcon"
import { MARK_KINDS } from "@/features/tickets/components/ticket-marks/markKinds"
import { removableRelations } from "@/features/tickets/lib/relationGroups"
import { m } from "@/paraglide/messages"

import { editable, onLiveTicket } from "./commands"

export const relationCommands: ReadonlyArray<Command> = [
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
    id: "ticket.add-sub-ticket",
    group: "ticketRelations",
    label: ({ ticketDetail }) =>
      ticketDetail?.type === "epic"
        ? m.tickets_command_add_ticket_to_epic()
        : m.tickets_command_add_sub_ticket(),
    icon: ListPlus,
    keywords: ["sub-ticket", "child", "subtask", "attach"],
    when: (context) =>
      editable(context) && context.tickets.create && context.canHoldChildren,
    page: "ticketSubTicket"
  },
  {
    id: "ticket.create-related",
    group: "ticketRelations",
    label: m.tickets_command_create_related,
    icon: SquarePlusCorner,
    keywords: ["new", "blocked", "blocking", "related", "sub-ticket"],
    tool: "create_ticket",
    when: (context) => onLiveTicket(context) && context.tickets.create,
    page: "ticketCreateRelated"
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
    when: editable,
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
      when: editable,
      page: `mark:${kind}`
    })
  ),
  {
    id: "ticket.unmark",
    group: "ticketRelations",
    label: m.tickets_menu_remove_relation,
    icon: Unlink,
    keywords: ["relation", "link", "unlink", "blocked", "blocking"],
    tool: "unmark_ticket",
    when: (context) =>
      editable(context) &&
      context.ticketDetail !== null &&
      removableRelations(context.ticketDetail.relations).length > 0,
    page: "ticketRemoveRelation"
  },
  {
    id: "ticket.detach",
    group: "ticketRelations",
    label: ({ ticketDetail }) =>
      m.tickets_row_detach_action({ id: ticketDetail?.parent?.id ?? "" }),
    icon: Unlink,
    keywords: ["parent", "epic", "detach"],
    tool: "update_ticket",
    when: ({ ticket, ticketDetail, tickets }) =>
      ticket !== null && tickets.edit && ticketDetail?.parent != null,
    run: ({ ticket }, env) => {
      if (ticket === null) return
      env.execute(
        updateTicketDetail(
          ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
        ),
        { parent: null }
      )
      env.close()
    }
  }
]
