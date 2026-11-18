import type { ComponentType } from "react"

import { SwitchOrgCommands } from "@/features/organizations/components/SwitchOrgCommands"
import { TicketAssigneeCommands } from "@/features/tickets/components/command-pages/TicketAssigneeCommands"
import { TicketPriorityCommands } from "@/features/tickets/components/command-pages/TicketPriorityCommands"
import { TicketStatusCommands } from "@/features/tickets/components/command-pages/TicketStatusCommands"

import { ThemeCommands } from "./components/ThemeCommands"
import type { CommandPage } from "./lib/commandMenu"
import type { CommandPageProps } from "./lib/commandPages"

function TicketStatusPage({ context, chip, onBack, env }: CommandPageProps) {
  return context.ticket === null ? null : (
    <TicketStatusCommands
      ticket={context.ticket}
      chip={chip}
      onBack={onBack}
      onClose={env.close}
    />
  )
}

function TicketPriorityPage({ context, chip, onBack, env }: CommandPageProps) {
  return context.ticket === null ? null : (
    <TicketPriorityCommands
      ticket={context.ticket}
      chip={chip}
      onBack={onBack}
      onClose={env.close}
    />
  )
}

function TicketAssigneePage({ context, chip, onBack, env }: CommandPageProps) {
  return context.ticket === null ? null : (
    <TicketAssigneeCommands
      ticket={context.ticket}
      chip={chip}
      onBack={onBack}
      onClose={env.close}
    />
  )
}

export const COMMAND_PAGES: Readonly<
  Record<Exclude<CommandPage, "root">, ComponentType<CommandPageProps>>
> = {
  ticketStatus: TicketStatusPage,
  ticketPriority: TicketPriorityPage,
  ticketAssignee: TicketAssigneePage,
  switchOrg: SwitchOrgCommands,
  theme: ThemeCommands
}
