import { isEpic } from "@pp/shared"
import { Flag, FlagOff, Layers, ListPlus, Stamp, Unlink } from "@pp/ui/icons"

import { commandScopes } from "@/features/command-menu/atoms/commandMenu"
import type { Command } from "@/features/command-menu/lib/commands"
import { scopeSelectionUpdate } from "@/features/command-menu/lib/commandScopes"
import { SquarePlusCorner } from "@/features/tickets/components/ticket-marks/blockingIcon"
import { MARK_KINDS } from "@/features/tickets/components/ticket-marks/markKinds"
import { removableRelations } from "@/features/tickets/lib/relationGroups"
import { appHotkeys } from "@/lib/appHotkeys"
import { m } from "@/paraglide/messages"

import { editable, editTicket, onLiveTicket } from "./commands"

export const relationCommands: ReadonlyArray<Command> = [
  {
    id: "ticket.parent",
    hotkey: appHotkeys["tickets.parent"],
    group: "ticketRelations",
    label: ({ ticketData }) =>
      ticketData?.parent
        ? m.tickets_command_change_epic()
        : m.tickets_command_add_to_epic(),
    icon: Layers,
    keywords: ["epic"],
    tool: "update_ticket",
    when: (context) => editable(context) && !isEpic(context.ticketData),
    page: "ticketParent"
  },
  {
    id: "ticket.add-sub-ticket",
    group: "ticketRelations",
    label: ({ ticketData }) =>
      isEpic(ticketData)
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
    id: "ticket.flag",
    hotkey: appHotkeys["tickets.flag"],
    bulk: true,
    group: "ticketRelations",
    label: m.tickets_command_flag,
    icon: Flag,
    keywords: ["attention", "mark"],
    tool: "update_ticket",
    when: (context) =>
      editable(context) &&
      (context.selection.length > 1
        ? context.selection.some((each) => each.flag === null)
        : context.ticketData !== null && context.ticketData.flag === null),
    run: ({ ticket, ticketData }, env) => {
      if (ticket === null || ticketData === null) return
      env.open("ticketFlag")
    }
  },
  {
    id: "ticket.unflag",
    hotkey: appHotkeys["tickets.flag"],
    bulk: true,
    group: "ticketRelations",
    label: m.tickets_mark_remove_flag,
    icon: FlagOff,
    keywords: ["attention", "unflag"],
    tool: "update_ticket",
    when: (context) =>
      editable(context) &&
      (context.selection.length > 1
        ? context.selection.some((each) => each.flag !== null)
        : context.ticketData !== null && context.ticketData.flag !== null),
    run: ({ ticket, selection }, env) => {
      if (ticket === null) return
      const updateSelection = scopeSelectionUpdate(
        env.registry.get(commandScopes)
      )
      if (selection.length > 1 && updateSelection !== null) {
        void updateSelection(
          ticket.slug,
          selection.map((each) => each.id),
          { flag: null }
        )
        env.close()
        return
      }
      editTicket(ticket, env, { flag: null })
      env.close()
    }
  },
  {
    id: "ticket.mark",
    group: "ticketRelations",
    label: m.tickets_command_mark_as,
    icon: Stamp,
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
    ({ kind, icon, command }) =>
      ({
        id: `ticket.mark.${kind}`,
        group: "ticketRelations",
        listed: "search",
        label: command,
        icon,
        keywords: ["relation", "link"],
        tool: kind === "duplicateOf" ? "archive_ticket" : "mark_ticket",
        when: editable,
        page: `mark:${kind}`
      }) satisfies Command
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
    label: ({ ticketData }) =>
      isEpic(ticketData?.parent)
        ? m.tickets_row_detach_epic_action({ id: ticketData.parent.id })
        : ticketData?.parent
          ? m.tickets_row_detach_parent_action({ id: ticketData.parent.id })
          : m.tickets_command_remove_parent(),
    icon: Unlink,
    keywords: ["parent", "epic", "detach"],
    tool: "update_ticket",
    when: ({ ticket, ticketData, tickets }) =>
      ticket !== null && tickets.edit && ticketData?.parent != null,
    run: ({ ticket }, env) => {
      if (ticket === null) return
      editTicket(ticket, env, { parent: null })
      env.close()
    }
  }
]
